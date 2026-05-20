import { describe, it, expect } from 'vitest';
import {
  scoreJob,
  proposalTier,
  geoScore,
  nicheScore,
  scopeScore,
  freshnessScore,
  budgetScore,
  paymentScore,
  NICHE_PERFECT,
} from '../scorer.js';

describe('geoScore', () => {
  it('scores primary geos highest', () => {
    expect(geoScore('United States')).toBe(20);
    expect(geoScore('UK')).toBe(20);
    expect(geoScore('Australia')).toBe(20);
    expect(geoScore('Dubai')).toBe(20);
  });
  it('scores secondary geos mid', () => {
    expect(geoScore('Singapore')).toBe(14);
    expect(geoScore('Germany')).toBe(14);
  });
  it('scores Remote as neutral (not penalised)', () => {
    expect(geoScore('Remote')).toBe(12);
    expect(geoScore('')).toBe(12);
    expect(geoScore('Worldwide')).toBe(12);
  });
  it('scores unknown regions low but not zero', () => {
    expect(geoScore('Brazil')).toBe(6);
    expect(geoScore('Pakistan')).toBe(6);
  });
  it('primary geos score higher than remote', () => {
    expect(geoScore('United States')).toBeGreaterThan(geoScore('Remote'));
  });
});

describe('nicheScore', () => {
  it('scores perfect keyword matches >= 10', () => {
    expect(nicheScore('React Developer', '', [])).toBeGreaterThanOrEqual(10);
    expect(nicheScore('Senior Next.js Engineer', '', [])).toBeGreaterThanOrEqual(10);
  });
  it('scores multiple perfect matches higher than single', () => {
    const multi = nicheScore('Full Stack React Node.js Developer', '', []);
    const single = nicheScore('React Developer', '', []);
    expect(multi).toBeGreaterThan(single);
  });
  it('scores tangential lower than perfect', () => {
    expect(nicheScore('React Developer', '', [])).toBeGreaterThan(
      nicheScore('Software Engineer JavaScript API', '', [])
    );
  });
  it('returns 0 for irrelevant jobs', () => {
    expect(nicheScore('Plumber needed', 'Fix pipes in bathroom', [])).toBe(0);
    expect(nicheScore('Accountant CPA', 'Tax returns', [])).toBe(0);
  });
  it('uses skills array', () => {
    expect(nicheScore('Developer', '', ['react', 'typescript'])).toBeGreaterThan(0);
  });
});

describe('scopeScore', () => {
  it('scores by description length', () => {
    expect(scopeScore('x'.repeat(600))).toBe(10);
    expect(scopeScore('x'.repeat(250))).toBe(7);
    expect(scopeScore('x'.repeat(100))).toBe(4);
    expect(scopeScore('short')).toBe(2);
    expect(scopeScore('')).toBe(0);
  });
  it('longer always >= shorter', () => {
    expect(scopeScore('x'.repeat(300))).toBeGreaterThanOrEqual(scopeScore('x'.repeat(100)));
  });
});

describe('freshnessScore', () => {
  it('returns neutral for null', () => expect(freshnessScore(null)).toBe(2));
  it('scores recent jobs highest (< 2h = 5)', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(freshnessScore(thirtyMinsAgo)).toBe(5);
  });
  it('scores 1h ago as >= 4', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(freshnessScore(oneHourAgo)).toBeGreaterThanOrEqual(4);
  });
  it('scores old jobs lowest', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(freshnessScore(threeDaysAgo)).toBe(1);
  });
  it('recent scores higher than old', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(freshnessScore(recent)).toBeGreaterThan(freshnessScore(old));
  });
});

describe('paymentScore', () => {
  it('gives 20 for verified', () => expect(paymentScore(true)).toBe(20));
  it('gives 0 for unverified', () => expect(paymentScore(false)).toBe(0));
  it('gives 8 for null (neutral)', () => expect(paymentScore(null)).toBe(8));
  it('gives 8 for undefined (neutral)', () => expect(paymentScore(undefined)).toBe(8));
});

