/* schema.md → functions/src/agency/schemadoc.ts の再生成。
   使い方: npx tsx tools/gen-schema-doc.ts （schema.md を直したら必ず実行） */
import fs from "node:fs";
import { parseSchemaMd } from "../functions/src/agency/schemaparse.js";
const m = parseSchemaMd(fs.readFileSync("docs/schema.md", "utf8"));
const body = Object.keys(m).sort().map((k) =>
  `  ${k}: [${[...m[k]].sort().map((f) => `"${f}"`).join(", ")}]`).join(",\n");
fs.writeFileSync("functions/src/agency/schemadoc.ts",
  `/**\n * schema.md から生成（2026-08-29）。**手で編集しない。**\n` +
  ` * schema.md を直したら: npx tsx tools/gen-schema-doc.ts で作り直す。\n` +
  ` * ズレたまま放置すると money.test の「schema.md と一致するか」で落ちる。\n */\n` +
  `export const DOCUMENTED: Record<string, string[]> = {\n${body},\n};\n`);
console.log("生成:", Object.keys(m).length, "コレクション");
