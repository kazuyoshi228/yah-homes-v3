/* 金額の別名VIEW v_money を、カタログから生成する（2026-09-03・design_agency_db_review B案）
 *
 * なぜ: 金額のフィールド名が15通りある（amount / total / value / cost / principal /
 *       contractTotal / listPrice / premiumPerYear / balance / unitPrice / annual …）。
 *       「この会社のお金を全部足す」に、名前を全部知っている必要があった。
 *
 * 列名は変えない（全カードが壊れる）。VIEWで1本に揃えるだけ。
 * 定義は catalog-def.mjs が正本——カタログを直せばVIEWも追随する。
 *
 * 使い方: node money-view.mjs        … SQLを出す
 *         node money-view.mjs --apply … BigQuery に作る */
import { execSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { CATALOG } from "./catalog-def.mjs";

const P = "yah-homes.agency";
/* 数値列は Datastore backup で STRUCT<integer,float,provided> に化けることがある
   （0 と 2.25 が混在すると起きる。finance.rate で実際に発生）。両方に耐える形で読む */
const NUM = (c) => `COALESCE(SAFE_CAST(${c} AS INT64), CAST(SAFE_CAST(${c} AS FLOAT64) AS INT64))`;

/* 列名は推測しない。BigQuery のスキーマを読んで、実在するものだけを使う
   （2026-09-03、utilities.place を推測で書いて Unrecognized name で落ちた） */
const schemaOf = (t) => {
  try {
    const j = JSON.parse(execSync(`bq --project_id=yah-homes show --schema --format=prettyjson agency.${t}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    return new Map(j.map((f) => [f.name, f.type]));
  } catch { return new Map(); }
};
/* その行が「いつ・どこ・何の」金額かを表す列の候補。上から順に、実在するものを採る */
const WHEN_CANDIDATES = ["date", "month", "ym", "year", "asOf"];
const WHO_CANDIDATES = ["prop", "place", "site", "owner"];
const KIND_CANDIDATES = ["kind", "category"];

const parts = [];
const skipped = [];
for (const [id, c] of Object.entries(CATALOG)) {
  if (!c.amountField) continue;
  const sc = schemaOf(id);
  if (!sc.has(c.amountField)) { skipped.push(`${id}.${c.amountField}`); continue; }
  const pick = (cands) => cands.find((k) => sc.has(k));
  const w = pick(WHEN_CANDIDATES), who = pick(WHO_CANDIDATES), kd = pick(KIND_CANDIDATES);
  parts.push(
    `SELECT '${id}' AS src, __key__.name AS id, ` +
    `${who ? `CAST(${who} AS STRING)` : "CAST(NULL AS STRING)"} AS prop, ` +
    `${kd ? `CAST(${kd} AS STRING)` : "CAST(NULL AS STRING)"} AS kind, ` +
    `${w ? `CAST(${w} AS STRING)` : "CAST(NULL AS STRING)"} AS asof, ` +
    `${NUM(c.amountField)} AS yen, '${c.amountField}' AS field\n  FROM \`${P}.${id}\``);
}
if (skipped.length) console.error("  ※ BigQuery に列が無いので除外: " + skipped.join(", "));

const sql = `-- 金額の別名VIEW（自動生成: node functions/money-view.mjs）
-- 手で編集しない。定義は functions/catalog-def.mjs が正本。
--
-- 金額のフィールド名が15通りあるので、名前を知らなくても横断で足せるようにする。
-- 元の列名は変えていない（カードが読んでいるため）。
--
--   SELECT src, SUM(yen) FROM \`${P}.v_money\` GROUP BY src ORDER BY 2 DESC
--   SELECT prop, SUM(yen) FROM \`${P}.v_money\` WHERE src='items' AND kind='acquisition' GROUP BY prop
--
-- ⚠️ 足し算の意味はコレクションごとに違う。単純に全部足さないこと——
--    items は支出、finance は借入の元本、landComps は㎡単価、cash は残高。
--    src で必ず切る。
CREATE OR REPLACE VIEW \`${P}.v_money\` AS
${parts.join("\nUNION ALL\n")};
`;
await writeFile("../tools/bq-v-money.sql", sql);
console.log(`✓ tools/bq-v-money.sql（${parts.length}コレクション）`);

if (process.argv.includes("--apply")) {
  /* SQL はファイルから標準入力で渡す（引数だとバッククォートがシェルに食われる） */
  execSync("bq --project_id=yah-homes --location=asia-northeast1 query --nouse_legacy_sql --format=none",
    { input: sql, stdio: ["pipe", "inherit", "inherit"] });
  console.log("✓ BigQuery に v_money を作成");
}
