import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env BEFORE module is imported
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '123456';

// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch.mockResolvedValue({
    json: vi.fn().mockResolvedValue({ ok: true }),
  });
});

const { sendMessage, notifyNewJob, notifyFollowUp } = await import('../telegram.js');

describe('sendMessage', () => {
  it('calls telegram sendMessage endpoint', async () => {
    await sendMessage('Hello test');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends correct body fields', async () => {
    await sendMessage('Hello test');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toBe('Hello test');
    expect(body.parse_mode).toBe('HTML');
    expect(body.disable_web_page_preview).toBe(true);
  });

  it('returns the json response', async () => {
    const result = await sendMessage('test');
    expect(result).toEqual({ ok: true });
  });
});

describe('notifyNewJob', () => {
  const baseJob = {
    id: 'abc12345-0000-0000-0000-000000000000',
    title: 'Senior React Developer',
    platform: 'remoteok',
    url: 'https://remoteok.com/l/123',
    skills: ['react', 'node.js'],
    location: 'Remote',
    budget_type: 'hourly',
    budget_min: 50,
    budget_max: 80,
    proposal: 'Your dashboard problem is one I have solved before.',
    relevance_score: 75,
  };

  it('sends HOT GIG alert for score >= 70', async () => {
    await notifyNewJob(baseJob);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('HOT GIG');
    expect(body.text).toContain('abc12345');
    expect(body.text).toContain('Senior React Developer');
  });

  it('sends NEW GIG alert for score 40-69', async () => {
    await notifyNewJob({ ...baseJob, relevance_score: 55 });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('NEW GIG');
  });

  it('includes hourly budget in message', async () => {
    await notifyNewJob(baseJob);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('$50');
  });

  it('shows salary TBD when no budget', async () => {
    await notifyNewJob({ ...baseJob, budget_min: null });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('TBD');
  });

  it('includes listing link', async () => {
    await notifyNewJob(baseJob);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('https://remoteok.com/l/123');
  });

  it('includes correct platform label for weworkremotely', async () => {
    await notifyNewJob({ ...baseJob, platform: 'weworkremotely' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('WeWorkRemotely');
  });

  it('includes fixed budget format', async () => {
    await notifyNewJob({ ...baseJob, budget_type: 'fixed', budget_min: 2000, budget_max: null });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('fixed');
  });

  it('includes command shortcuts in message', async () => {
    await notifyNewJob(baseJob);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('/applied_');
    expect(body.text).toContain('/lost_');
  });
});

describe('notifyFollowUp', () => {
  it('sends follow-up reminder with correct fields', async () => {
    await notifyFollowUp({
      id: 'def67890-0000-0000-0000-000000000000',
      title: 'React Dev Role',
      url: 'https://example.com/job',
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.text).toContain('FOLLOW-UP');
    expect(body.text).toContain('def67890');
    expect(body.text).toContain('React Dev Role');
    expect(body.text).toContain('/replied_');
  });
});
