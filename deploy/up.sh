#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Create .env from example if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — please edit with your API keys"
fi

# Create data directories
mkdir -p ../data/db ../data/uploads ../data/repos

# Build and start
docker compose up --build -d

echo ""
echo "Services started:"
echo "  Recruiter portal: http://localhost:${EXPOSE_PORT:-8090}/"
echo "  Admin portal:     http://localhost:${EXPOSE_PORT:-8090}/admin/"
echo "  Backend API:      http://localhost:${EXPOSE_PORT:-8090}/api/"
echo ""
# First-time setup: run 'docker compose exec backend npm run seed:prod' (or
# 'docker exec jas-backend node dist/db/seed.js') to create the admin user and
# default skills. Resume data is published via the admin portal, not seeded.
