/**
 * routes/analytics.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { healthSummary } from "../health.js";
import { successionSummary } from "../succession.js";
interface Dim { name: string; score: number; weight: number; note?: string }

export type Ctx = {
  db: FirebaseFirestore.Firestore;
  email: string;
  all: (col: string) => Promise<Array<Record<string, unknown>>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle(action: string, req: any, res: any, ctx: Ctx): Promise<boolean> {
  const { db, email } = ctx;
  switch (action) {
        case "cvr": {                                         // AirBnB CVR定点観測（定期レポート）
          const snap = await db.collection("cvr").get();
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }))
            .sort((a, b) => String((a as { sortKey?: string }).sortKey ?? "")
              .localeCompare(String((b as { sortKey?: string }).sortKey ?? "")));
          res.json({ ok: true, rows });
          return true;
        }
        case "cvrArchive": {                                  // CVR原本の一覧（保管庫から毎回引く＝一覧を二重に持たない）
          const [files] = await getStorage().bucket("yah-homes-os-archive")
            .getFiles({ prefix: "reports/cvr/" });
          res.json({ ok: true, files: files.map((f) => ({
            path: `gs://yah-homes-os-archive/${f.name}`,
            name: f.name.split("/").pop() ?? f.name,
            month: f.name.split("/")[2] ?? "",
          })).sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name)) });
          return true;
        }
        case "ga4Teiten": {                                   // GA4定点（ga4Daily・正本はGA4直取り）
          const gsnap = await db.collection("ga4Daily")
            .orderBy("date", "desc").limit(400).get();
          res.json({ ok: true, rows: gsnap.docs.map((d) => d.data()) });
          return true;
        }
        case "bookingTeiten": {                               // 予約状況の定点観測（定点シートの鏡を読む）
          const snap = await db.collection("bookingDaily")
            .orderBy("date", "desc").limit(400).get();
          res.json({ ok: true, rows: snap.docs.map((d) => d.data()) });
          return true;
        }
        case "reportArchive": {                               // 定期レポートの原本フォルダー（保管庫から毎回引く）
          const FOLDERS: Record<string, { prefix: string }> = {
            cvr: { prefix: "reports/cvr/" },
            revenue: { prefix: "finance/revenue/" },
          };
          const fol = FOLDERS[String(req.query.folder ?? "")];
          if (!fol) { res.status(400).json({ ok: false, error: "そのフォルダーはありません" }); return true; }
          const [rfiles] = await getStorage().bucket("yah-homes-os-archive")
            .getFiles({ prefix: fol.prefix });
          res.json({ ok: true, files: rfiles.map((f) => ({
            path: `gs://yah-homes-os-archive/${f.name}`,
            name: f.name.split("/").pop() ?? f.name,
            sub: f.name.slice(fol.prefix.length).includes("/")
              ? f.name.slice(fol.prefix.length).split("/")[0] : "",
          })).sort((a, b) => b.sub.localeCompare(a.sub) || a.name.localeCompare(b.name)) });
          return true;
        }
        case "succession": {                                  // 事業承継（採点表と分析）
          res.json({ ok: true, ...(await successionSummary()) });
          return true;
        }
        case "saveScorecard": {                               // 採点をやり直す（上書きせず日付ごとに積む）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { date, dimensions, summary, horizon } = req.body ?? {};
          if (!date || !Array.isArray(dimensions)) { res.status(400).json({ ok: false, error: "日付と観点が要ります" }); return true; }
          const w = (dimensions as Dim[]).reduce((a, d) => a + Number(d.weight ?? 0), 0);
          if (w !== 100) { res.status(400).json({ ok: false, error: `重みの合計が${w}です。100にしてください` }); return true; }
          const total = Math.round((dimensions as Dim[])
            .reduce((a, d) => a + Number(d.score) * Number(d.weight), 0) / 100 * 10) / 10;
          await db.collection("scorecards").doc(String(date)).set({
            kind: "scorecard", date, dimensions, total,
            summary: summary ?? "", horizon: horizon ?? "50年",
            updatedAt: new Date().toISOString(), updatedBy: email,
          }, { merge: true });
          res.json({ ok: true, total });
          return true;
        }
        case "health": {                                      // 全検証を1本で（A・分析の前に必ずこれ）
          res.json({ ok: true, ...(await healthSummary()) });
          return true;
        }
        case "saveDot": {                                     // ドットの手動上書き（人の判断・Firestoreに保存）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { card, state } = req.body ?? {};
          if (!card) { res.status(400).json({ ok: false, error: "カードが指定されていません" }); return true; }
          if (state != null && state !== "ok" && state !== "warn") {
            res.status(400).json({ ok: false, error: "state は ok / warn / null" }); return true;
          }
          await db.collection("settings").doc("dots").set({
            cards: { [String(card)]: state == null ? FieldValue.delete()
              : { state, by: email, at: new Date().toISOString() } },
          }, { merge: true });
          res.json({ ok: true });
          return true;
        }
  }
  return false;
}
