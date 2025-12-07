const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('optin')
        .setDescription('Analyze a thread for opt-in/out responses.')
        .addRoleOption(option =>
            option.setName('neighbourhood')
                .setDescription('Select the neighbourhood role')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('thread')
                .setDescription('Select the derby opt-in thread (defaults to current channel)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const thread = interaction.options.getChannel('thread') || interaction.channel;
            const neighbourhoodRole = interaction.options.getRole('neighbourhood');

            const role = await interaction.guild.roles.fetch(neighbourhoodRole.id);

            await interaction.editReply('🔄 Fetching neighborhood list...');
            await interaction.guild.members.fetch();

            const members = role.members;

            let messages = [];
            let lastId;

            await interaction.editReply(`🔄 Fetching messages from ${thread.name}...`);

            while (true) {
                const options = { limit: 100 };
                if (lastId) {
                    options.before = lastId;
                }

                const fetchedMessages = await thread.messages.fetch(options);
                messages.push(...fetchedMessages.values());
                lastId = fetchedMessages.last()?.id;

                if (messages.length % 500 === 0) {
                    await interaction.editReply(`🔄 Fetching messages from ${thread.name}... (${messages.length} found so far)`);
                }

                if (fetchedMessages.size !== 100) {
                    break;
                }
            }

            await interaction.editReply('🔄 Analyzing responses...');

            const optIn = [];
            const optOut = [];
            const noReply = [];

            members.forEach(member => {
                const farmName = member.displayName.split('[')[0].trim();
                const userMsgs = messages.filter(msg => msg.author.id === member.id);

                if (userMsgs.length === 0) {
                    noReply.push(farmName);
                    return;
                }

                const content = userMsgs.map(m => m.content.toLowerCase()).join(' ');
                const inKeywords = ["opt-in", "opt in", "in"];
                const outKeywords = ["opt-out", "opt out", "out"];

                if (inKeywords.some(kw => content.includes(kw))) {
                    optIn.push(farmName);
                } else if (outKeywords.some(kw => content.includes(kw))) {
                    optOut.push(farmName);
                } else {
                    noReply.push(farmName);
                }
            });

            const today = new Date();
            const dateToday = today.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            const finalMsg = `<:GG_Light_Dot:1244737191838748692> **Date of derby start:**\n${dateToday}\n` +
                `<:GG_Light_Dot:1244737191838748692> **Type of derby:**\n\n` +
                `<:GG_Light_Dot:1244737191838748692> **Neighborhood:**\n${role.toString()}\n` +
                `<:GG_Light_Dot:1244737191838748692> **Members who opted-in this derby:**\n` +
                (optIn.length > 0 ? optIn.map(name => `${name}`).join('\n') : 'None') + `\n` +
                `<:GG_Light_Dot:1244737191838748692> **Members who opted-out of this derby:**\n` +
                (optOut.length > 0 ? optOut.map(name => `${name}`).join('\n') : 'None') + `\n` +
                `<:GG_Light_Dot:1244737191838748692> **Members who did not respond to the thread:**\n` +
                (noReply.length > 0 ? noReply.map(name => `${name}`).join('\n') : 'None');

            await interaction.editReply(finalMsg);

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },
};
