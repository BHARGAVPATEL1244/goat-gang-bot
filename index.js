const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// --- Express API Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

app.set('client', client);

client.commands = new Collection();

// Load Commands
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// Handle Interactions (Fallback if not handled by events)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// --- API Routes ---
const authMiddleware = require('./api/middleware/auth');
const guildRoutes = require('./api/routes/guilds');
const messageRoutes = require('./api/routes/messages');
const giveawayRoutes = require('./api/routes/giveaways')(client);

app.use('/guilds', authMiddleware, guildRoutes);
app.use('/messages', authMiddleware, messageRoutes);
app.use('/giveaways', authMiddleware, giveawayRoutes);
app.use('/members', authMiddleware, require('./api/routes/members'));

// UptimeRobot Heartbeat
app.get('/', (req, res) => {
    res.send('Goat Gang Bot is alive! 🐐');
});

// Start Server
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});

// Login Bot
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    console.log(`Joined Guilds: ${readyClient.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ')}`);
});

client.login(process.env.DISCORD_TOKEN);
