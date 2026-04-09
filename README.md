# עיתון אישי - התקציר הבוקר

Personal morning digest that scrapes Ynet news, learns your preferences based on reading behavior, and delivers one personalized summary link every morning.

## Features

- 🌅 Daily automated news scraping at 6 AM Israel time
- 🧠 Machine learning-based personalization from your reading behavior
- 📰 Clean, Hebrew RTL digest interface
- 📊 Click tracking to improve future recommendations
- 🔗 Shareable digest links
- 💾 Minimal data storage (only article IDs and click counts)

## Architecture

### Cloudflare Workers
The main worker (`index.js`) handles:
- **HTTP Routes**: Serving digest UI, click tracking API, digest retrieval
- **Scheduled Cron**: Daily scraping and digest generation at 6 AM Israel time
- **KV Integration**: Storing and retrieving user preferences and reading history

### Core Modules

- **lib/scraper.js**: Fetches and parses Ynet news articles
- **lib/ml-scorer.js**: Scores articles based on reading patterns (category preferences, time-of-day, CTR)
- **lib/digest-generator.js**: Creates personalized digests and stores them in KV
- **lib/kv-store.js**: Abstraction layer for all KV operations
- **lib/utils.js**: Date/time helpers, Hebrew formatting, error handling

### Storage

Cloudflare KV stores:
- User reading history (article IDs + timestamps)
- Click tracking data
- Generated digests with metadata
- User preference scores

## Prerequisites

- Node.js 16+ and npm
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd personal-morning-digest
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create KV Namespaces

You need to create three KV namespaces:

```bash
# Create production KV namespace
wrangler kv:namespace create DIGEST_KV

# Create preview KV namespace for development
wrangler kv:namespace create DIGEST_KV --preview
```

Take note of the namespace IDs returned.

### 4. Configure wrangler.toml

Update `wrangler.toml` with your KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "DIGEST_KV"
id = "your-production-namespace-id"
preview_id = "your-preview-namespace-id"
```

### 5. Environment Variables (Optional)

Copy `.env.example` to `.env` and configure if needed:

```bash
cp .env.example .env
```

Variables:
- `DEBUG`: Enable detailed logging (true/false)
- Custom Ynet API keys if available (optional)

### 6. Deploy

```bash
# Deploy to production
npm run deploy

# Or deploy with wrangler directly
wrangler deploy
```

## Development

### Local Development

```bash
npm run dev
```

This starts a local server at `http://localhost:8787` with:
- Hot reload on file changes
- Local KV simulation
- All routes available for testing

### Testing Cron Locally

You can trigger the cron job manually:

```bash
curl http://localhost:8787/__scheduled
```

Or in production:

```bash
wrangler tail --format pretty
# Then trigger via Cloudflare dashboard or API
```

## API Endpoints

### GET /
Serves the digest UI for the current user

### GET /api/digest/:id
Retrieves a specific digest by ID
- Response: JSON with digest data and articles

### POST /api/track
Tracks article clicks
- Body: `{ "articleId": "string", "digestId": "string" }`
- Response: `{ "success": true }`

### Scheduled Cron (Internal)
Runs daily at 6 AM Israel time (0 6 * * *)
- Scrapes Ynet news
- Generates personalized digest
- Stores in KV with unique ID

## Cron Schedule

The worker runs automatically every day at 6 AM Israel time:

```
0 6 * * *
```

To modify the schedule, edit `wrangler.toml`:

```toml
[triggers]
crons = ["0 6 * * *"]  # Change to your preferred time
```

Cron format: `minute hour day-of-month month day-of-week`

## Data Storage

### KV Keys Structure

```
digest:{digestId}              → Full digest data with articles
user:history                   → User reading history (last 90 days)
user:preferences              → Category and content preferences
tracking:article:{articleId}  → Click tracking for specific articles
scrape:latest                 → Latest scrape results (cached 1 hour)
```

### TTL Settings

- Digests: 30 days
- Reading history: 90 days
- Scrape cache: 1 hour
- Tracking data: 90 days

## Monitoring

### View Logs

```bash
wrangler tail --format pretty
```

### Check Cron Status

Visit Cloudflare Dashboard → Workers → Your Worker → Triggers tab

### Debug Mode

Set `DEBUG=true` in environment variables for verbose logging.

## Customization

### Scraping Source

Edit `lib/scraper.js` to change news source or parsing logic.

### ML Algorithm

Modify `lib/ml-scorer.js` to adjust scoring weights:
- Category preference weight
- Time-of-day patterns
- Click-through rate importance
- Recency bias

### Digest Size

Change article count in `lib/digest-generator.js`:

```javascript
const topArticles = scoredArticles.slice(0, 10); // Change 10 to desired count
```

### UI Styling

The digest UI is inline in `index.js`. Modify the `<style>` section for custom styling.

## Troubleshooting

### Cron Not Running

1. Check Cloudflare Dashboard → Workers → Triggers
2. Verify cron schedule syntax in `wrangler.toml`
3. Check worker logs: `wrangler tail`

### Scraping Failures

The scraper has built-in error handling and will:
- Retry failed requests
- Return partial results if some articles fail
- Log detailed errors

Check logs to identify specific issues.

### KV Errors

Ensure namespace bindings match in:
1. `wrangler.toml` configuration
2. Code references in `lib/kv-store.js`

### Hebrew Text Issues

If text appears broken:
- Ensure your editor supports UTF-8
- Check RTL CSS is properly applied
- Verify `dir="rtl"` attribute on HTML elements

## Performance

- **Cold Start**: ~50-100ms
- **Digest Generation**: ~200-500ms
- **Scraping Duration**: ~2-5 seconds
- **KV Read Latency**: ~10-50ms
- **KV Write Latency**: ~50-200ms

## Costs

Cloudflare Workers Free Tier includes:
- 100,000 requests/day
- 10ms CPU time per request
- 1GB KV storage
- 1000 KV writes/day

This project typically uses:
- 1 cron execution/day (~3-5s CPU)
- ~50-100 KV operations/day
- ~1-5 MB KV storage

Well within free tier limits for personal use.

## Security

- No user authentication (single-user system)
- No external API keys required
- Minimal data collection
- No PII stored
- All data stays in Cloudflare infrastructure

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run dev`
5. Submit a pull request

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Cloudflare Workers documentation
3. Check Wrangler CLI documentation
4. Open an issue in the repository