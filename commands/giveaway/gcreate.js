const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Start a new giveaway')
        .addStringOption(option =>
            option.setName('prize')
                .setDescription('What is the prize?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration (e.g., 1h, 1d)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('winners')
                .setDescription('Number of winners')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to post the giveaway in'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const prize = interaction.options.getString('prize');
        const durationStr = interaction.options.getString('duration');
        const winnersCount = interaction.options.getInteger('winners');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        // Parse duration
        let durationMs = 0;
        if (durationStr.endsWith('m')) durationMs = parseInt(durationStr) * 60 * 1000;
        else if (durationStr.endsWith('h')) durationMs = parseInt(durationStr) * 60 * 60 * 1000;
        else if (durationStr.endsWith('d')) durationMs = parseInt(durationStr) * 24 * 60 * 60 * 1000;
        else return interaction.reply({ content: 'Invalid duration format. Use m, h, or d (e.g., 10m, 1h, 1d).', ephemeral: true });

        const endTime = new Date(Date.now() + durationMs);

        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY 🎉')
            .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnersCount}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n\nClick the button below to join!`)
            .setColor('#FFD700')
            .setFooter({ text: `Hosted by ${interaction.user.username}` })
            .setTimestamp(endTime);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_giveaway')
                    .setLabel('🎉 Join Giveaway')
                    .setStyle(ButtonStyle.Primary)
            );

        const message = await channel.send({ embeds: [embed], components: [row] });

        // Save to Supabase
        const { error } = await supabase
            .from('giveaways')
            .insert([{
                guild_id: interaction.guild.id,
                channel_id: channel.id,
                message_id: message.id,
                title: 'Giveaway',
                description: `Prize: ${prize}`,
                prize: prize,
                winners: winnersCount,
                end_time: endTime.toISOString(),
                created_by: interaction.user.id,
                status: 'running'
            }]);

        if (error) {
            console.error('Supabase Error:', error);
            return interaction.reply({ content: 'Failed to save giveaway to database.', ephemeral: true });
        }

        await interaction.reply({ content: `Giveaway started in ${channel}!`, ephemeral: true });
    },
};
