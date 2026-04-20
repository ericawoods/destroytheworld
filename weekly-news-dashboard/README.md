# Weekly News Dashboard

A self-hosted Node.js web app that fetches news articles grouped by topic, displays them in a clean dashboard, and lets you export or email a PDF digest.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and fill in your values
cp .env.example .env

# 3. Start the server
node server.js
```

Then open http://localhost:3000 in your browser.

---

## Getting a free NewsAPI.org key

1. Go to https://newsapi.org/register
2. Create a free account (the free Developer plan allows 100 requests/day)
3. Copy your API key from the dashboard
4. Paste it into your `.env` file as `NEWS_API_KEY=...`

> **Note:** The free NewsAPI plan only returns articles up to 1 month old and limits results to 100 requests per day. For higher volume or older articles, see their paid plans at https://newsapi.org/pricing.

---

## Configuring .env

Copy `.env.example` to `.env` and fill in every value:

```dotenv
# NewsAPI.org key
NEWS_API_KEY=abc123...

# SMTP server for outbound email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password

# Email sender and comma-separated recipient list
EMAIL_FROM=digest@yourdomain.com
EMAIL_TO=alice@example.com,bob@example.com

# Optional — defaults to 3000
PORT=3000
```

### Gmail tips
- Use an [App Password](https://support.google.com/accounts/answer/185833) rather than your main account password.
- Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`.

---

## Adding or editing topics

Open `topics.json`. Each entry has a `name` and a list of `keywords`:

```json
[
  {
    "name": "My Topic",
    "keywords": ["keyword one", "keyword two", "keyword three"]
  }
]
```

- **name** — displayed as the section header in the dashboard and PDF.
- **keywords** — each keyword is queried separately against NewsAPI; results are merged and deduplicated. More keywords = more coverage but more API calls.

Restart the server (or click **Refresh now**) after editing `topics.json`.

### Date window
- **Stablecoin** topic: articles from the last **7 days**.
- All other topics: articles from the last **14 days**.

To change a topic's window, edit the logic in `fetcher.js` — look for the `isStablecoin` check and adjust as needed.

---

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard (server-side rendered) |
| `POST` | `/refresh` | Re-fetch all topics and update cache |
| `POST` | `/export` | Generate and download a PDF |
| `POST` | `/send` | Generate PDF and email to `EMAIL_TO` |

---

## Automatic refresh (node-cron)

The server schedules a fetch every **Monday at 06:00** using `node-cron`. It also checks on startup — if any cache file is missing or older than 24 hours, it fetches automatically.

---

## Setting up a system cron (alternative to node-cron)

If you prefer to drive the refresh from the OS rather than from within Node, you can disable the in-process cron (comment out the `cron.schedule` block in `server.js`) and add a system cron entry instead.

```bash
crontab -e
```

Add:

```
0 6 * * 1  curl -s -X POST http://localhost:3000/refresh
```

This fires a `POST /refresh` request every Monday at 06:00 local time. Make sure the server is already running before the cron fires.

To keep the server running persistently, use a process manager such as [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start server.js --name weekly-news-dashboard
pm2 save
pm2 startup   # follow the instructions printed to enable autostart
```

---

## Project structure

```
weekly-news-dashboard/
├── server.js          # Express server, routes, cron job, PDF generation
├── fetcher.js         # NewsAPI fetching, deduplication, cache management
├── mailer.js          # Nodemailer email logic
├── topics.json        # Topic and keyword configuration
├── .env               # Your secrets (never commit this)
├── .env.example       # Template — safe to commit
├── cache/             # Auto-created; one JSON file per topic
└── public/
    └── style.css      # Dashboard stylesheet
```
