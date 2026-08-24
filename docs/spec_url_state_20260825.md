# 仕様書 — yah.OS のURL設計（並行スレッド運用に合わせた見直し）

- 状態: **提案・未実装（承認待ち）**
- 起票: 2026-08-25
- きっかけ: 「担当カード宣言に伴ってURLも見直して。なるべく細かくURLで区分けしたい。AIにとって分析しやすいのは？」（発注者）

---

## 1. 結論 — パスは今のまま、状態をクエリ文字列に統一する

```
https://os.yah.homes/{カード}.html?prop={棟}&tab={タブ}&item={行}
```

**パス（ファイル名）＝カード＝担当スレッド** の1対1は崩さない。細かくするのは
パスではなく**クエリ**。ハッシュ（#…）は使わない。

例:
```
/properties.html?prop=kiyokawa&tab=longterm&item=kiyokawa-lt-gaiheki
/reports.html?view=cvr&prop=takasago
/maintenance.html?tab=cal&prop=kiyokawa&ym=2026-09
/contracts.html?cat=運営委託&item=ops-airstar
```

## 2. なぜクエリか（＝AIにとって分析しやすいのはどれか）

| 方式 | サーバログに残る | 貼れば同じ画面が再現 | 機械可読 |
|---|---|---|---|
| ハッシュ `#物件/t=ct;p=kiyokawa`（現状の一部） | **✕ 送信されない** | △ 独自書式で解析が要る | ✕ 独自区切り（; =） |
| **クエリ `?prop=kiyokawa&tab=ct`** | **○** | **○** | **○ 標準ライブラリで一発** |
| パス深掘り `/properties/kiyokawa/ct/` | ○ | ○ | ○ だがリライト設定が要り、ファイル＝カードの1対1が壊れる |

AIにとっての価値は3つ:
1. **「この画面バグる」＋URLだけで、カード・棟・タブ・行まで特定できる**。
   今日の定期レポートのバグ調査は「どの画面のどの状態か」の特定から始まった——URLが状態を全部持っていれば一往復で済む
2. ハッシュはサーバに送信されないため**Hostingのログに残らない**。クエリなら残る＝後からアクセス分析ができる
3. 独自書式（`t=ct;p=kiyokawa;s=sum`）は毎回パーサを書くことになる。`URLSearchParams` で読める標準形に寄せる

## 3. キーの標準（全カード共通・ここが本体）

細かさより**全カードで同じキー名**が効く。カードごとに書式が違うと、AIは毎回定義を調べることになる。

| キー | 意味 | 値の例 |
|---|---|---|
| `prop` | 棟 | `kiyokawa` / `takasago` / `ropponmatsu` / `otemonA` / `otemonB`（FirestoreのドキュメントIDと同一） |
| `tab` | カード内のタブ | 各カードの data-t / data-view の値と同一 |
| `item` | 選択中の行 | FirestoreのドキュメントID と同一 |
| `ym` | 年月 | `2026-09` |
| `q` | 検索語 | 自由文字列 |
| `embed` | 埋め込みフラグ（既存） | `1` |

原則: **URLの値 ＝ Firestore のID・コードの識別子と同一文字列**。翻訳表を作らない
（`prop=清川` ではなく `prop=kiyokawa`。日本語はURLエンコードで別文字列になりログが読みにくい）。

## 4. 実装の形（承認後）

1. **os-core.js に共通ヘルパを1つ**（共有部＝専用スレッド1本で実施）:
   ```js
   export const urlState = {
     get: (k) => new URLSearchParams(location.search).get(k),
     set: (patch) => {  // 画面遷移なしでURLだけ書き換える（history.replaceState）
       const p = new URLSearchParams(location.search);
       for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v);
       history.replaceState(null, "", "?" + p);
     },
   };
   ```
2. **各カードの配線は担当スレッドが自分のカードで行う**（並行運用の型と一致する——
   タブ切替時に `urlState.set({tab})`、初期表示で `urlState.get("tab")` を読む。1カード30分程度）
3. index.html のハッシュルーティング（`#物件/t=ct;p=…`）は `?card=物件&…` に置き換え、
   内側のiframeへクエリを転送する（共有部・専用スレッド）
4. パスのリライト（`/properties/kiyokawa/…`）は**やらない**。見た目の美しさ以外の利得がなく、
   ファイル＝カード＝スレッドの1対1が壊れる

## 5. 導入順

| 順 | 内容 | スレッド |
|---|---|---|
| 1 | os-core.js に urlState（＋この仕様書のキー表をCLAUDE.mdへ転記） | 共有部スレッド1本 |
| 2 | 各カードの配線 | 各担当スレッドが随時（並行可） |
| 3 | index のハッシュ→クエリ移行 | 共有部スレッド1本 |
