/**
 * Scoring engine — 0–100 weighted matrix.
 *
 * HIGH-WEIGHT   (55 pts): location, payment verified, client spend
 * MEDIUM-WEIGHT (30 pts): niche fit, scope clarity, freshness
 * LOW-WEIGHT    (15 pts): proposal count, budget sanity
 *
 * Key design principle: when data is UNKNOWN (remote jobs with no client
 * spend data, no payment verification, no proposal count), score neutrally
 * rather than penalising. Unknown ≠ bad.
 */

// ─── Sandesh's target geographies ────────────────────────────────────────────
const GEO_PRIMARY = [
  'us',
  'usa',
  'united states',
  'uk',
  'united kingdom',
  'england',
  'australia',
  'canada',
  'uae',
  'dubai',
  'qatar',
  'saudi arabia',
  'bahrain',
  'kuwait',
  'oman',
  'abu dhabi',
];
const GEO_SECONDARY = [
  'ireland',
  'new zealand',
  'singapore',
  'germany',
  'netherlands',
  'sweden',
  'norway',
  'denmark',
  'switzerland',
  'austria',
  'europe',
];
const GEO_REMOTE = ['remote', 'worldwide', 'global', 'anywhere'];

// ─── Niche keywords ────────────────────────────────────────────────────────────
export const NICHE_PERFECT = [
  'react',
  'next.js',
  'nextjs',
  'node.js',
  'nodejs',
  'typescript',
  'full stack',
  'full-stack',
  'fullstack',
  'vite',
  'react developer',
  'frontend developer',
  'dashboard',
  'web app',
  'react native',
];
export const NICHE_TANGENTIAL = [
  'javascript',
  'api',
  'rest api',
  'graphql',
  'supabase',
  'postgresql',
  'vercel',
  'tailwind',
  'llm',
  'ai integration',
  'automation',
  'frontend',
  'web developer',
  'software engineer',
  'software developer',
];

// ─── Red flags ─────────────────────────────────────────────────────────────────
export const AUTO_EXCLUDE_PATTERNS = [
  /500\+\s*(jobs?|projects?)\s*completed/i,
  /guaranteed\s*(result|roas|lead|ranking)/i,
  /pay\s*(on|per)\s*(result|delivery|lead|performance)/i,
  /commission[\s-]only/i,
  /rev[\s-]?share/i,
  /free\s*trial/i,
  /do it for free/i,
  /last (agency|freelancer|developer) (ruined|messed|broke)/i,
];

export const RED_FLAG_SKILLS = [
  'wordpress only',
  'woocommerce only',
  'shopify theme',
  'magento',
  'drupal',
  'spring boot',
  'ruby on rails',
  'django only',
  'android native',
  'ios native',
  'flutter only',
];

export const PENALISE_PATTERNS = [
  /rockstar|ninja|guru|wizard|unicorn/i,
  /must have \d+\+?\s*years/i,
];

// ─── Scoring helpers ──────────────────────────────────────────────────────────

export function geoScore(location = '') {
  const loc = location.toLowerCase().trim();
  // Check specific named geos FIRST (before remote catch-all)
  if (GEO_PRIMARY.some((g) => loc.includes(g))) return 20;
  if (GEO_SECONDARY.some((g) => loc.includes(g))) return 14;
  // Remote/worldwide/empty = neutral (not penalised)
  if (!loc || GEO_REMOTE.some((g) => loc.includes(g))) return 12;
  return 6; // other regions
}

export function nicheScore(title = '', desc = '', skills = []) {
  const text = (title + ' ' + desc + ' ' + skills.join(' ')).toLowerCase();
  const perfect = NICHE_PERFECT.filter((kw) => text.includes(kw)).length;
  const tangential = NICHE_TANGENTIAL.filter((kw) => text.includes(kw)).length;

  if (perfect >= 3) return 15;
  if (perfect >= 2) return 13;
  if (perfect === 1) return 10;
  if (tangential >= 3) return 7;
  if (tangential >= 1) return 4;
  return 0;
}

