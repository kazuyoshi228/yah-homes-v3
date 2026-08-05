#!/usr/bin/env node
// Beds24年間カレンダー（テキスト貼り付け）のパーサー
// 使い方:
//   1. Beds24のカレンダー(1年ビュー)を全選択コピー → ~/Desktop/beds24.txt に保存
//   2. node scripts/parse-beds24.mjs ~/Desktop/beds24.txt
//   3. 前回状態(scripts/.beds24-state.json)との差分・先付け残高を表示し、状態を更新
// 判定ルール: 在庫数0 かつ オーバーライド=Blackoutでない日 = 成約。Blackout・未開放期間は除外。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const STATE = new URL(".beds24-state.json", import.meta.url).pathname;
const txt = readFileSync(process.argv[2], "utf8");

// プロパティごとにセクション分割（"yah 清川" / "yah.homes takasago" の見出しで切る）
function section(name, from, to) {
  const i = txt.indexOf(from);
  const j = to ? txt.indexOf(to, i + 1) : txt.length;
  return txt.slice(i, j === -1 ? txt.length : j);
}
const secK = section("清川", "yah 清川", "yah.homes takasago");
const secT = txt.slice(txt.indexOf("yah.homes takasago"));

// 開始日: "YYYY年 M月 D日" の表示行から
const m = txt.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

function parseVec(sec) {
  // 「在庫数」の後に続く 0/1 列を抽出（次の「在庫数」ラベルまで）
  const a = sec.indexOf("在庫数");
  const b = sec.indexOf("在庫数", a + 3);
  const body = sec.slice(a, b === -1 ? undefined : b);
  const vec = [...body.matchAll(/(?<![\d,.])([01])(?![\d%,.])/g)].map((x) => +x[1]);
  // Blackout位置: オーバーライド行のタブ列位置から日index を推定
  const oa = sec.indexOf("オーバーライド");
  const ob = sec.indexOf("オーバーライド", oa + 3);
  const orow = sec.slice(oa, ob === -1 ? undefined : ob);
  const cells = orow.split("\t");
  const blackout = new Set();
  cells.forEach((c, i) => { if (/Blackout/.test(c)) blackout.add(i - 1); });
  return { vec, blackout };
}

function bookedSet(p) {
  const s = new Set();
  p.vec.forEach((v, i) => {
    if (v === 0 && !p.blackout.has(i)) {
      const d = new Date(start.getTime() + i * 86400000);
      s.add(d.toISOString().slice(0, 10));
    }
  });
  return s;
}

const K = bookedSet(parseVec(secK));
const T = bookedSet(parseVec(secT));

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { K: [], T: [], date: null };
const pK = new Set(prev.K), pT = new Set(prev.T);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

function diff(now, before, label) {
  const added = [...now].filter((d) => !before.has(d) && d >= today).sort();
  const removed = [...before].filter((d) => !now.has(d) && d >= today).sort();
  console.log(`\n[${label}] 新規成約日: ${added.length ? added.join(", ") : "なし"}`);
  console.log(`[${label}] 解放(取消/変更): ${removed.length ? removed.join(", ") : "なし"}`);
  const fwd = [...now].filter((d) => d >= today).length;
  console.log(`[${label}] 先付け残高: ${fwd}泊`);
  return fwd;
}
console.log(`基準日(JST): ${today} / 前回状態: ${prev.date ?? "なし(初回)"}`);
const kf = diff(K, pK, "清川");
const tf = diff(T, pT, "高砂");
console.log(`\n2棟計 先付け: ${kf + tf}泊`);
console.log(`\nシート記入例: node scripts/update-teiten-sheet.mjs --date ${+today.slice(5,7)}/${+today.slice(8,10)} --kf ${kf} --tf ${tf} (組数/泊数は差分から判断して指定)`);

writeFileSync(STATE, JSON.stringify({ K: [...K], T: [...T], date: today }));
console.log(`状態を保存しました: ${STATE}`);
