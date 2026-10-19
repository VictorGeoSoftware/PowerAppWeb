#!/usr/bin/env bash
# Regenerates src/lib/comparator/__golden__/comparator-cases.json by compiling the real
# BmApp comparator sources (read-only) together with ComparatorGolden.kt.
# Needs kotlinc and a JDK. Usage: scripts/golden/generate-comparator-golden.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BMAPP="${BMAPP_DIR:-$ROOT/../BmApp}"
DOMAIN="$BMAPP/domain/src/main/java/com/briel/marnisos/brielapp/domain"
DATA="$BMAPP/data/src/main/java/com/briel/marnisos/brielapp/data"
OUT="$ROOT/src/lib/comparator/__golden__/comparator-cases.json"

SOURCES=(
  "$DOMAIN/calculations/ProposalCalculationHelper.kt"
  "$DOMAIN/usecases/CalculateComparatorSummaryUseCase.kt"
  "$DOMAIN/usecases/SelectUncompetitiveProposalsUseCase.kt"
  "$DOMAIN/models/ComparatorSummaryModel.kt"
  "$DOMAIN/models/CustomerConditionsColumnModel.kt"
  "$DOMAIN/models/ProposalPriceModel.kt"
  "$DOMAIN/models/ConsumptionSessionModel.kt"
  "$DOMAIN/models/CurrentUserConditionsModel.kt"
  "$DATA/utils/FormatUtils.kt"
)
for f in "${SOURCES[@]}"; do
  [[ -f "$f" ]] || { echo "Missing BmApp source: $f" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

kotlinc -nowarn "${SOURCES[@]}" "$ROOT/scripts/golden/ComparatorGolden.kt" -include-runtime -d "$TMP/golden.jar"
mkdir -p "$(dirname "$OUT")"
java -cp "$TMP/golden.jar" ComparatorGoldenKt > "$TMP/out.json"
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],JSON.stringify(j,null,1)+"\n");console.log(`${j.cases.length} cases written to ${process.argv[2]}`)' "$TMP/out.json" "$OUT"
