const { Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('[ChatBridge] Supabase keys missing. Bridge disabled.');
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Read Env Var at Runtime to avoid loading issues
        const BRIDGE_CHANNEL_ID = process.env.BRIDGE_CHANNEL_ID;

        // 1. Basic Checks
        if (!supabase) {
            console.error('[ChatBridge] ERROR: Supabase Client not initialized! Check SUPABASE_SERVICE_ROLE_KEY.');
            return;
        }

        // Debugging: Helps user verify they set the ID correctly
        // console.log(`[ChatBridge] Message in ${message.channelId} (Bridge: ${BRIDGE_CHANNEL_ID})`);

        if (message.author.bot) return; // Ignore bots

        if (!BRIDGE_CHANNEL_ID) {
            console.warn('[ChatBridge] BRIDGE_CHANNEL_ID is not set in .env!');
            return;
        }

        if (message.channelId !== BRIDGE_CHANNEL_ID) return; // Wrong channel

        try {
            console.log(`[ChatBridge] Syncing message from ${message.author.username}...`);

            // Handle Async Embeds (Tenor/Giphy Unfurl)
            // Discord takes a second to generate embeds for links. If we see a URL but no embed, wait and refetch.
            if (/https?:\/\//.test(message.content) && message.embeds.length === 0 && message.attachments.size === 0) {
                console.log('[ChatBridge] Link detected but no embed. Waiting 2.5s for unfurl...');
                await new Promise(r => setTimeout(r, 2500)); // Wait 2.5 seconds
                try {
                    message = await message.fetch(); // Refetch updated message
                } catch (e) {
                    console.warn('[ChatBridge] Failed to refetch message:', e);
                }
            }

            // Handle Attachments (Images/GIFs) & Embeds (Tenor/Giphy)
            // CRITICAL: We use raw 'content' to preserve Custom Emoji IDs (<:name:id>), which cleanContent destroys.
            let finalContent = message.content;

            // Resolve User Mentions <@123> or <@!123>
            finalContent = finalContent.replace(/<@!?(\d+)>/g, (match, id) => {
                const member = message.guild.members.cache.get(id);
                const user = message.mentions.users.get(id);
                return member ? `@${member.displayName}` : (user ? `@${user.username}` : match);
            });

            // Resolve Channel Mentions <#123>
            finalContent = finalContent.replace(/<#(\d+)>/g, (match, id) => {
                const channel = message.guild.channels.cache.get(id);
                return channel ? `#${channel.name}` : match;
            });

            // Resolve Role Mentions <@&123>
            finalContent = finalContent.replace(/<@&(\d+)>/g, (match, id) => {
                const role = message.guild.roles.cache.get(id);
                return role ? `@${role.name}` : match;
            });

            // 1. Attachments (Direct Uploads)
            if (message.attachments.size > 0) {
                const attachmentUrls = message.attachments.map(a => a.url).join('\n');
                finalContent = finalContent ? `${finalContent}\n${attachmentUrls}` : attachmentUrls;
            }

            // 2. stickers (Discord Stickers)
            if (message.stickers.size > 0) {
                console.log(`[ChatBridge] Found ${message.stickers.size} stickers.`);
                const stickerUrls = message.stickers.map(s => {
                    const url = s.url;
                    console.log(`[ChatBridge] Sticker URL: ${url}`);
                    return url;
                }).join('\n');
                finalContent = finalContent ? `${finalContent}\n${stickerUrls}` : stickerUrls;
            }

            // 3. Embeds (Tenor, Giphy, Links)
            if (message.embeds.length > 0) {
                const embedUrls = message.embeds
                    .map(e => e.thumbnail?.url || e.image?.url || e.url) // Prefer thumbnail/image for GIFs
                    .filter(url => url) // Remove nulls
                    .join('\n');

                if (embedUrls) {
                    finalContent = finalContent ? `${finalContent}\n${embedUrls}` : embedUrls;
                }
            }

            // 2. Insert into Supabase
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    content: finalContent,
                    author_name: message.member ? (message.member.nickname || message.member.displayName) : message.author.username,
                    author_avatar: message.author.displayAvatarURL(),
                    source: 'discord',
                    discord_message_id: message.id,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('[ChatBridge] FAILED to insert:', error.message, error.details);
            } else {
                console.log('[ChatBridge] Successfully synced.');
            }

        } catch (err) {
            console.error('[ChatBridge] Exception:', err);
        }
    },
};