export function scopeScore(desc = '') {
  const len = (desc || '').trim().length;
  if (len > 500) return 10;
  if (len > 200) return 7;
  if (len > 80) return 4;
  if (len > 0) return 2;
  return 0;
}

export function freshnessScore(pubDate) {
  if (!pubDate) return 2; // unknown = neutral
  const ageHours = (Date.now() - new Date(pubDate).getTime()) / 3_600_000;
  if (ageHours < 2) return 5;
  if (ageHours < 6) return 4;
  if (ageHours < 12) return 3;
  if (ageHours < 24) return 2;
  return 1;
}

export function proposalCountScore(count) {
  if (count == null) return 7; // unknown = neutral
  if (count < 5) return 10;
  if (count < 10) return 9;
  if (count < 20) return 8;
  if (count < 30) return 7;
  if (count < 50) return 6;
  return 5;
}

export function budgetScore(job) {
  if (!job.budget_min) return 3; // unknown = neutral
  if (job.budget_type === 'hourly') {
    if (job.budget_min >= 40) return 5;
    if (job.budget_min >= 25) return 3;
    return 1;
  }
  if (job.budget_type === 'fixed') {
    if (job.budget_min >= 1000) return 5;
    if (job.budget_min >= 300) return 3;
    return 1;
  }
  return 3;
}

// Payment verified: true=20, false=0, null/unknown=8 (neutral)
export function paymentScore(verified) {
  if (verified === true) return 20;
  if (verified === false) return 0;
  return 8; // null/unknown
}

// Client spend: only known for Upwork-style platforms
export function clientSpendScore(score) {
  if (score == null) return 8; // unknown = neutral (most remote job boards don't have this)
  return Math.min(20, Math.max(0, score));
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {object} job - raw job from scanner
 * @returns {{ score: number, autoExclude: boolean, excludeReason: string|null, penalise: boolean }}
 */
export function scoreJob(job) {
  const title = job.title || '';
  const desc = job.description || '';
  const skills = job.skills || [];
  const text = (title + ' ' + desc + ' ' + skills.join(' ')).toLowerCase();

  // ── Auto-exclude ──
  for (const pat of AUTO_EXCLUDE_PATTERNS) {
    if (pat.test(title) || pat.test(desc)) {
      return {
        score: 0,
        autoExclude: true,
        excludeReason: `red flag: ${pat.source.slice(0, 40)}`,
        penalise: false,
      };
    }
  }
  for (const kw of RED_FLAG_SKILLS) {
    if (text.includes(kw)) {
      return {
        score: 0,
        autoExclude: true,
        excludeReason: `skill mismatch: ${kw}`,
        penalise: false,
      };
    }
  }

  // ── Niche gate: must score ≥ 4 to proceed ──
  const niche = nicheScore(title, desc, skills);
  if (niche < 4) {
    return {
      score: 0,
      autoExclude: true,
      excludeReason: `niche fit too low (${niche})`,
      penalise: false,
    };
  }

  // ── Weighted score ──
  let s = 0;
  s += geoScore(job.location); // 6–20
  s += paymentScore(job.paymentVerified); // 0/8/20
  s += clientSpendScore(job.clientSpendScore ?? null); // 0–20
  s += niche; // 4–15
  s += scopeScore(desc); // 0–10
  s += freshnessScore(job.pubDate || job.created_at); // 1–5
  s += proposalCountScore(job.proposalCount ?? null); // 5–10
  s += budgetScore(job); // 1–5

  // ── Penalise ──
  let penalise = false;
  for (const pat of PENALISE_PATTERNS) {
    if (pat.test(title) || pat.test(desc)) {
      s = Math.max(0, s - 15);
      penalise = true;
      break;
    }
  }

  return { score: Math.min(100, Math.round(s)), autoExclude: false, excludeReason: null, penalise };
}

/** Proposal tier based on score */
export function proposalTier(score) {
  if (score >= 60) return 'full'; // full Groq-generated proposal
  if (score >= 40) return 'angle'; // one-liner angle
  return 'none'; // no alert sent
}
