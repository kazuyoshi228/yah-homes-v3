# CLAUDE.md — yah.homes 開発ガイド（AI/開発者向け）

yah.homes（福岡の一棟貸し・ヴィラ／宿泊ブランドサイト＋直接予約）。旧サイト（Manus 製・React 19 + Vite の完全CSR + Express/tRPC）を廃し、**検索・AI に正しく評価される静的サイトとして作り直す**プロジェクト。フロント **Astro 7（SSG）・Reactアイランド不使用（素のJS）**、バックエンド Firebase（Cloud Functions v2 / Firestore / Auth / Storage / Hosting）。Firebase プロジェクト: **`yah-homes`**（[コンソール](https://console.firebase.google.com/u/0/project/yah-homes/overview)）。magazine.yah.mobi とは**別プロジェクト**（データ・権限・課金・障害を分離）。

## 🚨 絶対ルール（例外なし・最優先）

**いかなる実装（コード変更・ファイル生成・スキャフォールド・依存追加・設定変更）も、以下のステップを経ずに着手しない。**

1. **Markdown で計画書（設計図）を作成する** — 保存先 `docs/design_<トピック>.md`。何を・なぜ・対象ファイル・影響範囲・リスク・検証計画・SEO 影響を含める（詳細は「実装フロー」章）。
2. **計画書をユーザーに提示し、明示的な承認（「これで進めて」等）を得る。**
3. **承認を得てから実装に進む。** 承認前は 1 行もコードを変更しない。

この「**計画書（md）→ 承認 → 実装**」の順序は、変更規模の大小に関わらず省略しない。迷ったら手を止めて計画書を出す。詳細な必須項目と進め方は後述の「実装フロー（設計図の承認が必須）」に従う。

4. **デプロイも承認必須。** 実装が完了しても、ユーザーの明示的な指示（「デプロイして」等）なしに本番へデプロイしない。ビルド・ローカル検証までで止めて報告する。
5. **会話の流れや細部の確認回答（「JPGでOK」等）を実装・デプロイの承認と解釈しない。** 承認は仕様書全体に対する明示的な着工指示のみ（2026-07-21 発注者指示）。
6. **デプロイ承認後の作業完了時は、コミットに加えて `git push` まで行う（またはプッシュ可否を確認する）。** 未プッシュのコミットを溜めない — ローカル障害時の損失を防ぐ（2026-07-21 発注者指示）。

## 🎨 ブランドガイドライン（デザイン変更時に必ず参照）

- 一次ソース: `docs/brand/Brandguidelines_yah.pdf`／要点: `docs/brand/brand-reference.md`
- 🚨 **カラーパレットは Black `#000000` / White `#FFFFFF` / Light Gray `#F7F7F7` / Gray `#D7D7D7` のモノクローム4色のみ。** 青・赤等の差し色は使わない（旧サイトの青 `#2B5BE8` は違反として全廃済み）。新しい色が必要と感じたら追加せずユーザーに相談する。
- フォント: EN = National 2（自ホストWOFF2）、JP = 游ゴシック/游明朝。ロゴは `LogoYah.astro` のSVGを無改変で使用（変形・着色・エフェクト禁止）。
- UI・スタイルを変更する際は、実装前にこのガイドラインとの整合を確認する。

## 📋 最新の全体計画書（着手前に必ず参照）

**[docs/plan_master_2026h2.md](docs/plan_master_2026h2.md)** — 直販基盤P1 × コンテンツ × 広告の順序・判断ゲート・決定済み方針。
個別の正本は各 `docs/design_*.md`（予約基盤は [design_booking_p1.md](docs/design_booking_p1.md)）。

## このプロジェクトの存在理由（最重要の設計原則）

旧 yah.homes は「サイトはあるが検索の入口に接続されていない」状態だった。作り直しはこの一点を解くためにある。以下は機能要件ではなく**憲法**として扱う。

- 🚨 **インデックス対象の全ページは、JS 実行なしで本文・見出し・メタが読める完全な HTML を返す（SSG）。** コア内容をクライアントサイドのみでレンダリングしない。「ブラウザで見えるからOK」ではなく「curl / Googlebot で中身が返るか」で判断する。
- 🚨 **UA（User-Agent）でボットと人間に別 HTML を出し分けない。** 旧実装の `prerender.ts` 方式（クローキング的・バグの温床）は復活させない。全 UA に同一の HTML を配信する。
- **リダイレクトは Firebase Hosting の `redirects`（実 HTTP 301）で行う。** JS（`<Redirect>` 等）でのクライアント側リダイレクトをインデックス対象パスに使わない。旧サイトはこれで 11 ページが未インデックス化していた。
- **title / meta description / canonical / hreflang / JSON-LD はビルド時にページごとへ焼き込む。** 全ページ同一タイトルにしない（旧サイトの既知バグ）。多言語（en / ko / zh / th）は hreflang と canonical を機械生成で実体と一致させる。
- **sitemap・robots.txt・llms.txt はビルドで自動生成し、実在ページと一致させる。** 存在しないパス（旧 `/zh-cn/` 等）を宣言しない。
- React アイランドは「動く部分だけ」（予約カレンダー・問い合わせフォーム・言語切替 UI 等）に限定し、コンテンツ本体は静的 HTML に置く。

判断に迷う変更は「Googlebot がこの URL を curl したとき、意図した中身が返るか」を基準にする。

## 参照元（旧実装）

- `_reference_original/` に旧 Manus 実装一式を保管（**参照専用・ビルド対象外**）。UI コンポーネント（`client/src/components/ui/` の Radix ベース 53 点）、翻訳（`client/src/i18n/translations.ts`）、物件・ローカルデータ（`client/src/data/*.ts`）、ページ別メタ／JSON-LD の**中身**（旧 `server/_core/prerender.ts` の `PAGE_META`）は再利用価値が高い。
- 🚨 再利用は「中身（データ・マークアップ・スキーマ）」に限る。**仕組み（UA 判定ミドルウェア・wouter ルーティング・Express/tRPC/Drizzle 層）は移植しない。** コピーではなく、Astro/SSG 前提で組み直す。

## ブランチ運用（重要）

- GitHub: `kazuyoshi228/yah-homes-v2`（リモート origin は SSH：`git@github.com:kazuyoshi228/yah-homes-v2.git`）。
- 開発は **`dev` ブランチ**にコミットする。**`main` へ直接コミットしない。**
- 本番リリース時のみ `dev` → `main` にマージする（`main` は初回リリース時に作成）。

## デプロイ運用（重要 — 取り違え厳禁）

| 対象 | ブランチ | コマンド | 反映先 URL |
|---|---|---|---|
| 確認用（dev） | `dev` | `firebase hosting:channel:deploy dev --expires 30d --project yah-homes` | https://yah-homes--dev-zk8qztud.web.app （ハッシュ `zk8qztud` はチャンネル固定・失効時は再デプロイで延長） |
| 本番 | `main` | `scripts/safe-deploy.sh live（BOOK_PREVIEW=1・必須ページ/計測タグ検査つき。素の firebase deploy は2026-08-17の本番404事故の原因のため使わない）` | https://yah.homes（独自ドメイン接続済み）

- 🚨 **本番リリース（`firebase deploy --only hosting` / `main`）は、必ずユーザーの明示的な指示があるときのみ実行する。AI は自発的に本番へデプロイしてはならない。** 変更が完成しても、デプロイは提案にとどめ、「デプロイして」等の指示を待つ。
- `dev` の内容は dev チャンネル URL にのみデプロイする。本番（`firebase deploy`）は `main` をリリースするときだけ。
- dev チャンネル URL のハッシュはチャンネル固定（再デプロイしても不変）。プレビューチャンネルは失効するため `--expires 30d` を付け、必要に応じ再デプロイで延長。
- 🔧 TODO: 独自ドメイン `yah.homes` の Hosting 接続（DNS 切替）後、本番 URL をここに確定させる。移行前後で URL 構造を変えない（リダイレクト設計を最小化する）。

## dev チャンネルの注意点

- **バックエンドは本番と共有**：dev チャンネルも Firestore / Functions / Auth は `yah-homes` プロジェクトの同一データを使う。dev での予約・問い合わせ送信は本番データに書き込まれる。
- 🔧 TODO: App Check / bot 保護（reCAPTCHA 等）を導入する場合、dev チャンネル URL を許可ドメインに追加しないとフォーム系がブロックされる。導入時にここへ明記する。

## 実装フロー（設計図の承認が必須）

🚨 **コード実装に入る前に、必ず「実装に向けた実施設計図（設計書）」を Markdown で作成し、ユーザーの承認を得てから実装に進む。承認前にコードは変更しない。**

1. 設計図を Markdown で作成する（保存先：`docs/design_<トピック>.md`）。最低限、次を含める：
   - 背景・目的（何を・なぜ）
   - 対象ファイルと変更方針（実コードを確認したうえでの、実際のファイル／該当箇所）
   - 影響範囲・リスク・代替案
   - テスト／検証計画（型チェック・テスト・ビルド出力の HTML 確認・プレビュー確認）
   - **SEO 影響（インデックス対象なら、生成 HTML に title/meta/canonical/hreflang/JSON-LD が正しく焼き込まれるか）**
   - 作業指示書がある場合は、実コードとの差異を明記する
2. 設計図を提示し、ユーザーの承認（「これで進めて」等の明示的な合意）を得る。**承認を得るまでコードには着手しない。**
3. 承認後に実装 → 検証（型チェック＋テスト＋ビルド＋プレビュー）→ `dev` にコミット、という順で進める。
4. 設計図の粒度は変更規模に比例させてよい（小さな修正は簡潔で可）。ただし「作成 → 提示 → 承認」の手順は省略しない。
5. 本番デプロイは、実装・検証・dev 確認のあと、別途ユーザーの明示指示で行う（上記デプロイ運用参照）。

## ビルド / 環境

- **Node 22 必須**。ローカルは PATH にバージョンマネージャ配下を追加して使う：
  - node / npm：`~/node22/bin`（v22.13.0）
  - pnpm / firebase：`~/node-lts/bin`
  - 非対話シェルで `node: command not found` になる場合は、コマンド先頭で `export PATH="/Users/kazuyoshi228/node22/bin:/Users/kazuyoshi228/node-lts/bin:$PATH"` を通す。
- 依存管理は **pnpm**。パッケージ追加は `pnpm add <pkg>`。🚨 `npm install` / `npm add` は `node_modules`（.pnpm レイアウト）と衝突するため使わない（`npm run <script>` の実行は可）。
  - ビルド：`pnpm build`（Astro。出力 `dist/`）。Hosting の `public` は `dist`。
  - 型チェック：`pnpm exec astro check` ＋ `pnpm exec tsc --noEmit`
  - 自動テストは未整備（v5 §8-2 #9）
  - プレビュー：`pnpm dev`（Astro dev server / 右ビューア）
- `functions/` は別管理（独自 `package-lock.json`、npm）。依存は `functions/` 内で `npm install`、ビルドは `npm run build`（tsc）、テストは `npm test`。
- Firestore エミュレータ用に Java（`~/jdk21`）を使用。エミュレータ起動：`firebase emulators:start`。

## 運用ルール（AI が守ること）

- **本番デプロイはユーザー指示が必須**（上記デプロイ節参照）。dev チャンネルへのデプロイも、明示指示または合意のうえで行う。
- **本番データを変更する前に、必ず読み取り専用で現状を確認する。** 移行スクリプトは実行前にドライラン相当の確認をし、対象 0 件なら実行しない。
- **作業指示書／仕様書は古いスナップショット前提のことがある。** 旧 `_reference_original/` のパスやファイル構成（Express/tRPC/wouter 前提）は新構成と異なる。**実コードを確認してから実装し、差異はユーザーに報告する。**
- **インデックス対象ページを変更したら、ビルド後の生成 HTML を確認する**（`dist/` を grep、または curl でローカルプレビュー）。「ブラウザ表示」だけで判断しない。
- UI 変更はプレビュー（Astro dev server / 右ビューア）で確認してからコミットする。
- コミット前に型チェック＋関連テスト＋ビルドを通す。
- **firebase CLI の認証切れ（invalid_rapt / reauth 要求）は AI 側で解決できない。** ユーザーに `firebase login --reauth` を依頼する。
- Storage への新規アセットは公開 ACL（allUsers:READER）を付与し、Cache-Control 1 年で配信されるため差し替え時は新ファイル名にしてキャッシュ汚染を避ける。
- **シークレットは扱わない・貼らない・コミットしない**（reCAPTCHA シークレット鍵、GitHub PAT `ghp_...` 等）。reCAPTCHA サイトキーは公開値なので可。`.env` は gitignore。
- コミットメッセージは**日本語＋種別プレフィックス**（feat/fix/perf 等）。末尾に `Co-Authored-By: Claude <noreply@anthropic.com>` を付与。

## 変更してはいけない / 前提

- 🚨 **GA4計測の生命線: `src/layouts/BaseLayout.astro` の `window.gtag = gtag;` を削除・移動しない（2026-08-18 修正・デプロイ済み）。** Astro の `define:vars` はインラインスクリプトを IIFE でラップするため、この1行がないと `function gtag()` がグローバルに出ず、`window.gtag?.(...)` で送る全カスタムイベント（book導線の `availability_requested`/`begin_checkout`/`booking_complete_viewed`、contact の `contact_submit`）が**エラーも出さずに全滅**する。checkout の `gtag("get")` も失敗して purchase が Unassigned になる（過去に実際に起きた）。GA4スクリプト周りをリファクタする場合も、`window.gtag` がグローバルに公開されている状態を必ず維持し、デプロイ後に本番コンソールで `typeof window.gtag === "function"` を確認すること。
- 🚨 **セキュリティルール（`firestore.rules`）／ Cloud Functions（`functions/src/*`）／ Storage ルール（`storage.rules`）は、ユーザーの許可なく変更しない。** セキュリティ・課金・データ整合に直結するため、変更が必要な場合はまず内容を提案し、承認を得てから実施する（デプロイも同様にユーザー指示が必須）。
- 🔧 **Beds24 連携（予約カレンダー同期・webhook）** は旧実装（`_reference_original/server/webhooks/`）を参照しつつ Functions へ移植予定。認証・鍵の扱いは設計図で確定させるまで実装しない。
- **magazine.yah.mobi との連携**：`/locals` 等でグルメ・ローカル記事を magazine 側の Firestore から取り込む構想（コンテンツの一次ソースは magazine に一本化）。SEO 上重要な埋め込みは**必ず SSG でビルド時に焼き込む**（クライアント fetch は AI クローラーに見えない）。magazine 記事更新をトリガーに再ビルドする方式を設計図で決める。

## リポジトリ構成メモ

- 🔧 TODO：Astro 雛形の確定後に実構成を追記する。想定：
  - フロント：`src/pages/`（ルート＝URL・言語別）、`src/components/`（静的＋ React アイランド）、`src/layouts/`、`src/i18n/`、`src/data/`
  - SEO 資産：`src/pages/sitemap.xml.ts` 等でビルド生成、`public/robots.txt`・`public/llms.txt`
  - バックエンド：`functions/src/`（問い合わせ送信・予約・Beds24 webhook などの動的処理のみ。ページ配信は Functions を使わず Hosting から静的配信）
  - 共有：`shared/`（types / schemas。Firebase Callable は undefined→null 変換のため任意項目は zod `.nullish()`）
- 物件は現状 **Kiyokawa（清川・最大7名）** と **Takasago（高砂・最大6名）** の2棟。データは `_reference_original/client/src/data/{kiyokawaData,takasagoData,localsData}.ts` を移植元とする。

---

### 現在地（2026-08-18）

- 直販 /book 本番稼働（Stripe本番・実決済/返金検証済み）・My Page・メッセージ/問い合わせスレッド・チャットサポート（chat.yah.homes）稼働
- 管理画面21ページ・/admin/properties は7ビュー（基本情報/施設概要/設備/移動・距離/チャット用情報/QRコード/共通情報）
- 宿の事実は property_facts（71フィールド×2棟＋meta）に完全集約・check-consistency が毎ビルド検査


## 仕様書・設計書の書式（2026-08-18 発注者指示）

- **仕様書・設計書・計画書はチャット出力で終わらせず、必ず `docs/*.md` として保存しコミットする**
  （GitHub 上でそのまま閲覧・レビューできる形に統一）。
- 命名は既存踏襲: `design_<題材>_v<版>.md` / `plan_<題材>_<YYYYMM>.md` / `analysis_…` 等。
- 冒頭に必ず「起票日・状態（ドラフト＝未承認・未着工 ／ 承認済み）」を明記し、
  承認・着工・完了のタイミングで状態行を更新する。
- 表・コード枠・図を活かした GitHub レンダリング前提の Markdown で書く。

## SSoT・重複禁止の原則（2026-08-18 全面監査で確立・違反はビルドが落ちる）

- **宿の事実（定員・時刻・住所・距離・設備・キャンセル日数）はコードに書かない。** 正本は Firestore `property_facts`（/admin/properties）。表示は `getPropertyFacts()`＋`{ci}/{co}/{cap}/{d}` 差し込み（`lib/factText.ts` の `makeFill`/`fillDeep`）、メールは `ssotProp()`。
- **集約先が決まっている定数を直書きしない**（scripts/check-consistency.mjs §10 が機械検査）:
  Functions URL→`adminConfig.ts` の `ENDPOINTS` / チャットURL・QRパス→`lib/chatLinks.ts` / 電話→`seo.ts` の `OPERATOR_PHONE` / サイトURL→`seo.ts` の `BASE_URL`（functions側は `mail-template.ts` の `SITE_URL`）/ 施設表示名→`lib/propNames.ts` / 施設ラベル対訳→`data/adminChatInfo.ts` の `CHAT_PROPS` / Firebase SDK版→`adminConfig.ts` の `FB_SDK` / Beds24 ID対応・SA・GA4→`functions/src/beds24Client.ts` / メール共通文言→`mail-template.ts`（`BRAND_FOOTER`・`MAIL_NOREPLY`）。
- **fail-closed**: SSoT が読めないときは既定値に倒さず、止める・断る・警報（`notifyError`）。「読めなければ送る/受ける」を書かない。
- **check-consistency.mjs は本文の実ファイルを検査する**（言語分割後の `src/data/{kiyokawa,takasago}/*.ts`）。データファイルを分割・移動したら検査対象も必ず追随させること（2026-08-18 に旧バレル検査で全検査が空振りしていた事故の教訓）。


## 並行スレッド運用（2026-08-25 発注者承認・S1/S2）

- **agencyApi の本番デプロイは push すれば CI が行う（S3・2026-08-25）**——functions/ に触れる
  main への push で tsc → deploy（衝突は concurrency で直列化）。手元の `./deploy-functions.sh` は非常用
- **新しいエンドポイントは `functions/src/agency/routes/` の担当ファイルへ足す（S4・2026-08-25）。**
  api.ts は認証とCORSだけ——触らない。route: props / finance / analytics / contracts / ops
- git 事故防止（2026-08-25）: `pull.rebase=true`・`rebase.autostash=true` 設定済み（.gitローカル。
  クローンし直したら再設定）。**編集したら pull の前に commit（add は担当ファイルだけ・`git add -A` 禁止＝並行スレッドの編集を巻き込まない）** ——dirty なまま pull して
  未コミット編集を失う事故が実際に起きた。未追跡ファイルの衝突は退避してからやり直す
- yah-os 側の鉄則は yah-os/CLAUDE.md
