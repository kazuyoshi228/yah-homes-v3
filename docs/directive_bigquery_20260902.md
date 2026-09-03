# 指示書: agency DB を BigQuery に載せる（2026-09-02）

**実行は発注者。AIは実行しない**（CLAUDE.md 共通ルール: デプロイ・課金操作は発注者）。
AIが用意したのは `tools/bq-export.sh`（手順）と `tools/bq-views.sql`（VIEW定義）。

## なぜやるか

2026-09-02 の点検で、**同じ「NOI」が4か所で違う数字を指していた**。
式は `functions/src/agency/derive.ts` に集約し、`derivecheck.mjs` がCIで見張る形にした（済）。

残る問題は**問い合わせのコスト**である。この日の分析では、集計のたびに
`node -e` のスクリプトを40本以上書いた。SQLなら数本で済む。
`landComps` が1,746件（公示291地点×6年）に育つと、JSでの突き合わせは辛くなる。

## やらないこと

- **Firestore から移行しない。** 正本は Firestore のまま。BigQuery は**読み取り専用の分析面**
- **アプリの読み書きは変えない。** カードは今までどおり `agencyApi` 経由で Firestore を読む
- **(default) DB・chat 系には触れない。** Firebaseプロジェクトは eSIM事業と共有

## 費用

データ 1.31MB（10年後の想定でも26MB）。**保存もクエリも無料枠に収まる**。

| | 御社 | 無料枠 |
|---|---:|---:|
| 保存 | 0.0013GB | 10GB |
| クエリ | 1.31MB×実行回数 | 1TB/月 |
| Scheduler | 1ジョブ | 3ジョブ |

## 手順

`tools/bq-export.sh` を読んでから実行する。中身は4段階:

1. **一度だけ** — API有効化・GCSバケット作成・データセット作成
2. **エクスポート** — `gcloud firestore export`（agency DBのみ）
3. **読み込み** — コレクションごとに `bq load --replace`
4. **定期実行** — Cloud Scheduler で日次

そのあと `tools/bq-views.sql` を流して VIEW を作る。

## 大事な約束

**`bq-views.sql` の式は `derive.ts` の写しである。**
片方だけ直すと、画面と分析で数字が食い違う——2026-09-02 に実際に起きたことの再発になる。

- 「なぜその式か」の正本 … Firestore の `assumptions/noi-definition`
- 実装の正本 … `functions/src/agency/derive.ts`
- 分析面の写し … `tools/bq-views.sql`

**変えるときは、この順で3つとも直す。**

## 確認すること

- [ ] `SELECT label, noi FROM v_property_noi` が、物件カードの表示と一致するか
- [ ] `v_land_comps_by_year` の高砂の中央値が、不動産DBカードと一致するか
- [ ] エクスポートが止まっても気づける仕組み（BigQueryのテーブル更新日時を health に出す）

最後の項目は**未着手**。2026-09-02 に融資カードが落ちたときのように、
**壊れても画面が出てしまう**のがいちばん危ない。同期が止まった状態で古い数字を
分析に使う事故は、起きうる。
