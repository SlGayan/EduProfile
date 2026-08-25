FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/
COPY apps/web/package.json ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/

RUN npm ci

# Copy Web source code
COPY apps/web ./apps/web/

# Build
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# API_URL must be available at build time so next.config.mjs rewrites() resolve correctly
ARG API_URL=http://api:8000
ENV API_URL=$API_URL
RUN npm run build

# Runner stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
