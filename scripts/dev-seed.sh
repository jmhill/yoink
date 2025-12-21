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

# Start server and capture initial output to extract token
# Then continue streaming output
pnpm exec tsx watch --experimental-sqlite src/index.ts 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" == *"Seeded API token:"* ]]; then
    TOKEN=$(echo "$line" | awk '{print $NF}')
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}Dev Token:${NC} $TOKEN"
    copy_to_clipboard "$TOKEN"
    echo ""
    echo -e "  ${CYAN}Web App:${NC}   http://localhost:5174"
    echo -e "  ${CYAN}Admin:${NC}     http://localhost:5173  ${YELLOW}(password: admin)${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
  fi
done
