#!/bin/bash
# ============================================================
# Push production code to GitHub — ashishblog09-star
# Usage: GITHUB_TOKEN=your_token bash scripts/push-to-github.sh
# ============================================================

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: Set GITHUB_TOKEN before running this script."
  echo "Usage: GITHUB_TOKEN=ghp_xxxx bash scripts/push-to-github.sh"
  exit 1
fi

REPO="ashishblog09-star"
GITHUB_USER="ashishblog09-star"

# Set remote with token
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git" 2>/dev/null || \
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"

git config user.email "ci@bharatcashgold.app"
git config user.name "Bharat Cash Gold CI"

git add -A
git commit -m "Production Fix: Removed Fake Ads, Implemented Real Unity Ads with Callback Reward System" || echo "Nothing new to commit."
git push origin main --force-with-lease || git push origin HEAD:main

echo ""
echo "✅ Successfully pushed to GitHub: https://github.com/${GITHUB_USER}/${REPO}"
