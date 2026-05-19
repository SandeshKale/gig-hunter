import { scanAll } from '../../lib/scanner.js';
import { upsertJob } from '../../lib/supabase.js';
import { notifyNewJob } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { scanned: 0, saved: 0, notified_hot: 0, notified_new: 0, excluded: 0, errors: [] };

  try {
    const jobs = await scanAll();
    results.scanned = jobs.length;

    for (const job of jobs) {
      try {
        const saved = await upsertJob(job);
        if (saved) {
          results.saved += 1;
          // Only alert for score >= 50 (tier = 'full' or 'angle')
          if (job.relevance_score >= 50) {
            await notifyNewJob({ ...job, id: saved.id });
            if (job.relevance_score >= 70) results.notified_hot += 1;
            else results.notified_new += 1;
          }
        }
      } catch (err) {
        results.errors.push(`${job.title?.slice(0, 40)}: ${err.message}`);
      }
    }

    console.log('[scan]', JSON.stringify(results));
    return res.json(results);
  } catch (err) {
    console.error('[scan] fatal:', err.message);
    return res.status(500).json({ error: err.message, results });
  }
}
