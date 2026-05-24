/**
 * Standalone email scan script — runs directly in GitHub Actions.
 *
 * Flow: Gmail IMAP → parse Upwork alert emails → score → Groq → Supabase → Telegram
 *
 * Note: Upwork direct search (403 block) removed — email alerts are the
 * only reliable free method. Set up Upwork saved searches to get alerts.
 */

// Prevent unhandled socket errors from crashing the process
process.on('uncaughtException', (err) => {
  console.error('[email-scan] uncaught exception (continuing):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[email-scan] unhandled rejection (continuing):', reason?.message || reason);
});

import { scanUpworkEmails } from '../lib/gmailReader.js';
import { enrichAndScore } from '../lib/scanner.js';
import { upsertJob } from '../lib/supabase.js';
import { notifyNewJob } from '../lib/telegram.js';

async function main() {
  console.log('[email-scan] starting', new Date().toISOString());
  const results = { raw: 0, scored: 0, saved: 0, notified: 0, errors: [] };

  try {
    const rawJobs = await scanUpworkEmails();
    results.raw = rawJobs.length;

    if (rawJobs.length === 0) {
      console.log('[email-scan] no new Upwork emails — done');
      console.log('[email-scan]', JSON.stringify(results));
      return;
    }

    console.log(`[email-scan] ${rawJobs.length} jobs extracted, scoring...`);
    const enriched = await enrichAndScore(rawJobs);
    results.scored = enriched.length;

    for (const job of enriched) {
      try {
        const saved = await upsertJob(job);
        if (saved) {
          results.saved += 1;
          if (job.relevance_score >= 40) {
            await notifyNewJob({ ...job, id: saved.id });
            results.notified += 1;
          }
        }
      } catch (err) {
        results.errors.push(`${job.title?.slice(0, 40)}: ${err.message}`);
        console.error('[email-scan] job error:', err.message);
      }
    }
  } catch (err) {
    console.error('[email-scan] fatal:', err.message);
    process.exit(1);
  }

  console.log('[email-scan] done', JSON.stringify(results));
}

main();
