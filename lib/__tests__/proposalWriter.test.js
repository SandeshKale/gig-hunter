import { describe, it, expect, vi } from 'vitest';

// Mock groq-sdk before any import
vi.mock('groq-sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Lead with Supabase dashboard experience.' } }],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

const job = {
  title: 'Senior React Developer',
  platform: 'remoteok',
  description: 'Build a real-time dashboard using React and Supabase.',
  skills: ['react', 'supabase', 'typescript'],
  budget_type: 'hourly',
  budget_min: 60,
  budget_max: 90,
};

describe('generateProposal', () => {
  it('returns fallback when GROQ_API_KEY is missing', async () => {
    delete process.env.GROQ_API_KEY;
    const { generateProposal } = await import('../proposalWriter.js');
    const result = await generateProposal(job, 'full');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('fallback includes skills from job', async () => {
    delete process.env.GROQ_API_KEY;
    const { generateProposal } = await import('../proposalWriter.js');
    const result = await generateProposal({ ...job, skills: ['next.js', 'postgresql'] }, 'full');
    expect(result).toContain('next.js');
  });

  it('fallback uses React/Node.js when skills empty', async () => {
    delete process.env.GROQ_API_KEY;
    const { generateProposal } = await import('../proposalWriter.js');
    const result = await generateProposal({ ...job, skills: [] }, 'full');
    expect(result).toContain('React / Node.js');
  });

  it('returns string for angle tier without key', async () => {
    delete process.env.GROQ_API_KEY;
    const { generateProposal } = await import('../proposalWriter.js');
    const result = await generateProposal(job, 'angle');
    expect(typeof result).toBe('string');
  });

  it('returns string for full tier without key', async () => {
    delete process.env.GROQ_API_KEY;
    const { generateProposal } = await import('../proposalWriter.js');
    const result = await generateProposal(job, 'full');
    expect(typeof result).toBe('string');
  });
});
