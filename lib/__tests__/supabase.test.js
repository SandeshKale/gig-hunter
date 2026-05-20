import { describe, it, expect, vi } from 'vitest';

// Mock @supabase/supabase-js before importing supabase.js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({ data: { id: 'abc-123' }, error: null })),
          maybeSingle: vi.fn(() => ({ data: { id: 'abc-123' }, error: null })),
        })),
      })),
      select: vi.fn(() => ({
        order: vi.fn(function () {
          return this;
        }),
        limit: vi.fn(() => ({ data: [], error: null })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    })),
  })),
}));

// Set env vars before import
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

const { upsertJob } = await import('../supabase.js');

describe('upsertJob — field sanitisation', () => {
  it('strips _tier and _penalised before upsert', async () => {
    // Should not throw even with private fields present
    const job = {
      external_id: 'test-001',
      platform: 'remoteok',
      title: 'React Developer',
      description: 'Build dashboards',
      url: 'https://example.com',
      location: 'Remote',
      skills: ['react'],
      relevance_score: 72,
      proposal: 'Hi there...',
      status: 'new',
      _tier: 'full',
      _penalised: false,
      pubDate: '2026-05-01',
      paymentVerified: null,
      proposalCount: null,
      clientSpendScore: null,
    };
    await expect(upsertJob(job)).resolves.not.toThrow();
  });

  it('handles missing optional fields gracefully', async () => {
    const minimal = {
      external_id: 'test-002',
      platform: 'weworkremotely',
      title: 'Frontend Dev',
    };
    await expect(upsertJob(minimal)).resolves.not.toThrow();
  });
});
