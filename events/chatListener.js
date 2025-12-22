const { Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase (reusing logic from SyncService would be cleaner, but for Event handler simpler to init here or pass from client)
// We will init here to be standalone.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('[ChatBridge] Supabase keys missing. Bridge disabled.');
}

const BRIDGE_CHANNEL_ID = process.env.BRIDGE_CHANNEL_ID;

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // 1. Basic Checks
        if (!supabase) return;
        if (message.author.bot) return; // Ignore bots (including ourselves/webhooks)
        if (!BRIDGE_CHANNEL_ID) return; // Feature not configured
        if (message.channelId !== BRIDGE_CHANNEL_ID) return; // Wrong channel

        try {
            // 2. Insert into Supabase
            const { error } = await supabase
                .from('chat_messages')
                .insert({
                    content: message.content,
                    author_name: message.member ? (message.member.nickname || message.member.displayName) : message.author.username,
                    author_avatar: message.author.displayAvatarURL(),
                    source: 'discord',
                    discord_message_id: message.id,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('[ChatBridge] Failed to sync message:', error.message);
            } else {
                // console.log(`[ChatBridge] Synced from ${message.author.username}: ${message.content.substring(0, 20)}...`);
            }

        } catch (err) {
            console.error('[ChatBridge] Error:', err);
        }
    },
};
