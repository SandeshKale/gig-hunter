import { describe, it, expect, vi } from 'vitest';
import { isNicheRelevant, enrichAndScore } from '../scanner.js';

// ─── isNicheRelevant ──────────────────────────────────────────────────────────
describe('isNicheRelevant', () => {
  it('matches react in title', () =>
    expect(isNicheRelevant('Senior React Developer', '', [])).toBe(true));
  it('matches nodejs in description', () =>
    expect(isNicheRelevant('Backend Dev', 'Looking for node developer', [])).toBe(true));
  it('matches typescript in tags', () =>
    expect(isNicheRelevant('Developer', '', ['typescript', 'aws'])).toBe(true));
  it('matches next.js case-insensitive', () =>
    expect(isNicheRelevant('Next.JS Engineer', '', [])).toBe(true));
  it('rejects plumber', () =>
    expect(isNicheRelevant('Plumber', 'Fixing pipes and drains', [])).toBe(false));
  it('rejects chef', () =>
    expect(isNicheRelevant('Chef needed', 'Italian restaurant kitchen', [])).toBe(false));
  it('rejects accountant', () =>
    expect(isNicheRelevant('Accountant CPA', 'Tax and auditing', [])).toBe(false));
  it('matches fullstack', () => expect(isNicheRelevant('Full Stack Engineer', '', [])).toBe(true));
  it('matches web developer', () =>
    expect(isNicheRelevant('Web Developer needed', '', [])).toBe(true));
});

// ─── enrichAndScore ───────────────────────────────────────────────────────────
describe('enrichAndScore', () => {
  // Mock generateProposal to avoid real Groq calls
  vi.mock('../proposalWriter.js', () => ({
    generateProposal: vi.fn().mockResolvedValue('Mocked proposal text.'),
  }));

  const goodJob = {
    external_id: 'test-001',
    platform: 'remoteok',
    title: 'Senior React Developer',
    description:
      'Build a dashboard using React, Next.js, TypeScript. ' +
      'US company, remote role, $60-80/hr, payment verified.',
    skills: ['react', 'next.js', 'typescript'],
    location: 'United States',
    budget_type: 'hourly',
    budget_min: 60,
    budget_max: 80,
    pubDate: new Date().toISOString(),
    paymentVerified: null,
    proposalCount: null,
  };

  const redFlagJob = {
    external_id: 'test-002',
    platform: 'remoteok',
    title: 'Shopify theme developer needed',
    description: 'Build shopify theme for our store.',
    skills: ['shopify theme'],
    location: 'Remote',
    budget_type: null,
    budget_min: null,
    budget_max: null,
    pubDate: new Date().toISOString(),
    paymentVerified: null,
    proposalCount: null,
  };

  it('returns enriched jobs for passing jobs', async () => {
    const results = await enrichAndScore([goodJob]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('relevance_score');
    expect(typeof results[0].relevance_score).toBe('number');
  });

  it('excludes red-flag jobs', async () => {
    const results = await enrichAndScore([redFlagJob]);
    expect(results.length).toBe(0);
  });

  it('keeps good and drops bad in same batch', async () => {
    const results = await enrichAndScore([goodJob, redFlagJob]);
    expect(results.length).toBe(1);
    expect(results[0].external_id).toBe('test-001');
  });

  it('attaches _tier to enriched jobs', async () => {
    const results = await enrichAndScore([goodJob]);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('_tier');
      expect(['full', 'angle', 'none']).toContain(results[0]._tier);
    }
  });

  it('returns empty array for all excluded jobs', async () => {
    const results = await enrichAndScore([redFlagJob]);
    expect(results).toEqual([]);
  });

  it('handles empty input', async () => {
    const results = await enrichAndScore([]);
    expect(results).toEqual([]);
  });
});
