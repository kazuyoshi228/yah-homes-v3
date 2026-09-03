#!/usr/bin/env bash
# agency DB を BigQuery に載せる（2026-09-02）
# ★発注者が実行する。1〜4は一度だけ、5〜6は毎回。
#
# 正本は Firestore のまま。BigQuery は【読み取り専用の分析面】。
# データ 1.31MB なので、保存もクエリも無料枠に収まる。
set -euo pipefail

PROJECT="yah-homes"
DB="agency"
BUCKET="gs://${PROJECT}-firestore-export"
DATASET="agency"
REGION="asia-northeast1"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# 出す台帳。--collection-ids を渡さないと all_kinds に1つへまとまってしまい、
# BigQuery が「どのテーブルか」を決められない（2026-09-03 実際に起きた）。
# 空のコレクションは export が作らないので、ここに書いてあっても害はない。
COLLECTIONS="assumptions,bankBalances,bsAdjustments,buildPayments,cash,construction,contracts,depreciation,equipment,finance,financials,insurance,items,jobs,judgments,landComps,personalAssets,personalDistributions,places,policies,properties,recurringCosts,reserves,revenue,schedules,scorecards,settings,taxes,tourismStats,utilities,utilityBills,vendors,adsDaily,bookingDaily,cvr,ga4Daily,gscDaily,gscPage,gscQuery,competitorObs,opsTasks"

step() { echo; echo "── $* ──"; }

step "0. 権限の確認"
gcloud config set project "$PROJECT" >/dev/null
echo "アカウント: $(gcloud config get-value account)"
echo "プロジェクト: $(gcloud config get-value project)"

step "1. APIを有効にする（一度だけ）"
gcloud services enable \
  firestore.googleapis.com bigquery.googleapis.com storage.googleapis.com \
  --project="$PROJECT"

step "2. エクスポート先のバケットを作る（一度だけ）"
gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1 \
  || gcloud storage buckets create "$BUCKET" \
       --project="$PROJECT" --location="$REGION" --uniform-bucket-level-access

step "3. BigQuery のデータセットを作る（一度だけ）"
bq --project_id="$PROJECT" --location="$REGION" show -d "$DATASET" >/dev/null 2>&1 \
  || bq --project_id="$PROJECT" --location="$REGION" mk -d \
       --description "agency DB のスナップショット（読み取り専用の分析面）" "$DATASET"

step "4. Firestore からエクスポート（数分かかる）"
gcloud firestore export "${BUCKET}/${STAMP}" \
  --database="$DB" --project="$PROJECT" --collection-ids="$COLLECTIONS"

step "5. BigQuery へ読み込む"
# エクスポートされたコレクションを、書き出し先から自動で拾う
FOUND=$(gcloud storage ls "${BUCKET}/${STAMP}/all_namespaces/" \
  | sed 's#.*/kind_##; s#/$##' | grep -v '^$' | grep -v all_kinds || true)
echo "見つかったコレクション: $(echo "$FOUND" | grep -c . ) 件"
for C in $FOUND; do
  META="${BUCKET}/${STAMP}/all_namespaces/kind_${C}/all_namespaces_kind_${C}.export_metadata"
  echo "  読み込み: $C"
  bq --project_id="$PROJECT" --location="$REGION" load --replace --quiet \
     --source_format=DATASTORE_BACKUP "${DATASET}.${C}" "$META" || echo "    → 失敗（空のコレクションかも）"
done

step "6. VIEW を作る"
# 式の正本は functions/src/agency/derive.ts。ここはその写し。
# 注釈を落として文ごとに分け、1本ずつ流す
#   ——まとめて流すと、途中で失敗したとき何が作れたか分からなくなる
SQLFILE="$(dirname "$0")/bq-views.sql"
# シェルの tr で切ると注釈や改行の扱いで文が途中で切れる（2026-09-03 実際に起きた）
python3 "$(dirname "$0")/bq-split-sql.py" "$SQLFILE" > /tmp/bq-views-split.txt
while IFS= read -r Q; do
  case "$Q" in *CREATE*) ;; *) continue ;; esac
  NAME=$(printf '%s' "$Q" | grep -oE 'VIEW `[^`]+`' | head -1)
  echo "  作成: ${NAME:-（不明）}"
  bq --project_id="$PROJECT" --location="$REGION" query --use_legacy_sql=false --quiet "$Q" \
    || echo "    → 失敗。元のテーブルが揃っているか確認してください"
done < /tmp/bq-views-split.txt

step "確認"
bq --project_id="$PROJECT" --location="$REGION" query --use_legacy_sql=false --format=pretty \
  'SELECT label, noi, ROUND(net_yield_pct,2) AS yield_pct FROM `yah-homes.agency.v_property_noi` ORDER BY noi DESC'

echo
echo "できました。物件カードの数字と一致していれば成功です。"
echo "  清川 NOI ¥7,124,188 / 高砂 NOI ¥7,945,589（2026-09-02 時点）"
