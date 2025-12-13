const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const ADMIN_ID = '725759248444686357'; // User to notify on status change

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

// Enable Verbose Debugging for Troubleshooting
client.on('debug', info => console.log(`[DEBUG] ${info}`));
client.on('error', error => console.error(`[CLIENT ERROR] ${error.message}`));

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

// Auto-Register Commands on Startup
(async () => {
    if (!process.env.DISCORD_TOKEN) {
        console.error('[DEPLOY] ERROR: DISCORD_TOKEN is missing in environment variables!');
        return;
    }
    if (!process.env.CLIENT_ID) {
        console.error('[DEPLOY] WARNING: CLIENT_ID is missing. Skipping command registration.');
        return;
    }

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const commandsData = client.commands.map(c => c.data.toJSON());

        console.log(`[DEPLOY] Started refreshing ${commandsData.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsData },
        );

        console.log(`[DEPLOY] Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('[DEPLOY] Error registering commands:', error);
    }
})();

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

// Security: Auto-Leave Unauthorized Guilds
client.on(Events.GuildCreate, async guild => {
    if (process.env.GUILD_ID && guild.id !== process.env.GUILD_ID) {
        console.warn(`[SECURITY] Leaving unauthorized guild: ${guild.name} (${guild.id})`);
        try {
            await guild.leave();
        } catch (err) {
            console.error(`[SECURITY] Failed to leave guild ${guild.id}:`, err);
        }
    }
});

// Handle Interactions (Fallback if not handled by events)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Security: Restrict Commands to Main Guild
    if (process.env.GUILD_ID && interaction.guildId !== process.env.GUILD_ID) {
        await interaction.reply({
            content: '⛔ This bot is private and restricted to the Goat Gang server only.',
            ephemeral: true
        });
        return;
    }

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

// Debug Endpoint
app.get('/debug', (req, res) => {
    res.json({
        node: process.version,
        status: client.ws.status,
        readyTimestamp: client.readyTimestamp,
        user: client.user ? client.user.tag : null,
        ping: client.ws.ping,
        uptime: client.uptime
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});

// Login Bot
client.once(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    console.log(`Joined Guilds: ${readyClient.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ')}`);

    // Notify Admin: Online
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);
        if (adminUser) {
            await adminUser.send(`🟢 **System Online**: Goat Gang Bot is now active and ready to serve! 🐐`);
        }
    } catch (err) {
        console.error('[STATUS] Failed to send Online DM:', err);
    }

    // --- Services ---
    const FeedManager = require('./services/FeedManager');
    const feedManager = new FeedManager(client);

    const SyncService = require('./services/SyncService');
    const syncService = new SyncService(client);
    const cron = require('node-cron');

    // Start Services
    feedManager.start();

    // Schedule Auto-Sync (Every Hour)
    cron.schedule('0 * * * *', () => {
        syncService.syncAll();
    });
    console.log('[Cron] Auto-Sync scheduled for every hour.');
});

if (!process.env.DISCORD_TOKEN) {
    console.error('[LOGIN] ERROR: DISCORD_TOKEN is missing! Bot cannot login.');
} else {
    console.log('[LOGIN] Attempting to login...');
    client.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error('[LOGIN] CRITICAL: Failed to login:', err);
    });
}

// Graceful Shutdown: Notify Admin
const handleShutdown = async (signal) => {
    console.log(`[${signal}] Shutting down...`);
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);
        if (adminUser) {
            await adminUser.send(`🔴 **System Offline**: Goat Gang Bot is shutting down (${signal})...`);
        }
    } catch (err) {
        console.error('[STATUS] Failed to send Offline DM:', err);
    }
    process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
