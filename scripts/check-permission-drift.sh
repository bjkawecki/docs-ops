#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/apps/backend/src"

LEGACY_PATTERN='canViewTeam|canViewDepartment|canViewCompany|getScopeLead|canReadInOwnerScope|userCanReadDocumentContext'

if rg -q "$LEGACY_PATTERN" "$BACKEND" 2>/dev/null; then
  echo "Permission drift check failed: legacy symbols still present:"
  rg "$LEGACY_PATTERN" "$BACKEND" || true
  exit 1
fi

# Direct membership/lead checks outside Layer 1 (predicates) and Layer 2 (scopeVisibility)
ALLOWED='userAccessPredicates\.ts|scopeVisibility\.ts|pinnedPermissions\.ts|canWrite\.ts|\.test\.ts'
if rg 'teamMemberships\.some|companyLeads\.some|departmentLeads\.some|leadOfTeams\.some' "$BACKEND" \
  | rg -v "$ALLOWED" 2>/dev/null; then
  echo "Permission drift check failed: hierarchy checks outside allowed modules."
  exit 1
fi

echo "Permission drift check passed."
