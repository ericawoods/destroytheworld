require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function topicSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchTopic(topic) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn('NEWS_API_KEY is not set — skipping fetch');
    return [];
  }

  const isStablecoin = topic.name.toLowerCase() === 'stablecoin';
  const from = daysAgoISO(isStablecoin ? 7 : 14);

  const seen = new Set();
  const articles = [];

  for (const keyword of topic.keywords) {
    try {
      const { data } = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: `"${keyword}"`,
          from,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: 20,
          apiKey,
        },
        timeout: 10000,
      });
      for (const article of data.articles || []) {
        if (article.url && !seen.has(article.url)) {
          seen.add(article.url);
          articles.push(article);
        }
      }
    } catch (err) {
      const status = err.response?.status;
      console.error(`  [${topic.name}] keyword "${keyword}" failed (${status || err.message})`);
    }
    // Avoid hitting NewsAPI rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const top10 = articles.slice(0, 10);

  const cachePath = path.join(CACHE_DIR, `${topicSlug(topic.name)}.json`);
  fs.writeFileSync(cachePath, JSON.stringify({
    topic: topic.name,
    fetchedAt: new Date().toISOString(),
    articles: top10,
  }, null, 2));

  console.log(`  [${topic.name}] cached ${top10.length} articles`);
  return top10;
}

async function fetchAllTopics() {
  const topics = JSON.parse(fs.readFileSync(path.join(__dirname, 'topics.json'), 'utf8'));
  console.log(`Fetching news for ${topics.length} topics…`);
  for (const topic of topics) {
    await fetchTopic(topic);
  }
  console.log('Fetch complete.');
}

function isCacheStale() {
  const topics = JSON.parse(fs.readFileSync(path.join(__dirname, 'topics.json'), 'utf8'));
  const maxAgeMs = 24 * 60 * 60 * 1000;
  for (const topic of topics) {
    const cachePath = path.join(CACHE_DIR, `${topicSlug(topic.name)}.json`);
    if (!fs.existsSync(cachePath)) return true;
    const { fetchedAt } = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!fetchedAt || Date.now() - new Date(fetchedAt).getTime() > maxAgeMs) return true;
  }
  return false;
}

function loadCachedTopics() {
  const topics = JSON.parse(fs.readFileSync(path.join(__dirname, 'topics.json'), 'utf8'));
  return topics.map(topic => {
    const cachePath = path.join(CACHE_DIR, `${topicSlug(topic.name)}.json`);
    if (!fs.existsSync(cachePath)) {
      return { name: topic.name, articles: [], fetchedAt: null };
    }
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return { name: topic.name, articles: cached.articles || [], fetchedAt: cached.fetchedAt || null };
  });
}

module.exports = { fetchAllTopics, isCacheStale, loadCachedTopics, topicSlug };
