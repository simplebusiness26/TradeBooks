#!/usr/bin/env bash
# Brings a fresh development environment up to a runnable state.
#
# Safe to run repeatedly: it starts PostgreSQL if it is installed locally and
# stopped, creates the development and test databases if they do not exist,
# applies migrations and seeds the demo business.
set -euo pipefail

cd "$(dirname "$0")/.."

log() { printf '  %s\n' "$1"; }

log "Checking PostgreSQL…"
if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q 2>/dev/null; then
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    log "Starting the local PostgreSQL cluster"
    pg_ctlcluster "$(ls /usr/lib/postgresql | head -1)" main start 2>/dev/null || true
  elif command -v service >/dev/null 2>&1; then
    service postgresql start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 15); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi

if command -v psql >/dev/null 2>&1 && pg_isready -q 2>/dev/null && id postgres >/dev/null 2>&1; then
  log "Ensuring the tradebooks role and databases exist"
  su postgres -c "psql -tAc \"select 1 from pg_roles where rolname='tradebooks'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c \"create role tradebooks login password 'tradebooks' superuser\"" >/dev/null 2>&1 || true
  su postgres -c "createdb -O tradebooks tradebooks" >/dev/null 2>&1 || true
  su postgres -c "createdb -O tradebooks tradebooks_test" >/dev/null 2>&1 || true
fi

if [ ! -f .env ]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  log "Installing dependencies"
  npm install --no-audit --no-fund
fi

log "Applying migrations"
npm run db:migrate --silent

log "Seeding the demo business (skipped if it already exists)"
npm run db:seed --silent

log "Ready. Run 'npm run dev' and open http://localhost:3000"