describe('budgetScore', () => {
  it('scores high hourly rate as 5', () => {
    expect(budgetScore({ budget_type: 'hourly', budget_min: 50 })).toBe(5);
  });
  it('scores medium hourly rate as 3', () => {
    expect(budgetScore({ budget_type: 'hourly', budget_min: 30 })).toBe(3);
  });
  it('scores low hourly rate as 1', () => {
    expect(budgetScore({ budget_type: 'hourly', budget_min: 10 })).toBe(1);
  });
  it('scores high fixed budget as 5', () => {
    expect(budgetScore({ budget_type: 'fixed', budget_min: 2000 })).toBe(5);
  });
  it('scores medium fixed budget as 3', () => {
    expect(budgetScore({ budget_type: 'fixed', budget_min: 500 })).toBe(3);
  });
  it('scores low fixed budget as 1', () => {
    expect(budgetScore({ budget_type: 'fixed', budget_min: 50 })).toBe(1);
  });
  it('returns 3 for unknown budget', () => {
    expect(budgetScore({ budget_type: null, budget_min: null })).toBe(3);
  });
});

describe('scoreJob integration', () => {
  const goodJob = {
    title: 'Senior React Developer',
    description:
      'We need a React developer to build a dashboard for our SaaS product. ' +
      'You will use Next.js, TypeScript, Tailwind CSS, REST APIs, and Supabase. ' +
      'Long-term engagement for a US-based startup. Remote work accepted. ' +
      'Looking for someone with 3+ years of React experience.',
    skills: ['react', 'next.js', 'typescript'],
    location: 'United States',
    paymentVerified: true,
    budget_type: 'hourly',
    budget_min: 50,
    budget_max: 80,
    proposalCount: 5,
    pubDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };

  it('passes a well-described niche job', () => {
    const r = scoreJob(goodJob);
    expect(r.autoExclude).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(50);
  });
  it('auto-excludes commission-only', () => {
    expect(scoreJob({ ...goodJob, title: 'Dev - commission-only arrangement' }).autoExclude).toBe(
      true
    );
  });
  it('auto-excludes rev-share', () => {
    expect(
      scoreJob({ ...goodJob, description: 'We offer rev-share instead of salary.' }).autoExclude
    ).toBe(true);
  });
  it('auto-excludes shopify theme mismatch', () => {
    expect(
      scoreJob({ ...goodJob, title: 'Shopify theme dev', skills: ['shopify theme'] }).autoExclude
    ).toBe(true);
  });
  it('auto-excludes irrelevant jobs', () => {
    expect(
      scoreJob({ title: 'Plumber needed', description: 'Fix pipes', skills: [], location: '' })
        .autoExclude
    ).toBe(true);
  });
  it('does NOT exclude Remote location', () => {
    const r = scoreJob({ ...goodJob, location: 'Remote' });
    expect(r.autoExclude).toBe(false);
    expect(r.score).toBeGreaterThan(0);
  });
  it('unknown payment is neutral not zero', () => {
    const verified = scoreJob({ ...goodJob, paymentVerified: true });
    const unknown = scoreJob({ ...goodJob, paymentVerified: null });
    expect(unknown.score).toBeGreaterThan(0);
    expect(verified.score).toBeGreaterThan(unknown.score);
  });
  it('caps at 100', () => expect(scoreJob(goodJob).score).toBeLessThanOrEqual(100));
  it('score is integer', () => expect(Number.isInteger(scoreJob(goodJob).score)).toBe(true));
  it('penalises ninja titles', () => {
    const normal = scoreJob(goodJob);
    const ninja = scoreJob({ ...goodJob, title: 'React Ninja Wizard Developer' });
    expect(ninja.score).toBeLessThan(normal.score);
    expect(ninja.penalise).toBe(true);
  });
  it('US scores higher than Remote for same job', () => {
    const us = scoreJob({ ...goodJob, location: 'United States' });
    const remote = scoreJob({ ...goodJob, location: 'Remote' });
    expect(us.score).toBeGreaterThan(remote.score);
  });
});

describe('proposalTier', () => {
  it('full for >= 60', () => expect(proposalTier(60)).toBe('full'));
  it('full for 100', () => expect(proposalTier(100)).toBe('full'));
  it('angle for 40–59', () => {
    expect(proposalTier(40)).toBe('angle');
    expect(proposalTier(59)).toBe('angle');
  });
  it('none for < 40', () => {
    expect(proposalTier(39)).toBe('none');
    expect(proposalTier(0)).toBe('none');
  });
});

describe('NICHE_PERFECT', () => {
  it('contains core keywords', () => {
    ['react', 'next.js', 'typescript', 'node.js', 'fullstack'].forEach((kw) =>
      expect(NICHE_PERFECT).toContain(kw)
    );
  });
});
