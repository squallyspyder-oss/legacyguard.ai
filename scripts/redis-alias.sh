# Redis alias for local dev. Loads .env.local so credentials stay out of history.
r() {
  set -a
  [ -f /workspaces/legacyguard.ai/.env.local ] && source /workspaces/legacyguard.ai/.env.local
  set +a
  redis-cli --tls -u "${REDIS_TLS_URL:-$REDIS_URL}" "$@"
}
export -f r
