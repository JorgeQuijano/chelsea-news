const { Client } = require('pg');
const http = require('http');

const port = 3000;
const NEON_CONN_STRING = process.env.NEON_CONN_STRING || 'postgresql://neondb_owner:npg_nUPZ9mW0bBMp@ep-fragrant-snow-am9trqvf-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function getDbConnection() {
  return new Client(NEON_CONN_STRING);
}

async function getArticles() {
  const client = getDbConnection();
  await client.connect();
  const result = await client.query(`
    SELECT id, title, link, source, published_at, content
    FROM articles
    ORDER BY published_at DESC
    LIMIT 50;
  `);
  await client.end();
  return result.rows;
}

const server = http.createServer(async (req, res) => {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/articles' && req.method === 'GET') {
    try {
      const articles = await getArticles();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, articles }));
    } catch (err) {
      console.error('DB error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  }
});

server.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
