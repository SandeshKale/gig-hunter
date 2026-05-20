import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

/**
 * Upwork RSS feeds — one per keyword query.
 * Tuned for Sandesh's profile: React / full-stack / Node.js, Singapore/remote, $50–80/hr.
 */
const QUERIES = [
  'react developer',
  'full stack react node',
  'next.js developer',
  'react node.js',
  'vite react',
  'react dashboard',
];

const MIN_FIXED = 500;
const MIN_HOURLY = 25;

const HIGH_VALUE_SKILLS = [
  'react',
  'next.js',
  'node.js',
  'typescript',
  'javascript',
  'vite',
  'supabase',
  'postgresql',
  'rest api',
  'graphql',
  'vercel',
  'tailwind',
  'dashboard',
  'full stack',
  'full-stack',
];

const RED_FLAGS = [
  'wordpress',
  'woocommerce',
  'shopify theme',
  'php',
  'laravel',
  'wix',
  'squarespace',
];

function parseBudget(content = '') {
  const hourlyMatch = content.match(/Hourly Range\s*:\s*\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)/i);
  if (hourlyMatch) {
    return { budget_type: 'hourly', budget_min: +hourlyMatch[1], budget_max: +hourlyMatch[2] };
  }
  const fixedMatch = content.match(/Budget\s*:\s*\$?([\d,]+)/i);
  if (fixedMatch) {
    return { budget_type: 'fixed', budget_min: +fixedMatch[1].replace(/,/g, ''), budget_max: null };
  }
  return { budget_type: null, budget_min: null, budget_max: null };
}

function parseSkills(content = '') {
  const match = content.match(/Skills\s*:\s*([^\n<]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function scoreRelevance(title = '', description = '', skills = [], budget) {
  let score = 5;
  const text = (title + ' ' + description + ' ' + skills.join(' ')).toLowerCase();
  HIGH_VALUE_SKILLS.forEach((kw) => {
    if (text.includes(kw)) score += 1;
  });
  RED_FLAGS.forEach((kw) => {
    if (text.includes(kw)) score -= 3;
  });
  if (budget.budget_type === 'hourly' && budget.budget_min >= 40) score += 1;
  if (budget.budget_type === 'fixed' && budget.budget_min >= 1000) score += 1;
  return Math.max(0, Math.min(10, score));
}

function meetsMinBudget(budget) {
  if (!budget.budget_type) return true;
  if (budget.budget_type === 'hourly') return (budget.budget_min ?? 0) >= MIN_HOURLY;
  if (budget.budget_type === 'fixed') return (budget.budget_min ?? 0) >= MIN_FIXED;
  return true;
}

function draftProposal(title, skills) {
  const topSkills = skills.slice(0, 3).join(', ') || 'React / Node.js';
  return `Hi,

I've built production React apps with ${topSkills} — including a live quoting tool (Google Drive-synced, Vercel-deployed, 95%+ test coverage) and a real-time trading dashboard.

I'd love to hear more about "${title}". Happy to share relevant code samples.

Best,
Sandesh`;
}

async function fetchQuery(query) {
  const url = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(query)}&sort=recency`;
  try {
    const feed = await parser.parseURL(url);
    const items = feed.items || [];
    console.log(`[upwork] "${query}" → ${items.length} items`);
    return items
      .map((item) => {
        const content = item.content || item['content:encoded'] || '';
        const budget = parseBudget(content);
        const skills = parseSkills(content);
        const score = scoreRelevance(item.title, item.contentSnippet, skills, budget);
        return {
          external_id: item.link || item.guid,
          platform: 'upwork',
          title: item.title || 'Untitled',
          description: (item.contentSnippet || '').slice(0, 800),
          url: item.link,
          skills,
          relevance_score: score,
          proposal: draftProposal(item.title, skills),
          ...budget,
        };
      })
      .filter(meetsMinBudget);
  } catch (err) {
    console.error(`[upwork] RSS failed for "${query}": ${err.message}`);
    return [];
  }
}

export async function scanUpwork() {
  const results = await Promise.all(QUERIES.map(fetchQuery));
  const flat = results.flat();
  const seen = new Set();
  return flat.filter((job) => {
    if (seen.has(job.external_id)) return false;
    seen.add(job.external_id);
    return true;
  });
}
