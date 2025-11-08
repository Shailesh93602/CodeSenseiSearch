# Multi-stage build for NestJS API
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

# Set working directory to API
WORKDIR /app/apps/api

# Generate Prisma client
RUN pnpm prisma generate

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
RUN adduser -S nestjs -u 1001

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY --chown=nestjs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nestjs:nodejs apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy environment files
COPY --chown=nestjs:nodejs .env.production.template ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Create directories for logs and temp files
RUN mkdir -p /app/logs /app/tmp && chown -R nestjs:nodejs /app/logs /app/tmp

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');const req=http.request({hostname:'localhost',port:3001,path:'/health',timeout:2000},res=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]