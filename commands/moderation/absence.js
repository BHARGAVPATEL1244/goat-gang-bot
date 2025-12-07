const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('absence')
        .setDescription('Generate an absence request for a member.')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('Select the member requesting absence')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const member = interaction.options.getMember('member');
            const displayName = member.displayName;

            const farmName = displayName.split('[')[0].trim();
            const levelMatches = displayName.match(/\[(\d+)\]/g);
            let farmLevel = "N/A";
            if (levelMatches && levelMatches.length > 0) {
                const lastMatch = levelMatches[levelMatches.length - 1];
                farmLevel = lastMatch.replace('[', '').replace(']', '');
            }

            const ROLE_MAP = {
                "L": "Leader",
                "C": "Co-Leader",
                "CO": "Co-Leader",
                "E": "Elder"
            };

            const roleLabelMatch = displayName.match(/\[([^\d]+)\]/);
            let roleText = "Member";

            if (roleLabelMatch) {
                const label = roleLabelMatch[1].toUpperCase();
                roleText = ROLE_MAP[label] || (label.charAt(0).toUpperCase() + label.slice(1).toLowerCase());
            }

            const nhRole = member.roles.cache.find(r => r.name.toLowerCase().startsWith('goat'));
            const neighbourhood = nhRole ? nhRole.name : "None";

            const today = new Date();
            const requestDate = today.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            }).replace(/\//g, '-');

            const fullText = `** ABSENCE REQUEST **\n` +
                `Farm name: ${farmName}\n` +
                `Discord id: ${member.id}\n` +
                `Farm level: ${farmLevel}\n` +
                `Role in neighbourhood: ${roleText}\n` +
                `Ticket number: \n` +
                `Date of requesting absence: ${requestDate}\n` +
                `Neighbourhood: ${neighbourhood}\n` +
                `Reason for absence: \n` +
                `Duration of absence: \n` +
                `Will they be active on Discord or in the game: \n`;

            await interaction.editReply(fullText);

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },
};
