#!/usr/bin/env bash
set -euo pipefail

archive="$(mktemp -d)"
trap 'rm -rf "$archive"' EXIT
curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip -o "$archive/bun.zip"
echo 'bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c  '"$archive/bun.zip" | sha256sum -c -
unzip -q "$archive/bun.zip" -d "$archive"
mkdir -p "$HOME/.local/bin"
install -m 755 "$archive/bun-linux-x64/bun" "$HOME/.local/bin/bun"
"$HOME/.local/bin/bun" --version
