import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.js'],
      exclude: [
        'lib/__tests__/**',
        // Networking/IO files — only testable with integration tests
        'lib/scanner.js',
        'lib/supabase.js',
        'lib/gmailReader.js',    // IMAP networking
        'lib/upworkSearch.js',   // HTTP scraper (removed from active use)
        'lib/proposalWriter.js', // Groq API — tested via mock, low meaningful coverage
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 50,
      },
    },
  },
});
