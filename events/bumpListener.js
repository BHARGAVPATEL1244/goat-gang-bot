const { Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
// Ensure these are in your .env file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('[BumpListener] Supabase credentials missing. Leaderboard will not update.');
}

const DISBOARD_BOT_ID = '302050872383242240';

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!supabase) return;

        // Check if message is from Disboard
        if (message.author.id === DISBOARD_BOT_ID) {
            // Check content/embeds for success message
            const isBump = message.embeds.some(embed => embed.description && embed.description.includes('Bump done')) ||
                message.content.includes('Bump done') ||
                message.content.includes('Bumped!');

            if (isBump) {
                console.log('[BumpListener] Bump Detected!');

                let bumperId = null;

                // 1. Try Interaction User (Slash Command)
                if (message.interaction) {
                    bumperId = message.interaction.user.id;
                } else {
                    // 2. Fallback: Fetch previous message
                    try {
                        const messages = await message.channel.messages.fetch({ limit: 2 });
                        const lastUserMessage = messages.last();
                        if (lastUserMessage && !lastUserMessage.author.bot) {
                            bumperId = lastUserMessage.author.id;
                        }
                    } catch (err) {
                        console.error('[BumpListener] Failed to fetch context:', err);
                    }
                }

                if (bumperId) {
                    console.log(`[BumpListener] Bumper Identified: ${bumperId}. Updating DB...`);

                    const { data: current } = await supabase.from('leaderboard_bumps').select('count').eq('user_id', bumperId).single();
                    const newCount = (current?.count || 0) + 1;

                    const { error } = await supabase.from('leaderboard_bumps').upsert({
                        user_id: bumperId,
                        count: newCount,
                        last_bumped_at: new Date().toISOString()
                    });

                    if (error) {
                        console.error('[BumpListener] DB Error:', error);
                    } else {
                        message.react('🐐');
                        console.log(`[BumpListener] Success! ${bumperId} now has ${newCount} bumps.`);
                    }
                } else {
                    console.log('[BumpListener] Could not identify bumper.');
                }
            }
        }
    },
};
