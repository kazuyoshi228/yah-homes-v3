# 設計検証: agency DB の構造（2026-09-03）

**発注者指示**「BaaSファースト＋AIネイティブが目標なのに、DB側が弱いとか、わかりづらいのは本当に最悪。
データベースの専門家として、構造や設計を再度検証し直して、最適な改善案を提案してください」

実測（53コレクション・全件走査）に基づく。**推測は書かない。**

---

## 総評

**スキーマは思ったより健全である。** 型のゆらぎは 2件だけ、`prop` の参照は 13コレクションを見て**壊れ 0件**。
「一次事実だけ保存して導出は持たない」というSSoT原則も、実際に守られている。

**弱いのはスキーマではなく【発見可能性】である。**
どの数字がどこにあるかを知る手立てがなく、名前がそれを教えてくれない。

2026-09-03 に実際に起きたこと——**AIが「土地の取得原価は台帳にない」と断言した。**
実際は `items` の `kind="acquisition"` に 27件あった。`properties` と `depreciation` を見て、無いと結論した。
**これは1件の事故ではなく、いまの構造が必然的に起こすものである。**

---

## 実測でわかったこと

### ① 金額のフィールド名が15通りある

| 名前 | 使っているコレクション |
|---|---|
| `amount` | bsAdjustments, buildPayments, contracts, equipment, items, utilities, utilityBills（7） |
| `total` | adsDaily, cash, scorecards（3） |
| `value` | assumptions, personalAssets, tourismStats（3） |
| `price` | equipment, landComps（2） |
| `amountPerYear` | reserves, taxes（2） |
| `cost` / `bookValue` | depreciation |
| `principal` / `monthlyPayment` | finance |
| `contractTotal` | construction |
| `listPrice` | properties |
| `premiumPerYear` | insurance |
| `balance` | bankBalances |
| `perRoomPerMonth` | assumptions |
| `fee` | contracts |

**「この会社の支出を全部足す」ができない。** 名前を知らないと SUM が書けない。
BigQueryに載せても、横断クエリは書けないままである。

### ② 型のゆらぎは 2件だけ（健全）

`jobs.actual`（object|number）と `vendors.services`（array|string）のみ。
ただし **BigQuery 側では数値列が `STRUCT<integer,float,provided>` に化ける**——
Datastore backup 経由で 0 と 2.25 が混在すると起きる（`finance.rate` で実際に発生）。
**これはFirestoreの問題ではなく、エクスポート経路の問題。**

### ③ 出どころの記録が半分

| | source | updatedAt | updatedBy |
|---|---|---|---|
| 全部入っている | 26/53 | 34/53 | **0/53** |
| **`items`（332件・取得原価の在り処）** | **49%** | **47%** | **0%** |

**`updatedBy` が 100% なのは `construction` だけ。** 誰が入れた数字かが、ほぼ残っていない。

### ④ 参照整合性は壊れていない（良い）

`prop` を持つ13コレクションを検査して、**`properties` に無いIDは 0件。**
ただし `contracts` の5件は `prop` が空文字で、これは「物件に紐づかない契約」（OTA規約など）。
**空文字とnullが混在しているので、機械的な判定ができない。**

### ⑤ 同じものが2箇所にある

| | bsAdjustments | depreciation |
|---|---|---|
| 大手門の建物 | ¥80,000,000 | ¥70,000,000 |
| 六本松の建物 | ¥40,000,000 | ¥40,000,000 |

大手門は **¥70,000,000（建物）＋¥10,000,000（家具）＝¥80,000,000** で、
粒度が違うだけ——**だが、それはどこにも書かれていない。**
2026-09-03、AIは「二重登録では」と疑い、SQLを1本書いて初めて解けた。

### ⑥ `assumptions` が24件のグラブバッグ

値の置き場が統一されていない。`cap-rate` は `value`、`reserve-plan` は `perRoomPerMonth`、
`corporate-tax` は `brackets`——**共通の形がない。**
`status` が入っているのは `family-fund` と `target-model` の2件だけで、
**残り22件は「これは決定なのか検討中なのか」が読めない。**

### ⑦ `items` が3つの別物を兼ねている

