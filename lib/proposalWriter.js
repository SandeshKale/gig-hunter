import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SANDESH_PROFILE = `
Who I am: Sandesh Kale, full-stack React/Node.js developer based in Singapore with 8+ years
building production web apps. I've shipped a Google Drive-synced quoting tool on Vercel with 95%+
test coverage, a real-time F&O trading dashboard, and enterprise automation integrations with IBM BAW,
ODM, and AI/LLM pipelines. I write clean, tested, documented code and have a strong track record
delivering on time without hand-holding.

My strengths:
- React, Next.js, Node.js, TypeScript, Vite
- Supabase, PostgreSQL, REST APIs, GraphQL
- Vercel, CI/CD, GitHub Actions
- Dashboard & data visualisation
- LLM/AI integration with enterprise systems

What I do NOT bid on:
- WordPress, Shopify theme work, PHP/Laravel
- Mobile apps (iOS/Android native)
- Commission-only or rev-share arrangements
- Full "marketing manager" roles mixing SEO + content + ads

Communication style: direct, confident, no filler phrases. Sound like a senior dev who has seen
the problem before, not a freelancer pitching desperately.
`;

/**
 * Generate a human-sounding proposal angle for a specific job.
 * Returns a string (2–4 sentences, ~100–150 words).
 * Used for top-scoring jobs only.
 */
export async function generateProposal(job, tier = 'full') {
  if (!process.env.GROQ_API_KEY) {
    return fallback(job);
  }

  const budgetStr = job.budget_min
    ? job.budget_type === 'hourly'
      ? `$${job.budget_min}–${job.budget_max ?? '?'}/hr`
      : `$${Number(job.budget_min).toLocaleString()} fixed`
    : 'budget not stated';

  const prompt = tier === 'full'
    ? `You are writing a winning Upwork proposal opening for Sandesh Kale.

SANDESH'S PROFILE:
${SANDESH_PROFILE}

JOB POSTING:
Title: ${job.title}
Platform: ${job.platform}
Budget: ${budgetStr}
Skills: ${(job.skills || []).join(', ') || 'not listed'}
Description: ${job.description || '(no description available)'}

Write a proposal opening (3–4 sentences, 100–150 words) that:
1. Opens with a line that references ONE specific detail from their post — not a generic "I saw your job". Make it show you actually read it.
2. Names the real underlying problem they're trying to solve (read between the lines)
3. Leads with the most relevant credential or project from Sandesh's profile
4. Ends with a low-friction next step — not "let me know if you're interested", something specific

Rules:
- Do NOT use phrases like: "I'm excited", "I'd love to", "passionate about", "As a seasoned", "look no further"
- Sound like a confident senior dev, not a freelancer begging for work
- No filler. Every sentence must earn its place.
- Write in first person as Sandesh
- Return ONLY the proposal text, no preamble or labels`

    : `You are writing a one-line proposal angle for Sandesh Kale (full-stack React/Node.js dev).

JOB: ${job.title}
Description: ${(job.description || '').slice(0, 300)}
Skills: ${(job.skills || []).join(', ') || 'not listed'}

Write ONE sentence (max 25 words) on what angle Sandesh should lead with in his proposal.
No filler. No "I would". Just the angle. Return ONLY the sentence.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: tier === 'full' ? 200 : 50,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || fallback(job);
  } catch (err) {
    console.error('[groq] proposal generation failed:', err.message);
    return fallback(job);
  }
}

function fallback(job) {
  const skills = (job.skills || []).slice(0, 3).join(', ') || 'React / Node.js';
  return `Built production apps with ${skills}. Happy to share relevant code samples — what's the best way to show you a quick proof of concept?`;
}
