import { describe, it, expect } from 'vitest';
import { extractJobsFromEmail } from '../gmailReader.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REAL_UPWORK_HTML = `
<html><body>
<h2>Senior React Developer Needed for SaaS Dashboard</h2>
<p>We're looking for an experienced React developer to help us rebuild our analytics dashboard
using Next.js, TypeScript and Tailwind CSS. The project involves real-time data visualization.</p>
<a href="https://www.upwork.com/jobs/Senior-React-Developer-SaaS-Dashboard_~01234567890abcdef">View Job</a>
<p>Budget: $50.00 - $80.00 / hr</p>

<h2>Full Stack Node.js Engineer – Remote</h2>
<p>Node.js backend developer needed for REST API development and PostgreSQL integration.</p>
<a href="https://www.upwork.com/jobs/Full-Stack-Node-Engineer_~0fedcba9876543210">View Job</a>
<p>Budget: $3,000 fixed</p>
</body></html>`;

const MINIMAL_HTML = `
<html><body>
<a href="https://www.upwork.com/jobs/React-Dev_~0abc123">View</a>
</body></html>`;

const PLAIN_TEXT_EMAIL = `
New job matching your saved search:

Senior React Developer
https://www.upwork.com/jobs/Senior-React-Dev_~0plaintext123
Budget: $60.00 - $90.00 / hr
`;

const NO_JOBS_HTML = `<html><body><p>Thanks for using Upwork!</p></body></html>`;

const DUPLICATE_URLS_HTML = `
<html><body>
<a href="https://www.upwork.com/jobs/React-Job_~0dup123">View</a>
<a href="https://www.upwork.com/jobs/React-Job_~0dup123">View Again</a>
<a href="https://www.upwork.com/jobs/Other-Job_~0other456">Other</a>
</body></html>`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractJobsFromEmail', () => {
  it('extracts multiple jobs from HTML email', () => {
    const jobs = extractJobsFromEmail({
      html: REAL_UPWORK_HTML,
      text: '',
      date: new Date(),
      subject: 'Job Alert',
    });
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });

  it('each job has required fields', () => {
    const jobs = extractJobsFromEmail({
      html: REAL_UPWORK_HTML,
      text: '',
      date: new Date(),
      subject: 'Job Alert',
    });
    for (const job of jobs) {
      expect(job).toHaveProperty('external_id');
      expect(job).toHaveProperty('platform', 'upwork');
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('url');
      expect(job).toHaveProperty('location', 'Remote');
      expect(job.url).toContain('upwork.com/jobs/');
    }
  });

  it('extracts hourly budget correctly', () => {
    const jobs = extractJobsFromEmail({
      html: REAL_UPWORK_HTML,
      text: '',
      date: new Date(),
      subject: 'Job Alert',
    });
    const hourlyJob = jobs.find((j) => j.budget_type === 'hourly');
    expect(hourlyJob).toBeDefined();
    expect(hourlyJob.budget_min).toBe(50);
    expect(hourlyJob.budget_max).toBe(80);
  });

  it('sets platform as upwork', () => {
    const jobs = extractJobsFromEmail({
      html: MINIMAL_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    expect(jobs.every((j) => j.platform === 'upwork')).toBe(true);
  });

  it('deduplicates same URL appearing twice in email', () => {
    const jobs = extractJobsFromEmail({
      html: DUPLICATE_URLS_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    const urls = jobs.map((j) => j.url);
    expect(urls.length).toBe(new Set(urls).size);
  });

  it('returns empty array when no Upwork URLs found', () => {
    const jobs = extractJobsFromEmail({
      html: NO_JOBS_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    expect(jobs).toEqual([]);
  });

  it('falls back to plain text when HTML has no URLs', () => {
    const jobs = extractJobsFromEmail({
      html: '',
      text: PLAIN_TEXT_EMAIL,
      date: new Date(),
      subject: 'Alert',
    });
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs[0].url).toContain('upwork.com');
  });

  it('strips query params from URLs', () => {
    const html = `<a href="https://www.upwork.com/jobs/React-Job_~0abc123?source=email&ref=123">View</a>`;
    const jobs = extractJobsFromEmail({ html, text: '', date: new Date(), subject: 'Alert' });
    expect(jobs[0].url).not.toContain('?');
  });

  it('uses email date as pubDate', () => {
    const date = new Date('2026-05-20T10:00:00Z');
    const jobs = extractJobsFromEmail({ html: MINIMAL_HTML, text: '', date, subject: 'Alert' });
    expect(jobs[0].pubDate).toBe(date.toISOString());
  });

  it('generates unique external_id per job', () => {
    // DUPLICATE_URLS_HTML has 1 duplicate URL + 1 unique = 2 distinct jobs
    const jobs = extractJobsFromEmail({
      html: DUPLICATE_URLS_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    const ids = jobs.map((j) => j.external_id);
    // All IDs must be unique (no duplicates in the output)
    expect(ids.length).toBe(new Set(ids).size);
    // Should have exactly 2 unique jobs (deduped from 3 anchors)
    expect(jobs.length).toBe(2);
  });

  it('external_id starts with upwork-email-', () => {
    const jobs = extractJobsFromEmail({
      html: MINIMAL_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    expect(jobs[0].external_id).toMatch(/^upwork-email-/);
  });

  it('handles missing date gracefully', () => {
    const jobs = extractJobsFromEmail({
      html: MINIMAL_HTML,
      text: '',
      date: null,
      subject: 'Alert',
    });
    expect(jobs[0].pubDate).toBeDefined();
    expect(typeof jobs[0].pubDate).toBe('string');
  });

  it('handles missing html gracefully (no crash)', () => {
    expect(() =>
      extractJobsFromEmail({ html: null, text: '', date: new Date(), subject: 'Alert' })
    ).not.toThrow();
  });

  it('skills defaults to empty array', () => {
    const jobs = extractJobsFromEmail({
      html: MINIMAL_HTML,
      text: '',
      date: new Date(),
      subject: 'Alert',
    });
    expect(jobs[0].skills).toEqual([]);
  });
});
