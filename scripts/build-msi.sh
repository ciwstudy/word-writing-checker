#!/usr/bin/env sh
# Builds dist/WritingChecker-<version>.msi. Needs wixl (Linux: apt install wixl)
# or run the .wxs through the WiX v3 toolset on Windows.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
node scripts/make-ico.mjs
mkdir -p dist downloads
wixl -D Version="$VERSION" -o "dist/WritingChecker-$VERSION.msi" installer/WritingChecker.wxs
cp "dist/WritingChecker-$VERSION.msi" downloads/WritingChecker.msi
echo "Built dist/WritingChecker-$VERSION.msi (copied to downloads/WritingChecker.msi)"
