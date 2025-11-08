# Multi-stage build for Next.js frontend
FROM node:18-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm fetch --frozen-lockfile

# Copy source code
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile --offline

# =============================================
# Build stage
# =============================================
FROM base AS builder

# Set working directory to web app
WORKDIR /app/apps/web

# Set build environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN pnpm build

# =============================================
# Production stage
# =============================================
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY --chown=nextjs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nextjs:nodejs apps/web/package.json ./apps/web/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Next.js config
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.js ./apps/web/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create directories for logs and temp files
RUN mkdir -p /app/logs /app/tmp && chown -R nextjs:nodejs /app/logs /app/tmp

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');const req=http.request({hostname:'localhost',port:3000,path:'/api/health',timeout:2000},res=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]