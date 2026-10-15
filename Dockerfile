# Tripwire: web app + background worker + headless Chromium in one container.
# The official Playwright image ships Node, Chromium and every system library it needs.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first so this layer is cached between code changes.
# Dev dependencies are kept: the worker and migrations run through tsx.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Data lives on a persistent volume mounted at /data (database + screenshots).
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/tripwire.db \
    BLOB_DIR=/data/blobs

EXPOSE 3000

# Runs migrations, then the web app and the worker together.
CMD ["npm", "start"]
