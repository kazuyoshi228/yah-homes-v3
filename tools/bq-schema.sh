#!/usr/bin/env bash
# 読み込まれたテーブルの列名を見る（VIEWのSQLを実データに合わせるため）
set -euo pipefail
P="yah-homes"; R="asia-northeast1"
for T in properties revenue landComps taxes insurance reserves; do
  echo "── $T ──"
  bq --project_id="$P" --location="$R" show --schema --format=prettyjson "agency.$T" 2>/dev/null \
    | python3 -c 'import sys,json; print(", ".join(f["name"] for f in json.load(sys.stdin)))' \
    || echo "  （取得できず）"
done
echo
echo "── landComps の1行 ──"
bq --project_id="$P" --location="$R" query --use_legacy_sql=false --format=prettyjson --quiet \
  'SELECT * FROM `yah-homes.agency.landComps` LIMIT 1' 2>/dev/null | head -40
