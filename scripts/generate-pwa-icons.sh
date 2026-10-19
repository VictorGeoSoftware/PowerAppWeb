#!/usr/bin/env bash
# Regenerates the PWA icons in public/icons/ from the BmApp launcher export.
# Requires ImageMagick 7 (`brew install imagemagick`). Usage: scripts/generate-pwa-icons.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/../BmApp/launcher_icon_export/hIYe8.png}"
OUT="$ROOT/public/icons"
mkdir -p "$OUT"

# Full-bleed square: the rounded icon over its own vertical gradient, so the
# transparent corners are filled. The glyph already sits inside the central
# 80% maskable safe zone (max ~0.28 of the size from the centre).
FULL="$(mktemp -t pwa-icon).png"
magick -size 1024x1024 gradient:'#FACB15-#F59F0B' "$SRC" -compose over -composite \
  -alpha off -depth 8 "$FULL"

magick "$SRC" -resize 192x192 -strip "$OUT/icon-192.png"
magick "$SRC" -resize 512x512 -strip "$OUT/icon-512.png"
magick "$FULL" -resize 512x512 -strip "$OUT/icon-maskable-512.png"
# iOS rounds the corners itself and renders transparency as black: opaque.
magick "$FULL" -resize 180x180 -alpha off -strip "$OUT/apple-touch-icon.png"
magick "$SRC" -define icon:auto-resize=48,32,16 "$ROOT/src/app/favicon.ico"

rm -f "$FULL"
echo "Icons written to $OUT and src/app/favicon.ico"
