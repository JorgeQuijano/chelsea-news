const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.NEON_CONN_STRING,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  try {
    await client.connect();
    const result = await client.query(`
      SELECT id, title, link, source, published_at, content
      FROM articles
      ORDER BY published_at DESC
      LIMIT 50;
    `);
    await client.end();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, articles: result.rows }));
  } catch (err) {
    console.error('DB error:', err);
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
};
