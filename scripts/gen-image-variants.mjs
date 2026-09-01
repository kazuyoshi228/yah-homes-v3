// B10: レスポンシブ画像バリアント生成（-480 / -768 を欠く画像に生成）
// 対象: story-hero・物件ギャラリー全点・detailヒーロー。既存はスキップ。
// 命名: <base>-480.webp / <base>-768.webp（コードから機械的に導出できる単純サフィックス）
import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";

const DIR = new URL("../public/assets/", import.meta.url).pathname;

const targets = readdirSync(DIR).filter(
  (f) =>
    f.endsWith(".webp") &&
    !/-(480|768)(_|\.)/.test(f) && // 既存バリアント自体は対象外
    (f.startsWith("kiyokawa-gallery-") ||
      f.startsWith("takasago-gallery-") ||
      f.startsWith("story-hero") ||
      f.startsWith("floorplan"))
);

let made = 0, skipped = 0;
for (const f of targets) {
  const base = f.replace(/\.webp$/, "");
  for (const w of [480, 768]) {
    const out = join(DIR, `${base}-${w}.webp`);
    if (existsSync(out)) { skipped++; continue; }
    await sharp(join(DIR, f)).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
    made++;
  }
}
console.log(`生成 ${made} / スキップ ${skipped} / 対象元画像 ${targets.length}`);
