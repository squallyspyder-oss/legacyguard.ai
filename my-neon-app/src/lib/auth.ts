import { createAuthClient } from '@neondatabase/neon-js/auth';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
if (!authUrl) {
  throw new Error('VITE_NEON_AUTH_URL is missing. Set it in your .env file.');
}

export const authClient = createAuthClient(authUrl);
