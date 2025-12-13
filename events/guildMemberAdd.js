const { Events, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase (Use service role key if available for full access, or anon key)
// Assuming ENV vars are set in bot process too
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('[WELCOME] Supabase keys missing. Welcome messages will not trigger.');
}

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        console.log(`[WELCOME] New member joined: ${member.user.tag} (${member.id})`);

        try {
            // 1. Fetch Config
            if (!supabase) {
                console.error('[WELCOME] ❌ Supabase client is invalid/null. Check Environment Variables!');
                return;
            }

            console.log(`[WELCOME] Fetching config for Guild ID: ${member.guild.id}`);

            // Try the specific Guild ID
            let { data: config, error } = await supabase
                .from('welcome_configs')
                .select('*')
                .eq('guild_id', member.guild.id)
                .single();

            if (error) {
                console.log(`[WELCOME] DB Error or No Config for specific guild: ${error.message}`);
            }

            // Fallback to 'default' if needed
            if (error || !config) {
                console.log('[WELCOME] Falling back to default config...');
                const { data: defaultConfig, error: defaultError } = await supabase
                    .from('welcome_configs')
                    .select('*')
                    .eq('guild_id', 'default')
                    .single();

                if (defaultConfig) {
                    config = defaultConfig;
                    console.log('[WELCOME] Found default config.');
                } else {
                    console.log('[WELCOME] ❌ No default config found either.');
                }
            } else {
                console.log('[WELCOME] Found guild-specific config.');
            }

            if (!config || !config.is_enabled) {
                console.log(`[WELCOME] ❌ Config invalid or disabled. Enabled: ${config?.is_enabled}`);
                return;
            }

            if (!config.channel_id) {
                console.log('[WELCOME] ❌ No channel_id in config.');
                return;
            }

            const channel = member.guild.channels.cache.get(config.channel_id);
            if (!channel) {
                console.log(`[WELCOME] Configured channel ${config.channel_id} not found.`);
                return;
            }

            // 2. Prepare Content
            const replacePlaceholders = (text) => {
                if (!text) return '';
                return text
                    .replace(/{user}/g, `<@${member.id}>`)
                    .replace(/{username}/g, member.user.username)
                    .replace(/{server}/g, member.guild.name)
                    .replace(/{memberCount}/g, member.guild.memberCount);
            };

            const replacePlaceholdersPlain = (text) => {
                if (!text) return '';
                return text
                    .replace(/{user}/g, member.user.username)
                    .replace(/{username}/g, member.user.username)
                    .replace(/{server}/g, member.guild.name)
                    .replace(/{memberCount}/g, member.guild.memberCount);
            };

            // 3. Construct Embed
            const colorHex = config.embed_color || '#FACC15';
            const colorInt = parseInt(colorHex.replace('#', ''), 16);

            const embed = new EmbedBuilder()
                .setColor(colorInt)
                .setTitle(replacePlaceholdersPlain(config.embed_title))
                .setDescription(replacePlaceholders(config.embed_description));

            if (config.show_user_pfp) {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
            }

            if (config.embed_image_url) {
                embed.setImage(config.embed_image_url);
            }

            if (config.embed_footer) {
                embed.setFooter({ text: replacePlaceholdersPlain(config.embed_footer) });
            }

            // 4. Send Message
            const messageContent = replacePlaceholders(config.message_content);

            await channel.send({
                content: messageContent,
                embeds: [embed]
            });

            console.log(`[WELCOME] Sent welcome message to #${channel.name} for ${member.user.tag}`);

        } catch (err) {
            console.error('[WELCOME] Error sending welcome message:', err);
        }
    },
};
