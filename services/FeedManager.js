const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');
const { EmbedBuilder } = require('discord.js');

const parser = new Parser();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

class FeedManager {
    constructor(client) {
        this.client = client;
        this.interval = null;
        this.checkInterval = 10 * 60 * 1000; // 10 Minutes default
    }

    start() {
        console.log('📡 Feed Manager Started');
        this.checkFeeds();
        this.interval = setInterval(() => this.checkFeeds(), this.checkInterval);
    }

    async checkFeeds() {
        try {
            // 1. Fetch Active Feeds
            const { data: feeds, error } = await supabase
                .from('feed_configs')
                .select('*')
                .eq('is_enabled', true);

            if (error) throw error;
            if (!feeds || feeds.length === 0) return;

            console.log(`📡 Checking ${feeds.length} feeds...`);

            // 2. Process Each Feed
            for (const feed of feeds) {
                await this.processFeed(feed);
            }

        } catch (err) {
            console.error('Error in checkFeeds:', err);
        }
    }

    async processFeed(feed) {
        try {
            let items = [];

            // A. Fetch Items based on Platform
            if (feed.platform === 'youtube') {
                // YouTube RSS: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNELID
                // Or user might put full URL, handle both
                let url = feed.source;
                if (!url.startsWith('http')) {
                    url = `https://www.youtube.com/feeds/videos.xml?channel_id=${feed.source}`;
                }
                const feedData = await parser.parseURL(url);
                items = feedData.items;

            } else if (feed.platform === 'rss') {
                const feedData = await parser.parseURL(feed.source);
                items = feedData.items;

            } else if (feed.platform === 'reddit') {
                // Reddit JSON: https://www.reddit.com/r/SUBREDDIT/new.json
                let sub = feed.source.replace('r/', '');
                const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=5`);
                const json = await res.json();
                items = json.data.children.map(c => ({
                    title: c.data.title,
                    link: `https://reddit.com${c.data.permalink}`,
                    pubDate: new Date(c.data.created_utc * 1000).toISOString(),
                    author: c.data.author,
                    id: c.data.id
                }));
            }

            if (!items || items.length === 0) return;

            // B. Find New Items 
            // We only take the LATEST item to compare against last_posted_id for simplicity (or loop until hit)
            // For this implementation, we check the very first item (latest).
            const latest = items[0];

            // Unique ID generation (YT uses guidelines, Reddit uses id, RSS uses guid or link)
            const latestId = latest.id || latest.guid || latest.link;

            if (latestId === feed.last_posted_id) {
                return; // Nothing new
            }

            // C. It's New! Post it.
            const channel = await this.client.channels.fetch(feed.channel_id).catch(() => null);
            if (!channel) {
                console.warn(`Channel ${feed.channel_id} not found for feed ${feed.id}`);
                return;
            }

            // D. Format Message
            const message = this.formatMessage(feed.message_template, latest, feed.platform);

            await channel.send(message);
            console.log(`✅ Posted new ${feed.platform} item to ${channel.name}: ${latest.title}`);

            // E. Update Database
            await supabase
                .from('feed_configs')
                .update({ last_posted_id: latestId })
                .eq('id', feed.id);

        } catch (err) {
            console.error(`Error processing feed ${feed.id} (${feed.source}):`, err.message);
        }
    }

    formatMessage(template, item, platform) {
        let text = template || "**New Post:** {url}";

        // Replacements
        text = text.replace(/{title}/g, item.title || 'No Title');
        text = text.replace(/{url}/g, item.link || '');
        text = text.replace(/{author}/g, item.author || item.creator || 'Unknown');
        text = text.replace(/{platform}/g, platform);

        return text;
    }
}

module.exports = FeedManager;
