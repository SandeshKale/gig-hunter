/**
 * Standalone email scan script — runs directly in GitHub Actions.
 * Avoids Vercel's 10s function timeout entirely.
 *
 * Flow: Gmail IMAP → parse jobs → score → Groq proposal → Supabase → Telegram
 */

import { scanUpworkEmails } from '../lib/gmailReader.js';
import { enrichAndScore } from '../lib/scanner.js';
import { upsertJob } from '../lib/supabase.js';
import { notifyNewJob } from '../lib/telegram.js';

async function main() {
  console.log('[email-scan] starting', new Date().toISOString());
  const results = { emails_found: 0, jobs_extracted: 0, saved: 0, notified: 0, errors: [] };

  try {
    const rawJobs = await scanUpworkEmails();
    results.emails_found = rawJobs.length;

    if (rawJobs.length === 0) {
      console.log('[email-scan] no new Upwork emails — done');
      return;
    }

    console.log(`[email-scan] extracted ${rawJobs.length} jobs, scoring...`);
    const enriched = await enrichAndScore(rawJobs);
    results.jobs_extracted = enriched.length;

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
    console.error('[email-scan] errors:', results.errors);
  }
}

main();
