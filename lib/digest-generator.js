```javascript
import { saveDigest, getUserPreferences } from './kv-store.js';

/**
 * Generates a unique digest ID
 */
function generateDigestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Selects top articles for the digest
 */
function selectTopArticles(scoredArticles, count = 10) {
  // Sort by score descending
  const sorted = [...scoredArticles].sort((a, b) => b.score - a.score);
  
  // Take top N articles
  return sorted.slice(0, count);
}

/**
 * Categorizes articles by topic
 */
function categorizeArticles(articles) {
  const categories = {};
  
  for (const article of articles) {
    const category = article.category || 'כללי';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(article);
  }
  
  return categories;
}

/**
 * Creates a balanced selection across categories
 */
function createBalancedSelection(scoredArticles, totalCount = 10) {
  const categorized = categorizeArticles(scoredArticles);
  const categories = Object.keys(categorized);
  
  if (categories.length === 0) {
    return [];
  }
  
  // Sort articles within each category by score
  for (const category of categories) {
    categorized[category].sort((a, b) => b.score - a.score);
  }
  
  const selected = [];
  let categoryIndex = 0;
  
  // Round-robin selection from categories to ensure diversity
  while (selected.length < totalCount) {
    const category = categories[categoryIndex % categories.length];
    const articles = categorized[category];
    
    if (articles && articles.length > 0) {
      const article = articles.shift();
      selected.push(article);
    }
    
    categoryIndex++;
    
    // Stop if all categories are empty
    const hasArticles = categories.some(cat => categorized[cat] && categorized[cat].length > 0);
    if (!hasArticles) {
      break;
    }
  }
  
  return selected;
}

/**
 * Generates metadata for the digest
 */
function generateDigestMetadata(articles, userId) {
  const now = new Date();
  const categories = [...new Set(articles.map(a => a.category || 'כללי'))];
  
  return {
    generatedAt: now.toISOString(),
    articleCount: articles.length,
    categories: categories,
    userId: userId || 'anonymous',
    version: '1.0'
  };
}

/**
 * Creates a digest summary
 */
function createDigestSummary(articles) {
  const categoryCount = new Set(articles.map(a => a.category)).size;
  const topCategory = articles[0]?.category || 'חדשות';
  
  return {
    headline: `הסיכום היומי שלך`,
    description: `${articles.length} כתבות נבחרות מ-${categoryCount} קטגוריות`,
    topCategory: topCategory,
    firstArticleTitle: articles[0]?.title || ''
  };
}

/**
 * Main function: generates a complete digest
 */
export async function generateDigest(scoredArticles, env, userId = 'default') {
  try {
    if (!scoredArticles || scoredArticles.length === 0) {
      throw new Error('No articles available for digest generation');
    }
    
    // Get user preferences to determine article count
    const preferences = await getUserPreferences(env, userId);
    const articleCount = preferences?.digestSize || 10;
    
    // Select articles with balanced category distribution
    const selectedArticles = createBalancedSelection(scoredArticles, articleCount);
    
    if (selectedArticles.length === 0) {
      throw new Error('Failed to select articles for digest');
    }
    
    // Generate unique digest ID
    const digestId = generateDigestId();
    
    // Create digest metadata
    const metadata = generateDigestMetadata(selectedArticles, userId);
    
    // Create digest summary
    const summary = createDigestSummary(selectedArticles);
    
    // Prepare digest object
    const digest = {
      id: digestId,
      userId: userId,
      articles: selectedArticles.map(article => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        link: article.link,
        category: article.category,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        score: article.score,
        clicked: false
      })),
      metadata: metadata,
      summary: summary,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };
    
    // Save digest to KV storage
    await saveDigest(env, digestId, digest);
    
    // Return digest info
    return {
      success: true,
      digestId: digestId,
      digestUrl: `/digest/${digestId}`,
      articleCount: selectedArticles.length,
      categories: metadata.categories,
      summary: summary
    };
    
  } catch (error) {
    console.error('Error generating digest:', error);
    return {
      success: false,
      error: error.message,
      digestId: null,
      digestUrl: null
    };
  }
}

/**
 * Regenerates a digest with updated preferences
 */
export async function regenerateDigest(originalDigestId, scoredArticles, env, userId = 'default') {
  try {
    // Generate new digest
    const result = await generateDigest(scoredArticles, env, userId);
    
    if (result.success) {
      result.regeneratedFrom = originalDigestId;
    }
    
    return result;
    
  } catch (error) {
    console.error('Error regenerating digest:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a quick digest from top articles (for testing)
 */
export async function createQuickDigest(articles, env, count = 5) {
  // Score articles with simple default scoring
  const scoredArticles = articles.map((article, index) => ({
    ...article,
    score: 100 - index // Simple descending score
  }));
  
  return await generateDigest(scoredArticles, env, 'quick-digest-user');
}

/**
 * Validates digest data structure
 */
export function validateDigest(digest) {
  if (!digest || typeof digest !== 'object') {
    return false;
  }
  
  const required = ['id', 'userId', 'articles', 'metadata', 'createdAt'];
  const hasAllFields = required.every(field => field in digest);
  
  if (!hasAllFields) {
    return false;
  }
  
  if (!Array.isArray(digest.articles) || digest.articles.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Formats digest for API response
 */
export function formatDigestForResponse(digest) {
  if (!digest) {
    return null;
  }
  
  return {
    id: digest.id,
    summary: digest.summary,
    articleCount: digest.articles.length,
    categories: digest.metadata.categories,
    createdAt: digest.createdAt,
    articles: digest.articles.map(article => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      link: article.link,
      category: article.category,
      imageUrl: article.imageUrl,
      publishedAt: article.publishedAt
    }))
  };
}
```