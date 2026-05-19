/**
 * Scoring engine — 0–100 weighted matrix based on the Upwork Lead Triage doc.
 *
 * HIGH-WEIGHT   (60 pts): location quality, payment verified, client spend
 * MEDIUM-WEIGHT (25 pts): scope clarity, niche fit, freshness
 * LOW-WEIGHT    (15 pts): proposal count, budget sanity
 *
 * Red flags: two tiers
 *   AUTO_EXCLUDE  → status = 'skip', no Telegram alert
 *   PENALISE      → score -= 15, still shown
 */

// ─── Sandesh's target geographies ───────────────────────────────────────────
const GEO_PRIMARY   = ['us', 'usa', 'united states', 'uk', 'united kingdom',
                        'australia', 'canada', 'uae', 'dubai', 'qatar',
                        'saudi arabia', 'bahrain', 'kuwait', 'oman'];
const GEO_SECONDARY = ['ireland', 'new zealand', 'singapore', 'germany',
                        'netherlands', 'sweden', 'norway', 'denmark',
                        'switzerland', 'austria'];

// ─── Niche fit keywords ───────────────────────────────────────────────────────
const NICHE_PERFECT = [
  'react', 'next.js', 'nextjs', 'node.js', 'nodejs', 'typescript',
  'full stack', 'full-stack', 'fullstack', 'vite', 'javascript developer',
  'frontend developer', 'react developer', 'dashboard', 'web app',
];
const NICHE_TANGENTIAL = [
  'javascript', 'api', 'rest api', 'graphql', 'supabase', 'postgresql',
  'vercel', 'tailwind', 'llm', 'ai integration', 'automation',
];

// ─── Red flags ────────────────────────────────────────────────────────────────
const AUTO_EXCLUDE_PATTERNS = [
  /500\+\s*(jobs?|projects?)\s*completed/i,
  /guaranteed\s*(result|roas|lead|ranking)/i,
  /pay\s*(on|per)\s*(result|delivery|lead|performance)/i,
  /commission.only/i,
  /rev.?share/i,
  /free\s*trial/i,
  /do it for free/i,
  /last (agency|freelancer|developer) (ruined|messed|broke)/i,
  /wordpress.*only/i,
  /woocommerce.*only/i,
  /shopify.*theme/i,
];

const PENALISE_PATTERNS = [
  /rockstar|ninja|guru|wizard|unicorn/i,
  /must have .{0,80} years? experience/i,
  /vague.*high expectation/i,
];

const RED_FLAG_SKILLS = [
  'wordpress', 'woocommerce', 'shopify theme', 'php', 'laravel',
  'magento', 'drupal', 'ios', 'android', 'flutter', 'swift', 'kotlin',
  'java spring', 'spring boot', 'ruby on rails', 'django only',
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function geoScore(location = '') {
  const loc = location.toLowerCase();
  if (GEO_PRIMARY.some((g)   => loc.includes(g))) return 20;
  if (GEO_SECONDARY.some((g) => loc.includes(g))) return 14;
  if (loc.length === 0) return 8; // unknown = neutral
  return 4;
}

function nicheScore(title = '', desc = '', skills = []) {
  const text = (title + ' ' + desc + ' ' + skills.join(' ')).toLowerCase();
  const perfectMatches = NICHE_PERFECT.filter((kw) => text.includes(kw)).length;
  const tangentialMatches = NICHE_TANGENTIAL.filter((kw) => text.includes(kw)).length;

  if (perfectMatches >= 2) return 10;
  if (perfectMatches === 1) return 8;
  if (tangentialMatches >= 3) return 6;
  if (tangentialMatches >= 1) return 3;
  return 0; // no fit
}

function scopeScore(desc = '') {
  if (!desc) return 2;
  const len = desc.trim().length;
  // Longer, detailed descriptions score higher
  if (len > 600) return 10;
  if (len > 300) return 8;
  if (len > 150) return 5;
  return 2;
}

function freshnessScore(createdAt) {
  if (!createdAt) return 1;
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (ageHours < 2)  return 5;
  if (ageHours < 6)  return 3;
  if (ageHours < 12) return 1;
  return 0;
}

function proposalCountScore(count) {
  if (!count) return 7; // unknown = neutral
  if (count < 5)   return 10;
  if (count < 10)  return 9;
  if (count < 20)  return 8;
  if (count < 30)  return 7;
  if (count < 50)  return 6;
  return 5;
}

function budgetSanityScore(budget) {
  if (!budget.budget_min) return 3; // unknown
  if (budget.budget_type === 'hourly') {
    if (budget.budget_min >= 30) return 5;
    if (budget.budget_min >= 15) return 2;
    return 0;
  }
  if (budget.budget_type === 'fixed') {
    if (budget.budget_min >= 500)  return 5;
    if (budget.budget_min >= 200)  return 2;
    return 0;
  }
  return 3;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Returns { score, niche, autoExclude, excludeReason, penalise }
 */
export function scoreJob(job) {
  const title    = job.title || '';
  const desc     = job.description || '';
  const skills   = job.skills || [];
  const location = job.location || '';
  const text     = (title + ' ' + desc + ' ' + skills.join(' ')).toLowerCase();

  // ── Auto-exclude checks ──
  for (const pattern of AUTO_EXCLUDE_PATTERNS) {
    if (pattern.test(title) || pattern.test(desc)) {
      return { score: 0, niche: 0, autoExclude: true, excludeReason: pattern.source.replace(/\\/g, '') };
    }
  }
  const hasRedFlagSkill = RED_FLAG_SKILLS.some((kw) => text.includes(kw));
  if (hasRedFlagSkill) {
    const reason = RED_FLAG_SKILLS.find((kw) => text.includes(kw));
    return { score: 0, niche: 0, autoExclude: true, excludeReason: `skill mismatch: ${reason}` };
  }

  // ── Niche check ──
  const niche = nicheScore(title, desc, skills);
  if (niche < 3) {
    return { score: 0, niche, autoExclude: true, excludeReason: 'niche fit too low' };
  }

  // ── Score calculation ──
  let s = 0;
  s += geoScore(location);                          // 0–20
  s += job.paymentVerified ? 20 : (job.paymentVerified === false ? 0 : 8); // 0/8/20
  s += job.clientSpendScore || 8;                   // 0–20 (set by scanner if known)
  s += scopeScore(desc);                             // 0–10
  s += niche;                                        // 0–10
  s += freshnessScore(job.created_at);               // 0–5
  s += proposalCountScore(job.proposalCount || null);// 5–10
  s += budgetSanityScore(job);                       // 0–5

  // ── Penalise checks ──
  let penalise = false;
  for (const pattern of PENALISE_PATTERNS) {
    if (pattern.test(title) || pattern.test(desc)) {
      s = Math.max(0, s - 15);
      penalise = true;
      break;
    }
  }

  return { score: Math.min(100, s), niche, autoExclude: false, excludeReason: null, penalise };
}

/** Proposal tier based on score */
export function proposalTier(score) {
  if (score >= 70) return 'full';      // full Claude-generated proposal
  if (score >= 50) return 'angle';     // one-liner angle
  return 'none';                        // no alert
}
