import { scanUpwork } from '../../lib/upwork.js';
import { upsertJob } from '../../lib/supabase.js';
import { notifyNewJob } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { scanned: 0, passed_budget: 0, new: 0, notified: 0, errors: [] };

  try {
    const jobs = await scanUpwork();
    results.scanned = jobs.length;

    for (const job of jobs) {
      try {
        const saved = await upsertJob(job);
        if (saved) {
          results.new += 1;
          if (job.relevance_score >= 4) {
            await notifyNewJob({ ...job, id: saved.id });
            results.notified += 1;
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
