// Playwright's direct Node loader does not apply Next.js's server-only alias.
// This empty test-only module preserves the production marker while allowing
// route handlers to be exercised as ordinary functions in focused unit tests.
export {};
