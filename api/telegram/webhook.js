import { updateJobStatus, getWeeklyStats } from '../../lib/supabase.js';
import { sendMessage } from '../../lib/telegram.js';

/** Find full job ID from 8-char short ID */
import { supabase } from '../../lib/supabase.js';

async function findJob(shortId) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, url')
    .ilike('id', `${shortId}%`)
    .limit(1)
    .single();
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message } = req.body || {};
  if (!message?.text) return res.status(200).end();

  const text = message.text.trim();
  const reply = (msg) => sendMessage(msg);

  // Command: /applied_XXXXXXXX
  const commandMatch = text.match(/^\/(applied|replied|won|lost|skip)_([a-f0-9]{8})/i);
  if (commandMatch) {
    const [, action, shortId] = commandMatch;
    const statusMap = {
      applied: 'applied', replied: 'replied', won: 'won', lost: 'lost', skip: 'skip',
    };
    try {
      const job = await findJob(shortId);
      if (!job) return (await reply(`❌ Job <code>${shortId}</code> not found.`), res.status(200).end());
      await updateJobStatus(job.id, statusMap[action]);
      const emoji = { applied: '📤', replied: '💬', won: '🏆', lost: '❌', skip: '⏭' };
      await reply(`${emoji[action]} <b>${action.toUpperCase()}</b>\n💼 ${job.title}`);
    } catch (err) {
      await reply(`⚠️ Error: ${err.message}`);
    }
    return res.status(200).end();
  }

  // Command: /stats
  if (text === '/stats') {
    try {
      const s = await getWeeklyStats();
      await reply(
`📊 <b>This Week</b>

🆕 New:     ${s.new_count}
📤 Applied: ${s.applied_count}
💬 Replied: ${s.replied_count}
🏆 Won:     ${s.won_count}
🎯 Win rate: ${s.win_rate_pct ?? 0}%`
      );
    } catch (err) {
      await reply(`⚠️ Stats error: ${err.message}`);
    }
    return res.status(200).end();
  }

  // Command: /help
  if (text === '/help' || text === '/start') {
    await reply(
`🤖 <b>Gig Hunter Bot</b>

After you apply, update the status:
/applied_XXXXXXXX — Submitted proposal
/replied_XXXXXXXX — Got a reply
/won_XXXXXXXX     — 🎉 Gig won!
/lost_XXXXXXXX    — Pass / lost
/skip_XXXXXXXX    — Not relevant

Other commands:
/stats — This week's numbers
/help  — This message

The 8-char code is shown in each job alert.`
    );
    return res.status(200).end();
  }

  // Unknown — just ack
  res.status(200).end();
}
