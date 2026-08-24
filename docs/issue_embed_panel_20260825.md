# 不具合メモ — 埋め込み表示で右パネルが常に消え、400pxの死にスペースが出る

- 状態: **対応済み・本番反映済み（2026-08-25 共有部スレッド）**
  - 採った方針: 「埋め込みで右パネルを消すべきか」→ **消さない**。iframeはほぼ常に1100px未満で
    機能（分析結果・詳細）が死ぬため、埋め込みでは幅360pxで共存し、900px未満で列ごと消す
  - os-embed.js の空判定から index リンクを除外（keep-side誤発動＝150px左溝の解消）
  - 実測: iframe 800px → grid `150px 650px`（死にスペースなし）／1208px → パネル400pxで表示
  - 教訓: 修正のメディアクエリは **os.css の末尾** に置くこと。基底の embed/keep-side ルールより
    前に書くと同詳細度の後勝ちで無効化される（初回修正はこれで空振りした）
- 発見: 2026-08-25・定期レポート担当スレッド（?card=reports の検証中）
- 対象: **全カード共通**（os.css の埋め込み表示とメディアクエリの相互作用）

## 事象

1280pxの画面で index に埋め込むと、iframe幅は約1048pxになる。このとき:

1. os.css 107行目 `@media (max-width: 1100px) { .panel, .panel-resizer { display: none; } }` が
   **iframe内では実質常時発動**し、右パネル（定期レポートの分析結果・契約書類の詳細など）が消える
2. しかし embed / keep-side のグリッドは `… 5px var(--panel-w, 400px)` の列を確保したままなので、
   **右に約405pxの死にスペース**ができ、中央が493pxまで圧迫される（サブメニューの折返しもこれが原因）
3. 副次: 全カードで keep-side が発動している。os-embed.js の空判定
   `side.querySelector(".side-link, button, a")` に、side に残る「← カード一覧へ」リンク
   （CSSで非表示・DOMには残る）が常にヒットするため。結果、**空の150px左溝**が全埋め込みページにある

## 修正の方向（共有部スレッドで）

- embed時のメディアクエリを分ける: パネルを消すなら列も消す
  `@media (max-width:1100px){ body.embed .layout { grid-template-columns: minmax(0,1fr); }
   body.embed.keep-side .layout { grid-template-columns: 150px minmax(0,1fr); } }`
- そもそも埋め込みで右パネルを消すべきかは要判断（iframeはほぼ常に1100px未満＝機能が実質死ぬ）
- os-embed.js の空判定から index リンクを除外（`.side-link:not([href="index.html"])` 等）→ 150px溝の解消
