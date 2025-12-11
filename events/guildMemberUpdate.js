const { Events } = require('discord.js');

// Regex to detect Country Flag Emojis (Regional Indicator Symbols)
const FLAG_REGEX = /[\uD83C\uDDE6-\uD83C\uDDFF]{2}/u;

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        try {
            // 1. Get Current Name
            const currentNick = newMember.nickname || newMember.user.username;

            // 2. Check for Flags
            // We only care if the nickname currently has a flag.
            // Even if the user didn't change their nickname (e.g. role update), 
            // if they have a flag, we want to remove it.
            // Using a lighter check first before regex if desired, but regex is fast enough.
            if (FLAG_REGEX.test(currentNick)) {
                console.log(`[FlagFilter] Flag detected in user: ${newMember.user.tag} (${currentNick})`);

                // 3. Remove flags
                // Replace all instances of the flag pattern with an empty string
                const cleanNick = currentNick.replace(/[\uD83C\uDDE6-\uD83C\uDDFF]{2}/gu, '').trim();

                // 4. Update the nickname
                // Ensure the bot has permissions and isn't trying to enforce on owner/higher roles
                if (newMember.manageable) {
                    // Fallback to username if cleaning results in empty string, or strict default
                    const finalNick = cleanNick.length > 0 ? cleanNick : (newMember.user.username || 'Member');

                    // Avoid API spam: Only update if the cleaned name is actually different (it should be if regex matched)
                    if (finalNick !== currentNick) {
                        try {
                            await newMember.setNickname(finalNick);
                            console.log(`[FlagFilter] Renamed ${newMember.user.tag} to "${finalNick}"`);
                        } catch (err) {
                            console.error(`[FlagFilter] Failed to set nickname for ${newMember.user.tag}:`, err.message);
                        }
                    }
                } else {
                    console.log(`[FlagFilter] Cannot manage user: ${newMember.user.tag} (Role hierarchy or missing permissions)`);
                }
            }
        } catch (error) {
            console.error('[FlagFilter] Error in guildMemberUpdate:', error);
        }
    },
};
