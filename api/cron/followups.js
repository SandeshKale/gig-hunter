import { getFollowUpJobs, updateJobStatus } from '../../lib/supabase.js';
import { notifyFollowUp } from '../../lib/telegram.js';

export default async function handler(req, res) {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const jobs = await getFollowUpJobs();
    let count = 0;

    for (const job of jobs) {
      await notifyFollowUp(job);
      await updateJobStatus(job.id, 'applied', {
        follow_up_sent_at: new Date().toISOString(),
      });
      count++;
    }

    console.log(`[followups] reminded=${count}`);
    return res.json({ reminded: count });
  } catch (err) {
    console.error('[followups] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
