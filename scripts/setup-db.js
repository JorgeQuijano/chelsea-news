const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_nUPZ9mW0bBMp@ep-fragrant-snow-am9trqvf-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

async function setup() {
  await client.connect();
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT UNIQUE NOT NULL,
      source TEXT,
      published_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      content TEXT
    );
  `);

  // Index for fast chronological queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
  `);

  console.log('✅ Schema created successfully');
  await client.end();
}

setup().catch(console.error);
