# 計画書: ガイド配管 — magazine Firestore → yah.homes /guides/ 描画

日付: 2026-07-14 / ステータス: **実装済み（2026-08-18 状態行を実態に同期）
関連: content_strategy_yah_homes.md（目標: オーガニック月1,000人）/ magazine Blueprint v9 §7-1（頭⑤ yah.homes配信）・§8-2（編集=別プロジェクト、公開=静的パブリッシュ）

## 0. 一行要約

**編集はmagazineのCMS（Firestore・品質ゲート・承認フロー）、表示はyah.homes（Astro SSGが自ブランドのデザインで /guides/ を静的生成）。** 記事1本目 `fukuoka-villa`（Firestore draft投入済み）をパイロットとして通す。

```
[胴体] magazine CMS ── status:published & distribution:[homes]
          │
[配管]    │  公開JSONフィード（方式B・推奨）
          ▼
[頭]   yah.homes ビルド時に取得 → /{lang}/guides/{slug}/ を静的生成
          → canonical・JSON-LD・sitemap・llms.txt は yah.homes 側で完結
```

---

## 1. 受け渡し方式の比較（A/B）

| | 方式A: Firestore直読み | 方式B: 公開JSONフィード（推奨） |
|---|---|---|
| 仕組み | yah.homesビルドがfirebase-adminでmagazineのFirestoreを直接クエリ | magazineのseoserverに `GET /feeds/homes.json` を追加し、yah.homesビルドがfetch |
| 認証 | **別プロジェクトのADC/サビ垢が必要**（今日invalid_raptで期限切れを経験＝ビルドが認証に依存し脆い） | **不要**（公開フィード。中身は公開予定の記事のみ） |
| 結合度 | 密（スキーマ変更が直撃） | 疎（フィードが契約。中間で整形できる） |
| デバッグ | 難（admin SDK経由） | 易（curlで見える） |
| 追加実装 | yah.homes側のみ | magazine側に小さなエンドポイント1本 |
| 障害波及 | magazine側の権限変更でyah.homesビルドが壊れる | フィード互換を保てば独立 |

**採用: 方式B。** Blueprint §8-2「爆発半径の分離」に合致。draftは絶対にフィードに載せない（公開＝status:published のみ）ため、情報漏えい面も安全。

## 2. フィード仕様（magazine側・新規）

- **URL**: `https://magazine.yah.mobi/feeds/homes.json`（seoserver=既存Cloud Functionにルート追加）
- **抽出条件**: `status == "published"` **かつ** `distribution` array-contains `"homes"`
- **形**（配列）:

```json
[{
  "slug": "fukuoka-villa",
  "layer": "1.5", "hesitation": "anxiety",
  "handoff": ["/booking/kiyokawa", "/booking/takasago"],
  "primaryQuery": "福岡 ヴィラ",
  "confirmedDate": "2026-07-14",
  "publishedAt": 1770000000000, "updatedAt": 1770000000000,
  "thumbnailUrl": null,
  "languages": ["ja"],
  "translations": {
    "ja": { "title": "…", "excerpt": "…", "body": "(Markdown)",
             "directAnswer": "…", "metaTitle": "…", "metaDescription": "…",
             "faq": [{"q": "…", "a": "…"}] }
  }
}]
```

- キャッシュ: `Cache-Control: public, max-age=300`（Firestore読取コストは無視できる規模）
- **magazine表示面からの除外**: distributionに `esim`/`guides` を含まない homes専用記事は、magazine.yah.mobi の記事ページ・sitemap・llms.txt に**載せない**（重複とcanonical混乱の根絶）

## 3. yah.homes側の実装

### 3-1. 取得
- `src/lib/guides.ts`: ビルド時にフィードをfetch。**取得失敗はビルド失敗**（静かにページが消えるのを防ぐ）
- 言語マッピング: magazine `zh-TW` → yah.homes `zh`。`th` はmagazine未対応のため、翻訳が存在する言語のみページ生成

