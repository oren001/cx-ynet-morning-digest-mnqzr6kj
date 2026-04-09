```javascript
// lib/ml-scorer.js
// Machine learning recommendation engine for personalized article scoring

export class MLScorer {
  constructor(kvStore) {
    this.kvStore = kvStore;
  }

  /**
   * Score and rank articles based on user preferences
   * @param {Array} articles - Array of article objects from scraper
   * @param {string} userId - User identifier (IP hash or session ID)
   * @returns {Promise<Array>} Sorted array of articles with scores
   */
  async scoreArticles(articles, userId = 'default') {
    if (!articles || articles.length === 0) {
      return [];
    }

    const userHistory = await this.getUserHistory(userId);
    const preferences = this.calculatePreferences(userHistory);

    const scoredArticles = articles.map(article => {
      const categoryScore = this.getCategoryScore(article.category, preferences.categories);
      const timeScore = this.getTimeScore(article, preferences.timePatterns);
      const freshnessScore = this.getFreshnessScore(article);
      const diversityScore = this.getDiversityScore(article, userHistory);
      const engagementScore = this.getEngagementScore(article, preferences.keywords);

      const totalScore = 
        categoryScore * 0.35 +
        engagementScore * 0.25 +
        freshnessScore * 0.20 +
        timeScore * 0.12 +
        diversityScore * 0.08;

      return {
        ...article,
        score: totalScore,
        scoreBreakdown: {
          category: categoryScore,
          engagement: engagementScore,
          freshness: freshnessScore,
          time: timeScore,
          diversity: diversityScore
        }
      };
    });

    return scoredArticles.sort((a, b) => b.score - a.score);
  }

  /**
   * Get user reading history from KV
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserHistory(userId) {
    try {
      const historyKey = `history:${userId}`;
      const historyJson = await this.kvStore.get(historyKey);
      
      if (!historyJson) {
        return {
          clicks: [],
          reads: [],
          lastUpdated: Date.now()
        };
      }

      return JSON.parse(historyJson);
    } catch (error) {
      console.error('Error fetching user history:', error);
      return {
        clicks: [],
        reads: [],
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Calculate user preferences from history
   * @param {Object} history
   * @returns {Object}
   */
  calculatePreferences(history) {
    const categories = {};
    const keywords = {};
    const timePatterns = Array(24).fill(0);

    // Process clicks (stronger signal)
    history.clicks.forEach(click => {
      const weight = this.getRecencyWeight(click.timestamp);
      
      if (click.category) {
        categories[click.category] = (categories[click.category] || 0) + (2 * weight);
      }

      if (click.keywords && Array.isArray(click.keywords)) {
        click.keywords.forEach(keyword => {
          keywords[keyword] = (keywords[keyword] || 0) + weight;
        });
      }

      const hour = new Date(click.timestamp).getHours();
      timePatterns[hour] += weight;
    });

    // Process reads (weaker signal)
    history.reads.forEach(read => {
      const weight = this.getRecencyWeight(read.timestamp) * 0.5;
      
      if (read.category) {
        categories[read.category] = (categories[read.category] || 0) + weight;
      }

      if (read.keywords && Array.isArray(read.keywords)) {
        read.keywords.forEach(keyword => {
          keywords[keyword] = (keywords[keyword] || 0) + (weight * 0.5);
        });
      }
    });

    // Normalize categories
    const maxCategoryScore = Math.max(...Object.values(categories), 1);
    Object.keys(categories).forEach(cat => {
      categories[cat] = categories[cat] / maxCategoryScore;
    });

    // Normalize keywords
    const maxKeywordScore = Math.max(...Object.values(keywords), 1);
    Object.keys(keywords).forEach(kw => {
      keywords[kw] = keywords[kw] / maxKeywordScore;
    });

    // Normalize time patterns
    const maxTimeScore = Math.max(...timePatterns, 1);
    const normalizedTimePatterns = timePatterns.map(t => t / maxTimeScore);

    return {
      categories,
      keywords,
      timePatterns: normalizedTimePatterns
    };
  }

  /**
   * Calculate recency weight (exponential decay)
   * @param {number} timestamp
   * @returns {number}
   */
  getRecencyWeight(timestamp) {
    const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    const halfLife = 7; // 7 days half-life
    return Math.exp(-0.693 * ageInDays / halfLife);
  }

  /**
   * Score article by category preference
   * @param {string} category
   * @param {Object} categoryPreferences
   * @returns {number}
   */
  getCategoryScore(category, categoryPreferences) {
    if (!category || Object.keys(categoryPreferences).length === 0) {
      return 0.5; // Neutral score for new users
    }

    return categoryPreferences[category] || 0.3; // Lower score for unknown categories
  }

  /**
   * Score article by time-of-day patterns
   * @param {Object} article
   * @param {Array} timePatterns
   * @returns {number}
   */
  getTimeScore(article, timePatterns) {
    const now = new Date();
    const hour = now.getHours();
    
    if (timePatterns.every(t => t === 0)) {
      return 0.5; // Neutral for new users
    }

    return timePatterns[hour] || 0.3;
  }

  /**
   * Score article freshness
   * @param {Object} article
   * @returns {number}
   */
  getFreshnessScore(article) {
    if (!article.publishedAt) {
      return 0.5;
    }

    const ageInHours = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
    
    if (ageInHours < 2) return 1.0;
    if (ageInHours < 6) return 0.9;
    if (ageInHours < 12) return 0.7;
    if (ageInHours < 24) return 0.5;
    return 0.3;
  }

  /**
   * Score article for diversity (avoid similar recent reads)
   * @param {Object} article
   * @param {Object} history
   * @returns {number}
   */
  getDiversityScore(article, history) {
    const recentReads = history.clicks
      .filter(click => Date.now() - click.timestamp < 7 * 24 * 60 * 60 * 1000)
      .map(click => click.articleId);

    if (recentReads.includes(article.id)) {
      return 0; // Already read
    }

    const recentCategories = history.clicks
      .filter(click => Date.now() - click.timestamp < 2 * 24 * 60 * 60 * 1000)
      .map(click => click.category);

    const categoryCount = recentCategories.filter(cat => cat === article.category).length;
    
    if (categoryCount === 0) return 1.0;
    if (categoryCount === 1) return 0.7;
    if (categoryCount === 2) return 0.5;
    return 0.3;
  }

  /**
   * Score article based on keyword engagement
   * @param {Object} article
   * @param {Object} keywordPreferences
   * @returns {number}
   */
  getEngagementScore(article, keywordPreferences) {
    if (Object.keys(keywordPreferences).length === 0) {
      return 0.5; // Neutral for new users
    }

    const articleText = `${article.title} ${article.summary || ''}`.toLowerCase();
    let totalScore = 0;
    let matchCount = 0;

    Object.entries(keywordPreferences).forEach(([keyword, score]) => {
      if (articleText.includes(keyword.toLowerCase())) {
        totalScore += score;
        matchCount++;
      }
    });

    if (matchCount === 0) {
      return 0.4; // Slightly lower for no keyword matches
    }

    return Math.min(totalScore / matchCount, 1.0);
  }

  /**
   * Track user click for learning
   * @param {string} userId
   * @param {Object} articleData
   */
  async trackClick(userId, articleData) {
    try {
      const history = await this.getUserHistory(userId);
      
      const clickData = {
        articleId: articleData.id,
        category: articleData.category,
        keywords: this.extractKeywords(articleData.title),
        timestamp: Date.now()
      };

      history.clicks.push(clickData);
      
      // Keep only last 100 clicks
      if (history.clicks.length > 100) {
        history.clicks = history.clicks.slice(-100);
      }

      history.lastUpdated = Date.now();

      const historyKey = `history:${userId}`;
      await this.kvStore.put(historyKey, JSON.stringify(history), {
        expirationTtl: 90 * 24 * 60 * 60 // 90 days
      });

      return true;
    } catch (error) {
      console.error('Error tracking click:', error);
      return false;
    }
  }

  /**
   * Track article read (viewed but not clicked)
   * @param {string} userId
   * @param {Object} articleData
   */
  async trackRead(userId, articleData) {
    try {
      const history = await this.getUserHistory(userId);
      
      const readData = {
        articleId: articleData.id,
        category: articleData.category,
        keywords: this.extractKeywords(articleData.title),
        timestamp: Date.now()
      };

      history.reads.push(readData);
      
      // Keep only last 200 reads
      if (history.reads.length > 200) {
        history.reads = history.reads.slice(-200);
      }

      history.lastUpdated = Date.now();

      const historyKey = `history:${userId}`;
      await this.kvStore.put(historyKey, JSON.stringify(history), {
        expirationTtl: 90 * 24 * 60 * 60 // 90 days
      });

      return true;
    } catch (error) {
      console.error('Error tracking read:', error);
      return false;
    }
  }

  /**
   * Extract simple keywords from Hebrew text
   * @param {string} text
   * @returns {Array<string>}
   */
  extractKeywords(text) {
    if (!text) return [];

    const stopWords = ['של', 'את', 'על', 'עם', 'אל', 'כי', 'זה', 'זו', 'לא', 'או', 'גם', 'אם', 'כל', 'יותר', 'מאוד', 'אחר', 'אותו'];
    
    const words = text
      .toLowerCase()
      .replace(/[^\u0590-\u05FF\s]/g, ' ') // Keep only Hebrew letters and spaces
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    // Return unique words
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Get user statistics
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserStats(userId) {
    const history = await this.getUserHistory(userId);
    const preferences = this.calculatePreferences(history);

    const topCategories = Object.entries(preferences.categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, score]) => ({ category: cat, score }));

    const topKeywords = Object.entries(preferences.keywords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([keyword, score]) => ({ keyword, score }));

    return {
      totalClicks: history.clicks.length,
      totalReads: history.reads.length,
      topCategories,
      topKeywords,
      lastUpdated: history.lastUpdated
    };
  }
}

export default MLScorer;
```