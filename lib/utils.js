```javascript
export function getIsraelTime() {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return israelTime;
}

export function formatIsraelDate(date = new Date()) {
  const israelDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return israelDate.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}

export function formatIsraelTime(date = new Date()) {
  const israelDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return israelDate.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getIsraelHour() {
  const israelTime = getIsraelTime();
  return israelTime.getHours();
}

export function isMorning() {
  const hour = getIsraelHour();
  return hour >= 6 && hour < 12;
}

export function isAfternoon() {
  const hour = getIsraelHour();
  return hour >= 12 && hour < 18;
}

export function isEvening() {
  const hour = getIsraelHour();
  return hour >= 18 || hour < 6;
}

export function getTimeOfDay() {
  if (isMorning()) return 'morning';
  if (isAfternoon()) return 'afternoon';
  return 'evening';
}

export function normalizeHebrewText(text) {
  if (!text) return '';
  return text
    .replace(/\u200F/g, '')
    .replace(/\u200E/g, '')
    .replace(/[\u0591-\u05C7]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function truncateHebrewText(text, maxLength = 150) {
  if (!text) return '';
  const normalized = normalizeHebrewText(text);
  if (normalized.length <= maxLength) return normalized;
  
  const truncated = normalized.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

export function sanitizeHebrewText(text) {
  if (!text) return '';
  return normalizeHebrewText(text)
    .replace(/[<>]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return '';
  }
}

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

export function normalizeUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return urlObj.href;
  } catch (e) {
    if (!url.startsWith('http')) {
      return normalizeUrl('https://' + url);
    }
    return url;
  }
}

export function generateId(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateDigestId() {
  const israelTime = getIsraelTime();
  const dateStr = israelTime.toISOString().split('T')[0].replace(/-/g, '');
  const randomStr = generateId(6);
  return `digest-${dateStr}-${randomStr}`;
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function generateArticleId(url, title) {
  const combined = `${url}-${title}`;
  return hashString(combined);
}

export function logError(message, error, context = {}) {
  const timestamp = getIsraelTime().toISOString();
  const logEntry = {
    timestamp,
    level: 'ERROR',
    message,
    error: error?.message || String(error),
    stack: error?.stack,
    context
  };
  console.error(JSON.stringify(logEntry));
}

export function logInfo(message, context = {}) {
  const timestamp = getIsraelTime().toISOString();
  const logEntry = {
    timestamp,
    level: 'INFO',
    message,
    context
  };
  console.log(JSON.stringify(logEntry));
}

export function logWarning(message, context = {}) {
  const timestamp = getIsraelTime().toISOString();
  const logEntry = {
    timestamp,
    level: 'WARNING',
    message,
    context
  };
  console.warn(JSON.stringify(logEntry));
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

export function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status);
}

export function successResponse(data) {
  return jsonResponse({ success: true, data });
}

export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

export function redirectResponse(url, status = 302) {
  return new Response(null, {
    status,
    headers: {
      'Location': url
    }
  });
}

export function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logWarning(`Retry attempt ${attempt}/${maxAttempts} failed`, { error: error.message });
      
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt);
      }
    }
  }
  
  throw lastError;
}

export function parseJsonSafely(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    logWarning('Failed to parse JSON', { error: e.message });
    return defaultValue;
  }
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function percentage(value, total) {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function groupBy(array, keyFn) {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

export function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function uniqueBy(array, keyFn) {
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function getDaysSince(date) {
  const now = getIsraelTime();
  const then = new Date(date);
  const diffMs = now - then;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getHoursSince(date) {
  const now = getIsraelTime();
  const then = new Date(date);
  const diffMs = now - then;
  return Math.floor(diffMs / (1000 * 60 * 60));
}

export function isToday(date) {
  const israelNow = getIsraelTime();
  const israelDate = new Date(new Date(date).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  
  return israelNow.getFullYear() === israelDate.getFullYear() &&
         israelNow.getMonth() === israelDate.getMonth() &&
         israelNow.getDate() === israelDate.getDate();
}

export function formatRelativeTime(date) {
  const hours = getHoursSince(date);
  
  if (hours < 1) return 'לפני כמה דקות';
  if (hours === 1) return 'לפני שעה';
  if (hours < 24) return `לפני ${hours} שעות`;
  
  const days = getDaysSince(date);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  
  return formatIsraelDate(date);
}
```