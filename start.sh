#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
prisma db push --accept-data-loss

echo "Starting server..."
exec node server.js