### 3-2. ルーティング（既存の[...locale]文法に準拠）
```
/guides/{slug}/            … en（翻訳がある場合のみ）
/ja/guides/{slug}/         … ja
/ko/… /zh/…                … 同様
/{lang}/guides/            … ガイド一覧（言語別・公開分のみ）
```
- 新規ファイル: `src/pages/[...locale]/guides/index.astro`・`src/pages/[...locale]/guides/[slug].astro`
- getStaticPathsはフィードの `languages` から生成（無い言語のURLは作らない）

### 3-3. 描画
- BaseLayout流用（既存デザイン文法・ヘッダー/フッター/nav）
- 本文: Markdown→HTML（marked等・ビルド時変換）。本文内の相対リンク `/booking/…` `/locals/…` は描画時に `localizedPath(lang, …)` でロケール接頭辞化
- 冒頭にdirectAnswerブロック（ホームの.direct-answerと同型）＋confirmedDate表示
- 末尾にhandoff（物件カードへの内部リンク）を明示的に描画
- JSON-LD: `Article`（headline/datePublished/dateModified/author=Organization）＋ `FAQPage`（faq配列から）
- **hreflang**: その記事に存在する翻訳のみ出力（BaseLayoutに `availableLocales?: Locale[]` プロップを追加。既存ページは従来どおり全言語）

### 3-4. canonical / noindex
- canonical = **自己参照**（`https://yah.homes/{prefix}/guides/{slug}/`）。magazine側には対応URLを作らないため相互canonicalは不要
- **noindexプレビュー**: 環境変数 `GUIDES_PREVIEW=1` のビルドではフィードの代わりにローカルMD（またはトークン付きdraftフィード＝将来）を含め、**全guidesページにnoindex**を付与し**devチャンネルにのみ**デプロイ。本番ビルドは published のみ＆index可
- 本番デプロイは従来どおり明示指示時のみ

### 3-5. sitemap / llms.txt / 内部リンク（水路）
- sitemap: @astrojs/sitemapが生成ルートを自動包含（追加作業なし）
- llms.txt: `## Guides` セクションを追加し公開ガイドを列挙（テンプレート拡張）
- 水路: 物件ページ・ホームに「関連ガイド」導線（フェーズ2。まず記事→物件の片方向で開始）

## 4. 公開フロー（運用）

```
1. Claude: content/guides/{lang}/{slug}.md 下書き → pnpm md:write（draft投入）
2. 編集者/あなた: magazine CMSで裏どり・仕上げ
3. あなた: CMSで status: published に（唯一の公開権限）
4. yah.homes を再ビルド＆デプロイ → /guides/ に反映  ★当面は手動（「本番へデプロイして」）
   （将来: Firestore onWrite → ビルドWebhookで自動化。フェーズ4）
```

## 5. 段階導入

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| 1 | magazineにフィードエンドポイント追加 | curlで fukuoka-villa（published後）が返る ※検証中はdraftも返す一時フラグ→削除 |
| 2 | yah.homesにguides取得+ページ生成+一覧 | devチャンネルで実物確認（noindex） |
| 3 | fukuoka-villa公開→本番反映→SC登録 | /ja/guides/fukuoka-villa/ がインデックス |
| 4（任意） | 公開→自動ビルドのWebhook | — |

## 6. 影響範囲・リスク

- magazine: functions/src/index.ts にルート1本追加（既存seoserverの爆発半径内・決済系に波及なし）
- yah.homes: 新規ページ2つ＋lib1つ＋BaseLayoutにオプションprop（既存ページは非破壊）
- リスク: ①フィード落ち→ビルド失敗で検知（静かな欠落なし） ②言語マッピング漏れ→生成対象をlanguagesで明示制御 ③本文Markdownの描画差（CMSプレビューとyah.homes描画）→フェーズ2のdevプレビューで目視確認をゲートにする
