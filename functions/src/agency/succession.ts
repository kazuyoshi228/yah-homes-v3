/**
 * 事業承継 — 採点表と分析
 *
 * 採点は上書きせず、日付ごとに1件ずつ積む。前回と比べて何が動いたかを残すため。
 * 重みは観点ごとに持たせ、合計が100になることだけを機械が確かめる。
 */
import { agencyDb } from "./engine.js";

export interface Dimension { name: string; score: number; weight: number; note: string }

export async function successionSummary() {
  const db = agencyDb();
  const [scSnap, anSnap, polSnap, conSnap] = await Promise.all([
    db.collection("scorecards").get(),
    db.collection("analyses").get(),
    db.collection("policies").get(),
    db.collection("contracts").get(),
  ]);

  const cards = scSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as object) } as { id: string; date: string; total: number; dimensions: Dimension[]; summary?: string; horizon?: string })) 
    .sort((a, b) => b.date.localeCompare(a.date));

  /* 重みの合計が100でない採点は、点数の意味が壊れているので印を付ける */
  const checked = cards.map((c) => {
    const w = (c.dimensions ?? []).reduce((a, d) => a + d.weight, 0);
    const calc = Math.round((c.dimensions ?? []).reduce((a, d) => a + d.score * d.weight, 0) / 100 * 10) / 10;
    return { ...c, weightSum: w, calculated: calc, weightOk: w === 100 };
  });

  /* 前回との差。観点ごとに何点動いたかを出す */
  const [now, prev] = checked;
  const deltas = now && prev
    ? now.dimensions.map((d) => {
        const p = prev.dimensions.find((x) => x.name === d.name);
        return { name: d.name, score: d.score, delta: p ? d.score - p.score : null };
      })
    : [];

  return {
    cards: checked,
    latest: now ?? null,
    previous: prev ?? null,
    deltas,
    analyses: anSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }))
      .sort((a, b) => String((b as { date?: string }).date ?? "").localeCompare(String((a as { date?: string }).date ?? ""))),
    policies: polSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
    contracts: conSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
  };
}
