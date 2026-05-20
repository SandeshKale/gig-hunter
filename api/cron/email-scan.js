import { scanUpworkEmails } from '../../lib/gmailReader.js';
import { enrichAndScore } from '../../lib/scanner.js';
import { upsertJob } from '../../lib/supabase.js';
import { notifyNewJob } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { emails_scanned: 0, jobs_found: 0, saved: 0, notified: 0, errors: [] };

  try {
    // 1. Fetch jobs from Upwork alert emails
    const rawJobs = await scanUpworkEmails();
    results.emails_scanned = rawJobs.length;

    if (rawJobs.length === 0) {
      return res.json({ ...results, message: 'No new Upwork emails' });
    }

    // 2. Score + generate proposals
    const enriched = await enrichAndScore(rawJobs);
    results.jobs_found = enriched.length;

    // 3. Save + notify
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
      }
    }

    console.log('[email-scan]', JSON.stringify(results));
    return res.json(results);
  } catch (err) {
    console.error('[email-scan] fatal:', err.message);
    return res.status(500).json({ error: err.message, results });
  }
}
