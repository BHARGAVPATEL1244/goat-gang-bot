const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');
const { EmbedBuilder } = require('discord.js');

const parser = new Parser();
let supabase = null;
if (process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
} else {
    console.warn('[FEED MANAGER] Supabase keys missing! Feeds will not work.');
}

class FeedManager {
    constructor(client) {
        this.client = client;
        this.interval = null;
        this.lastCheckedMap = new Map(); // Stores timestamp of last check per feed ID
    }

    start() {
        console.log('📡 Feed Manager Started');
        // Run the main loop every 1 minute
        // We check if each feed is 'due' based on its specific interval
        this.checkFeeds();
        this.interval = setInterval(() => this.checkFeeds(), 60 * 1000);
    }

    async checkFeeds() {
        try {
            // 1. Fetch Active Feeds
            if (!supabase) return;
            const { data: feeds, error } = await supabase
                .from('feed_configs')
                .select('*')
                .eq('is_enabled', true);

            if (error) throw error;
            if (!feeds || feeds.length === 0) return;

            const now = Date.now();

            // 2. Process Each Feed if Due
            for (const feed of feeds) {
                const lastChecked = this.lastCheckedMap.get(feed.id) || 0;
                const intervalMinutes = feed.check_interval_minutes || 15; // Default 15m
                const intervalMs = intervalMinutes * 60 * 1000;

                if (now - lastChecked >= intervalMs) {
                    await this.processFeed(feed);
                    this.lastCheckedMap.set(feed.id, now);
                }
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
                // Reddit Subreddit Posts
                let sub = feed.source.replace('r/', '');
                const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=5`, {
                    headers: { 'User-Agent': 'GoatGangBot/1.0' }
                });
                if (!res.ok) throw new Error(`Reddit API Error: ${res.status}`);
                const json = await res.json();
                items = json.data.children.map(c => ({
                    title: c.data.title,
                    link: `https://reddit.com${c.data.permalink}`,
                    pubDate: new Date(c.data.created_utc * 1000).toISOString(),
                    author: c.data.author,
                    id: c.data.id
                }));

            } else if (feed.platform === 'reddit_comments') {
                // Reddit Post Comments
                // Source should be full URL or ID. If URL, extract ID.
                // URL: https://www.reddit.com/r/subreddit/comments/POSTID/...
                let postId = feed.source;
                const match = feed.source.match(/comments\/([a-z0-9]+)\//i);
                if (match) postId = match[1];

                const res = await fetch(`https://www.reddit.com/comments/${postId}.json?sort=new&limit=20`, {
                    headers: { 'User-Agent': 'GoatGangBot/1.0' }
                });
                if (!res.ok) throw new Error(`Reddit API Error: ${res.status}`);
                const json = await res.json();

                // Reddit returns array [PostData, CommentsData]
                const commentsData = json[1].data.children;

                items = commentsData
                    .filter(c => c.kind === 't1') // t1 = comment
                    .map(c => ({
                        id: c.data.id,
                        title: json[0].data.children[0].data.title, // Post Title
                        body: c.data.body,
                        author: c.data.author,
                        link: `https://reddit.com${c.data.permalink}`,
                        created_utc: c.data.created_utc
                    }));
            }

            if (!items || items.length === 0) return;

            // B. Sort Items Chronologically (Oldest -> Newest) so we process in order if multiple new
            // Reddit usually returns newest first, so we reverse.
            // RSS/YT can vary.
            // Let's standardise: We want to find the first item that is NEWER than last_posted_id.

            // Actually, simplest logic for "Last Posted ID" strategy:
            // 1. If we have a last_posted_id, find it in the list.
            // 2. Take everything NEWER (above it, or chronologically after).
            // 3. If last_posted_id not found, maybe just take the absolute latest (to avoid spamming history).

            // Current simplified logic: Just check the VERY LATEST item.
            // *Enhancement*: For Reddit Comments, we might want multiple new comments.
            // Let's stick to "Latest One" for now to check functionality, OR improve to "One at a time" loop.

            // Improved Logic:
            // Find items newer than last_posted_id?
            // Since ID is random for Reddit, we rely on equality.
            // If we assume the fetch list is ordered Newest -> Oldest (standard):

            const latest = items[0];
            const latestId = latest.id || latest.guid || latest.link;

            if (latestId === feed.last_posted_id) return; // Nothing new

            // Check Filters for Reddit Comments
            if (feed.platform === 'reddit_comments' && feed.meta) {
                // Min Length
                if (feed.meta.min_length && latest.body.length < feed.meta.min_length) return;

                // Ignore AutoMod
                if (feed.meta.ignore_automod && latest.author === 'AutoModerator') return;

                // Keywords
                if (feed.meta.keywords) {
                    const keys = feed.meta.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                    const bodyLower = latest.body.toLowerCase();
                    const hasKey = keys.some(k => bodyLower.includes(k));
                    if (keys.length > 0 && !hasKey) return;
                }
            }

            // C. It's New! Post it.
            const channel = await this.client.channels.fetch(feed.channel_id).catch(() => null);
            if (!channel) {
                console.warn(`Channel ${feed.channel_id} not found for feed ${feed.id}`);
                return;
            }

            // D. Format Message
            const message = this.formatMessage(feed.message_template, latest, feed.platform);

            // Send
            await channel.send(message);
            console.log(`✅ Posted ${feed.platform} to ${channel.name}: ${latest.title || latest.id}`);

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

        // Max body length for Discord (2000 chars total, so truncate body)
        let body = item.body || '';
        if (body.length > 1500) body = body.substring(0, 1500) + '...';

        // Replacements
        text = text.replace(/{title}/g, item.title || 'No Title');
        text = text.replace(/{url}/g, item.link || '');
        text = text.replace(/{author}/g, item.author || item.creator || 'Unknown');
        text = text.replace(/{platform}/g, platform);
        text = text.replace(/{body}/g, body);

        return text;
    }
}

module.exports = FeedManager;
