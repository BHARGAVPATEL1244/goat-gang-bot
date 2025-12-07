const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('greroll')
        .setDescription('Reroll a giveaway winner')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');

        const { data: giveaway, error } = await supabase
            .from('giveaways')
            .select('*')
            .eq('message_id', messageId)
            .single();

        if (error || !giveaway) {
            return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
        }

        if (giveaway.status !== 'ended') {
            return interaction.reply({ content: 'Giveaway must be ended to reroll.', ephemeral: true });
        }

        const { data: entries } = await supabase
            .from('giveaway_entries')
            .select('user_id')
            .eq('giveaway_id', giveaway.id);

        if (!entries || entries.length === 0) {
            return interaction.reply({ content: 'No entries to reroll from.', ephemeral: true });
        }

        const randomIndex = Math.floor(Math.random() * entries.length);
        const winnerId = entries[randomIndex].user_id;

        const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
        const message = await channel.messages.fetch(giveaway.message_id);

        await message.reply(`🎉 **REROLL** 🎉\n\nNew Winner: <@${winnerId}>`);

        await interaction.reply({ content: 'Rerolled successfully.', ephemeral: true });
    },
};
