import { describe, it, expect } from 'vitest';
import { isNicheRelevant } from '../scanner.js';

describe('isNicheRelevant', () => {
  it('matches react in title', () => {
    expect(isNicheRelevant('Senior React Developer', '', [])).toBe(true);
  });
  it('matches nodejs in description', () => {
    expect(isNicheRelevant('Backend Dev', 'Looking for node developer', [])).toBe(true);
  });
  it('matches typescript in tags', () => {
    expect(isNicheRelevant('Developer', '', ['typescript', 'aws'])).toBe(true);
  });
  it('matches next.js case-insensitive', () => {
    expect(isNicheRelevant('Next.JS Engineer', '', [])).toBe(true);
  });
  it('rejects completely unrelated jobs', () => {
    expect(isNicheRelevant('Plumber', 'Fixing pipes and drains', [])).toBe(false);
    expect(isNicheRelevant('Chef needed', 'Italian restaurant kitchen', [])).toBe(false);
    expect(isNicheRelevant('Accountant CPA', 'Tax and auditing', [])).toBe(false);
  });
  it('matches fullstack', () => {
    expect(isNicheRelevant('Full Stack Engineer', '', [])).toBe(true);
  });
  it('matches web developer', () => {
    expect(isNicheRelevant('Web Developer needed', '', [])).toBe(true);
  });
});
