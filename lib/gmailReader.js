import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const UPWORK_SENDER = 'noreply@upwork.com';

/**
 * Connect to Gmail via IMAP and fetch unread Upwork alert emails.
 * Returns an array of raw parsed email objects.
 */
const IMAP_TIMEOUT_MS = 60_000; // 60 second hard timeout on IMAP ops

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpworkEmails() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
    socketTimeout: 30000, // 30s socket idle timeout
    greetingTimeout: 15000, // 15s for server greeting
    connectionTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
    },
  });

  const emails = [];

  try {
    await withTimeout(client.connect(), IMAP_TIMEOUT_MS, 'IMAP connect');
    await withTimeout(client.mailboxOpen('INBOX'), IMAP_TIMEOUT_MS, 'mailbox open');

    // Search for unread emails from Upwork
    const uids = await withTimeout(
      client.search({ from: UPWORK_SENDER, seen: false }),
      IMAP_TIMEOUT_MS,
      'IMAP search'
    );

    if (uids.length === 0) {
      console.log('[gmail] no new Upwork emails');
      await client.logout();
      return [];
    }

    console.log(`[gmail] found ${uids.length} unread Upwork emails`);

    // Fetch and parse each email individually
    for (const uid of uids) {
      try {
        // Download full message as a Buffer using download() — more reliable than fetch()
        const { content: rawBuffer } = await withTimeout(
          client.download(uid, undefined, { uid: true }),
          45_000,
          `download uid=${uid}`
        );

        // Collect stream into buffer
        const chunks = [];
        for await (const chunk of rawBuffer) {
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks);

        const parsed = await simpleParser(raw);
        emails.push(parsed);

        // Mark as read so we don't reprocess
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        console.log(`[gmail] parsed email: "${parsed.subject}"`);
      } catch (err) {
        console.error(`[gmail] fetch/parse error uid=${uid}:`, err.message);
        // Continue processing remaining emails even if one fails
      }
    }

    await client.logout();
  } catch (err) {
    console.error('[gmail] IMAP error:', err.message);
    try {
      await client.logout();
    } catch (_) {
      /* ignore */
    }
  }

  return emails;
}

/**
 * Extract job data from a parsed Upwork alert email.
 * Upwork alert emails contain job title, URL, budget, and description in HTML.
 */
export function extractJobsFromEmail(parsed) {
  const jobs = [];
  const html = parsed.html || '';
  const text = parsed.text || '';

  // ── Strategy 1: extract from HTML anchor tags ──────────────────────────────
  // Upwork job URLs follow the pattern: upwork.com/jobs/~XXXX or /ab/proposals/job/~XXXX
  const urlPattern = /href="(https:\/\/www\.upwork\.com\/(?:jobs|ab\/proposals\/job)\/[^"]+)"/g;
  const titlePattern = /<h[23][^>]*>\s*([^<]{10,200})\s*<\/h[23]>/g;

  const urls = [];
  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    const url = match[1].replace(/&amp;/g, '&').split('?')[0];
    if (!urls.includes(url)) urls.push(url);
  }

  // Extract titles from heading tags
  const titles = [];
  while ((match = titlePattern.exec(html)) !== null) {
    const title = match[1].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    if (title.length > 5 && !titles.includes(title)) titles.push(title);
  }

  // ── Strategy 2: fallback to plain text parsing ─────────────────────────────
  // Upwork plain text emails list jobs as: Title\nBudget: $X\nURL
  if (urls.length === 0) {
    const textUrlPattern = /https:\/\/www\.upwork\.com\/(?:jobs|ab\/proposals\/job)\/[^\s]+/g;
    while ((match = textUrlPattern.exec(text)) !== null) {
      const url = match[0].split('?')[0];
      if (!urls.includes(url)) urls.push(url);
    }
  }

  // ── Extract budget hints from email text ───────────────────────────────────
  const budgetHints = [];
  const hourlyPattern = /\$(\d+(?:\.\d+)?)\s*[-–]\s*\$(\d+(?:\.\d+)?)\s*\/\s*hr/gi;
  const fixedPattern = /(?:budget|fixed)[:\s]+\$(\d[\d,]*)/gi;

  while ((match = hourlyPattern.exec(html + text)) !== null) {
    budgetHints.push({ type: 'hourly', min: parseFloat(match[1]), max: parseFloat(match[2]) });
  }
  while ((match = fixedPattern.exec(html + text)) !== null) {
    budgetHints.push({ type: 'fixed', min: parseFloat(match[1].replace(/,/g, '')), max: null });
  }

  // ── Extract description snippets ───────────────────────────────────────────
  const descPattern =
    /<p[^>]*class="[^"]*(?:description|body|content)[^"]*"[^>]*>([\s\S]{20,500}?)<\/p>/gi;
  const descriptions = [];
  while ((match = descPattern.exec(html)) !== null) {
    const desc = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (desc.length > 20) descriptions.push(desc);
  }

  // ── Build job objects ──────────────────────────────────────────────────────
  urls.forEach((url, i) => {
    const budget = budgetHints[i] || budgetHints[0] || null;
    jobs.push({
      external_id: `upwork-email-${Buffer.from(url).toString('base64url').slice(-24)}`,
      platform: 'upwork',
      title: titles[i] || extractTitleFromUrl(url),
      description: descriptions[i] || '',
      url,
      location: 'Remote',
      skills: [],
      pubDate: parsed.date?.toISOString() || new Date().toISOString(),
      budget_type: budget?.type || null,
      budget_min: budget?.min || null,
      budget_max: budget?.max || null,
      paymentVerified: null,
      proposalCount: null,
      _source: 'upwork-email',
    });
  });

  console.log(`[gmail] extracted ${jobs.length} jobs from email: "${parsed.subject}"`);
  return jobs;
}

function extractTitleFromUrl(url) {
  // e.g. upwork.com/jobs/Senior-React-Developer_~012345 → "Senior React Developer"
  const slug = url.split('/').pop().split('_')[0];
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Upwork Job';
}

/**
 * Main export: fetch + parse all unread Upwork alert emails.
 * Returns array of raw job objects ready for enrichAndScore().
 */
export async function scanUpworkEmails() {
  const emails = await fetchUpworkEmails();
  const allJobs = emails.flatMap(extractJobsFromEmail);

  // Deduplicate by external_id
  const seen = new Set();
  return allJobs.filter((j) => {
    if (seen.has(j.external_id)) return false;
    seen.add(j.external_id);
    return true;
  });
}
