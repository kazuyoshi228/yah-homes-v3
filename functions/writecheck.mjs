/* 台帳への書き込みを ledgerSet / ledgerJudgement に集約する（2026-09-03・design_agency_db_review C案）
 *
 * なぜ: 53コレクションのうち updatedBy が完備しているのは construction だけだった。
 * 誰が入れた数字かが残らないと、人が確認した値とAIが置いた値を後から区別できない。
 *
 * 方式: ラチェット。いまある直接書き込みの数を基準にし、増えたら失敗する。
 *       減ったら基準を下げるよう促す（逆戻り不可）。一気に全部は直せないので。 */
import { readFile, readdir } from "node:fs/promises";

/* 実査値（2026-09-03・計58箇所/17ファイル）。直したら下げてコミットする。
   多いのは portal.ts（14）と engine.ts（10）——engine の分は ledgerSet 自身と
   キュー・ロックの操作なので、台帳の一次事実とは性格が違う。移行はそこを最後に回す。
   2026-09-04: engine.ts を 7 → 10 に上げた。変更履歴（設計メモ⑥）を残すために
   ledgerSet の中でトランザクション書き込みが3箇所増えたため——
   これは ledgerSet【自身の実装】であって、検査が止めたい「ledgerSet を通さない書き込み」ではない */
const BASELINE = {
  "ai.ts": 2, "aicheck.ts": 1, "alerts.ts": 3, "bs.ts": 1, "dispatcher.ts": 5,
  "engine.ts": 10, "functions.ts": 5, "health.ts": 3, "inbox.ts": 3, "intake.ts": 6,
  "lifecycle.ts": 3, "monthly.ts": 1, "portal.ts": 14, "props.ts": 1,
  "schedules.ts": 1, "tourism.ts": 1, "weekly.ts": 1,
};
/* 台帳ではないもの（キャッシュ・ログ・外部データの取り込み）は対象外にしてよい。
   ここに足すときは【なぜ台帳ではないか】をコメントで書くこと */
const EXEMPT = new Set([
  "buildinfo.ts",   // CIが生成する
]);

const dir = "src/agency";
const files = (await readdir(dir)).filter((f) => f.endsWith(".ts") && !EXEMPT.has(f));
let bad = 0, lowered = 0;
for (const f of files) {
  const s = await readFile(`${dir}/${f}`, "utf8");
  /* doc(...).set( / .update( / .add( を数える。ledgerSet の実装自体は除く */
  const n = s.split("\n").filter((l) =>
    /\.(set|update)\(|\.add\(/.test(l) &&
    !/res\.set\(|headers\.set\(|\.set\("Access-Control|Map|Set\b/.test(l) &&
    !/ledgerSet|ledgerJudgement/.test(l)).length;
  const base = BASELINE[f] ?? 0;
  if (n > base) {
    console.error(`✗ ${f}: 台帳への直接書き込みが ${n}箇所（基準 ${base}）`);
    console.error("   → engine.ts の ledgerSet / ledgerJudgement を使う（updatedBy が自動で入る）");
    bad++;
  } else if (n < base) {
    console.log(`↓ ${f}: ${n}箇所（基準${base}）——writecheck.mjs の基準値を ${n} に下げてください`);
    lowered++;
  }
}
console.log(bad ? `\n書き込みの検査: ${bad}件`
  : `書き込みの検査: 新規違反なし（${files.length}ファイル${lowered ? `・基準を下げられるもの ${lowered}` : ""}）`);
process.exit(bad ? 1 : 0);
