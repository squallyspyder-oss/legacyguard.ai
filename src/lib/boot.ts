let bootLogged = false;

export function logBootDiagnostics(source = 'api') {
  if (bootLogged) return;
  bootLogged = true;

  const port = process.env.PORT || process.env.NEXT_PORT || '3000';
  const apiKeyLoaded = Boolean(process.env.OPENAI_API_KEY);

  console.log(`[boot] LegacyGuard server ready (source=${source})`);
  console.log(`[boot] listening on port ${port}`);
  console.log(`[boot] OPENAI_API_KEY loaded=${apiKeyLoaded}`);
}

export function resetBootLogForTests() {
  bootLogged = false;
}
