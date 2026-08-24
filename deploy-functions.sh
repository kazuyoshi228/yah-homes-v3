#!/bin/bash
# yah.homes-v2 functions デプロイ門番（S2・2026-08-25 発注者承認）
#
# functions のデプロイは functions/ 全体をビルドして配信する。並行スレッドの書きかけTSが
# 混入するのを防ぐため、clean かつ origin/main と一致し、型チェックが通るときだけ通す。
#
#   ./deploy-functions.sh              … agencyApi のみ（yah.OS の作業は通常これ）
#   ./deploy-functions.sh <functions式> … 例: "functions:seoserver" / "functions"（全部）
set -e
cd "$(dirname "$0")"

git fetch origin --quiet
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ 未コミットの変更があります。commit してから実行してください:"
  git status --porcelain | head -10
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "✗ origin/main と一致していません。git pull --rebase && git push してから実行してください"
  exit 1
fi

echo "→ 型チェック"
(cd functions && npx tsc --noEmit -p .)

TARGET="${1:-functions:agencyApi}"
echo "→ 本番へデプロイ: $TARGET"
# --force: minInstances の課金確認を通す（P4で承認済み・2026-08-24）
firebase deploy --only "$TARGET" --project yah-homes --force
