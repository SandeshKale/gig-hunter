/**
 * Upwork direct search fetcher.
 *
 * Upwork embeds search results as JSON in a <script id="__NEXT_DATA__"> tag.
 * We fetch the search page with a real browser UA and parse that JSON.
 * No API key, no RSS, no email required.
 *
 * Rate limit: we search 3 queries max per run, staggered 2s apart.
 */

const SEARCH_QUERIES = [
  'react developer',
  'next.js developer',
  'full stack react node',
  'react dashboard typescript',
  'node.js api developer',
];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseBudgetFromJob(job) {
  if (!job) return { budget_type: null, budget_min: null, budget_max: null };

  // Hourly
  if (job.hourlyBudgetMin || job.hourlyBudgetMax) {
    return {
      budget_type: 'hourly',
      budget_min: job.hourlyBudgetMin || null,
      budget_max: job.hourlyBudgetMax || null,
    };
  }
  // Fixed
  if (job.amount?.amount) {
    return {
      budget_type: 'fixed',
      budget_min: parseFloat(job.amount.amount),
      budget_max: null,
    };
  }
  if (job.budget?.amount) {
    return {
      budget_type: 'fixed',
      budget_min: parseFloat(job.budget.amount),
      budget_max: null,
    };
  }
  return { budget_type: null, budget_min: null, budget_max: null };
}

function extractJobsFromNextData(data) {
  try {
    // Upwork stores results in different paths depending on page version
    const results =
      data?.props?.pageProps?.initialData?.results ||
      data?.props?.pageProps?.searchResults?.jobs ||
      data?.props?.pageProps?.data?.searchResults?.result?.results ||
      [];

    if (!Array.isArray(results) || results.length === 0) return [];

    return results.map((job) => {
      const budget = parseBudgetFromJob(job);
      const skills = (job.skills || job.attrs || []).map(
        (s) => s.prettyName || s.label || s.skill || s
      );
      const jobId = job.id || job.uid || job.jobId || '';
      const slug = (job.title || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const url = jobId
        ? `https://www.upwork.com/jobs/${slug}_~${jobId}`
        : job.ciphertext
          ? `https://www.upwork.com/jobs/${slug}_~${job.ciphertext}`
          : null;

      if (!url) return null;

      return {
        external_id: `upwork-search-${jobId || job.ciphertext}`,
        platform: 'upwork',
        title: job.title || 'Untitled',
        description: (job.description || job.snippet || '').slice(0, 800),
        url,
        location: job.location?.country || job.countryTimezone || 'Remote',
        skills,
        pubDate: job.createdOn || job.postedOn || new Date().toISOString(),
        budget_type: budget.budget_type,
        budget_min: budget.budget_min,
        budget_max: budget.budget_max,
        paymentVerified: job.client?.paymentVerificationStatus === 'VERIFIED' || null,
        proposalCount: job.proposalsTier
          ? parseTier(job.proposalsTier)
          : job.totalApplicants || null,
        clientSpendScore: scoreClientSpend(job.client?.totalSpent),
      };
    }).filter(Boolean);
  } catch (err) {
    console.error('[upwork-search] extraction error:', err.message);
    return [];
  }
}

function parseTier(tier) {
  // Upwork returns "Less than 5", "5 to 10", "10 to 15", "15 to 20", "20 to 50", "50+"
  if (!tier) return null;
  const match = tier.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function scoreClientSpend(spent) {
  if (!spent) return null;
  const amount = parseFloat(String(spent).replace(/[$,]/g, ''));
  if (amount >= 10000) return 20;
  if (amount >= 1000)  return 15;
  if (amount >= 100)   return 10;
  return 5;
}

async function fetchQuery(query) {
  const url = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(query)}&sort=recency&per_page=20`;

  try {
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      console.warn(`[upwork-search] "${query}" HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();

    // Extract __NEXT_DATA__ JSON
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      console.warn(`[upwork-search] "${query}" no __NEXT_DATA__ found (likely blocked)`);
      return [];
    }

    const data = JSON.parse(match[1]);
    const jobs = extractJobsFromNextData(data);
    console.log(`[upwork-search] "${query}" → ${jobs.length} jobs`);
    return jobs;
  } catch (err) {
    console.error(`[upwork-search] "${query}" failed: ${err.message}`);
    return [];
  }
}

export async function scanUpworkSearch() {
  const jobs = [];
  const seen = new Set();

  // Run queries sequentially with a delay to avoid rate limiting
  for (const query of SEARCH_QUERIES) {
    const results = await fetchQuery(query);
    for (const job of results) {
      if (!seen.has(job.external_id)) {
        seen.add(job.external_id);
        jobs.push(job);
      }
    }
    await sleep(2000); // 2s between requests
  }

  console.log(`[upwork-search] total unique jobs: ${jobs.length}`);
  return jobs;
}
