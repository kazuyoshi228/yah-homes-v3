#!/usr/bin/env bash
# agency DB を BigQuery に載せる（2026-09-02）
#
# なぜ: 導出値の定義は derive.ts に集約したが、分析のたびにスクリプトを書いている。
#       SQLで問い合わせられるようにして、同じ問いに同じ答えが返る形にする。
# 方式: 日次エクスポート（Firestore → GCS → BigQuery）。
#       ストリーミング拡張より安く、構成も単純。相場や台帳は日次で足りる。
# 費用: データ 1.31MB。保存もクエリも無料枠（10GB / 1TB per month）に収まる。
#
# ★このスクリプトは【発注者が実行】する。AIは実行しない（CLAUDE.md 共通ルール）。
set -euo pipefail

PROJECT="yah-homes"
DATABASE="agency"
BUCKET="gs://${PROJECT}-firestore-export"
DATASET="agency"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "== 1. 一度だけ: APIの有効化とバケットの作成"
echo "   （すでに済んでいれば、この節は飛ばして構いません）"
cat <<'ONCE'
  gcloud services enable firestore.googleapis.com bigquery.googleapis.com \
      storage.googleapis.com cloudscheduler.googleapis.com --project=yah-homes
  gcloud storage buckets create gs://yah-homes-firestore-export \
      --project=yah-homes --location=asia-northeast1 --uniform-bucket-level-access
  bq --project_id=yah-homes --location=asia-northeast1 mk -d \
      --description "agency DB の日次スナップショット（読み取り専用の分析面）" agency
ONCE

echo
echo "== 2. エクスポート（毎回）"
echo "gcloud firestore export ${BUCKET}/${STAMP} --database=${DATABASE} --project=${PROJECT}"

echo
echo "== 3. BigQuery へ読み込み"
echo "   コレクションごとにテーブルを作る。--replace で毎回入れ替え（差分は追わない）"
cat <<'LOAD'
  for C in properties revenue finance landComps assumptions depreciation \
           personalAssets personalDistributions taxes insurance reserves \
           utilities buildPayments cash financials bsAdjustments; do
    bq --project_id=yah-homes --location=asia-northeast1 load --replace \
       --source_format=DATASTORE_BACKUP \
       "agency.${C}" \
       "gs://yah-homes-firestore-export/<STAMP>/all_namespaces/kind_${C}/all_namespaces_kind_${C}.export_metadata"
  done
LOAD

echo
echo "== 4. 定期実行（Cloud Scheduler・3ジョブまで無料）"
cat <<'SCHED'
  gcloud scheduler jobs create http agency-bq-daily \
    --project=yah-homes --location=asia-northeast1 --schedule="0 3 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://firestore.googleapis.com/v1/projects/yah-homes/databases/agency:exportDocuments" \
    --oauth-service-account-email="<エクスポート用のサービスアカウント>" \
    --message-body='{"outputUriPrefix":"gs://yah-homes-firestore-export/daily"}'
SCHED

echo
echo "== 注意 =="
echo " ・Firebaseプロジェクトは eSIM事業と共有です。(default) DB や chat 系には触れないこと"
echo " ・BigQuery は【読み取り専用の分析面】です。正本は Firestore のまま"
echo " ・VIEW の定義は tools/bq-views.sql にあります。derive.ts と同じ式です"
