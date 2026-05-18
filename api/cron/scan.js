import { scanUpwork } from '../../lib/upwork.js';
import { upsertJob } from '../../lib/supabase.js';
import { notifyNewJob } from '../../lib/telegram.js';

export default async function handler(req, res) {
  // Protect cron from manual triggers in production
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { scanned: 0, new: 0, errors: [] };

  try {
    const jobs = await scanUpwork();
    results.scanned = jobs.length;

    for (const job of jobs) {
      try {
        const saved = await upsertJob(job);
        if (saved) {
          // saved is null if duplicate — only notify on genuinely new jobs
          results.new += 1;
          if (job.relevance_score >= 4) {
            // Only notify for relevant jobs (skip obvious mismatches)
            await notifyNewJob({ ...job, id: saved.id });
          }
        }
      } catch (err) {
        results.errors.push(`${job.title}: ${err.message}`);
      }
    }

    console.log(`[scan] scanned=${results.scanned} new=${results.new}`);
    return res.json(results);
  } catch (err) {
    console.error('[scan] fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
