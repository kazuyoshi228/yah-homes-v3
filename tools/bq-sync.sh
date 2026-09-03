#!/usr/bin/env bash
# agency DB を BigQuery へ同期する（2026-09-03 発注者承認・design_agency_db_review_20260903.md D案）
#
# なぜ: 2026-09-03 の実測で、finance が12件中10件・landComps が1555件中100件しか
#       入っていなかった。欠けていた2件は loan-kazuyoshi-officer（¥93,031,628）と
#       loan-harunobu-corp-3m——家族ファンドの計算でいちばん効く2本だった。
#       原因は ①--collection-ids を指定せず種別が分かれていなかった
#             ②定期実行が無く、手で回した日の状態で止まっていた
#
# 使い方: tools/bq-sync.sh          … 同期して件数を突き合わせる
#         tools/bq-sync.sh --verify … 同期せず、件数の突き合わせだけ
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=yah-homes
DB=agency
DATASET=agency
BUCKET=gs://${PROJECT}-firestore-export
LOC=asia-northeast1

# 同期するコレクション。増えたらここに足す——足し忘れは verify が見つける
COLS="assumptions bankBalances bsAdjustments buildPayments cash catalog construction contracts
depreciation equipment finance financials insurance items judgments landComps personalAssets
personalDistributions places properties recurringCosts reserves revenue settings taxes utilities
utilityBills vendors bookingDaily"
CSV=$(echo $COLS | tr ' ' ',')

if [ "${1:-}" != "--verify" ]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  echo "== 1. エクスポート（$DB → $BUCKET/$STAMP）"
  # --collection-ids は必須。省くと all_kinds になり、種別ごとの bq load ができない
  gcloud firestore export "$BUCKET/$STAMP" --database="$DB" --project="$PROJECT" \
    --collection-ids="$CSV" >/dev/null
  echo "   完了"

  echo "== 2. BigQuery へ読み込み（--replace）"
  for C in $COLS; do
    if bq --project_id="$PROJECT" --location="$LOC" load --replace \
        --source_format=DATASTORE_BACKUP "$DATASET.$C" \
        "$BUCKET/$STAMP/all_namespaces/kind_$C/all_namespaces_kind_$C.export_metadata" >/dev/null 2>&1
    then printf "   OK   %s\n" "$C"; else printf "   NG   %s\n" "$C"; fi
  done
fi

echo "== 3. 件数の突き合わせ（Firestore ↔ BigQuery）"
exec node functions/bq-verify-counts.mjs $COLS
