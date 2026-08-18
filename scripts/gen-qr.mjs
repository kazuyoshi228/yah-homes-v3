#!/usr/bin/env node
/* チャット導線のQRコード生成（2026-08-18 発注者指示）。
   URL が変わったらここを直して再実行 → public/qr/ が更新される。
   - 通常版（メール・how-to 用）: 360px PNG
   - 印刷用（現地掲示・MANUAL本用）: 2048px PNG（余白広め）
   実行: node scripts/gen-qr.mjs */
import QRCode from "qrcode";
import { mkdirSync } from "node:fs";

const TARGETS = [
  { key: "kiyokawa", url: "https://chat.yah.homes/kiyokawa" },
  { key: "takasago", url: "https://chat.yah.homes/takasago" },
];
mkdirSync("public/qr/print", { recursive: true });
for (const t of TARGETS) {
  await QRCode.toFile(`public/qr/chat-${t.key}.png`, t.url,
    { width: 360, margin: 2, errorCorrectionLevel: "M" });
  await QRCode.toFile(`public/qr/print/chat-${t.key}-print.png`, t.url,
    { width: 2048, margin: 4, errorCorrectionLevel: "H" });   // 印刷は誤り訂正を強めに
  console.log(`${t.key}: ${t.url} → 通常360px / 印刷2048px`);
}
