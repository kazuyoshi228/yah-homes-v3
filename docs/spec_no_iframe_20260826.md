# 仕様書 — yah.OS iframe全廃＋URL再々設計（MPA直遷移への転換）

- 状態: **承認済み・実装済み・本番デプロイ済み（2026-08-26）**
  - 実装: os-nav.js 新設／index.html ホーム化＋旧URL転送シム／全12カード一斉配線／os-embed.js 削除／
    os.css embed規則撤去＋osnav＋view-transition／firebase.json cleanUrls／CLAUDE.md 改訂
  - 検証: プレビューで全カード描画・コンソールエラー0・旧URL転送（/?card=maintenance&tab=cal&prop=kiyokawa → /maintenance?tab=cal&prop=kiyokawa で棟・タブ復元）を確認後、CI経由で本番へ
- 起票: 2026-08-26。きっかけ: 発注者「画面遷移のフラッシュのようにバババッとなる動作をどうにかして。iframe全部削除したら？」「URLも再度再設計して」
- 前提: spec_display_stability_20260826.md の原因判定は有効。本仕様はその **P1（キープアライブ等）を置き換える**上位案。発注者の指示どおり iframe を全廃する。

---

## 1. 結論 — iframeを消して「普通のWebサイト」に戻す

いまの構造は「index.html という外枠が、単一 iframe に各カードを差し込む」疑似アプリ。
バババッの正体は、この構造が**カード切替のたびに** (a) iframe 空白 → (b) 素のレイアウト露出 → (c) 埋め込み変形（サブナビ移設） → (d) モック → (e) キャッシュ描画 → (f) 本データ描画、と**最大6段の塗り直し**を走らせていること。段を1つ隠しても残りが見える——だから修正しても「治ってない」が続いた。

**新構造: 外枠を捨て、左ナビを各ページが持ち、カード切替は普通のページ遷移にする。**

```
旧:  os.yah.homes/index.html?card=properties   ← 外枠が iframe に properties.html?embed=1 を差し込む
新:  os.yah.homes/properties?prop=kiyokawa&tab=inv   ← properties.html がそのまま画面。外枠なし
```

- iframe・os-embed.js（トップバー消し・サブナビ移設・s=復元）・embed=1・postMessage・読み込み中マスク——**全部不要になり削除**。
- SPA化ではない。1カード=1HTML・単体で開ける・スレッド分離・障害隔離は**全て今のまま**。変わるのは「差し込むのをやめて直接開く」だけ。

## 2. URL の再々設計（3度目・これが最終形）

| 項目 | 設計 |
|---|---|
| カード | **パス＝カード**: `/properties` `/maintenance` `/finance` `/reports` `/contracts` …（firebase.json の cleanUrls で .html 省略） |
| 状態 | クエリ: `?prop=` `?tab=` `?item=` `?ym=` `?q=`（キー表は現行 CLAUDE.md のまま） |
| ホーム | `/` ＝ 今日ボード＋ヘルス（旧 index はここに縮退） |
| 書き込み | タブ・棟の切替時に **replaceState で即時反映**（iframe が無いので「外枠と中身の二重URL」問題が消滅し、自動反映を安全に復活できる） |
| 戻る/進む | ブラウザ標準がそのまま効く（旧構造では効かなかった） |
| 共有 | アドレスバーをコピーするだけ。「リンクをコピー」ボタンは撤去 |
| 旧URL互換 | `/index.html?card=X&…` と旧ハッシュ形式は `/X?…` へ1行リダイレクト（ブックマーク救済・6ヶ月後に削除） |

「URLは入口専用」（8/25決定）は iframe の内外二重構造への対症療法だった。構造が消えるので、**URL＝画面状態の完全な写像**という本来の姿に戻す。AIが「このURLでバグる」から状態を一発特定できる利点もこれで最大化。

## 3. 遷移フラッシュの根治（6段→最大2段）

1. **左ナビの共通部品化**: os-core.js に `<os-nav>`（Custom Element）を定義。各カードは body 先頭に `<os-nav active="properties"></os-nav>` の1行。ナビは静的な CARDS 配列から**同期描画**（health 待ちで空にならない。ドットは cachePaint で前回値→health 到着で更新）。
2. **描画は「キャッシュ即描き→本データは差分がある時だけ塗り直す」の最大2段に統一**: os-core.js に `boot({cacheKey, fetch, render})` ヘルパー。JSON 同一なら再描画しない。焼き込みモック（見本データ）は未ログイン時のみ表示し、ログイン済みの初回パスから除外。
3. **ページ遷移自体のなめらかさ**: 共有アセット（os.css/os-core.js）は immutable キャッシュでネットワーク往復ゼロ化＋ CSS `@view-transition { navigation: auto }`（Chrome はクロスフェード、非対応ブラウザは普通の遷移＝無害）。
4. 認証は各ページで IndexedDB から復元（現行どおり）。外枠が消えるので**親子二重 auth と自発リロード問題は構造ごと消滅**。

## 4. 工数と順序

| 順 | 内容 | 担当 | 工数 |
|---|---|---|---|
| 1 | os-core に `<os-nav>`＋CARDS 配列＋boot ヘルパー、os.css 整理、`/`（今日ボード）新設 | 共有部 | 1.5日 |
| 2 | 全カード一斉配線（os-embed 参照削除→os-nav 1行追加・自前topbar撤去・urlState 復活）——機械的変更なので共有部が一括実施（CLAUDE.md の定めどおり、カードスレッド停止時間帯に実施→即push） | 共有部 | 1日 |
| 3 | firebase.json（cleanUrls・旧URLリダイレクト・キャッシュヘッダ）、os-embed.js 削除、CLAUDE.md 改訂 | 共有部 | 0.5日 |
| 4 | 低速スロットリング検証（切替20回でフラッシュゼロ確認）→ 本番 | 共有部 | 0.5日 |

**計 3.5人日。** spec_display_stability の P0（済）はそのまま活き、P1 のキープアライブ・親auth一元化・postMessage は**不要になり実施しない**。

## 5. 何が消えるか（保守が軽くなる）

- os-embed.js 全体（サブナビ移設のDOM手術＝事故多発地帯）／embed=1 の全分岐／s= 復元契約／postMessage 往復／読み込み中マスクとタイムアウト／「リンクをコピー」実装／index.html の LINKS・openKey・boot・showHome の大半
- 各カードスレッドへの影響: 担当ファイルは変わらず1枚。「os-nav を置く・urlState で状態をクエリに書く」だけが新しい約束
