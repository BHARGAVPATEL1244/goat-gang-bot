const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (interaction.isButton()) {
            if (interaction.customId === 'join_giveaway') {
                const messageId = interaction.message.id;
                const userId = interaction.user.id;
                const username = interaction.user.username;

                // Check if giveaway exists and is running
                const { data: giveaway, error: fetchError } = await supabase
                    .from('giveaways')
                    .select('id, status')
                    .eq('message_id', messageId)
                    .single();

                if (fetchError || !giveaway) {
                    return interaction.reply({ content: 'Giveaway not found or database error.', ephemeral: true });
                }

                if (giveaway.status !== 'running') {
                    return interaction.reply({ content: 'This giveaway has ended!', ephemeral: true });
                }

                // Add entry
                const { error: insertError } = await supabase
                    .from('giveaway_entries')
                    .insert([{
                        giveaway_id: giveaway.id,
                        user_id: userId,
                        username: username,
                        joined_from: 'discord'
                    }]);

                if (insertError) {
                    if (insertError.code === '23505') { // Unique violation
                        return interaction.reply({ content: 'You have already joined this giveaway!', ephemeral: true });
                    }
                    console.error('Entry Error:', insertError);
                    return interaction.reply({ content: 'Failed to join giveaway.', ephemeral: true });
                }

                return interaction.reply({ content: '🎉 You have successfully joined the giveaway!', ephemeral: true });
            }
        }
    },
};
