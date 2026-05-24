/**
 * Standalone email scan script — runs directly in GitHub Actions.
 * Avoids Vercel's 10s function timeout entirely.
 *
 * Flow:
 *   1. Gmail IMAP → parse Upwork alert emails
 *   2. If no emails found → fall back to Upwork direct search
 *   3. Score + Groq proposal → Supabase → Telegram
 */

import { scanUpworkEmails } from '../lib/gmailReader.js';

// Prevent unhandled socket errors from crashing the process
process.on('uncaughtException', (err) => {
  console.error('[email-scan] uncaught exception (continuing):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[email-scan] unhandled rejection (continuing):', reason?.message || reason);
});
import { scanUpworkSearch } from '../lib/upworkSearch.js';
import { enrichAndScore } from '../lib/scanner.js';
import { upsertJob } from '../lib/supabase.js';
import { notifyNewJob } from '../lib/telegram.js';

async function main() {
  console.log('[email-scan] starting', new Date().toISOString());
  const results = { source: '', raw: 0, scored: 0, saved: 0, notified: 0, errors: [] };

  try {
    // 1. Try Gmail IMAP first
    let rawJobs = await scanUpworkEmails();

    if (rawJobs.length === 0) {
      // 2. Fallback: scrape Upwork search directly
      console.log('[email-scan] no emails — falling back to Upwork direct search');
      results.source = 'upwork-direct';
      rawJobs = await scanUpworkSearch();
    } else {
      results.source = 'gmail';
    }

    results.raw = rawJobs.length;
    console.log(`[email-scan] source=${results.source} raw=${rawJobs.length}`);

    if (rawJobs.length === 0) {
      console.log('[email-scan] nothing to process — done');
      console.log('[email-scan]', JSON.stringify(results));
      return;
    }

    // 3. Score + generate proposals
    const enriched = await enrichAndScore(rawJobs);
    results.scored = enriched.length;

    // 4. Save + notify
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
  if (results.errors.length > 0) {
    console.error('[email-scan] errors:', results.errors.join('\n'));
  }
}

main();
