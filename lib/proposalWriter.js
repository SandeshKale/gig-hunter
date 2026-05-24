import Groq from 'groq-sdk';

// Lazy-initialise so tests that don't need Groq don't fail on missing key
let _groq = null;
function getGroq() {
  if (!_groq) {
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'placeholder' });
  }
  return _groq;
}

const SANDESH_PROFILE = `
Who I am: Sandesh Kale, full-stack React/Node.js developer based in Singapore with 8+ years
building production web apps. Shipped a Google Drive-synced quoting tool on Vercel (95%+ test
coverage), a real-time F&O trading dashboard, and enterprise AI/LLM integrations with IBM BAW & ODM.
I write clean, tested, documented code and have a strong track record delivering on time.

Strengths: React, Next.js, Node.js, TypeScript, Vite, Supabase, PostgreSQL, REST APIs,
GraphQL, Vercel, CI/CD, GitHub Actions, LLM/AI integration.

I do NOT bid on: WordPress/Shopify theme work, PHP/Laravel, native mobile (iOS/Android),
commission-only or rev-share arrangements.

Communication style: direct, confident. Sound like a senior dev who has seen the problem
before — not a freelancer pitching desperately.
`;

export async function generateProposal(job, tier = 'full') {
  if (!process.env.GROQ_API_KEY) return fallback(job);

  const budgetStr = job.budget_min
    ? job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`
    : 'not stated';

  const prompt =
    tier === 'full'
      ? `You are writing a winning proposal opening for Sandesh Kale.

SANDESH'S PROFILE:
${SANDESH_PROFILE}

JOB POSTING:
Title: ${job.title}
Platform: ${job.platform}
Budget: ${budgetStr}
Skills: ${(job.skills || []).join(', ') || 'not listed'}
Description: ${job.description || '(no description)'}

Write a proposal opening (3–4 sentences, 100–150 words) that:
1. Opens with ONE line referencing a specific detail from their post — not generic "I saw your job"
2. Identifies the real underlying problem they're solving
3. Leads with the most relevant credential from Sandesh's profile
4. Ends with a low-friction specific next step

Rules: NO "I'm excited", "I'd love to", "passionate", "As a seasoned", "look no further".
Sound confident. No filler. First person as Sandesh. Return ONLY the proposal text.`
      : `One sentence (max 25 words): what angle should Sandesh lead with for this job?
Job: ${job.title}
Description: ${(job.description || '').slice(0, 200)}
Return ONLY the sentence. No filler, no "I would".`;

  const GROQ_TIMEOUT = 15_000; // 15s per proposal max
  try {
    const groqPromise = getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: tier === 'full' ? 200 : 50,
      temperature: 0.7,
    });
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Groq timeout')), GROQ_TIMEOUT);
    });
    const completion = await Promise.race([groqPromise, timeoutPromise]);
    clearTimeout(timer);
    return completion.choices[0]?.message?.content?.trim() || fallback(job);
  } catch (err) {
    console.error('[groq] proposal failed:', err.message);
    return fallback(job);
  }
}

function fallback(job) {
  const skills = (job.skills || []).slice(0, 3).join(', ') || 'React / Node.js';
  return `Built production apps with ${skills}. Happy to share relevant code samples — what's the best way to show you a quick proof of concept?`;
}
