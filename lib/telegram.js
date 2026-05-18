const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  return res.json();
}

const PLATFORM_EMOJI = {
  remoteok:       '🟠 RemoteOK',
  weworkremotely: '🟣 WeWorkRemotely',
  upwork:         '🔷 Upwork',
};

export async function notifyNewJob(job) {
  const stars    = '⭐'.repeat(Math.min(job.relevance_score || 0, 5));
  const platform = PLATFORM_EMOJI[job.platform] || job.platform;
  const budget   = job.budget_min
    ? job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`
    : 'Remote · Salary TBD';
  const shortId  = job.id.slice(0, 8);
  const skills   = (job.skills || []).slice(0, 4).join(' · ') || '—';

  await sendMessage(
`🆕 <b>NEW GIG</b>  ${stars}
${platform}  <code>${shortId}</code>

💼 ${job.title}
💰 ${budget}
🏷 ${skills}

📋 <b>Proposal:</b>
${job.proposal || '—'}

<a href="${job.url}">View listing →</a>

✅ /applied_${shortId}   ❌ /lost_${shortId}   ⏭ /skip_${shortId}`
  );
}

export async function notifyFollowUp(job) {
  const shortId = job.id.slice(0, 8);
  await sendMessage(
`⏰ <b>FOLLOW-UP REMINDER</b>  <code>${shortId}</code>

Applied 3 days ago — no reply yet.
💼 ${job.title}
<a href="${job.url}">View listing →</a>

✅ /replied_${shortId}   ❌ /lost_${shortId}`
  );
}
