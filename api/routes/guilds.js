const express = require('express');
const router = express.Router();
const { ChannelType } = require('discord.js');

// GET /guilds - List all guilds the bot is in
router.get('/', async (req, res) => {
    try {
        const client = req.app.get('client');
        const guilds = client.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL()
        }));

        res.json({ success: true, data: guilds });
    } catch (error) {
        console.error('Error fetching guilds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /guilds/:id/channels - List text channels for a guild
router.get('/:id/channels', async (req, res) => {
    try {
        const client = req.app.get('client');
        const { id } = req.params;

        const guild = client.guilds.cache.get(id);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'Guild not found' });
        }

        // Fetch channels if not cached (optional, but safer)
        // await guild.channels.fetch(); 

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({ success: true, data: channels });
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
