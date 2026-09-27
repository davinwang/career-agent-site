FROM node:22-slim

# fontconfig: PDF generation embeds the bundled TTFs, and git is used by the
# repo-ingestion tools (simple-git).
RUN apt-get update && \
    apt-get install -y --no-install-recommends fontconfig git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching). No lockfile is committed,
# so `npm ci` will fail and fall back to `npm install`. Dev deps are required
# here because the TypeScript compiler (tsc) runs during the image build.
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci || npm install

# Copy fonts.
COPY fonts/ /app/fonts/

# Copy source and build.
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
RUN npm run build

# Drop dev dependencies now that the build artifacts exist in dist/.
RUN npm prune --omit=dev

# Create runtime data directories (bind-mounted volume overlays these).
RUN mkdir -p /app/data/db /app/data/uploads /app/data/repos

# Install fonts system-wide and rebuild the font cache.
RUN mkdir -p /usr/local/share/fonts/alibaba && \
    cp /app/fonts/*.ttf /usr/local/share/fonts/alibaba/ && \
    chmod 644 /usr/local/share/fonts/alibaba/* && \
    fc-cache -fv

EXPOSE 4111

ENV NODE_ENV=production
ENV FONT_DIR=/app/fonts
ENV DATABASE_PATH=/app/data/db/job-agent.db
ENV UPLOAD_DIR=/app/data/uploads
ENV REPO_DIR=/app/data/repos

CMD ["node", "dist/server.js"]
