const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
    },
    {
        name: 'kicking',
        description: 'Generate a kicking log for a member.',
        options: [
            {
                name: 'member',
                description: 'Select the member',
                type: 6, // USER type
                required: true,
            },
        ],
    },
    {
        name: 'absence',
        description: 'Generate an absence request for a member.',
        options: [
            {
                name: 'member',
                description: 'Select the member requesting absence',
                type: 6, // USER type
                required: true,
            },
        ],
    },
    {
        name: 'optin',
        description: 'Analyze a thread for opt-in/out responses.',
        options: [
            {
                name: 'neighbourhood',
                description: 'Select the neighbourhood role',
                type: 8, // ROLE type
                required: true,
            },
            {
                name: 'thread',
                description: 'Select the derby opt-in thread (defaults to current channel)',
                type: 7, // CHANNEL type
                required: false,
            },
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        // Register for a specific guild (Instant)
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
