const express = require('express');
const router = express.Router();
const { parseEmbed } = require('../../utils/embedParser');

// Helper to get channel
async function getChannel(client, guildId, channelId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const channel = guild.channels.cache.get(channelId);
    if (!channel) throw new Error('Channel not found');

    if (!channel.isTextBased()) throw new Error('Channel is not text-based');

    return channel;
}

// POST /messages/send
router.post('/send', async (req, res) => {
    try {
        const client = req.app.get('client');
        const { guildId, channelId, embeds, files } = req.body;

        if (!guildId || !channelId || !embeds) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const channel = await getChannel(client, guildId, channelId);
        const parsedEmbeds = embeds.map(e => parseEmbed(e)).filter(e => e !== null);

        if (parsedEmbeds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid embeds provided' });
        }

        const messageOptions = { embeds: parsedEmbeds };

        // Handle files (Base64 -> Buffer)
        if (files && Array.isArray(files)) {
            messageOptions.files = files.map(f => ({
                name: f.name,
                attachment: Buffer.from(f.data, 'base64')
            }));
        }

        const message = await channel.send(messageOptions);

        console.log(`[API] Sent message ${message.id} in ${channel.name} (${guildId})`);

        res.json({
            success: true,
            data: {
                messageId: message.id,
                channelId: channel.id
            }
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /messages/edit
router.post('/edit', async (req, res) => {
    try {
        const client = req.app.get('client');
        const { guildId, channelId, messageId, embeds, files } = req.body;

        if (!guildId || !channelId || !messageId || !embeds) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const channel = await getChannel(client, guildId, channelId);
        const message = await channel.messages.fetch(messageId);

        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        if (message.author.id !== client.user.id) {
            return res.status(403).json({ success: false, error: 'Cannot edit messages from other users' });
        }

        const parsedEmbeds = embeds.map(e => parseEmbed(e)).filter(e => e !== null);

        const editOptions = { embeds: parsedEmbeds };

        if (files && Array.isArray(files)) {
            editOptions.files = files.map(f => ({
                name: f.name,
                attachment: Buffer.from(f.data, 'base64')
            }));
        }

        await message.edit(editOptions);

        console.log(`[API] Edited message ${message.id} in ${channel.name} (${guildId})`);

        res.json({
            success: true,
            data: {
                messageId: message.id,
                channelId: channel.id
            }
        });
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /messages/resend
router.post('/resend', async (req, res) => {
    try {
        const client = req.app.get('client');
        const { guildId, channelId, messageId, embeds, files } = req.body;

        if (!guildId || !channelId || !messageId || !embeds) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const channel = await getChannel(client, guildId, channelId);

        // Try to delete old message
        try {
            const oldMessage = await channel.messages.fetch(messageId);
            if (oldMessage && oldMessage.deletable) {
                await oldMessage.delete();
            }
        } catch (err) {
            console.warn('Could not delete old message during resend:', err.message);
            // Continue to send new one anyway
        }

        const parsedEmbeds = embeds.map(e => parseEmbed(e)).filter(e => e !== null);

        const messageOptions = { embeds: parsedEmbeds };

        if (files && Array.isArray(files)) {
            messageOptions.files = files.map(f => ({
                name: f.name,
                attachment: Buffer.from(f.data, 'base64')
            }));
        }

        const newMessage = await channel.send(messageOptions);

        console.log(`[API] Resent message. Old: ${messageId}, New: ${newMessage.id}`);

        res.json({
            success: true,
            data: {
                messageId: newMessage.id,
                channelId: channel.id
            }
        });
    } catch (error) {
        console.error('Error resending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /messages/delete
router.post('/delete', async (req, res) => {
    try {
        const client = req.app.get('client');
        const { guildId, channelId, messageId } = req.body;

        if (!guildId || !channelId || !messageId) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const channel = await getChannel(client, guildId, channelId);
        const message = await channel.messages.fetch(messageId);

        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        if (!message.deletable) {
            return res.status(403).json({ success: false, error: 'Cannot delete this message' });
        }

        await message.delete();
        console.log(`[API] Deleted message ${messageId} in ${channel.name}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
