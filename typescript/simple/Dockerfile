# Multi-stage Dockerfile for Simple Graph Service
# Based on existing MCP Runtime and Self-RAG patterns

# ===================================================================
# Stage 1: Builder - Build TypeScript application
# ===================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Enable Corepack for Yarn 4
RUN corepack enable

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Install all dependencies (including devDependencies for build)
# SDK will be installed from npm registry
RUN yarn install --immutable

# Copy source code
COPY . .

# Build the application
RUN yarn build

# ===================================================================
# Stage 2: Production - Minimal runtime image
# ===================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nestjs && \
    adduser -S -u 1001 -G nestjs nestjs

# Copy package files
COPY --from=builder /app/package.json ./package.json

# Copy node_modules from builder (уже установлены)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy graph manifest (required by SDK)
COPY --from=builder /app/graph.manifest.json ./graph.manifest.json

# Change ownership
RUN chown -R nestjs:nestjs /app

# Switch to non-root user
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/src/main.js"]
