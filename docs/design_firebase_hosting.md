# 設計図：Firebase Hosting 接続（Phase 1・静的配信）

- 作成日: 2026-07-13
- ステータス: **承認済み（2026-07-13・バックエンドも今スキャフォールドする方針で確定）→ 実装可**
- スコープ変更: 「静的のみ」→「**静的配信 + Functions/Firestore の足場作成**」。ただしデプロイは段階分け（下記 §4）。
- 対象: `kazuyoshi228/yah-homes-v2`（ブランチ `dev`）／ Firebase プロジェクト `yah-homes`
- 前提: `firebase login` 済み（kazuyoshi.yamada@bonfire.co.jp）。デフォルトサイト `https://yah-homes.web.app`。

---

## 1. 背景・目的

Astro でビルドした静的サイト（`dist/`・35ページ）を Firebase Hosting（プロジェクト `yah-homes`）から配信できるようにする。**本フェーズは静的配信のみ**。Functions / Firestore は使わない（問い合わせは UI のみ・予約は外部 iframe のため、動的処理は現時点で不要）。

まず **dev チャンネルにデプロイして実URLで確認**するところまでを範囲とする。本番（`yah-homes.web.app` / 独自ドメイン）へのデプロイ・DNS 切替は含めない。

---

## 2. スコープ

### 含む
- `firebase.json`（Hosting + **functions + firestore セクション**）と `.firebaserc`（`yah-homes` 紐付け）
- 末尾スラッシュ整合（Astro `trailingSlash: 'always'` ↔ Hosting）
- レガシーパスの **実 HTTP 301 リダイレクト**（旧サイトの JS リダイレクト未インデックス問題への回答）
- 静的アセットのキャッシュヘッダ
- **Functions 足場**（`functions/`・TypeScript・Node 22・health チェック1本のみ。実機能は今後）
- **Firestore ルール足場**（`firestore.rules` = 全 deny のロックダウン初期値・`firestore.indexes.json` 空）
- **Storage ルール足場**（`storage.rules` = 認証必須の最小）
- **Hosting のみ dev チャンネルへデプロイ**（`firebase hosting:channel:deploy dev`）と実URL確認

### 含まない（別フェーズ）
- 本番デプロイ（`firebase deploy --only hosting`）— CLAUDE.md 通りユーザーの明示指示が必須
- 独自ドメイン `yah.homes` の接続・DNS 切替（現行 Manus 稼働中のため慎重に別途）
- **Functions / Firestore の実デプロイ**（下記の前提が整うまで足場のみ）
- 問い合わせ送信・Beds24 webhook・magazine 連携などの実ロジック（機能フェーズで実装）

### 🔧 バックエンド・デプロイの前提（ユーザー実施が必要）
Functions/Firestore を**デプロイ**するには、事前に以下が必要（足場ファイル作成には不要）:
1. **Firestore データベースの有効化**（Firebase コンソール or `firebase firestore:databases:create`）
2. **Blaze（従量課金）プランへのアップグレード** — Cloud Functions のデプロイに必須
3. これらが済んだら `firebase deploy --only firestore:rules,functions --project yah-homes`（rules は deny 初期値なので安全）

---

## 3. 作成するファイル

### `.firebaserc`
```json
{ "projects": { "default": "yah-homes" } }
```

### `firebase.json`（案）
```jsonc
{
  "hosting": {
    "public": "dist",                    // Astro の出力先
    "trailingSlash": true,               // Astro directory出力(/ko/)に合わせ末尾スラッシュ統一
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "redirects": [
      // 旧サイトの JS リダイレクト起因の未インデックスを、実301で解消
      { "source": "/home", "destination": "/", "type": 301 },
      { "source": "/ko/home", "destination": "/ko/", "type": 301 },
      { "source": "/zh/home", "destination": "/zh/", "type": 301 },
      { "source": "/th/home", "destination": "/th/", "type": 301 },
      { "source": "/korean", "destination": "/ko/", "type": 301 }
    ],
    "headers": [
      { "source": "/_astro/**",       "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/fonts/**",        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/assets/**","headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  }
}
```

補足：
- **Functions/Firestore セクションは作らない**（静的のみ）。将来 `contact` を足す時に `functions` を追記する。
- `/_astro/**`（フィンガープリント付き）・`/fonts/**`（安定）・`/assets/**`（ファイル名にハッシュ有り）は immutable キャッシュで安全。HTML はデフォルト（短期）で、再デプロイ時に更新される。
- `redirects` の宛先は末尾スラッシュ付き（`trailingSlash: true` と整合）。

---

## 4. デプロイ手順（承認後）

1. `firebase.json`・`.firebaserc` を作成（コミット）。
2. `pnpm build` で `dist/` を生成。
3. **dev チャンネルへデプロイ**：
   `firebase hosting:channel:deploy dev --expires 30d --project yah-homes`
   → `https://yah-homes--dev-XXXXXX.web.app` の実URLが発行される（ハッシュはチャンネル固定）。
4. 実URLで表示・言語切替・リダイレクト・iframe を確認。
5. 確認URLを CLAUDE.md のデプロイ表に記録。

🚨 **本番（`firebase deploy`）は実行しない。** dev チャンネルは本番サイト（`yah-homes.web.app`）にも現行 Manus サイトにも影響しない。

---

## 5. 影響範囲・リスク

- **影響範囲**：新規ファイル2つ＋dev チャンネル（隔離環境）。現行の稼働サイト（Manus 上の yah.homes）・本番 Firebase サイトには一切触れない。
- **リスク**：
  - dev チャンネルURLは reCAPTCHA/App Check 等を入れていないため、フォーム系のブロック懸念は無し（Phase 1 は送信無し）。
  - Beds24 iframe が dev チャンネルの別オリジンで表示されるか要確認（外部埋め込みなので通常問題ないが、実URLで確認する）。
- **代替案**：`firebase init hosting` の対話実行でも同じ結果になるが、対話プロンプトを避け、静的のみの最小構成を手書きする方が確実（既存 `dist/` を上書き設定しない・不要な GitHub Actions 連携を作らない）。

---

## 6. テスト／検証計画

- dev チャンネル実URLで：
  - トップ・各言語（`/`・`/ko/`・`/zh/`・`/th/`）が表示される
  - `/home` → `/`、`/ko/home` → `/ko/` が **301** で飛ぶ（`curl -I` で確認）
  - Kiyokawa/Takasago の Beds24 iframe が表示される
  - フォント（National2）・画像（manus-storage）が配信される
  - `curl` で HTML に title/canonical/hreflang/JSON-LD が入っている（SSGの再確認）

---

## 7. 要承認

1. 上記 `firebase.json`（静的のみ・301リダイレクト・キャッシュヘッダ）の構成で良いか。
2. 初回は **dev チャンネルのみ**デプロイ（本番は後日ユーザー指示）で良いか。
3. レガシー301の対象（`/home`・`/ko|zh|th/home`・`/korean`）はこれで十分か（他に旧URLがあれば追加）。

**承認後、ファイル作成 → build → dev チャンネルデプロイまで進めます。**
