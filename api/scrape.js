const { Client } = require('pg');
const Parser = require('rss-parser');

const parser = new Parser();
const client = new Client({
  connectionString: process.env.NEON_CONN_STRING,
  ssl: { rejectUnauthorized: false },
});

const RSS_FEEDS = [
  { name: 'Evening Standard', url: 'https://www.standard.co.uk/sport/football/chelsea/rss', filter: null },
  { name: 'The Guardian', url: 'https://www.theguardian.com/football/chelsea/rss', filter: null },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', filter: 'chelsea' },
];

async function insertArticle(article) {
  await client.query(`
    INSERT INTO articles (title, link, source, published_at, content)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (link) DO NOTHING;
  `, [article.title, article.link, article.source, article.published_at, article.content || '']);
}

async function scrapeFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  let inserted = 0;

  for (const entry of parsed.items) {
    const title = entry.title?.trim();
    const link = entry.link?.trim();
    if (!title || !link) continue;

    // Apply keyword filter if set
    if (feed.filter && !title.toLowerCase().includes(feed.filter) && !link.toLowerCase().includes(feed.filter)) {
      continue;
    }

    const article = {
      title,
      link,
      source: feed.name,
      published_at: entry.isoDate ? new Date(entry.isoDate) : new Date(),
      content: entry.contentSnippet || entry.content || '',
    };

    try {
      const result = await insertArticle(article);
      inserted++;
    } catch (e) {
      // skip dupes
    }
  }

  return inserted;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Optional: only allow cron or authorized callers
  if (req.headers['x-vercel-cron'] !== '1' && req.query.secret !== process.env.CRON_SECRET) {
    res.writeHead(403);
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    return;
  }

  try {
    await client.connect();
    let totalInserted = 0;

    for (const feed of RSS_FEEDS) {
      try {
        const count = await scrapeFeed(feed);
        totalInserted += count;
      } catch (e) {
        console.error(`[${feed.name}] Error:`, e.message);
      }
    }

    await client.end();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, inserted: totalInserted }));
  } catch (err) {
    console.error('Scraper error:', err);
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
};
