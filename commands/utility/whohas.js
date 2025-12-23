const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whohas')
        .setDescription('Audit members with a specific role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The target role to check (e.g., Verified)')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('nh_role')
                .setDescription('Optional: Filter by Neighborhood Role (Audit Mode)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const role = interaction.options.getRole('role');
            const nhRole = interaction.options.getRole('nh_role');

            // Ensure we have all members cached
            await interaction.guild.members.fetch();

            if (nhRole) {
                // --- AUDIT MODE ---
                const nhMembers = interaction.guild.members.cache.filter(m => m.roles.cache.has(nhRole.id));

                const hasRole = [];
                const missingRole = [];

                nhMembers.forEach(member => {
                    if (member.roles.cache.has(role.id)) {
                        hasRole.push(member);
                    } else {
                        missingRole.push(member);
                    }
                });

                const embed = new EmbedBuilder()
                    .setColor('#404040')
                    .setTitle(`Audit: ${role.name} in ${nhRole.name}`)
                    .setDescription(`Checking which members of **${nhRole.name}** have the **${role.name}** role.`)
                    .setFooter({ text: `Total NH Members: ${nhMembers.size}` })
                    .setTimestamp();

                // Helper to add fields safely (Discord 1024 char limit)
                const addSafeFields = (label, members, emoji) => {
                    if (members.length === 0) {
                        embed.addFields({ name: `${emoji} ${label} (0)`, value: 'None', inline: false });
                        return;
                    }

                    // Sort alphabetically
                    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

                    const allNames = members.map(m => `• ${m.toString()}`);
                    let currentChunk = [];
                    let currentLength = 0;
                    let fieldIndex = 1;

                    allNames.forEach((name) => {
                        // +1 for the newline character
                        if (currentLength + name.length + 1 > 1000) {
                            // Flush chunk
                            embed.addFields({
                                name: `${emoji} ${label} (${members.length}) - Part ${fieldIndex}`,
                                value: currentChunk.join('\n'),
                                inline: true
                            });
                            currentChunk = [];
                            currentLength = 0;
                            fieldIndex++;
                        }
                        currentChunk.push(name);
                        currentLength += name.length + 1;
                    });

                    // Flush remaining
                    if (currentChunk.length > 0) {
                        embed.addFields({
                            name: fieldIndex > 1 ? `${emoji} ${label} (${members.length}) - Part ${fieldIndex}` : `${emoji} ${label} (${members.length})`,
                            value: currentChunk.join('\n'),
                            inline: true
                        });
                    }
                };

                addSafeFields('Has Role', hasRole, '✅');
                addSafeFields('Missing Role', missingRole, '❌');

                await interaction.editReply({ embeds: [embed] });

            } else {
                // --- CLASSIC MODE ---
                const membersWithRole = interaction.guild.members.cache.filter(member => member.roles.cache.has(role.id));
                const count = membersWithRole.size;
                const membersArray = Array.from(membersWithRole.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));

                // For Classic Mode, we use Description (4096 chars max)
                // If it's HUGE, we might still clip, but 4096 is ~200 mentions.

                let description = membersArray.map(m => `• ${m.toString()} (${m.user.tag})`).join('\n');

                if (description.length > 4090) {
                    description = description.substring(0, 4000) + `\n\n... and more (Discord Limit reached)`;
                }
                if (count === 0) {
                    description = "No members found with this role.";
                }

                const embed = new EmbedBuilder()
                    .setColor('#404040')
                    .setTitle(`Members with role: ${role.name}`)
                    .setDescription(description)
                    .setFooter({ text: `Total: ${count} members` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Failed to fetch members.', ephemeral: true });
        }
    },
};
