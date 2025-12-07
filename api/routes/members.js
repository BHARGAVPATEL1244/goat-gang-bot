const express = require('express');
const router = express.Router();

// GET /members/:userId
// Query Param: guildId (optional, defaults to process.env.GUILD_ID)

// 1. Get Roles (Optional filter by prefix)
router.get('/roles', async (req, res) => {
    const guildId = req.query.guildId || process.env.GUILD_ID;
    const prefix = req.query.prefix?.toLowerCase();

    const client = req.app.get('client');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.json({ error: 'Guild not found' });

    // Fetch roles
    let roles = guild.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }));

    if (prefix) {
        roles = roles.filter(r => r.name.toLowerCase().startsWith(prefix));
    }

    // Sort by position (descending)
    roles.sort((a, b) => {
        const roleA = guild.roles.cache.get(a.id);
        const roleB = guild.roles.cache.get(b.id);
        return roleB.position - roleA.position;
    });

    res.json({ guildName: guild.name, roles });
});

// Simple in-memory cache to prevent rate limits
let membersCache = {
    data: null,
    timestamp: 0
};
const CACHE_DURATION = 60 * 1000; // 1 minute

// 2. List Members (Optional filter by roleId)
router.get('/list', async (req, res) => {
    const guildId = req.query.guildId || process.env.GUILD_ID;
    const roleId = req.query.roleId;

    const client = req.app.get('client');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.json({ error: 'Guild not found' });

    try {
        let members;
        const now = Date.now();

        // Use cache if available and fresh
        if (membersCache.data && (now - membersCache.timestamp < CACHE_DURATION)) {
            members = membersCache.data;
        } else {
            // Fetch fresh and update cache
            members = await guild.members.fetch();
            membersCache = {
                data: members,
                timestamp: now
            };
        }

        let memberList = members.map(m => ({
            id: m.id,
            username: m.user.username,
            discriminator: m.user.discriminator,
            nickname: m.nickname, // Explicit nickname
            displayName: m.nickname || m.displayName || m.user.username, // Resolved server name
            roles: m.roles.cache.map(r => r.id),
            avatar: m.user.displayAvatarURL()
        }));

        if (roleId) {
            memberList = memberList.filter(m => m.roles.includes(roleId));
        }

        if (memberList.length > 0) {
            // console.log("Debug: First Member in List:", JSON.stringify(memberList[0]));
        }

        res.json({ count: memberList.length, members: memberList });
    } catch (error) {
        console.error("Member Fetch Error:", error);
        res.status(500).json({ error: error.message, code: error.code });
    }
});

// 3. Update Nickname
router.patch('/:userId/nickname', async (req, res) => {
    const { userId } = req.params;
    const { nickname } = req.body;
    const guildId = req.query.guildId || process.env.GUILD_ID;

    const client = req.app.get('client');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    try {
        const member = await guild.members.fetch(userId);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const oldNickname = member.nickname;
        await member.setNickname(nickname);

        console.log(`[Nickname Update] ${member.user.tag}: "${oldNickname}" -> "${nickname}"`);

        res.json({
            success: true,
            message: `Nickname updated for ${member.user.username}`,
            oldNickname,
            newNickname: nickname
        });
    } catch (error) {
        console.error('[Nickname Update Error]', error);
        let errorMessage = `Failed to update nickname. (Code: ${error.code || 'Unknown'})`;

        if (error.code === 50013) {
            errorMessage = 'Bot lacks permission. Ensure "GoatBot" role is higher than the user\'s role.';
        } else if (error.code === 50035) {
            console.error('Full Error 50035 Details:', JSON.stringify(error, null, 2));
            errorMessage = `Invalid Nickname (50035). Details: ${JSON.stringify(error.rawError?.errors || error.message)}`;
        } else if (error.message && error.message.includes('Missing Permissions')) {
            errorMessage = 'Bot is missing "Manage Nicknames" permission.';
        }

        res.status(500).json({ success: false, error: errorMessage, details: error.message });
    }
});

// Global Lookup (not guild dependent)
router.get('/lookup/:userId', async (req, res) => {
    try {
        const client = req.app.get('client');
        const user = await client.users.fetch(req.params.userId);
        res.json({ id: user.id, username: user.username, discriminator: user.discriminator, tag: user.tag });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const guildId = req.query.guildId || process.env.GUILD_ID;
        const client = req.app.get('client');

        if (!guildId) {
            return res.status(400).json({ success: false, error: 'Guild ID is required' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'Guild not found' });
        }

        try {
            // Force fetch to bypass cache and get real status
            const member = await guild.members.fetch(userId);

            return res.json({
                success: true,
                isMember: true,
                user: {
                    id: member.id,
                    username: member.user.username,
                    nickname: member.nickname,
                    avatar: member.user.avatarURL(),
                    roles: member.roles.cache.map(r => r.id), // Return all role IDs
                    guildName: guild.name,
                    guildId: guild.id
                }
            });
        } catch (error) {
            if (error.code === 10007) { // Unknown Member
                return res.json({ success: true, isMember: false });
            }
            throw error;
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
