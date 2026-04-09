```javascript
import { scrapeYnetNews } from './lib/scraper.js';
import { scoreArticles } from './lib/ml-scorer.js';
import { generateDigest, getDigest } from './lib/digest-generator.js';
import { trackClick, getUserPreferences } from './lib/kv-store.js';
import { buildJsonResponse, buildHtmlResponse, logError } from './lib/utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET / - Show today's digest or landing page
      if (path === '/' && request.method === 'GET') {
        const todayDigestId = await env.DIGEST_KV.get('latest_digest_id');
        
        if (!todayDigestId) {
          return buildHtmlResponse(getLandingPageHtml(), 200);
        }

        const digestData = await getDigest(env.DIGEST_KV, todayDigestId);
        
        if (!digestData) {
          return buildHtmlResponse(getLandingPageHtml(), 200);
        }

        return buildHtmlResponse(getDigestHtml(digestData, todayDigestId), 200);
      }

      // GET /api/digest/:id - Get specific digest by ID
      if (path.startsWith('/api/digest/') && request.method === 'GET') {
        const digestId = path.split('/api/digest/')[1];
        
        if (!digestId) {
          return buildJsonResponse({ error: 'Missing digest ID' }, 400);
        }

        const digestData = await getDigest(env.DIGEST_KV, digestId);
        
        if (!digestData) {
          return buildJsonResponse({ error: 'Digest not found' }, 404);
        }

        return buildHtmlResponse(getDigestHtml(digestData, digestId), 200);
      }

      // POST /api/track - Track article click
      if (path === '/api/track' && request.method === 'POST') {
        const body = await request.json();
        const { articleId, digestId, category } = body;

        if (!articleId) {
          return buildJsonResponse({ error: 'Missing articleId' }, 400);
        }

        await trackClick(env.DIGEST_KV, articleId, category || 'unknown');

        return buildJsonResponse({ success: true }, 200);
      }

      // GET /api/preferences - Get user preferences (for debugging)
      if (path === '/api/preferences' && request.method === 'GET') {
        const preferences = await getUserPreferences(env.DIGEST_KV);
        return buildJsonResponse(preferences, 200);
      }

      return buildJsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
      logError('Request handler error', error);
      return buildJsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      console.log('Starting scheduled digest generation...');

      // Step 1: Scrape latest news from Ynet
      const articles = await scrapeYnetNews();
      
      if (!articles || articles.length === 0) {
        console.error('No articles scraped, aborting digest generation');
        return;
      }

      console.log(`Scraped ${articles.length} articles`);

      // Step 2: Get user preferences and score articles
      const preferences = await getUserPreferences(env.DIGEST_KV);
      const scoredArticles = scoreArticles(articles, preferences);

      console.log(`Scored ${scoredArticles.length} articles`);

      // Step 3: Generate digest and store in KV
      const digestId = await generateDigest(env.DIGEST_KV, scoredArticles);

      // Store latest digest ID for easy access
      await env.DIGEST_KV.put('latest_digest_id', digestId, {
        expirationTtl: 86400 * 7 // 7 days
      });

      console.log(`Digest generated successfully: ${digestId}`);

    } catch (error) {
      logError('Scheduled cron error', error);
    }
  }
};

function getLandingPageHtml() {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>עיתון אישי - התקציר הבוקר</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      direction: rtl;
    }

    .container {
      max-width: 600px;
      background: white;
      border-radius: 20px;
      padding: 60px 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }

    h1 {
      font-size: 2.5rem;
      color: #2d3748;
      margin-bottom: 20px;
      font-weight: 700;
    }

    .subtitle {
      font-size: 1.2rem;
      color: #718096;
      margin-bottom: 40px;
      line-height: 1.6;
    }

    .status-box {
      background: #f7fafc;
      border-radius: 12px;
      padding: 30px;
      border: 2px dashed #cbd5e0;
    }

    .status-icon {
      font-size: 4rem;
      margin-bottom: 20px;
    }

    .status-text {
      font-size: 1.1rem;
      color: #4a5568;
      line-height: 1.8;
    }

    .cron-info {
      margin-top: 30px;
      padding: 20px;
      background: #edf2f7;
      border-radius: 8px;
      font-size: 0.95rem;
      color: #2d3748;
    }

    .features {
      margin-top: 40px;
      text-align: right;
    }

    .feature-item {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
      color: #4a5568;
    }

    .feature-icon {
      margin-left: 12px;
      font-size: 1.5rem;
    }

    @media (max-width: 640px) {
      .container {
        padding: 40px 24px;
      }

      h1 {
        font-size: 2rem;
      }

      .subtitle {
        font-size: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📰 עיתון אישי</h1>
    <p class="subtitle">התקציר האישי שלך מחברת ynet</p>
    
    <div class="status-box">
      <div class="status-icon">⏳</div>
      <div class="status-text">
        <strong>התקציר היומי עדיין לא נוצר</strong><br>
        המערכת תיצור את התקציר האישי שלך בכל בוקר בשעה 6:00
      </div>
    </div>

    <div class="cron-info">
      <strong>מתי יגיע התקציר?</strong><br>
      התקציר היומי נוצר אוטומטית כל בוקר בשעה 6:00 (שעון ישראל)<br>
      חזור לדף זה אחרי השעה 6:00 כדי לקרוא את התקציר שלך
    </div>

    <div class="features">
      <div class="feature-item">
        <span class="feature-icon">🤖</span>
        <span>למידת מכונה המבוססת על הרגלי הקריאה שלך</span>
      </div>
      <div class="feature-item">
        <span class="feature-icon">📊</span>
        <span>סינון חכם של חדשות לפי העדפות אישיות</span>
      </div>
      <div class="feature-item">
        <span class="feature-icon">⚡</span>
        <span>תקציר יומי קצר וממוקד</span>
      </div>
      <div class="feature-item">
        <span class="feature-icon">🔒</span>
        <span>פרטיות מלאה - רק מעקב אחר קריאת כתבות</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getDigestHtml(digestData, digestId) {
  const articles = digestData.articles || [];
  const generatedAt = new Date(digestData.generatedAt || Date.now());
  
  const articlesHtml = articles.map((article, index) => `
    <article class="article-card" data-article-id="${article.id}" data-category="${article.category}">
      <div class="article-number">${index + 1}</div>
      <div class="article-content">
        <div class="article-category">${article.category}</div>
        <h2 class="article-title">${article.title}</h2>
        <p class="article-summary">${article.summary}</p>
        <div class="article-meta">
          <span class="article-score">ציון התאמה: ${Math.round(article.score * 100)}%</span>
          <span class="article-time">${article.publishedAt ? new Date(article.publishedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
        <a href="${article.link}" target="_blank" class="article-link" data-article-id="${article.id}" data-category="${article.category}">
          קרא עוד ←
        </a>
      </div>
    </article>
  `).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>התקציר היומי שלי - ${generatedAt.toLocaleDateString('he-IL')}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f7fafc;
      direction: rtl;
      line-height: 1.6;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .header-date {
      font-size: 1.1rem;
      opacity: 0.9;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .digest-info {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      text-align: center;
    }

    .digest-info p {
      color: #4a5568;
      font-size: 1rem;
    }

    .articles-grid {
      display: grid;
      gap: 24px;
    }

    .article-card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      transition: all 0.3s ease;
      display: flex;
      gap: 20px;
      cursor: pointer;
    }

    .article-card:hover {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }

    .article-number {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.2rem;
    }

    .article-content {
      flex: 1;
    }

    .article-category {
      display: inline-block;
      background: #edf2f7;
      color: #667eea;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .article-title {
      font-size: 1.5rem;
      color: #2d3748;
      margin-bottom: 12px;
      font-weight: 600;
      line-height: 1.4;
    }

    .article-summary {
      color: #4a5568;
      margin-bottom: 16px;
      font-size: 1rem;
      line-height: 1.7;
    }

    .article-meta {
      display: flex;
      gap: 20px;
      margin-bottom: 16px;
      font-size: 0.9rem;
      color: #718096;
    }

    .article-score {
      font-weight: 600;
      color: #667eea;
    }

    .article-link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
    }

    .article-link:hover {
      transform: translateX(-4px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .footer {
      text-align: center;
      padding: 40px 20px;
      color: #718096;
      font-size: 0.95rem;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #718096;
    }

    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 20px;
    }

    @media (max-width: 640px) {
      .header h1 {
        font-size: 1.8rem;
      }

      .article-card {
        flex-direction: column;
        gap: 16px;
      }

      .article-title {
        font-size: 1.25rem;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📰 התקציר האישי שלי</h1>
    <div class="header-date">${generatedAt.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>

  <div class="container">
    <div class="digest-info">
      <p>✨ ${articles.length} כתבות נבחרו במיוחד עבורך על בסיס העדפות הקריאה שלך</p>
    </div>

    ${articles.length > 0 ? `
      <div class="articles-grid">
        ${articlesHtml}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h2>אין כתבות זמינות כרגע</h2>
        <p>התקציר היומי יתעדכן בקרוב</p>
      </div>
    `}
  </div>

  <div class="footer">
    <p>התקציר נוצר אוטומטית בשעה 6:00 בבוקר • לומד מהרגלי הקריאה שלך</p>
  </div>

  <script>
    document.querySelectorAll('.article-link').forEach(link => {
      link.addEventListener('click', async (e) => {
        const articleId = e.target.dataset.articleId;
        const category = e.target.dataset.category;
        
        if (articleId) {
          try {
            await fetch('/api/track', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                articleId: articleId,
                digestId: '${digestId}',
                category: category
              })
            });
          } catch (error) {
            console.error('Failed to track click:', error);
          }
        }
      });
    });

    document.querySelectorAll('.article-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('article-link')) {
          return;
        }
        const link = card.querySelector('.article-link');
        if (link) {
          link.click();
        }
      });
    });
  </script>
</body>
</html>`;
}
```