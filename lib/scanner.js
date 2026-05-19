import Parser from 'rss-parser';
import { scoreJob, proposalTier } from './scorer.js';
import { generateProposal } from './proposalWriter.js';

const rss = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; GigHunter/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ─── Niche keywords ───────────────────────────────────────────────────────────
const NICHE_KEYWORDS = ['react', 'node', 'javascript', 'typescript', 'next.js',
                        'nextjs', 'full stack', 'fullstack', 'frontend', 'vite'];

function isNicheRelevant(title = '', desc = '', tags = []) {
  const text = (title + ' ' + desc + ' ' + tags.join(' ')).toLowerCase();
  return NICHE_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── RSS Sources (US/UK/AU/ME/Remote) ─────────────────────────────────────────
const RSS_SOURCES = [
  { id: 'wwr-programming', platform: 'weworkremotely', location: 'Remote',
    url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss' },
  { id: 'wwr-fullstack',   platform: 'weworkremotely', location: 'Remote',
    url: 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss' },
  { id: 'wwr-frontend',    platform: 'weworkremotely', location: 'Remote',
    url: 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss' },
  { id: 'remotive-sw',     platform: 'remotive',       location: 'Remote',
    url: 'https://remotive.com/remote-jobs/feed/software-dev' },
  { id: 'remotive-fe',     platform: 'remotive',       location: 'Remote',
    url: 'https://remotive.com/remote-jobs/feed/frontend' },
];

async function fetchRSS(source) {
  try {
    const feed  = await rss.parseURL(source.url);
    const items = feed.items || [];
    console.log(`[${source.id}] ${items.length} raw`);
    return items
      .filter((item) => isNicheRelevant(item.title, item.contentSnippet, []))
      .map((item) => ({
        external_id:    `${source.id}-${item.guid || item.link}`,
        platform:       source.platform,
        title:          item.title || 'Untitled',
        description:    (item.contentSnippet || '').slice(0, 800),
        url:            item.link,
        location:       source.location,
        skills:         [],
        budget_type:    null, budget_min: null, budget_max: null,
        paymentVerified: null, proposalCount: null,
      }));
  } catch (err) {
    console.error(`[${source.id}] failed: ${err.message}`);
    return [];
  }
}

// ─── JSON Sources ─────────────────────────────────────────────────────────────

async function fetchRemoteOK() {
  const TAGS = ['react', 'nodejs', 'javascript', 'typescript', 'fullstack', 'nextjs'];
  const jobs = [];
  for (const tag of TAGS) {
    try {
      const res  = await fetch(`https://remoteok.com/api?tag=${tag}`, {
        headers: { 'User-Agent': 'GigHunter/1.0', 'Accept': 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of data.slice(1).filter((j) => j.id)) {
        const skills = (j.tags || []).map(String);
        jobs.push({
          external_id:    `remoteok-${j.id}`,
          platform:       'remoteok',
          title:          j.position || 'Untitled',
          description:    (j.description || '').replace(/<[^>]+>/g, '').slice(0, 800),
          url:            j.url || `https://remoteok.com/l/${j.id}`,
          location:       j.location || 'Remote',
          skills,
          budget_type:    null,
          budget_min:     j.salary_min || null,
          budget_max:     j.salary_max || null,
          paymentVerified: null, proposalCount: null,
        });
      }
    } catch (err) { console.error(`[remoteok:${tag}] ${err.message}`); }
  }
  return jobs;
}

async function fetchJobicy() {
  try {
    const res  = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50&tag=javascript',
      { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || [])
      .filter((j) => isNicheRelevant(j.jobTitle, j.jobDescription, j.jobTags || []))
      .map((j) => ({
        external_id:    `jobicy-${j.id}`,
        platform:       'jobicy',
        title:          j.jobTitle,
        description:    (j.jobDescription || '').replace(/<[^>]+>/g, '').slice(0, 800),
        url:            j.url,
        location:       j.jobGeo || 'Remote',
        skills:         j.jobTags || [],
        budget_type:    null, budget_min: null, budget_max: null,
        paymentVerified: null, proposalCount: null,
      }));
  } catch (err) { console.error(`[jobicy] ${err.message}`); return []; }
}

async function fetchArbeitnow() {
  try {
    const res  = await fetch('https://arbeitnow.com/api/job-board-api',
      { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .filter((j) => j.remote && isNicheRelevant(j.title, j.description, j.tags || []))
      .map((j) => ({
        external_id:    `arbeitnow-${j.slug}`,
        platform:       'arbeitnow',
        title:          j.title,
        description:    (j.description || '').replace(/<[^>]+>/g, '').slice(0, 800),
        url:            j.url,
        location:       j.location || 'Remote / EU',
        skills:         j.tags || [],
        budget_type:    null, budget_min: null, budget_max: null,
        paymentVerified: null, proposalCount: null,
      }));
  } catch (err) { console.error(`[arbeitnow] ${err.message}`); return []; }
}

// Freelancer.com — open RSS, works server-side
async function fetchFreelancer() {
  const TERMS = ['react', 'nodejs', 'next.js', 'typescript'];
  const jobs  = [];
  for (const term of TERMS) {
    try {
      const feed = await rss.parseURL(
        `https://www.freelancer.com/jobs/rss/?keyword=${encodeURIComponent(term)}`
      );
      for (const item of (feed.items || [])) {
        if (!isNicheRelevant(item.title, item.contentSnippet, [])) continue;
        jobs.push({
          external_id:    `freelancer-${item.guid || item.link}`,
          platform:       'freelancer',
          title:          item.title || 'Untitled',
          description:    (item.contentSnippet || '').slice(0, 800),
          url:            item.link,
          location:       '',
          skills:         [],
          budget_type:    null, budget_min: null, budget_max: null,
          paymentVerified: null, proposalCount: null,
        });
      }
    } catch (err) { console.error(`[freelancer:${term}] ${err.message}`); }
  }
  return jobs;
}

// Himalayas — US/AU remote jobs, good JSON API
async function fetchHimalayas() {
  try {
    const res  = await fetch('https://himalayas.app/jobs/api?q=react&limit=50',
      { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || [])
      .filter((j) => isNicheRelevant(j.title, j.description, j.skills || []))
      .map((j) => ({
        external_id:    `himalayas-${j.id}`,
        platform:       'himalayas',
        title:          j.title,
        description:    (j.description || '').replace(/<[^>]+>/g, '').slice(0, 800),
        url:            j.applicationUrl || j.url,
        location:       (j.regions || []).join(', ') || 'Remote',
        skills:         j.skills || [],
        budget_type:    null,
        budget_min:     j.salaryMin || null,
        budget_max:     j.salaryMax || null,
        paymentVerified: null, proposalCount: null,
      }));
  } catch (err) { console.error(`[himalayas] ${err.message}`); return []; }
}

// Authentic Jobs — US/UK creative/tech freelance
async function fetchAuthenticJobs() {
  try {
    const feed = await rss.parseURL('https://authenticjobs.com/feed/?type=all&search=react');
    return (feed.items || [])
      .filter((item) => isNicheRelevant(item.title, item.contentSnippet, []))
      .map((item) => ({
        external_id:    `authenticjobs-${item.guid || item.link}`,
        platform:       'authenticjobs',
        title:          item.title || 'Untitled',
        description:    (item.contentSnippet || '').slice(0, 800),
        url:            item.link,
        location:       'US / Remote',
        skills:         [],
        budget_type:    null, budget_min: null, budget_max: null,
        paymentVerified: null, proposalCount: null,
      }));
  } catch (err) { console.error(`[authenticjobs] ${err.message}`); return []; }
}

// ─── Score + enrich ────────────────────────────────────────────────────────────

async function enrichAndScore(rawJobs) {
  const results = [];
  // Process in parallel batches of 5 to avoid Groq rate limits
  for (let i = 0; i < rawJobs.length; i += 5) {
    const batch = rawJobs.slice(i, i + 5);
    const enriched = await Promise.all(batch.map(async (job) => {
      const { score, autoExclude, excludeReason, penalise } = scoreJob(job);
      if (autoExclude) {
        console.log(`[score] EXCLUDE "${job.title.slice(0, 50)}" — ${excludeReason}`);
        return null;
      }
      const tier     = proposalTier(score);
      const proposal = tier !== 'none' ? await generateProposal(job, tier) : null;
      return { ...job, relevance_score: score, proposal, _tier: tier, _penalised: penalise };
    }));
    results.push(...enriched.filter(Boolean));
  }
  return results;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function scanAll() {
  const [rssJobs, remoteOK, jobicy, arbeitnow, freelancer, himalayas, authenticJobs] =
    await Promise.all([
      Promise.all(RSS_SOURCES.map(fetchRSS)).then((r) => r.flat()),
      fetchRemoteOK(),
      fetchJobicy(),
      fetchArbeitnow(),
      fetchFreelancer(),
      fetchHimalayas(),
      fetchAuthenticJobs(),
    ]);

  const raw = [...rssJobs, ...remoteOK, ...jobicy, ...arbeitnow,
               ...freelancer, ...himalayas, ...authenticJobs];
  console.log(`[scanner] raw: ${raw.length}`);

  // Deduplicate
  const seen   = new Set();
  const deduped = raw.filter((j) => {
    if (!j.external_id || seen.has(j.external_id)) return false;
    seen.add(j.external_id);
    return true;
  });
  console.log(`[scanner] deduped: ${deduped.length}`);

  const enriched = await enrichAndScore(deduped);
  console.log(`[scanner] pass scoring: ${enriched.length}`);
  return enriched;
}
