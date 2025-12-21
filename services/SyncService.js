const { createClient } = require('@supabase/supabase-js');
const { EmbedBuilder } = require('discord.js');

class SyncService {
    constructor(client) {
        this.client = client;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn('[SyncService] Supabase keys missing. Sync disabled.');
        }
    }

    async syncAll() {
        if (!this.supabase) return;
        console.log('[SyncService] Starting Auto-Sync for all hoods...');
        const start = Date.now();

        try {
            // 1. Fetch Configuration & Districts
            const { data: configRows } = await this.supabase
                .from('app_config')
                .select('key, value')
                .in('key', ['role_id_coleader', 'role_id_elder']);

            const config = new Map(configRows?.map(r => [r.key, r.value]));
            const globalCoLeaderId = config.get('role_id_coleader');
            const globalElderId = config.get('role_id_elder');

            const { data: districts } = await this.supabase
                .from('map_districts')
                .select('*');

            if (!districts || districts.length === 0) {
                console.log('[SyncService] No districts found.');
                return;
            }

            let totalSynced = 0;

            // 2. Iterate and Sync
            for (const district of districts) {
                await this.syncDistrict(district, globalCoLeaderId, globalElderId);
                totalSynced++;
            }

            console.log(`[SyncService] Complete! Synced ${totalSynced} hoods in ${(Date.now() - start) / 1000}s`);

        } catch (error) {
            console.error('[SyncService] Error:', error);
        }
    }

    async syncDistrict(district, globalCoLeaderRole, globalElderRole) {
        if (!district.hood_id) return;

        try {
            const guildId = process.env.GUILD_ID;
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return console.error(`[SyncService] Guild ${guildId} not found.`);

            // Fetch Members with the District Role
            // We fetch ALL members then filter, or fetch by role if efficient.
            // Discord.js fetch() gets all.
            const role = guild.roles.cache.get(district.hood_id);
            if (!role) {
                // console.warn(`[SyncService] Role ${district.hood_id} not found for ${district.name}`);
                return;
            }

            // Using Guild.members.fetch() ensures cache is populated
            // But iterating cache is faster if already fetched. 
            // Let's rely on cache or force fetch if needed.
            // For cron, lightweight is better.

            // Filter members who have the role
            const members = role.members.map(m => m);

            if (members.length === 0) return;

            const upsertData = members.map(m => {
                let rank = 'Member';
                const roles = m.roles.cache;

                // Priority 1: Fixed Leader
                if (district.leader_discord_id && m.id === district.leader_discord_id) {
                    rank = 'Leader';
                }
                // Priority 2: Fixed Co-Leaders
                else if (district.coleader_discord_ids && district.coleader_discord_ids.includes(m.id)) {
                    rank = 'CoLeader';
                }
                // Priority 3: Global Roles
                else if (globalCoLeaderRole && roles.has(globalCoLeaderRole)) {
                    rank = 'CoLeader';
                } else if (globalElderRole && roles.has(globalElderRole)) {
                    rank = 'Elder';
                }

                return {
                    user_id: m.id,
                    hood_id: district.hood_id,
                    rank: rank,
                    nickname: m.nickname || m.displayName,
                    username: m.user.username,
                    avatar_url: m.user.displayAvatarURL()
                };
            });

            // Handle Manual Promotions / Preservation logic if needed (matching Next.js logic)
            // But for Auto-Sync, strictly enforcing Discord State is safer and cleaner unless explicitly requested otherwise.
            // The Next.js logic had: "if no global roles, keep existing".
            // Let's replicate that simply:

            let finalData = upsertData;

            if (!globalCoLeaderRole && !globalElderRole) {
                // Fetch existing to preserve
                const { data: existing } = await this.supabase.from('hood_memberships').select('user_id, rank').eq('hood_id', district.hood_id);
                const existingMap = new Map(existing?.map(e => [e.user_id, e.rank]));

                finalData = upsertData.map(d => {
                    if (d.rank !== 'Member') return d;
                    return { ...d, rank: existingMap.get(d.user_id) || 'Member' };
                });
            }

            const { error } = await this.supabase
                .from('hood_memberships')
                .upsert(finalData, { onConflict: 'user_id,hood_id' });

            if (error) console.error(`[SyncService] Failed to upsert ${district.name}:`, error.message);
            // else console.log(`[SyncService] Synced ${district.name} (${finalData.length} members)`);

        } catch (err) {
            console.error(`[SyncService] Error syncing ${district.name}:`, err.message);
        }
    }
}

module.exports = SyncService;
