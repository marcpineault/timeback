#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
# Use --accept-data-loss to handle any schema changes without prompts
prisma db push --accept-data-loss || echo "Migration warning (continuing anyway)"

echo "Starting server..."
exec node server.js
