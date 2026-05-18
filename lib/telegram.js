const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(text) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

/** Alert for a freshly found job */
export async function notifyNewJob(job) {
  const stars = '⭐'.repeat(Math.min(job.relevance_score || 0, 5));
  const budget = job.budget_min
    ? job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`
    : 'Budget TBD';

  const shortId = job.id.slice(0, 8);
  const skills  = (job.skills || []).slice(0, 4).join(' · ') || '—';

  await sendMessage(
`🆕 <b>NEW GIG</b>  ${stars}  <code>${shortId}</code>

💼 ${job.title}
💰 ${budget}
🏷 ${skills}

📋 <b>Proposal draft:</b>
${job.proposal || '(generating…)'}

<a href="${job.url}">View on Upwork →</a>

✅ /applied_${shortId}   ❌ /lost_${shortId}   ⏭ /skip_${shortId}`
  );
}

/** Follow-up reminder */
export async function notifyFollowUp(job) {
  const shortId = job.id.slice(0, 8);
  await sendMessage(
`⏰ <b>FOLLOW-UP REMINDER</b>  <code>${shortId}</code>

You applied 3 days ago — no reply yet.

💼 ${job.title}
<a href="${job.url}">View on Upwork →</a>

✅ /replied_${shortId}   ❌ /lost_${shortId}`
  );
}

/** Win alert */
export async function notifyWin(job) {
  await sendMessage(
`🏆 <b>GIG WON!</b>

💼 ${job.title}
🎉 Congrats — update notes with /won_${job.id.slice(0, 8)}`
  );
}
