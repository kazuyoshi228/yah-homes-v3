#!/usr/bin/env bash
# 安全デプロイ — 本番を壊さずに「必要な箇所だけ」更新する手順を強制する。
#
# 背景（2026-08-17 の事故）:
#   クリーンな git worktree で `npm run build` しただけでデプロイした結果、
#   BOOK_PREVIEW=1 が無く /ja/book/ /ja/account/ が生成されないまま本番を上書きし、
#   Stripe本番決済が動いている状態で直販サイトが404になった。
#   「ビルドが成功した」ことと「必要なページが全部ある」ことは別物。
#
# 使い方:
#   scripts/safe-deploy.sh preview   … プレビューチャネルへ出す（本番に影響しない）
#   scripts/safe-deploy.sh live      … 本番へ出す（preview で確認済みのときだけ）
set -euo pipefail

MODE="${1:-preview}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# 生成されていなければ本番を壊す、というページ。ここを増やすほど事故が減る。
REQUIRED_PAGES=(
  "dist/index.html"
  "dist/ja/index.html"
  "dist/zh/index.html"
  "dist/ja/book/index.html"
  "dist/ja/account/index.html"
  "dist/ja/book/checkout/index.html"
  "dist/ja/properties/kiyokawa/index.html"
  "dist/ja/legal/tokushoho/index.html"
  "dist/ja/legal/privacy/index.html"
)
MIN_PAGES=165   # BOOK_PREVIEW=1 で171ページ。151ページ（予約機能なし）を弾くための下限

echo "── 1. 作業ツリーの確認 ──"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠ 未コミットの変更があります（他セッションの作業中かもしれません）:"
  git status --short
  echo
  read -r -p "このままビルドしますか？ [y/N] " a
  [[ "$a" == "y" || "$a" == "Y" ]] || { echo "中止しました。"; exit 1; }
fi
echo "  HEAD: $(git log --oneline -1)"

echo
echo "── 2. ビルド（BOOK_PREVIEW=1 必須） ──"
# これを付けないと予約ページ・物件ページの予約ボタンが消える
BOOK_PREVIEW=1 npm run build

echo
echo "── 3. 生成物の検証 ──"
missing=0
for p in "${REQUIRED_PAGES[@]}"; do
  if [[ -f "$p" ]]; then printf "  ✅ %s\n" "$p"
  else printf "  ❌ %s が無い\n" "$p"; missing=1; fi
done
# 計測ブロックの必須要素。1つでも欠けると計測が静かに全損する（docs/GUARD_tracking_baselayout.md）
echo
echo "── 3-2. 計測タグの健全性 ──"
assert_in()  { if grep -q "$2" "$1"; then printf "  ✅ %s\n" "$3"; else printf "  ❌ %s が無い（%s）\n" "$3" "$1"; missing=1; fi; }
assert_out() { if grep -q "$2" "$1"; then printf "  ❌ %s（%s にあってはいけない）\n" "$3" "$1"; missing=1; else printf "  ✅ %s\n" "$3"; fi; }
assert_in  dist/zh/index.html "window.gtag = gtag"                  "window.gtag を公開している（IIFE事故の再発防止）"
assert_in  dist/zh/index.html 'location.hostname === "yah.homes"'    "本番ホストガード TRACK がある"
assert_in  dist/zh/index.html "window.fbq && fbq"                    "fbq を安全呼び出ししている"
assert_in  dist/zh/index.html "connect.facebook.net"                 "Metaピクセルが入っている"
assert_out dist/admin/menu/index.html "gtag/js?id=G-VJ5DDRML79"          "管理画面に計測タグが無い"

count=$(find dist -name index.html | wc -l | tr -d ' ')
printf "  ページ総数: %s（下限 %s）\n" "$count" "$MIN_PAGES"
[[ "$count" -lt "$MIN_PAGES" ]] && { echo "  ❌ ページ数が少なすぎます"; missing=1; }
[[ "$missing" -eq 1 ]] && { echo; echo "🛑 検証に失敗。デプロイせず中止します。"; exit 1; }
echo "  → 検証OK"

echo
if [[ "$MODE" == "preview" ]]; then
  echo "── 4. プレビューチャネルへデプロイ ──"
  firebase hosting:channel:deploy "verify-$(date +%m%d-%H%M)" --expires 2d
  echo
  echo "上のURLで表示を確認してください。問題なければ:"
  echo "  scripts/safe-deploy.sh live"
else
  echo "── 4. 本番へデプロイ ──"
  read -r -p "本番に反映します。よろしいですか？ [y/N] " a
  [[ "$a" == "y" || "$a" == "Y" ]] || { echo "中止しました。"; exit 1; }
  firebase deploy --only hosting
  echo
  echo "── 5. 本番の検証 ──"
  for u in / /ja/ /zh/ /ja/book/ /ja/account/ /ja/book/checkout/ /ja/properties/kiyokawa/ /ja/legal/tokushoho/; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://yah.homes$u")
    [[ "$code" == "200" ]] && printf "  ✅ %-28s %s\n" "$u" "$code" || printf "  ❌ %-28s %s\n" "$u" "$code"
  done
fi
