# 静的アセットのパス改名 `/manus-storage/` → `/assets/`（設計書）

- 起票: 2026-09-01（発注者指摘「なんでManus?」）
- 状態: **ドラフト＝未承認・未着工**。着手前に「7. 未決事項」の回答が必要
- 規模: 実装0.5日（＋検証）。デプロイは1回

## 1. 背景・目的

`public/manus-storage/` は、作り直す前のサイトを作った外部ツール **Manus** に由来する名前が
そのまま残ったもの。中身は yah.homes の正規アセット（画像239・フォント2・ロゴ2・PDF1／計25MB）で、
他社ツールとは無関係。以下の理由で改名する。

1. **ブランド上の不整合** — 公開URLに他社ツール名が出る（`https://yah.homes/manus-storage/...`）。
   ソースを見た第三者に「Manus製サイト」と誤認される
2. **由来の説明できなさ** — 新しく参加する人が「なぜこの名前か」を辿れない。旧実装の遺物が
   現行の一等地（公開パス）に残り続けている
3. SSoT・命名規約の整備を進めてきた流れ（2026-08 の全面監査）で、ここだけ手つかず

**目的は名前の正常化のみ**。中身・構造・配信方式は変えない。

## 2. 変更後のパス

`/assets/` を採用する。

| 候補 | 判断 |
|---|---|
| **`/assets/`** | **採用**。静的アセット置き場の一般的な名前で、画像・フォント・PDFを含む現状に合う |
| `/img/` | 不採用。フォント・PDFが入っているため実態と合わない |
| `/media/` | 不採用。`/assets/` ほど一般的でない |
| `/static/` | 不採用。Astro の `public/` と概念が重複して紛らわしい |

- ディレクトリ: `public/manus-storage/` → `public/assets/`
- 公開URL: `/manus-storage/**` → `/assets/**`
- **ファイル名は変えない**（`kiyokawa-gallery-001_b1729543.webp` 等はそのまま）。
  変更をパス1階層に閉じ込め、差分と事故の範囲を最小化する

## 3. 対象ファイル（実測・2026-09-01 時点）

参照は **146箇所 / 20ファイル**。

| 区分 | ファイル | 備考 |
|---|---|---|
| 画像パスの起点 | `src/data/properties.ts`（`IMG` 定数） | ギャラリー・外観の起点 |
| ページ・コンポーネント | `src/pages/**`（about / book / guides / locals / properties / how-to）、`src/components/**`（Hero・Story・Director・BookingConversion・PropertiesSection） | 直書きが散在 |
| データ | `src/data/localsData.ts` | ローカル記事の画像 |
| **SEO/OGP** | `src/lib/seo.ts`（`OG_IMAGE`・物件別OG・JSON-LD の `logo`） | **外部露出あり（後述）** |
| **メール** | `functions/src/index.ts`（予約確定メール等の物件画像） | **外部露出あり（後述）** |
| 設定 | `firebase.json`（`/manus-storage/**` の1年 immutable キャッシュ） | ヘッダのパターン |
| PWA | `public/manifest.json` | アイコン |
| ツール | `scripts/gen-image-variants.mjs` | 画像バリアント生成の出力先 |

## 4. リスク（最重要）— 外に出ているURLは消せない

改名して旧パスを消すと、**既に外部に出回っているURLが 404 になる**。

| 経路 | 内容 | 影響 |
|---|---|---|
| **送信済みメール** | 予約確定・前日案内などに物件画像を `<img>` で埋め込み済み | 過去メールの画像が表示されなくなる（受信箱に残り続ける） |
| **SNS・OGP** | Facebook/X 等が取得済みの `OG_IMAGE` | シェア済み投稿のサムネイルが割れる |
| **検索エンジン** | Google 画像検索がインデックス済み | 画像検索の流入を失う |
| **チャット・AI** | チャット回答やllms経由で案内した画像URL | 参照切れ |

### 対策: 旧パスから301リダイレクトを永続的に置く

`firebase.json` の `redirects` に以下を追加し、**恒久的に残す**（消さない）。

```json
{ "source": "/manus-storage/**", "destination": "/assets/:splat", "type": 301 }
```

- 実HTTP 301 なので、Googleは新URLへ評価を移す（CLAUDE.md のリダイレクト方針＝JSではなくHostingで行う、に合致）
- メール内の `<img>` もリダイレクトを追って表示される
- **この1行は将来も削除しない**。削除した瞬間に上記の全経路が壊れる（コメントで明記する）

## 5. 作業手順

1. `git mv public/manus-storage public/assets`（履歴を保つ）
2. `src/` `functions/src/` `scripts/` `public/manifest.json` の参照を一括置換（146箇所）
   - `IMG` 定数は `"/assets"` に。他はパス直書きを同様に置換
3. `firebase.json`：
   - キャッシュヘッダの `source` を `/assets/**` に変更（1年 immutable は維持）
   - `redirects` に旧パスの301を追加（§4）
4. 検証（§6）
5. デプロイ（hosting＋functions）。**functions も同時に出す**（メールの画像URLが変わるため）

## 6. 検証計画

| 項目 | 方法 | 合格条件 |
|---|---|---|
| 参照漏れ | `grep -rn "manus-storage" src/ functions/src/ scripts/ public/*.json` | ヒット0（`firebase.json` の redirects 行を除く） |
| ビルド | `BOOK_PREVIEW=1 npm run build` | 177ページ・エラーなし |
| 画像の実在 | `dist` 内の `/assets/` 参照をすべて抽出し、実ファイルの存在を突合するスクリプト | 欠損0 |
| 実行時 | `scripts/smoke-dist.mjs` | 全ページJSエラー0 |
| **リダイレクト** | デプロイ後に旧URLを curl | `301` → 新URLで `200`（メール画像の生存確認） |
| メール | `/admin/mail-preview` と実送信テスト | 画像が表示される |
| OGP | デプロイ後に Facebook/X のデバッガで再取得 | 新URLで画像取得OK |

## 7. 未決事項（着工前に回答が必要）

1. **パス名**: `/assets/` でよいか（§2の比較参照）
2. **実施タイミング**: 146箇所の一括置換のため、他の作業と重なると衝突しやすい。
   他スレッドの作業が落ち着いたタイミングで実施したい（希望日はあるか）
3. **旧301の扱い**: 恒久的に残す方針でよいか（推奨。消すと過去メール・SNSが壊れる）

## 8. やらないこと

- ファイル名の変更（ハッシュ付きの現行名を維持）
- 画像の再エンコード・最適化（別件）
- Firebase Storage への移設（Hosting配信のまま。storage.rules は触らない）
