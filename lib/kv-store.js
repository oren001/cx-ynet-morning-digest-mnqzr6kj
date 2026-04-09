```javascript
export class KVStore {
  constructor(kv) {
    this.kv = kv;
    this.USER_KEY = 'user_preferences';
    this.HISTORY_KEY_PREFIX = 'history_';
    this.DIGEST_KEY_PREFIX = 'digest_';
    this.CLICKS_KEY = 'click_tracking';
    
    this.DEFAULT_TTL = 90 * 24 * 60 * 60;
    this.DIGEST_TTL = 30 * 24 * 60 * 60;
  }

  async getUserPreferences() {
    try {
      const data = await this.kv.get(this.USER_KEY, { type: 'json' });
      if (!data) {
        return {
          categoryWeights: {},
          totalClicks: 0,
          lastUpdated: new Date().toISOString(),
          preferredCategories: []
        };
      }
      return data;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {
        categoryWeights: {},
        totalClicks: 0,
        lastUpdated: new Date().toISOString(),
        preferredCategories: []
      };
    }
  }

  async updateUserPreferences(preferences) {
    try {
      const updated = {
        ...preferences,
        lastUpdated: new Date().toISOString()
      };
      await this.kv.put(this.USER_KEY, JSON.stringify(updated), {
        expirationTtl: this.DEFAULT_TTL
      });
      return true;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }
  }

  async getReadingHistory(limit = 100) {
    try {
      const historyKey = `${this.HISTORY_KEY_PREFIX}main`;
      const data = await this.kv.get(historyKey, { type: 'json' });
      if (!data || !Array.isArray(data)) {
        return [];
      }
      return data.slice(0, limit);
    } catch (error) {
      console.error('Error fetching reading history:', error);
      return [];
    }
  }

  async addReadingHistory(articleId, category, timestamp = null) {
    try {
      const historyKey = `${this.HISTORY_KEY_PREFIX}main`;
      const history = await this.getReadingHistory();
      
      const newEntry = {
        articleId,
        category,
        timestamp: timestamp || new Date().toISOString(),
        hour: new Date().getHours()
      };

      const isDuplicate = history.some(entry => 
        entry.articleId === articleId && 
        Math.abs(new Date(entry.timestamp) - new Date(newEntry.timestamp)) < 60000
      );

      if (!isDuplicate) {
        history.unshift(newEntry);
        const trimmed = history.slice(0, 200);
        
        await this.kv.put(historyKey, JSON.stringify(trimmed), {
          expirationTtl: this.DEFAULT_TTL
        });
      }

      return true;
    } catch (error) {
      console.error('Error adding reading history:', error);
      return false;
    }
  }

  async trackClick(articleId, category, digestId = null) {
    try {
      const clickData = await this.kv.get(this.CLICKS_KEY, { type: 'json' }) || {};
      
      if (!clickData[articleId]) {
        clickData[articleId] = {
          count: 0,
          category,
          firstClick: new Date().toISOString(),
          lastClick: null,
          digestIds: []
        };
      }

      clickData[articleId].count++;
      clickData[articleId].lastClick = new Date().toISOString();
      if (digestId && !clickData[articleId].digestIds.includes(digestId)) {
        clickData[articleId].digestIds.push(digestId);
      }

      await this.kv.put(this.CLICKS_KEY, JSON.stringify(clickData), {
        expirationTtl: this.DEFAULT_TTL
      });

      await this.addReadingHistory(articleId, category);

      const preferences = await this.getUserPreferences();
      preferences.totalClicks = (preferences.totalClicks || 0) + 1;
      
      if (!preferences.categoryWeights) {
        preferences.categoryWeights = {};
      }
      preferences.categoryWeights[category] = (preferences.categoryWeights[category] || 0) + 1;

      const sortedCategories = Object.entries(preferences.categoryWeights)
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat);
      preferences.preferredCategories = sortedCategories.slice(0, 5);

      await this.updateUserPreferences(preferences);

      return true;
    } catch (error) {
      console.error('Error tracking click:', error);
      return false;
    }
  }

  async getClickData() {
    try {
      const data = await this.kv.get(this.CLICKS_KEY, { type: 'json' });
      return data || {};
    } catch (error) {
      console.error('Error fetching click data:', error);
      return {};
    }
  }

  async saveDigest(digestId, digestData) {
    try {
      const key = `${this.DIGEST_KEY_PREFIX}${digestId}`;
      const data = {
        ...digestData,
        createdAt: new Date().toISOString(),
        digestId
      };
      
      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: this.DIGEST_TTL
      });

      await this.addToDigestIndex(digestId, data.createdAt);

      return true;
    } catch (error) {
      console.error('Error saving digest:', error);
      return false;
    }
  }

  async getDigest(digestId) {
    try {
      const key = `${this.DIGEST_KEY_PREFIX}${digestId}`;
      const data = await this.kv.get(key, { type: 'json' });
      return data;
    } catch (error) {
      console.error('Error fetching digest:', error);
      return null;
    }
  }

  async addToDigestIndex(digestId, createdAt) {
    try {
      const indexKey = 'digest_index';
      const index = await this.kv.get(indexKey, { type: 'json' }) || [];
      
      index.unshift({ digestId, createdAt });
      const trimmed = index.slice(0, 30);
      
      await this.kv.put(indexKey, JSON.stringify(trimmed), {
        expirationTtl: this.DIGEST_TTL
      });
      
      return true;
    } catch (error) {
      console.error('Error updating digest index:', error);
      return false;
    }
  }

  async getDigestIndex() {
    try {
      const indexKey = 'digest_index';
      const index = await this.kv.get(indexKey, { type: 'json' });
      return index || [];
    } catch (error) {
      console.error('Error fetching digest index:', error);
      return [];
    }
  }

  async getLatestDigestId() {
    try {
      const index = await this.getDigestIndex();
      if (index.length === 0) return null;
      return index[0].digestId;
    } catch (error) {
      console.error('Error fetching latest digest ID:', error);
      return null;
    }
  }

  async cleanupOldData() {
    try {
      const history = await this.getReadingHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const filtered = history.filter(entry => 
        new Date(entry.timestamp) > cutoffDate
      );

      if (filtered.length < history.length) {
        const historyKey = `${this.HISTORY_KEY_PREFIX}main`;
        await this.kv.put(historyKey, JSON.stringify(filtered), {
          expirationTtl: this.DEFAULT_TTL
        });
      }

      const clickData = await this.getClickData();
      const cleanedClicks = {};
      
      for (const [articleId, data] of Object.entries(clickData)) {
        if (new Date(data.lastClick || data.firstClick) > cutoffDate) {
          cleanedClicks[articleId] = data;
        }
      }

      if (Object.keys(cleanedClicks).length < Object.keys(clickData).length) {
        await this.kv.put(this.CLICKS_KEY, JSON.stringify(cleanedClicks), {
          expirationTtl: this.DEFAULT_TTL
        });
      }

      return true;
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      return false;
    }
  }

  async getCategoryStats() {
    try {
      const preferences = await this.getUserPreferences();
      const clickData = await this.getClickData();
      const history = await this.getReadingHistory();

      const stats = {
        totalClicks: preferences.totalClicks || 0,
        categoryBreakdown: preferences.categoryWeights || {},
        topCategories: preferences.preferredCategories || [],
        uniqueArticlesRead: Object.keys(clickData).length,
        recentActivityCount: history.length,
        lastActivity: history.length > 0 ? history[0].timestamp : null
      };

      return stats;
    } catch (error) {
      console.error('Error fetching category stats:', error);
      return {
        totalClicks: 0,
        categoryBreakdown: {},
        topCategories: [],
        uniqueArticlesRead: 0,
        recentActivityCount: 0,
        lastActivity: null
      };
    }
  }
}

export function createKVStore(kvNamespace) {
  return new KVStore(kvNamespace);
}
```