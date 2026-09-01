FROM node:22-alpine AS builder

WORKDIR /app

# Copy everything first — .dockerignore excludes node_modules, .next, dist
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Install after all source is present
RUN npm install

# Build shared first
WORKDIR /app/packages/shared
RUN npm run build

# Build web
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

# Standalone output already bundles a minimal traced node_modules — no npm install needed
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=appuser:appgroup /app/apps/web/public ./apps/web/public

USER appuser

WORKDIR /app/apps/web
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
