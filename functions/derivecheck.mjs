/* 導出値が derive.ts の外で書き直されていないかを見る（2026-09-02）。
   2026-09-02 の点検で NOI が4か所で違う数字を指していた。同じことを繰り返さないための門番。
   「式そのもの」を探す——名前だけでは通り抜けられるので、引き算の形で照合する。 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/agency";
const OWNER = "derive.ts";               // ここだけが式を持ってよい
/* 見つけたら止めるもの: 導出値の名前に、その場の計算を代入している形 */
const RULES = [
  { name: "NOI",     re: /\bconst\s+noi\s*=\s*(?!.*(?:propertyNoi|companyNoi|annualize|derive)).*[-+]/ },
  { name: "DSCR",    re: /\bconst\s+dscr\s*=\s*(?!.*dscr\()/ },
  { name: "収益還元", re: /\bconst\s+asset\s*=\s*(?!.*capValue).*\/\s*cap/i },
  { name: "実質利回り", re: /\bconst\s+(netYield|yieldPct)\s*=\s*(?!.*netYield\().*\// },
  { name: "担保余力", re: /\bconst\s+(headroom|collateral\w*)\s*=\s*(?!.*collateralHeadroom).*[*-]/ },
];

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []);

let bad = 0;
for (const f of walk(DIR)) {
  if (f.endsWith(OWNER) || f.endsWith(".test.ts")) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // 注釈は見ない
    for (const r of RULES) {
      if (r.re.test(line)) {
        console.log(`✗ ${f}:${i + 1}  ${r.name} を derive.ts の外で計算しています`);
        console.log(`    ${line.trim().slice(0, 100)}`);
        bad++;
      }
    }
  });
}
console.log(bad
  ? `\n導出の重複: ${bad}件。式は src/agency/derive.ts に集めてください（2026-09-02 方針）`
  : "導出の重複: なし（式は derive.ts に集約されています）");
process.exit(bad ? 1 : 0);
