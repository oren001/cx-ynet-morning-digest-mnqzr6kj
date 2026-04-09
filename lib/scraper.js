```javascript
export async function scrapeYnetArticles() {
  const articles = [];
  const sources = [
    { url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', category: 'כללי' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', category: 'חדשות' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss2142.xml', category: 'כלכלה' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss550.xml', category: 'ספורט' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss4403.xml', category: 'תרבות' },
  ];

  const fetchPromises = sources.map(source => 
    fetchRSSFeed(source.url, source.category).catch(err => {
      console.error(`Failed to fetch ${source.category}:`, err.message);
      return [];
    })
  );

  const results = await Promise.all(fetchPromises);
  
  for (const result of results) {
    articles.push(...result);
  }

  if (articles.length === 0) {
    console.warn('All RSS feeds failed, attempting homepage scrape');
    const homepageArticles = await scrapeHomepage().catch(err => {
      console.error('Homepage scrape failed:', err.message);
      return [];
    });
    articles.push(...homepageArticles);
  }

  return deduplicateArticles(articles);
}

async function fetchRSSFeed(url, category) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const text = await response.text();
  return parseRSS(text, category);
}

function parseRSS(xmlText, category) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/;
  const linkRegex = /<link>(.*?)<\/link>/;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(titleRegex);
    const linkMatch = itemContent.match(linkRegex);
    const descMatch = itemContent.match(descRegex);
    const dateMatch = itemContent.match(pubDateRegex);

    if (titleMatch && linkMatch) {
      const title = cleanText(titleMatch[1]);
      const link = linkMatch[1].trim();
      const description = descMatch ? cleanHTML(descMatch[1]) : '';
      const pubDate = dateMatch ? new Date(dateMatch[1]) : new Date();

      if (title && link && isValidYnetLink(link)) {
        articles.push({
          id: generateArticleId(link),
          title,
          summary: truncateSummary(description, 200),
          link,
          category,
          publishedAt: pubDate.toISOString(),
          scrapedAt: new Date().toISOString(),
        });
      }
    }
  }

  return articles;
}

async function scrapeHomepage() {
  const response = await fetch('https://www.ynet.co.il', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Homepage fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseHomepageHTML(html);
}

function parseHomepageHTML(html) {
  const articles = [];
  const linkPattern = /<a[^>]+href=["'](\/articles\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  const titlePattern = /<[^>]*class=["'][^"']*title[^"']*["'][^>]*>(.*?)<\/[^>]+>/i;
  
  let match;
  const seenLinks = new Set();
  
  while ((match = linkPattern.exec(html)) !== null) {
    const relativeLink = match[1];
    const anchorContent = match[2];
    
    const fullLink = relativeLink.startsWith('http') 
      ? relativeLink 
      : `https://www.ynet.co.il${relativeLink}`;
    
    if (seenLinks.has(fullLink) || !isValidYnetLink(fullLink)) {
      continue;
    }
    seenLinks.add(fullLink);
    
    const titleMatch = anchorContent.match(titlePattern);
    const title = titleMatch 
      ? cleanHTML(titleMatch[1]) 
      : cleanHTML(anchorContent.substring(0, 150));
    
    if (title.length > 10) {
      articles.push({
        id: generateArticleId(fullLink),
        title: cleanText(title),
        summary: '',
        link: fullLink,
        category: 'כללי',
        publishedAt: new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
      });
    }
    
    if (articles.length >= 30) break;
  }

  return articles;
}

function cleanHTML(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSummary(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

function isValidYnetLink(link) {
  if (!link) return false;
  
  const url = link.toLowerCase();
  return (url.includes('ynet.co.il') || url.startsWith('/articles/')) &&
         (url.includes('/articles/') || url.includes('/article/')) &&
         !url.includes('/json') &&
         !url.includes('/rss') &&
         !url.includes('.xml');
}

function generateArticleId(link) {
  const match = link.match(/\/(\d+)/);
  if (match) {
    return `ynet-${match[1]}`;
  }
  
  const hash = simpleHash(link);
  return `ynet-${hash}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function deduplicateArticles(articles) {
  const seen = new Map();
  const unique = [];
  
  for (const article of articles) {
    if (!seen.has(article.id)) {
      seen.set(article.id, true);
      unique.push(article);
    }
  }
  
  return unique.sort((a, b) => 
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
```