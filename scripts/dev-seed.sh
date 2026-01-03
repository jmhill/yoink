#!/usr/bin/env bash
set -euo pipefail

# Dev seed script for Yoink API
# Sets up dev environment with seeded auth data and copies token to clipboard

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Copy to clipboard if possible, otherwise just display prominently
copy_to_clipboard() {
  local text="$1"
  if command -v pbcopy &> /dev/null; then
    echo -n "$text" | pbcopy && echo -e "${GREEN}✓ Copied to clipboard${NC}"
  elif command -v xclip &> /dev/null; then
    echo -n "$text" | xclip -selection clipboard && echo -e "${GREEN}✓ Copied to clipboard${NC}"
  elif command -v xsel &> /dev/null; then
    echo -n "$text" | xsel --clipboard --input && echo -e "${GREEN}✓ Copied to clipboard${NC}"
  else
    echo -e "${YELLOW}(clipboard not available - copy manually)${NC}"
  fi
}

# Set dev environment variables
export SEED_TOKEN="dev-token"
export ADMIN_PASSWORD="admin"

# WebAuthn configuration for passkey authentication
export WEBAUTHN_RP_ID="localhost"
export WEBAUTHN_RP_NAME="Yoink Dev"
export WEBAUTHN_ORIGIN="http://localhost:5174"
export WEBAUTHN_CHALLENGE_SECRET="dev-challenge-secret-at-least-32-chars"
export COOKIE_SECURE="false"

# Seed invitation for passkey signup (separate from token user)
# Using .test TLD (IETF reserved for testing) to ensure email passes validation
export SEED_INVITATION_EMAIL="dev@localhost.test"

# Track what we've seen so we can print the summary once
SEEN_TOKEN=""
SEEN_INVITATION=""

print_summary() {
  echo ""
  echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
  if [[ -n "$SEEN_TOKEN" ]]; then
    echo -e "  ${GREEN}Dev Token:${NC}  $SEEN_TOKEN"
  fi
  if [[ -n "$SEEN_INVITATION" ]]; then
    echo -e "  ${GREEN}Signup URL:${NC} http://localhost:5174/signup?code=$SEEN_INVITATION"
    copy_to_clipboard "http://localhost:5174/signup?code=$SEEN_INVITATION"
  fi
  echo ""
  echo -e "  ${CYAN}Web App:${NC}    http://localhost:5174"
  echo -e "  ${CYAN}Admin:${NC}      http://localhost:5173  ${YELLOW}(password: admin)${NC}"
  echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# Start server and capture initial output to extract token and invitation
# Then continue streaming output
pnpm exec tsx watch --experimental-sqlite src/index.ts 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" == *"Seeded API token:"* ]]; then
    SEEN_TOKEN=$(echo "$line" | awk '{print $NF}')
  fi
  if [[ "$line" == *"Seeded invitation code:"* ]]; then
    SEEN_INVITATION=$(echo "$line" | awk '{print $4}')
  fi
  # Print summary once we've seen both (or after invitation if no token)
  if [[ -n "$SEEN_INVITATION" && (-n "$SEEN_TOKEN" || "$line" == *"Seeded invitation code:"*) ]]; then
    print_summary
    # Reset so we don't print again
    SEEN_TOKEN=""
    SEEN_INVITATION=""
  fi
done
