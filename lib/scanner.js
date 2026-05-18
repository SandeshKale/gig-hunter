import Parser from 'rss-parser';

const rss = new Parser({ timeout: 12000 });

// ─── Scoring ────────────────────────────────────────────────────────────────

const HIGH_VALUE = [
  'react', 'next.js', 'nextjs', 'node.js', 'nodejs', 'typescript',
  'javascript', 'full stack', 'full-stack', 'vite', 'supabase',
  'postgresql', 'rest api', 'graphql', 'vercel', 'tailwind', 'dashboard',
];
const RED_FLAGS = [
  'wordpress', 'woocommerce', 'shopify', 'php', 'laravel', 'wix',
  'squarespace', 'magento', 'drupal', 'java ', 'spring boot', 'android', 'ios',
];
const MIN_FIXED  = 300;
const MIN_HOURLY = 20;

function score(title = '', desc = '', skills = []) {
  let s = 5;
  const text = (title + ' ' + desc + ' ' + skills.join(' ')).toLowerCase();
  HIGH_VALUE.forEach((kw) => { if (text.includes(kw)) s += 1; });
  RED_FLAGS.forEach((kw)  => { if (text.includes(kw)) s -= 2; });
  return Math.max(0, Math.min(10, s));
}

function proposal(title, skills) {
  const top = skills.slice(0, 3).join(', ') || 'React / Node.js';
  return `Hi,

I've built production React apps with ${top} — including a live Google Drive-synced quoting tool (Vercel, 95%+ test coverage) and a real-time trading dashboard.

I'd love to learn more about "${title}". Happy to share relevant code samples.

Best,
Sandesh`;
}

// ─── RemoteOK ───────────────────────────────────────────────────────────────
// Free JSON API — no auth required. Returns remote-only jobs tagged by tech.

const REMOTEOK_TAGS = ['react', 'nodejs', 'javascript', 'typescript', 'fullstack'];

async function scanRemoteOK() {
  const jobs = [];
  for (const tag of REMOTEOK_TAGS) {
    try {
      const res = await fetch(`https://remoteok.com/api?tag=${tag}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GigHunter/1.0)',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) { console.warn(`[remoteok] ${tag} HTTP ${res.status}`); continue; }
      const data = await res.json();
      // First item is a legal notice object — skip it
      const listings = data.slice(1).filter((j) => j.id);
      console.log(`[remoteok] tag=${tag} → ${listings.length} jobs`);

      for (const j of listings) {
        const skills = (j.tags || []).map(String);
        const s      = score(j.position, j.description, skills);
        jobs.push({
          external_id:     `remoteok-${j.id}`,
          platform:        'remoteok',
          title:           j.position || 'Untitled',
          description:     (j.description || '').replace(/<[^>]+>/g, '').slice(0, 800),
          url:             j.url || `https://remoteok.com/l/${j.id}`,
          skills,
          relevance_score: s,
          proposal:        proposal(j.position, skills),
          budget_type:     null,
          budget_min:      j.salary_min || null,
          budget_max:      j.salary_max || null,
        });
      }
    } catch (err) {
      console.error(`[remoteok] ${tag}: ${err.message}`);
    }
  }
  return jobs;
}

// ─── We Work Remotely ────────────────────────────────────────────────────────
// Open RSS feed — no auth, works server-side.

const WWR_FEEDS = [
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
];

const WWR_KEYWORDS = ['react', 'node', 'javascript', 'typescript', 'next.js', 'full stack', 'frontend', 'fullstack'];

async function scanWWR() {
  const jobs = [];
  for (const feedUrl of WWR_FEEDS) {
    try {
      const feed = await rss.parseURL(feedUrl);
      const items = feed.items || [];
      console.log(`[wwr] ${feedUrl.split('/').pop()} → ${items.length} items`);

      for (const item of items) {
        const text = ((item.title || '') + ' ' + (item.contentSnippet || '')).toLowerCase();
        // Only include if at least one target keyword appears
        if (!WWR_KEYWORDS.some((kw) => text.includes(kw))) continue;

        const s = score(item.title, item.contentSnippet, []);
        jobs.push({
          external_id:     `wwr-${item.guid || item.link}`,
          platform:        'weworkremotely',
          title:           item.title || 'Untitled',
          description:     (item.contentSnippet || '').slice(0, 800),
          url:             item.link,
          skills:          [],
          relevance_score: s,
          proposal:        proposal(item.title, []),
          budget_type:     null,
          budget_min:      null,
          budget_max:      null,
        });
      }
    } catch (err) {
      console.error(`[wwr] ${err.message}`);
    }
  }
  return jobs;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function scanAll() {
  const [rok, wwr] = await Promise.all([scanRemoteOK(), scanWWR()]);
  const all  = [...rok, ...wwr];

  // Deduplicate by external_id
  const seen = new Set();
  return all.filter((j) => {
    if (seen.has(j.external_id)) return false;
    seen.add(j.external_id);
    return true;
  });
}
