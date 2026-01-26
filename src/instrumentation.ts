export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logEnvValidation } = await import('./lib/env');
    logEnvValidation();
  }
}