`acquisition` 27件（取得原価）／`construction` 48件／`supply` 257件。
**取得原価は会計上の資産で、消耗品の購入とはまったく別の概念である。**
同じコレクションにあるので、`items` を見た人は「備品の台帳」だと思う。実際そう思った。

---

## 改善案

**移行しない。Firestoreのまま、4つ足す。** データは1.31MBで、構造は健全である。
**壊れているのは「知る手立て」なので、そこだけ直す。**

### A. カタログを台帳に置く（最優先）

`catalog` コレクションを新設し、**コレクションごとに「何が入っているか」を1件で書く。**

```
catalog/items
  label: "物件ごとの支出明細"
  holds: ["取得原価（kind=acquisition・土地の簿価はここ）",
          "工事関連（kind=construction）", "備品・消耗品（kind=supply）"]
  amountField: "amount"
  keyFields: ["prop", "kind", "date"]
  relatedTo: ["properties", "depreciation"]
  notReferencedBy: "properties には取得原価は無い（listPrice は検討中物件の売出価格）"
```

**`notReferencedBy` が要点である。** 「ここには無い」を書いておけば、
2026-09-03 の誤断は起きなかった。**AIが最初に読むのはこれ、という約束にする。**

`functions/report-values.mjs` の119キーが持つ `src` は、すでにこのカタログの半分である。
**そこから自動生成できる。**

### B. 金額のフィールド名に「別名」を1本通す

既存の列名は変えない（全カードが壊れる）。**`catalog.amountField` で対応表を持ち、
BigQueryのVIEW `v_money` を1本作る。**

```sql
CREATE VIEW v_money AS
SELECT 'items' AS src, __key__.name AS id, prop, kind, date, amount AS yen FROM items
UNION ALL SELECT 'finance', __key__.name, prop, kind, NULL, principal FROM finance
UNION ALL ...
```

**「この会社のお金を全部足す」が1クエリで書けるようになる。** 名前を知らなくていい。

### C. `status` と `updatedBy` を必須にする

`assumptions` の24件すべてに `status`（`confirmed` / `proposed` / `provisional`）を入れる。
**いま2件しか入っていないので、22件が「決定なのか検討中なのか」不明である。**

`updatedBy` は 0/53 コレクションで完備。**書き込み側（agencyApi）で自動的に入れる。**
AIが書いた数字と人が入れた数字を、後から区別できるようにする。

### D. BigQuery の同期を自動にし、鮮度を health に出す

2026-09-03 の実測——**`finance` が12件中10件、`landComps` が1555件中100件しか入っていなかった。**
欠けていた2件は `loan-kazuyoshi-officer`（¥93,031,628）と `loan-harunobu-corp-3m`。
**家族ファンドの計算で、いちばん効く2本だった。**

手で入れ直して全26テーブル一致にしたが、**定期実行がないので明日には古くなる。**

- Cloud Scheduler で日次（`--collection-ids` を明示。指定しないと種別が分かれず `bq load` できない）
- **同期の最終時刻を `?action=health` に出す。** 止まっても画面は出るのが、いちばん危ない

---

## やらないこと（検討したが却下）

**Supabase（Postgres）への移行。** 発見可能性は確かに上がる（`\d` でテーブルが見える、
横断クエリがSQLで書ける、VIEWで導出を1箇所に持てる）。
だが `agencyApi`・全カード・認証がFirestoreに直結していて、
**このFirebaseプロジェクトは eSIM事業と共有している。** 数週間かかる。

そして**今日の失敗のうち、移行で防げるのは半分だけである。**
`closing`（納税前）と `closingAfterTax` の取り違えも、勝手な仮定も、DBの種類とは関係ない。
**カタログと検査で潰すほうが、速くて確実。**

**カラム名の一括リネーム。** 全カードとAPIが壊れる。別名VIEW（B）で足りる。

---

## 順番

1. **A カタログ** … `report-values.mjs` の `src` から生成できる。半日
2. **D 同期の自動化と鮮度の可視化** … 止まっても気づけない状態が、いま続いている。半日
3. **C status / updatedBy** … 書き込み側に足すだけ。数時間
4. **B v_money** … Aができてから。数時間

**1と2を先にやる。** どちらも「間違った数字が静かに使われる」を止めるものだから。
