# Build stage
FROM node:24-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy package manifests for all packages
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/api-contracts/package.json ./packages/api-contracts/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/infrastructure/ ./packages/infrastructure/
COPY packages/api-contracts/ ./packages/api-contracts/
COPY apps/api/ ./apps/api/

# Build all packages
RUN pnpm build

# Production stage
FROM node:24-alpine AS runner

# Install Litestream for SQLite backup/restore
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/api-contracts/package.json ./packages/api-contracts/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only (ignore prepare script which runs husky)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/packages/infrastructure/dist ./packages/infrastructure/dist
COPY --from=builder /app/packages/api-contracts/dist ./packages/api-contracts/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Create data directory for SQLite
RUN mkdir -p /app/apps/api/data

# Copy Litestream config and startup script
COPY apps/api/litestream.yml /etc/litestream.yml
COPY apps/api/run.sh /app/run.sh
RUN chmod +x /app/run.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/apps/api

CMD ["/app/run.sh"]
