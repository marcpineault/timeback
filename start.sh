#!/bin/sh
set -e

echo "Running database migrations..."
prisma db push --schema=./prisma/schema.prisma --skip-generate

echo "Starting server..."
exec node server.js
