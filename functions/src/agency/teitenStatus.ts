/**
 * 定点の同期状態 — 各系統が「いつのデータまで入っているか」だけを返す
 * （2026-08-27 発注者承認。2026-08-26 の1日遅れバグを画面から気づけなかったため新設）
 *
 * 保存しない。各コレクションの最新1件を読んで、日付と同期時刻をそのまま返すだけ。
 * 「何日遅れなら正常か」の判断は assumptions/teiten-freshness が正本で、
 * 遅れているかどうかの判定は画面が表示時に行う（合否をここで焼かない）。
 *
 * GSCはGoogle側の確定が2〜3日遅れる——止まっているのか仕様なのかを
 * 区別できるようにするのが、この画面の目的。
 */
import { agencyDb } from "./engine.js";

/** 画面に出す順。ラベルはここが正本（コレクション名を画面に書かせない） */
const SOURCES: Array<{ key: string; label: string; note: string }> = [
  { key: "bookingDaily", label: "予約状況", note: "毎朝8:10・定点シートの鏡" },
  { key: "ga4Daily", label: "GA4", note: "毎朝8:05・GA4 Data API" },
  { key: "adsDaily", label: "Google広告費", note: "毎朝8:08・GA4の advertiserAdCost" },
  { key: "gscDaily", label: "検索流入（GSC）", note: "毎朝8:15・Search Console API" },
];

/** JSTの今日。UTCで切ると朝の時間帯に1日ずれる（2026-08-26 の同じ罠） */
const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export async function teitenStatus() {
  const db = agencyDb();
  const [freshDoc, ...snaps] = await Promise.all([
    db.collection("assumptions").doc("teiten-freshness").get(),
    ...SOURCES.map((s) => db.collection(s.key).orderBy("date", "desc").limit(1).get()),
  ]);
  const maxLag = (freshDoc.data()?.maxLagDays ?? {}) as Record<string, number>;
  const today = jstToday();

  const rows = SOURCES.map((s, i) => {
    const d = snaps[i].docs[0]?.data();
    const latest = d?.date ? String(d.date) : null;
    /* 未来日の行（シートに事前作成された空行）を「最新」と読むと遅れを見逃す */
    const effective = latest && latest > today ? today : latest;
    const lagDays = effective
      ? Math.round((Date.parse(today) - Date.parse(effective)) / 864e5) : null;
    const ts = d?.syncedAt;
    return {
      key: s.key, label: s.label, note: s.note,
      latest, lagDays,
      maxLagDays: Number.isFinite(Number(maxLag[s.key])) ? Number(maxLag[s.key]) : null,
      syncedAt: ts?.toDate ? ts.toDate().toISOString() : (typeof ts === "string" ? ts : null),
      fetchFailed: d?.fetchFailed === true,
    };
  });

  return { rows, asOf: today, source: "各コレクションの最新1件（保存はしていない）" };
}
