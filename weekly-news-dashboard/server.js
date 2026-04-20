require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const { fetchAllTopics, isCacheStale, loadCachedTopics } = require('./fetcher');
const { sendDigest } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOPIC_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#7c3aed',
  '#ea580c', '#0891b2', '#be185d', '#ca8a04',
];

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function buildHTML(topicsData) {
  const css = fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8');

  // Most recent fetchedAt across all topics
  let lastUpdated = 'Never';
  for (const t of topicsData) {
    if (t.fetchedAt) {
      if (lastUpdated === 'Never' || new Date(t.fetchedAt) > new Date(lastUpdated)) {
        lastUpdated = t.fetchedAt;
      }
    }
  }
  const lastUpdatedDisplay = lastUpdated === 'Never'
    ? 'Never'
    : new Date(lastUpdated).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

  const sectionsHTML = topicsData.map((topic, i) => {
    const color = TOPIC_COLORS[i % TOPIC_COLORS.length];

    const cardsHTML = topic.articles.length === 0
      ? '<p class="no-articles">No articles found. Click "Refresh now" to fetch the latest news.</p>'
      : topic.articles.map(a => `
        <div class="card">
          <a class="card-title" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a>
          <div class="card-meta">${escapeHtml(a.source && a.source.name ? a.source.name : 'Unknown')} &bull; ${formatDate(a.publishedAt)}</div>
          ${a.description ? `<p class="card-desc">${escapeHtml(a.description)}</p>` : ''}
        </div>`).join('');

    return `
    <section class="topic-section">
      <div class="topic-header" style="background:${color}">
        <h2>${escapeHtml(topic.name)}</h2>
      </div>
      <div class="cards-grid">${cardsHTML}</div>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly News Digest</title>
  <style>${css}</style>
</head>
<body>
  <header class="app-header">
    <div class="header-left">
      <h1>Weekly News Digest</h1>
      <span class="last-updated">Last updated: ${lastUpdatedDisplay}</span>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="refreshNow(this)">Refresh now</button>
      <button class="btn btn-primary" onclick="downloadPDF(this)">Download PDF</button>
      <button class="btn btn-primary" onclick="sendDigest(this)">Send digest</button>
    </div>
  </header>
  <main class="main-content">
    ${sectionsHTML}
  </main>
  <script>
    async function refreshNow(btn) {
      btn.disabled = true;
      btn.textContent = 'Refreshing\u2026';
      try {
        const res = await fetch('/refresh', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        window.location.reload();
      } catch (e) {
        alert('Refresh failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Refresh now';
      }
    }

    async function downloadPDF(btn) {
      btn.disabled = true;
      btn.textContent = 'Generating\u2026';
      try {
        const res = await fetch('/export', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'news-digest-' + today + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('PDF generation failed: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Download PDF';
      }
    }

    async function sendDigest(btn) {
      btn.disabled = true;
      btn.textContent = 'Sending\u2026';
      try {
        const res = await fetch('/send', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        alert('Digest sent successfully!');
      } catch (e) {
        alert('Send failed: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send digest';
      }
    }
  </script>
</body>
</html>`;
}

async function generatePDF() {
  const topicsData = loadCachedTopics();
  const html = buildHTML(topicsData);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  try {
    const topicsData = loadCachedTopics();
    res.send(buildHTML(topicsData));
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Internal server error: ' + err.message);
  }
});

app.post('/refresh', async (req, res) => {
  try {
    await fetchAllTopics();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /refresh error:', err);
    res.status(500).send(err.message);
  }
});

app.post('/export', async (req, res) => {
  try {
    const pdf = await generatePDF();
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="news-digest-${dateStr}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('POST /export error:', err);
    res.status(500).send(err.message);
  }
});

app.post('/send', async (req, res) => {
  try {
    const pdf = await generatePDF();
    await sendDigest(pdf);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /send error:', err);
    res.status(500).send(err.message);
  }
});

// ── Cron: every Monday at 06:00 ──────────────────────────────────────────────

cron.schedule('0 6 * * 1', async () => {
  console.log('Cron triggered: fetching weekly news…');
  try {
    await fetchAllTopics();
  } catch (err) {
    console.error('Cron fetch error:', err);
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`Weekly News Dashboard running at http://localhost:${PORT}`);
  if (isCacheStale()) {
    console.log('Cache is stale or missing — fetching on startup…');
    try {
      await fetchAllTopics();
    } catch (err) {
      console.error('Startup fetch error:', err);
    }
  } else {
    console.log('Cache is fresh — skipping startup fetch.');
  }
});
