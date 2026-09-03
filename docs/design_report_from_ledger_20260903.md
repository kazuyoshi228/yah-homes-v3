# 設計図: 戦略提案書を台帳から生成する（2026-09-03）

**発注者指示**「このHTML自体を全部焼き付けを無くしたら」→ **B案（台帳から自動生成）で承認**。

## なぜやるか

2026-09-03、30年後の清算額を1日のうちに**6回訂正した**。

| # | 訂正の中身 | 発見者 |
|---|---|---|
| 1 | 家族の元本を「返す」前提にしていた | 発注者 |
| 2 | 法人税の軽減枠（年800万以下25%）を1室ずつに与えていた | 発注者 |
| 3 | 築30年の建物を新築と同じ cap 6.0% で売る計算 | 発注者 |
| 4 | 「すぐ売るほうが4.55倍得」——原価の前提を混ぜていた | 発注者 |
| 5 | 家族への返済額がモデルの仮定（台帳と ¥30,000,000 違う） | 発注者 |
| 6 | `closing`（納税前）を期末残高として読んだ。正は `closingAfterTax` | 発注者 |

**6回とも、原因は同じである。数字がHTMLに焼き込まれていた。**
台帳が正でも文書が追随せず、間違いは人が読んで気づくまで残る。

yah-os の CLAUDE.md はこれを禁じている——**「HTMLに実在の金額・係数を書かない」**。
CI（`check-hardcoded.mjs`）が機械検査までしている。**提案書だけがその外にあった。**

## やらないこと

- **カードを置き換えない。** 画面は今までどおり `agencyApi` から生で読む
- **台帳に集計値を保存しない。** SSoT原則（保存してよいのは一次事実と人の判断だけ）
- **文章まで生成しない。** 生成するのは**数字だけ**。論旨は人が書く

## 仕組み

```
reports/<name>.tpl.html   テンプレート（人が書く。数字は {{key}} だけ）
        ↓  node tools/report-build.mjs
reports/out/<name>.html   公開用（数字が埋まった状態）
```

### ① テンプレート

数字は書かない。プレースホルダだけを置く。

```html
<p>2050年の現金は <strong>{{exit2050.cash}}</strong>。</p>
<p>売却の手取りは {{exit2050.saleNet}}、家族へ返す元本は {{family.corpPrincipal}}。</p>
```

- 書式は生成側で決める（`¥1,234,567`）。テンプレートに `¥` を書かない
- 未定義のキーを参照したら**生成を失敗させる**（黙って空にしない）

### ② 値の定義 `tools/report-values.mjs`

**1ファイルに集約する。** キーごとに「値」と「出どころ」を持つ。

```js
export async function values() {
  const r = await cashflow(360, ASOF, true);          // 台帳を実走
  const y2050 = r.yearly.find(v => String(v.year) === "2050");
  const v2050 = r.valuation.find(v => String(v.year) === "2050");
  return {
    "exit2050.cash":  { v: y2050.closingAfterTax,
                        src: "cashflow(360).yearly[2050].closingAfterTax（法人税・消費税の納付後）" },
    "exit2050.asset": { v: v2050.asset,
                        src: "cashflow(360).valuation[2050].asset（NOI÷assumptions/cap-rate）" },
    "family.corpPrincipal": { v: sum(famCorp, "principal"),
                        src: 'finance where entity="corp" and lender not like 銀行/公庫/金庫' },
    // …
  };
}
```

**掛け算・引き算もここに書く。** テンプレート側では計算しない。
「仲介手数料＝売却額×3%＋6万（税込）」「譲渡益＝売却額−土地の簿価−手数料」も、
式はここに1回だけ書く。**`derive.ts` に既にある式は、再定義せず import する。**

### ③ 生成 `tools/report-build.mjs`

1. `values()` を呼ぶ
2. テンプレートの `{{key}}` を置換。未定義キーがあれば **exit 1**
3. 出力の末尾に**出どころ一覧と生成時刻**を自動で付ける
4. `reports/out/` に書く

### ④ 検査 `tools/reportcheck.mjs`（CIに載せる）

yah-os の `check-hardcoded.mjs` と同じ思想。

- `reports/*.tpl.html` に `¥` ＋数字があれば**失敗**（「例:」付きは除外）
- テンプレートが参照するキーが `report-values.mjs` に無ければ**失敗**
- `report-values.mjs` の各キーに `src` が無ければ**失敗**（出どころのない数字を作らせない）

## 出どころの表を、文書に必ず付ける

生成物の末尾に自動で出す。今日の6回の訂正は、どれも
**「その数字がどこから来たか」が書いてあれば発注者が即座に見抜けた**ものだった。

| キー | 値 | 出どころ |
|---|---|---|
| exit2050.cash | ¥170,562,694 | `cashflow(360).yearly[2050].closingAfterTax` |
| exit2050.asset | ¥500,995,700 | `valuation[2050].asset`（`assumptions/cap-rate` 6.0%） |
| family.corpPrincipal | ¥186,031,628 | `finance` entity="corp"・非銀行 5件 |
| land.bookValue | ¥302,177,530 | `items` kind="acquisition" 26件 |

## 決めること（承認をお願いする点）

1. **置き場所** … `yah.homes-v2/reports/`。提案書は事業の資料で、カードではない
2. **公開** … 生成物を Artifact として公開する。**公開はAIが行い、台帳が変わったら再生成→再公開**
3. **既存6章の移行** … 一度に全部ではなく、**第六章（2050年の清算）から**。
   いちばん数字が多く、いちばん間違えた章
4. **CIに載せるか** … `deploy-functions.yml` の型チェック段に `reportcheck.mjs` を足す。
   テンプレートに金額が書かれたら**その時点で止まる**

## 積み残し（この設計では解決しない）

- **`valuation` が最終年で `NaN` を返す**（2026-09-03 発見・別件）
- **BigQuery の同期に定期実行がない。** 2026-09-03 に手動で全26テーブルを入れ直し、
  Firestoreと件数一致を確認した。**翌日には古くなる**
- **`items` に土地の取得原価があることが、どこにも書かれていない。**
  2026-09-03、私は「台帳にない」と誤断した。**カタログ（どの数字がどこにあるか）が要る**
