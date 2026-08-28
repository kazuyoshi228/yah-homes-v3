/**
 * routes/props.route.ts — エンドポイントの分割（S4・2026-08-25 発注者承認）
 *
 * 新しいエンドポイントは api.ts ではなく、担当カードに対応するこのファイルへ足す。
 * 本文は api.ts から移設したまま（一字も変えない方針。return; → return true; のみ機械置換）。
 */
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { renewalPlan } from "../lifecycle.js";
import { propertySummary, PROP_FIELDS } from "../props.js";

export type Ctx = {
  db: FirebaseFirestore.Firestore;
  email: string;
  all: (col: string) => Promise<Array<Record<string, unknown>>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle(action: string, req: any, res: any, ctx: Ctx): Promise<boolean> {
  const { db, email } = ctx;
  switch (action) {
        case "properties": {                                  // 物件（棟そのものの属性の正本）
          res.json({ ok: true, ...(await propertySummary()) });
          return true;
        }
        case "saveProperty": {                                // 属性の編集は画面から
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { id, data } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "棟が指定されていません" }); return true; }
          /* 決めた項目以外は保存しない。画面の作り替えで勝手に項目が増えるのを防ぐ */
          const clean: Record<string, unknown> = {};
          for (const k of PROP_FIELDS) if (k in (data ?? {})) clean[k] = (data as Record<string, unknown>)[k];
          if (!Object.keys(clean).length) { res.status(400).json({ ok: false, error: "保存できる項目がありません" }); return true; }
          await db.collection("properties").doc(String(id))
            .set({ ...clean, kind: "property", updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });

          /* 新棟の自動シード（2026-08-24）。準備中の棟には、清川で後追いで集めた
             「追加必須書類」10項目と、定番の周期4件（無効状態）を最初から置いておく。
             次の棟は「空欄が並んでいて埋めていく」形になる。既にあれば触らない。 */
          if (clean.status === "準備中" || clean.planned === true) {
            const ref = db.collection("properties").doc(String(id));
            const snap = await ref.get();
            if (!snap.data()?.requiredDocs) {
              const doc = (label: string, cat: string, need: string, pri: number, note: string) =>
                ({ label, category: cat, necessity: need, priority: pri, status: "未取得", note });
              await ref.set({ requiredDocs: [
                doc("登記事項証明書（全部事項）", "権利・法令", "必須", 1, "所有権・抵当権の根拠。売却・融資で必ず求められる"),
                doc("旅館業の営業許可証", "権利・法令", "必須", 1, "開業時に取得。更新・変更届の期限管理にも要る"),
                doc("消防法令適合通知書", "権利・法令", "必須", 1, "旅館業とセット"),
                doc("地積測量図・公図", "権利・法令", "必須", 2, "境界の根拠"),
                doc("まもりすまい保険等の証券", "建物の維持", "あると効く", 2, "新築10年の瑕疵担保"),
                doc("設備の保証書", "建物の維持", "あると効く", 2, "給湯器・エアコン・冷蔵庫・洗濯機の型番と保証期限"),
                doc("鍵・キーボックスの管理情報", "建物の維持", "あると効く", 2, "個数と場所のみ。暗証番号は置かない"),
                doc("家具・備品のリスト", "運営", "あると効く", 1, "次の棟の予算の基準になる"),
                doc("竣工写真・現況写真", "運営", "あると効く", 3, "原状の証拠・OTA写真の履歴"),
                doc("近隣との取り決め", "運営", "あると効く", 3, "ゴミ出し・駐車場の案内先・騒音"),
              ] }, { merge: true });
              const sched = (sid: string, title: string, months: number[], extra: object) =>
                db.collection("schedules").doc(`${id}-${sid}`).set({
                  title: `${title}（${clean.label ?? id}）`, prop: String(id), months,
                  everyYears: 1, leadDays: 45, statutory: false,
                  active: false, needsDecision: true, vendorId: "",
                  note: "自動シード。時期・業者を確定したら active にする",
                  updatedAt: new Date().toISOString(), ...extra,
                }, { merge: true });
              await sched("shoubou", "消防設備点検", [10], { statutory: true, leadDays: 60 });
              await sched("gaiheki", "外壁クリーニング", [11], { everyYears: 5, leadDays: 90 });
              await sched("hoken", "火災保険の更改", [1], { manualOnly: true, category: "保険" });
              await sched("kotei-shisan", "固定資産税の納税通知書を確認して更新", [4], { manualOnly: true, category: "税金", leadDays: 15 });
            }
          }
          res.json({ ok: true });
          return true;
        }
        case "saveLifespan": {                                // 実効年数の手直し（画面から1項目だけ）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { id, years } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "アイテムが指定されていません" }); return true; }
          const ref = db.collection("equipment").doc(String(id));
          if (!(await ref.get()).exists) { res.status(404).json({ ok: false, error: "そのアイテムがありません" }); return true; }
          /* 空で送られたら手直しを取り消し、耐用年数×使用強度の計算に戻す */
          if (years === null || years === "" || years === undefined) {
            await ref.set({ effectiveYearsOverride: FieldValue.delete(),
              overrideBy: FieldValue.delete(), overrideAt: FieldValue.delete() }, { merge: true });
            res.json({ ok: true, cleared: true });
            return true;
          }
          const y = Number(years);
          if (!Number.isFinite(y) || y <= 0 || y > 100) {
            res.status(400).json({ ok: false, error: "年数は 1〜100 で入れてください" }); return true;
          }
          await ref.set({ effectiveYearsOverride: Math.round(y * 10) / 10,
            overrideBy: email, overrideAt: new Date().toISOString() }, { merge: true });
          res.json({ ok: true });
          return true;
        }
        case "saveEstimate": {                                // 見積の取得状況（未／済）
          if (req.method !== "POST") { res.status(405).json({ ok: false }); return true; }
          const { id, obtained } = req.body ?? {};
          if (!id) { res.status(400).json({ ok: false, error: "アイテムが指定されていません" }); return true; }
          const ref = db.collection("equipment").doc(String(id));
          if (!(await ref.get()).exists) { res.status(404).json({ ok: false, error: "そのアイテムがありません" }); return true; }
          await ref.set({ estimateObtained: !!obtained,
            estimateObtainedAt: obtained ? new Date().toISOString() : FieldValue.delete(),
            estimateObtainedBy: obtained ? email : FieldValue.delete() }, { merge: true });
          res.json({ ok: true });
          return true;
        }
        case "renewalPlan": {                                 // 更新計画（設備台帳から毎回引き直す）
          res.json({ ok: true, ...(await renewalPlan(String(req.query.prop ?? "") || undefined)) });
          return true;
        }
        case "landScreening": {                              // 土地取得の採点基準（正本: assumptions/land-screening）
          const doc = await db.collection("assumptions").doc("land-screening").get();
          if (!doc.exists) { res.json({ ok: true, rubric: null }); return true; }
          res.json({ ok: true, rubric: doc.data() });
          return true;
        }
        case "drawing": {                                     // 図面データ（非公開の保管庫から一時リンクで開く）
          const gs = String(req.query.path ?? "");
          if (!gs.startsWith("gs://yah-homes-os-archive/")) {
            res.status(400).json({ ok: false, error: "その置き場は開けません" }); return true;
          }
          const [bucket, ...rest] = gs.slice(5).split("/");
          const [url] = await getStorage().bucket(bucket).file(rest.join("/"))
            .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60 * 1000 });
          res.json({ ok: true, url });
          return true;
        }
  }
  return false;
}
