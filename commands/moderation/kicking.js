const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kicking')
        .setDescription('Generate a kicking log for a member.')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('Select the member')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const member = interaction.options.getMember('member');
            const kicker = interaction.member.displayName;

            const displayName = member.displayName;
            const farmName = displayName.split('[')[0].trim();

            const levelMatches = displayName.match(/\[(\d+)\]/g);
            let farmLevel = "N/A";
            if (levelMatches && levelMatches.length > 0) {
                const lastMatch = levelMatches[levelMatches.length - 1];
                farmLevel = lastMatch.replace('[', '').replace(']', '');
            }

            const nhRole = member.roles.cache.find(r => r.name.toLowerCase().startsWith('goat'));
            const neighbourhood = nhRole ? nhRole.name : "None";

            const today = new Date();
            const kickDate = today.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            }).replace(/\//g, '-');

            const fullText = `** KICKING LOG **\n` +
                `Farm name: ${farmName}\n` +
                `Farm Discord ID: ${member.id}\n` +
                `Discord username: ${member.user.username}\n` +
                `Farm level: ${farmLevel}\n` +
                `Farm tag: \n` +
                `Neighbourhood: ${neighbourhood}\n` +
                `When were they kicked: ${kickDate}\n` +
                `Why were they kicked: \n` +
                `Who decided to kick them: ${kicker}`;

            await interaction.editReply(fullText);

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },
};
