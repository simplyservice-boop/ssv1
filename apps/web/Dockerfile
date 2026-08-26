# ── Stage 1: Build ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time Vite env vars (baked into static bundle)
ARG VITE_API_URL=/api/v1
ARG VITE_MAPBOX_TOKEN
ARG VITE_SOCKET_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

# Install dependencies first (layer cache)
COPY package.json yarn.lock* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --network-timeout 300000

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared package
WORKDIR /app/packages/shared
RUN yarn build 2>/dev/null || true

# Build web app
WORKDIR /app/apps/web
RUN yarn build

# ── Stage 2: Serve ────────────────────────────
FROM nginx:1.25-alpine AS runner

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

# Create log directories and set permissions
RUN mkdir -p /var/log/nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
