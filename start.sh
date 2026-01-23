#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
prisma db push --skip-generate

echo "Starting server..."
exec node server.js
