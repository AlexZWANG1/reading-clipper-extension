import { supabaseAdmin } from '../../config/supabase.mjs';
import {
  getSubscriptionById,
  listDueSubscriptionStates,
} from '../supabase/rss.mjs';
import { RssSyncConflictError, syncSubscription } from './sync.mjs';

let schedulerTimer = null;
let schedulerRunning = false;

async function runTick(batchSize) {
  if (schedulerRunning) return;
  schedulerRunning = true;

  try {
    const nowIso = new Date().toISOString();
    const dueStates = await listDueSubscriptionStates(supabaseAdmin, nowIso, batchSize);

    for (const state of dueStates) {
      try {
        const subscription = await getSubscriptionById(
          supabaseAdmin,
          state.user_id,
          state.subscription_id
        );
        if (!subscription || subscription.status !== 'active') continue;

        await syncSubscription({
          supabase: supabaseAdmin,
          userId: state.user_id,
          subscriptionId: state.subscription_id,
          force: true,
        });
      } catch (error) {
        if (error instanceof RssSyncConflictError) continue;
        console.error('[rss-scheduler] sync failed:', state.subscription_id, error.message);
      }
    }
  } catch (error) {
    console.error('[rss-scheduler] tick failed:', error.message);
  } finally {
    schedulerRunning = false;
  }
}

export function startRssScheduler() {
  if (process.env.RSS_SCHEDULER_ENABLED === 'false') {
    console.log('[rss-scheduler] disabled by RSS_SCHEDULER_ENABLED=false');
    return;
  }

  if (!supabaseAdmin) {
    console.warn('[rss-scheduler] supabaseAdmin unavailable, scheduler not started');
    return;
  }

  if (schedulerTimer) return;

  const intervalMs = Math.max(
    Number.parseInt(process.env.RSS_SCHEDULER_INTERVAL_MS || '60000', 10) || 60000,
    5000
  );
  const batchSize = Math.max(
    Number.parseInt(process.env.RSS_SCHEDULER_BATCH_SIZE || '10', 10) || 10,
    1
  );

  schedulerTimer = setInterval(() => {
    runTick(batchSize).catch((err) => {
      console.error('[rss-scheduler] unexpected error:', err.message);
    });
  }, intervalMs);

  // Trigger one warm-up tick shortly after boot.
  setTimeout(() => {
    runTick(batchSize).catch((err) => {
      console.error('[rss-scheduler] warm-up error:', err.message);
    });
  }, 2000);

  console.log(`[rss-scheduler] started, interval=${intervalMs}ms, batch=${batchSize}`);
}

export function stopRssScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  console.log('[rss-scheduler] stopped');
}
