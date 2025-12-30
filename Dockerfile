# Multi-stage Dockerfile for Next.js 16 app (pnpm)
# Render will run: docker build .

# ---------- Base ----------
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---------- Deps ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Builder ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure standalone output (bundles minimal node_modules into .next/standalone)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- Runner ----------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Copy standalone build output
COPY --from=builder /app/.next/standalone .
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Expose port (Render uses PORT env)
EXPOSE 3000
ENV PORT=3000

# Use non-root user for safety
USER node

CMD ["node", "server.js"]
