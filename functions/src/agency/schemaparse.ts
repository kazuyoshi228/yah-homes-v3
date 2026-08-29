/**
 * schema.md（台帳の正本）を機械で読む — 文書と実データのズレを検知するため（2026-08-29）
 *
 * 「スキーマを変えたら schema.md も直す」は人の約束だったので、守られたか誰も検査していなかった。
 * ここで文書側を構造化し、health が実データのフィールドと突き合わせる。
 */

/** 「主なフィールド」欄の1マスから、フィールド名だけを取り出す */
export function parseFieldCell(cell: string): string[] {
  return cell
    .replace(/`/g, "")
    .replace(/\([^)]*\)/g, "")          // kind(supply/construction) → kind
    .replace(/\{[^}]*\}/g, "")          // actual{amount,ym} → actual
    .replace(/\[\]/g, "")               // timeline[] → timeline
    .split(/[,、，・]/)
    .flatMap((s) => s.split("/"))        // item/label → item, label（どちらの名でも文書済みとみなす）
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s));   // 日本語の説明・…・— は落とす
}

/** schema.md 全文 → { コレクション名: 文書に載っているフィールド名[] } */
export function parseSchemaMd(md: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const head = cells[1].replace(/`/g, "").trim();
    /* 1列目が `a` / `b` の複合（vendors / templates / settings）にも対応 */
    const cols = head.split("/").map((s) => s.trim()).filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s));
    if (!cols.length) continue;
    const fields = parseFieldCell(cells[3] ?? "");
    for (const c of cols) out[c] = [...new Set([...(out[c] ?? []), ...fields])];
  }
  return out;
}
