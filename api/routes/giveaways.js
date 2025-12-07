const express = require('express');
const router = express.Router();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = (client) => {
    // POST /giveaways/create
    router.post('/create', async (req, res) => {
        const { guildId, channelId, title, description, prize, winners, duration, createdBy } = req.body;

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);

            const endTime = new Date(Date.now() + duration); // duration in ms

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(`${description}\n\n**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>`)
                .setColor('#FFD700')
                .setTimestamp(endTime);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_giveaway')
                        .setLabel('🎉 Join Giveaway')
                        .setStyle(ButtonStyle.Primary)
                );

            const message = await channel.send({ embeds: [embed], components: [row] });

            // Return message ID so website can save to DB
            res.json({ success: true, messageId: message.id, endTime: endTime.toISOString() });

        } catch (error) {
            console.error('Giveaway Create Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /giveaways/end
    router.post('/end', async (req, res) => {
        const { guildId, channelId, messageId, winners } = req.body; // winners is array of userIds

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);

            const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
            await message.reply(`🎉 **GIVEAWAY ENDED** 🎉\n\nWinners: ${winnerMentions || 'None'}`);

            const embed = message.embeds[0];
            const newEmbed = { ...embed.data, title: '🎉 GIVEAWAY ENDED 🎉', color: 0x2f3136 };
            await message.edit({ embeds: [newEmbed], components: [] });

            res.json({ success: true });

        } catch (error) {
            console.error('Giveaway End Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
