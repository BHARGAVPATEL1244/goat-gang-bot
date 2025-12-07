const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gend')
        .setDescription('End a giveaway early')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');

        // Fetch giveaway from DB
        const { data: giveaway, error } = await supabase
            .from('giveaways')
            .select('*')
            .eq('message_id', messageId)
            .single();

        if (error || !giveaway) {
            return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
        }

        if (giveaway.status !== 'running') {
            return interaction.reply({ content: 'Giveaway is already ended.', ephemeral: true });
        }

        // Trigger end logic (this would ideally be a shared function, but for now we call the API or duplicate logic)
        // For simplicity in this command, we'll just mark it ended and pick winners.

        // 1. Mark as ended
        await supabase.from('giveaways').update({ status: 'ended', end_time: new Date().toISOString() }).eq('id', giveaway.id);

        // 2. Fetch entries
        const { data: entries } = await supabase
            .from('giveaway_entries')
            .select('user_id')
            .eq('giveaway_id', giveaway.id);

        if (!entries || entries.length === 0) {
            return interaction.reply({ content: 'Giveaway ended. No entries.', ephemeral: true });
        }

        // 3. Pick winners
        const winners = [];
        const entriesCopy = [...entries];
        for (let i = 0; i < giveaway.winners && entriesCopy.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * entriesCopy.length);
            winners.push(entriesCopy.splice(randomIndex, 1)[0].user_id);
        }

        // 4. Announce
        const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
        const message = await channel.messages.fetch(giveaway.message_id);

        const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
        await message.reply(`🎉 **GIVEAWAY ENDED** 🎉\n\nWinners: ${winnerMentions || 'None'}`);

        // Update embed to show ended
        const embed = message.embeds[0];
        const newEmbed = { ...embed.data, title: '🎉 GIVEAWAY ENDED 🎉', color: 0x2f3136 }; // Grey color
        await message.edit({ embeds: [newEmbed], components: [] }); // Remove buttons

        await interaction.reply({ content: 'Giveaway ended successfully.', ephemeral: true });
    },
};
