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
                // Filter members who belong to the NH Role
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

                // Helper to format list
                const formatList = (members) => {
                    if (members.length === 0) return 'None';
                    const list = members.slice(0, 20).map(m => `• ${m.toString()}`).join('\n'); // Start with 20
                    if (members.length > 20) return `${list}\n...and ${members.length - 20} others`;
                    return list;
                };

                const embed = new EmbedBuilder()
                    .setColor(role.color || '#0099ff')
                    .setTitle(`Audit: ${role.name} in ${nhRole.name}`)
                    .setDescription(`Checking which members of **${nhRole.name}** have the **${role.name}** role.`)
                    .addFields(
                        {
                            name: `✅ Has Role (${hasRole.length})`,
                            value: formatList(hasRole),
                            inline: true
                        },
                        {
                            name: `❌ Missing Role (${missingRole.length})`,
                            value: formatList(missingRole),
                            inline: true
                        }
                    )
                    .setFooter({ text: `Total NH Members: ${nhMembers.size}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } else {
                // --- CLASSIC MODE ---
                const membersWithRole = interaction.guild.members.cache.filter(member => member.roles.cache.has(role.id));
                const count = membersWithRole.size;

                const MAX_DISPLAY = 40;
                const membersArray = Array.from(membersWithRole.values());

                let description = membersArray
                    .slice(0, MAX_DISPLAY)
                    .map(m => `• ${m.toString()} (${m.user.tag})`) // Mention + Tag
                    .join('\n');

                if (count > MAX_DISPLAY) {
                    description += `\n\n**...and ${count - MAX_DISPLAY} others.**`;
                }

                if (count === 0) {
                    description = "No members found with this role.";
                }

                const embed = new EmbedBuilder()
                    .setColor(role.color || '#0099ff')
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
