"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDIS_TLS_URL = exports.REDIS_URL = void 0;
exports.getRedisUrl = getRedisUrl;
exports.REDIS_URL = process.env.REDIS_URL || '';
exports.REDIS_TLS_URL = process.env.REDIS_TLS_URL || '';
/**
 * Retorna a URL do Redis a ser usada. Prefere `REDIS_TLS_URL` se definida,
 * depois `REDIS_URL`. Em produção, lança erro se não configurado.
 */
function getRedisUrl() {
    const url = exports.REDIS_TLS_URL || exports.REDIS_URL;
    if (!url) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('REDIS_URL ou REDIS_TLS_URL deve ser configurado em produção');
        }
        console.warn('[CONFIG] Redis não configurado - algumas funcionalidades podem não funcionar');
        return '';
    }
    return url;
}
exports.default = {
    REDIS_URL: exports.REDIS_URL,
    REDIS_TLS_URL: exports.REDIS_TLS_URL,
    getRedisUrl,
};
