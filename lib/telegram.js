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

const PLATFORM_LABEL = {
  remoteok:       '🟠 RemoteOK',
  weworkremotely: '🟣 WeWorkRemotely',
  remotive:       '🔵 Remotive',
  jobicy:         '🟡 Jobicy',
  arbeitnow:      '⚪ Arbeitnow',
  freelancer:     '🟢 Freelancer',
  himalayas:      '🏔 Himalayas',
  authenticjobs:  '✳️ AuthenticJobs',
  upwork:         '🔷 Upwork',
};

function scoreBar(score) {
  // Visual score bar out of 10 blocks
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
}

function budgetStr(job) {
  if (job.budget_min) {
    return job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`;
  }
  return 'Salary TBD';
}

/** Full alert — score ≥ 70 — includes Claude-generated proposal */
async function notifyHighScore(job) {
  const shortId  = job.id.slice(0, 8);
  const platform = PLATFORM_LABEL[job.platform] || job.platform;
  const location = job.location || 'Remote';

  await sendMessage(
`🔥 <b>HOT GIG</b>  <code>${shortId}</code>
${platform}  ·  ${location}

💼 <b>${job.title}</b>
💰 ${budgetStr(job)}
📊 ${scoreBar(job.relevance_score)}
🏷 ${(job.skills || []).slice(0, 5).join(' · ') || '—'}

✍️ <b>Proposal angle:</b>
${job.proposal}

<a href="${job.url}">View listing →</a>

✅ /applied_${shortId}   ❌ /lost_${shortId}   ⏭ /skip_${shortId}`
  );
}

/** Medium alert — score 50–69 — one-line angle only */
async function notifyMediumScore(job) {
  const shortId  = job.id.slice(0, 8);
  const platform = PLATFORM_LABEL[job.platform] || job.platform;

  await sendMessage(
`🆕 <b>NEW GIG</b>  <code>${shortId}</code>
${platform}

💼 ${job.title}
💰 ${budgetStr(job)}
📊 ${scoreBar(job.relevance_score)}

💡 ${job.proposal || 'Check the listing.'}

<a href="${job.url}">View →</a>

✅ /applied_${shortId}   ⏭ /skip_${shortId}`
  );
}

export async function notifyNewJob(job) {
  if (job.relevance_score >= 70) return notifyHighScore(job);
  return notifyMediumScore(job);
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
