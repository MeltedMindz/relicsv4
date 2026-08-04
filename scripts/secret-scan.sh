#!/usr/bin/env bash
# Self-contained secret / private-data scan for the clean-room starter.
#
# Two layers:
#   1) If `gitleaks` is installed, run it against the working tree with the repo config.
#   2) A dependency-free scan (portable to macOS bash 3.2) for high-signal patterns that must NEVER
#      appear in a public repo: populated private keys, mnemonics, and RPC URLs with embedded
#      credentials. Uses `git grep` so it only inspects tracked files and skips submodules.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

echo "== layer 1: gitleaks =="
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks dir . --config .gitleaks.toml --redact --exit-code 1 || fail=1
else
  echo "gitleaks not installed locally; relying on layer 2 + CI docker gitleaks."
fi

echo "== layer 2: git grep for populated secrets in tracked files =="
# git grep returns 0 when it finds a match. We invert: a match here is a FAILURE.
# Exclude vendored libraries and lockfiles from the pathspec.
EXCLUDES=(':!lib' ':!**/package-lock.json' ':!scripts/secret-scan.sh' ':!.gitleaks.toml')

# Populated 64-hex private key / mnemonic assignment (not the empty template).
if git grep -InE '(private[_-]?key|secret[_-]?key|mnemonic)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?(0x)?[0-9a-fA-F]{64}' -- "${EXCLUDES[@]}"; then
  echo "FAIL: populated private key / mnemonic assignment found."
  fail=1
fi

# RPC URL with an embedded API key (provider host + long token segment).
if git grep -InE 'https?://[^[:space:]"'"'"']*(infura|alchemy|quiknode|quicknode|ankr|blastapi)[^[:space:]"'"'"']*/(v[0-9]/)?[A-Za-z0-9_-]{20,}' -- "${EXCLUDES[@]}"; then
  echo "FAIL: RPC URL with embedded credential found."
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "PASS: no secrets or private data detected."
fi
exit "$fail"
