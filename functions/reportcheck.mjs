/* 提案書テンプレートに金額を焼き込ませない（2026-09-03・yah-os の check-hardcoded.mjs と同じ思想）
 * ① reports/*.tpl.html に ¥数字 があれば失敗（「例:」付きは除外）
 * ② テンプレートが参照するキーが report-values.mjs に無ければ失敗
 * ③ report-values.mjs の各キーに src が無ければ失敗（出どころのない数字を作らせない） */
import { readFile, readdir } from "node:fs/promises";

let bad = 0;
const tpls = (await readdir("../reports")).filter((f) => f.endsWith(".tpl.html"));

for (const t of tpls) {
  const s = await readFile(`../reports/${t}`, "utf8");
  /* ¥0 は金額ではなく「ゼロ」の意味なので数えない（「支払利息が ¥0 になる」など） */
  const lines = s.split("\n").filter((l) => /¥[0-9]/.test(l.replace(/¥0(?![0-9,])/g, "")) && !/例[:：)）]/.test(l) && !/^[^¥]*¥0(?![0-9,])/.test(l.replace(/¥0(?![0-9,])/g,"@@")));
  if (lines.length) {
    console.error(`✗ ${t}: ¥数字が ${lines.length}行（テンプレートに金額を書かない）`);
    lines.slice(0, 3).forEach((l) => console.error(`    ${l.trim().slice(0, 90)}`));
    bad++;
  }
}

/* 定義側は静的に読む（台帳へ接続せずCIで回すため） */
const def = await readFile("report-values.mjs", "utf8");
const defined = new Set([...def.matchAll(/put\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]));
/* 動的に作るキー。put(`land.${k}.total`) や famPut("family.officer", …) の形 */
const dynPrefix = [...def.matchAll(/put\(`([A-Za-z0-9_.]+)\.\$\{[^}]+\}\.([A-Za-z0-9_.]+)`/g)]
  .map((m) => ({ head: m[1], tail: m[2] }));
for (const m of def.matchAll(/famPut\("([A-Za-z0-9_.]+)"/g)) defined.add(m[1]);
const isDefined = (k) => defined.has(k)
  || dynPrefix.some((d) => k.startsWith(d.head + ".") && k.endsWith("." + d.tail));
for (const m of def.matchAll(/put\("([A-Za-z0-9_.]+)"\s*,([^;]*?)\);/gs)) {
  const args = m[2].split(",");
  if (args.length < 2 || !args.slice(1).join(",").trim()) {
    console.error(`✗ report-values.mjs: ${m[1]} に出どころ（src）がありません`); bad++;
  }
}
for (const t of tpls) {
  const s = await readFile(`../reports/${t}`, "utf8");
  for (const m of s.matchAll(/\{\{([A-Za-z0-9_.]+)(?:\|(?:raw|pct|num))?\}\}/g)) {
    if (!isDefined(m[1])) { console.error(`✗ ${t}: 未定義のキー {{${m[1]}}}`); bad++; }
  }
}
console.log(bad ? `\n提案書の検査: ${bad}件` : `提案書の検査: 違反なし（テンプレート ${tpls.length}件・定義 ${defined.size}キー）`);
process.exit(bad ? 1 : 0);
