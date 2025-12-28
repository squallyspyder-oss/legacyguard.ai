export const REDIS_URL = process.env.REDIS_URL || '';
export const REDIS_TLS_URL = process.env.REDIS_TLS_URL || '';

/**
 * Retorna a URL do Redis a ser usada. Prefere `REDIS_TLS_URL` se definida,
 * depois `REDIS_URL`. Em produção, lança erro se não configurado.
 */
export function getRedisUrl(): string {
  const url = REDIS_TLS_URL || REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL ou REDIS_TLS_URL deve ser configurado em produção');
    }
    console.warn('[CONFIG] Redis não configurado - algumas funcionalidades podem não funcionar');
    return '';
  }
  return url;
}

export default {
  REDIS_URL,
  REDIS_TLS_URL,
  getRedisUrl,
};
