#!/usr/bin/env python3
"""
Chelsea News Scraper
Fetches articles from Chelsea FC Official RSS feed and stores in Neon DB.
Run on a cron schedule (e.g., every 15 minutes).
"""

import os
import psycopg2
import feedparser
from datetime import datetime
from urllib.parse import urlparse

# Neon connection — set NEON_CONN_STRING env var or hardcode for now
NEON_CONN_STRING = os.environ.get(
    'NEON_CONN_STRING',
    'postgresql://neondb_owner:npg_nUPZ9mW0bBMp@ep-fragrant-snow-am9trqvf-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
)

RSS_FEEDS = [
    ('Evening Standard', 'https://www.standard.co.uk/sport/football/chelsea/rss', None),
    ('The Guardian', 'https://www.theguardian.com/football/chelsea/rss', None),
    ('BBC Sport', 'https://feeds.bbci.co.uk/sport/football/rss.xml', 'chelsea'),
    # Add more feeds here as we expand
]

def get_db_connection():
    return psycopg2.connect(NEON_CONN_STRING)

def create_table_if_not_exists(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                link TEXT UNIQUE NOT NULL,
                source TEXT,
                published_at TIMESTAMPTZ,
                scraped_at TIMESTAMPTZ DEFAULT NOW(),
                content TEXT
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_articles_published_at
            ON articles(published_at DESC);
        """)
        conn.commit()

def parse_rss_feed(source_name, feed_url, filter_keyword=None):
    """Fetch and parse an RSS feed, return list of article dicts."""
    articles = []
    feed = feedparser.parse(feed_url)
    
    for entry in feed.entries:
        title = entry.get('title', '').strip()
        link = entry.get('link', '').strip()
        
        # Skip if no title or link
        if not title or not link:
            continue
        
        # Optional: filter by keyword (e.g. BBC is all football, not Chelsea-specific)
        if filter_keyword and filter_keyword.lower() not in (title + link).lower():
            continue
        
        article = {
            'title': title,
            'link': link,
            'source': source_name,
            'content': entry.get('summary', entry.get('description', '')).strip(),
        }
        
        # Parse published date
        published = entry.get('published_parsed') or entry.get('updated_parsed')
        if published:
            article['published_at'] = datetime(*published[:6])
        else:
            article['published_at'] = datetime.utcnow()
            
        articles.append(article)
    
    return articles

def insert_articles(conn, articles):
    """Insert articles into DB, skip duplicates (link is UNIQUE)."""
    inserted = 0
    skipped = 0
    
    with conn.cursor() as cur:
        for article in articles:
            try:
                cur.execute("""
                    INSERT INTO articles (title, link, source, published_at, content)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (link) DO NOTHING;
                """, (
                    article['title'],
                    article['link'],
                    article['source'],
                    article['published_at'],
                    article.get('content', '')
                ))
                if cur.rowcount > 0:
                    inserted += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f"Error inserting article: {e}")
                skipped += 1
    
    conn.commit()
    return inserted, skipped

def scrape_all():
    print(f"[{datetime.now().isoformat()}] Starting scrape...")
    conn = get_db_connection()
    create_table_if_not_exists(conn)
    
    total_inserted = 0
    total_skipped = 0
    
    for source_name, feed_url, filter_kw in RSS_FEEDS:
        try:
            articles = parse_rss_feed(source_name, feed_url, filter_kw)
            inserted, skipped = insert_articles(conn, articles)
            print(f"  [{source_name}] {len(articles)} fetched | {inserted} new | {skipped} dupes")
            total_inserted += inserted
            total_skipped += skipped
        except Exception as e:
            print(f"  [{source_name}] ERROR: {e}")
    
    conn.close()
    print(f"[{datetime.now().isoformat()}] Done. {total_inserted} inserted, {total_skipped} skipped.")
    return total_inserted, total_skipped

if __name__ == '__main__':
    scrape_all()
