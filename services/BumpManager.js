const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

class BumpManager {
    constructor(client) {
        this.client = client;
        this.supabase = null;
        this.initSupabase();
    }

    initSupabase() {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn('[BumpManager] Supabase credentials missing. Auto-reset will fail.');
        }
    }

    start() {
        // Schedule: 1st of every month at 00:00 (Midnight)
        // Cron: "0 0 1 * *"
        cron.schedule('0 0 1 * *', async () => {
            console.log('[BumpManager] 📅 Running Monthly Reset...');
            await this.handleMonthlyReset();
        });

        console.log('[BumpManager] Service Started. Waiting for 1st of month.');
    }

    async handleMonthlyReset() {
        if (!this.supabase) return;

        try {
            // 1. Fetch Winners (Before Reset)
            const { data: winners } = await this.supabase
                .from('leaderboard_bumps')
                .select('user_id, count')
                .order('count', { ascending: false })
                .limit(3);

            // 2. Announce Winners (If channel exists)
            const channelId = process.env.BRIDGE_CHANNEL_ID;
            if (channelId && winners && winners.length > 0) {
                try {
                    const channel = await this.client.channels.fetch(channelId);
                    if (channel) {
                        const winnerText = winners.map((w, i) =>
                            `${i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'} <@${w.user_id}> (${w.count} bumps)`
                        ).join('\n');

                        await channel.send({
                            content: `**🏆 THE MONTHLY BUMP RACE HAS ENDED! 🏆**\n\nCongrats to our champions:\n${winnerText}\n\n*The leaderboard has been reset. Start your engines for this month!* 🏎️`
                        });
                    }
                } catch (err) {
                    console.error('[BumpManager] Failed to announce winners:', err);
                }
            }

            // 3. Reset Counts (Set all to 0)
            // Note: Efficient way is to update all.
            // Supabase 'update' without 'eq' updates all rows if RLS allows or Service Role used.
            const { error } = await this.supabase
                .from('leaderboard_bumps')
                .update({ count: 0 })
                .neq('user_id', 'CHECK_ALL'); // Hacky way to select all?
            // Actually, .neq('count', -1) work better?
            // Or just dont chain any filter? Supabase JS requires at least one filter usually to prevent accidental wipe? 
            // Let's use .gt('count', 0) to only reset those with points.

            const { error: resetError } = await this.supabase
                .from('leaderboard_bumps')
                .update({ count: 0 })
                .gt('count', 0);

            if (resetError) {
                console.error('[BumpManager] Failed to reset DB:', resetError);
            } else {
                console.log('[BumpManager] Leaderboard successfully reset.');
            }

        } catch (err) {
            console.error('[BumpManager] Critical error during reset:', err);
        }
    }
}

module.exports = BumpManager;
