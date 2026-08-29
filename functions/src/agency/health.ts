/**
 * health — 全検証を1本に常設する（A・2026-08-25 発注者承認）
 *
 * 分析の前に必ずここを1回叩けば、全カードの数字の信頼度が分かる。
 * カード内の監査（物件の血統・二重計上など）に加えて、カードをまたぐ不変条件を見る。
 * check.card は index の data-key と同一文字列——ドットの色はここから導出する
 * （手動ドットは廃止。保存された判断もどきを持たない・G）。
 */
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { agencyDb, findOverdue } from "./engine.js";
import { propertySummary } from "./props.js";
import { renewalPlan } from "./lifecycle.js";
import { estimatesDue, warrantyDue } from "./alerts.js";

/* goto: 消し込む場所への深リンク（今日ボード・点検メールの行から1クリックで直行する・2026-08-27） */
export type HealthCheck = { card: string; name: string; ok: boolean; detail: string; goto?: string };

export async function healthSummary() {
  const db = agencyDb();
  const now = new Date();
  const checks: HealthCheck[] = [];
  const add = (card: string, name: string, ok: boolean, detail = "", goto?: string) =>
    checks.push({ card, name, ok, detail, ...(goto ? { goto } : {}) });

  const [props, plan, overdue, est, conSnap, cvrSnap, schedSnap, eqSnap, jobSnap, asmSnap] =
    await Promise.all([
      propertySummary(), renewalPlan(), findOverdue(now), estimatesDue(now),
      db.collection("contracts").get(), db.collection("cvr").get(),
      db.collection("schedules").get(),
      db.collection("equipment").where("kind", "==", "equipment").get(),
      db.collection("jobs").where("status", "in",
        ["draft", "sent", "negotiating", "confirmed", "done"]).get(),
      db.collection("assumptions").get(),
    ]);
  /* 手動の上書き（人の判断＝保存してよい・Firestoreが正本）。色は上書きが勝つが、
     検証結果は捨てない——ツールチップに残す */
  const ovDoc = await db.collection("settings").doc("dots").get();
  const overrides = (ovDoc.data()?.cards ?? {}) as Record<string, { state: string; by: string; at: string }>;

  /* 物件: 各棟の監査（出典・二重計上・group未宣言）。
     稼働していない棟（準備中・見送り）は対象外——積立の検査と同じ理由で、
     開業前の棟に台帳の整備を毎日促しても消せない（2026-08-29 発注者判断） */
  const propStatus = new Map((props.rows as Array<{ id: string; status?: string }>)
    .map((r) => [r.id, String(r.status ?? "")]));
  for (const r of props.rows as Array<{ id: string; label?: string;
      audit?: { ok: number; total: number; warn: Array<{ name: string; detail: string }> } }>) {
    if (!r.audit?.total) continue;
    const st0 = propStatus.get(r.id) ?? "";
    if (st0 === "準備中" || st0 === "見送り") continue;
    add("物件", `${r.label ?? r.id}: 監査`, r.audit.warn.length === 0,
      r.audit.warn.length ? r.audit.warn.map((w) => `${w.name}(${w.detail})`).join(" / ")
        : `${r.audit.ok}/${r.audit.total}`, `/properties?prop=${r.id}`);
  }

  /* 物件×固定費: 積立が年割りで足りているか（棟ごと）。
     稼働していない棟（準備中・見送り）は対象外——開業前に積立を立てないのは正常で、
     警告として出すと消しようのない宿題になる（2026-08-29 発注者判断）。
     status が未設定の棟は従来どおり検査する（黙って隠さない） */
  for (const p of plan.byProp) {
    const st = propStatus.get(p.prop) ?? "";
    if (st === "準備中" || st === "見送り") continue;
    add("固定費", `${p.propLabel}: 積立 vs 年割り`, p.gap >= 0,
      `${p.gap >= 0 ? "+" : ""}${p.gap.toLocaleString()}円/年`, "/maintenance?tab=ren");
  }
  add("物件", "耐用年数の欠測", plan.total.noLifespan === 0, `${plan.total.noLifespan}件`, "/maintenance?tab=ren");

  /* メンテナンス: 期日・見積・紐づけの整合 */
  add("メンテナンス", "期日超過のジョブ", overdue.length === 0,
    overdue.map((o) => o.job.title).join(" / ") || "なし", "/maintenance?tab=cal");
  const wty = await warrantyDue(now);
  add("メンテナンス", "保証の期限が近い設備", wty.length === 0,
    wty.map((w) => `${w.label}(${w.until}まで)`).join(" / ") || "なし", "/maintenance?tab=ren");
  add("メンテナンス", "見積の催促（実施年が近い概算）", est.length === 0,
    est.map((e) => `${e.label}(${e.due})`).join(" / ") || "なし", "/properties?tab=ren");
  const eqIds = new Set(eqSnap.docs.map((d) => d.id));
  const dangling = schedSnap.docs
    .filter((d) => d.data().ledgerId && !eqIds.has(String(d.data().ledgerId)))
    .map((d) => String(d.data().title ?? d.id));
  add("メンテナンス", "台帳への紐づけ切れ（schedules.ledgerId）", dangling.length === 0,
    dangling.join(" / ") || "なし", "/maintenance?tab=sch");
  const schedIds = new Set(schedSnap.docs.map((d) => d.id));
  const orphanJobs = jobSnap.docs
    .filter((d) => d.data().scheduleId && !schedIds.has(String(d.data().scheduleId)))
    .map((d) => String(d.data().title ?? d.id));
  add("メンテナンス", "周期への紐づけ切れ（jobs.scheduleId）", orphanJobs.length === 0,
    orphanJobs.join(" / ") || "なし", "/maintenance?tab=cal");

  /* 契約書類: 期限と原本 */
  const today = now.toISOString().slice(0, 10);
  const d90 = new Date(now.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  const cons: Array<Record<string, unknown>> = conSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Record<string, unknown>));
  const expired = cons.filter((c) => c.expiresAt && String(c.expiresAt) < today);
  const expiring = cons.filter((c) => c.expiresAt && String(c.expiresAt) >= today && String(c.expiresAt) <= d90);
  const noOriginal = cons.filter((c) => !c.path && !c.file);
  add("契約書類", "期限切れ", expired.length === 0, expired.map((c) => String(c.label)).join(" / ") || "なし", "/contracts");
  add("契約書類", "90日以内に期限", expiring.length === 0, expiring.map((c) => `${c.label}(${c.expiresAt})`).join(" / ") || "なし", "/contracts");
  add("契約書類", "原本が未登録", noOriginal.length === 0, `${noOriginal.length}件`, "/contracts?filter=%E6%9C%AA");

  /* 定期レポート: CVRの内部整合（閲覧÷表示＝検索→閲覧） */
  const cvrBad = cvrSnap.docs.filter((d) => {
    const x = d.data();
    if (x.views == null || x.impressions == null || x.searchToView == null) return false;
    return Math.abs((Number(x.views) / Number(x.impressions)) * 100 - Number(x.searchToView)) > 0.06;
  }).map((d) => d.id);
  add("定期レポート", "CVRの検算（閲覧÷表示）", cvrBad.length === 0, cvrBad.join(" / ") || "全行一致", "/reports?tab=cvr");

  /* 横断: AIRSTAR月次報告の稼働 ↔ Beds24の実予約（独立ソース同士の突合・2026-08-25 発注者承認）。
     報告書は運営会社の申告、beds24_state は毎朝の観測ジョブが維持する生の予約一覧——出所が別。
     予約の泊を月に按分して締月ごとに比べる。許容±2泊（按分・キャンセル扱いの差） */
  try {
    const PROP_JA: Record<string, string> = { "清川": "kiyokawa", "高砂": "takasago" };
    const st = (await getFirestore().collection("beds24_state").doc("latest").get()).data();
    const bookings = (st?.bookings ?? {}) as Record<string,
      { status?: string; arrival?: string; n?: number; prop?: string }>;
    const nights: Record<string, number> = {};
    for (const b of Object.values(bookings)) {
      if (!b?.arrival || String(b.status ?? "") === "cancelled") continue;
      const prop = PROP_JA[String(b.prop)] ?? String(b.prop);
      const d = new Date(String(b.arrival) + "T00:00:00Z");
      for (let i = 0; i < Number(b.n ?? 0); i++) {
        const ym = d.toISOString().slice(0, 7);
        nights[`${prop}|${ym}`] = (nights[`${prop}|${ym}`] ?? 0) + 1;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    const thisYm = now.toISOString().slice(0, 7);
    const revSnap = await db.collection("revenue").where("kind", "==", "monthly").get();
    const byProp: Record<string, string[]> = {};
    let comparable = 0;
    for (const dref of revSnap.docs) {
      const r = dref.data() as { prop: string; month: string; occ: number };
      if (!r.month || r.month >= thisYm) continue;
      /* beds24_state の履歴は2026年5月末から。5月は部分データで必ず偽陽性になるため
         照合の下限を06に置く（06は両棟±0泊で一致を実測確認・2026-08-25） */
      if (r.month < "2026-06") continue;
      const beds = nights[`${r.prop}|${r.month}`];
      if (beds == null) continue;   // Beds24側に履歴が無い月は照合しない（下の件数で欠測が分かる）
      comparable++;
      const days = new Date(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)), 0).getDate();
      const rep = Math.round(Number(r.occ) / 100 * days);
      byProp[r.prop] ??= [];
      if (Math.abs(beds - rep) > 2) byProp[r.prop].push(`${r.month}: 報告${rep}泊 vs Beds24 ${beds}泊`);
    }
    for (const [prop, bad] of Object.entries(byProp)) {
      const label = prop === "kiyokawa" ? "清川" : prop === "takasago" ? "高砂" : prop;
      add("定期レポート", `${label}: 稼働の突合（AIRSTAR報告 ↔ Beds24実予約）`, bad.length === 0,
        bad.length ? bad.join(" / ") : `照合できた全月が±2泊以内（${comparable}ヶ月）`, "/reports?tab=rev");
    }
  } catch {
    add("定期レポート", "Beds24との突合", false, "beds24_state が読めない");
  }

  /* Branding: 配布リンクが実在のアセットを指しているか（保管庫からファイルが消えたら気づく） */
  try {
    const bDoc = (await db.collection("settings").doc("branding").get()).data() ?? {};
    const usage = (bDoc.usage ?? []) as Array<{ scene: string; asset: string }>;
    const [bFiles] = await getStorage().bucket("yah-homes-os-archive").getFiles({ prefix: "branding/" });
    const names = new Set(bFiles.map((f) => f.name.split("/").pop() ?? ""));
    const broken = usage.filter((u) => u.asset && !names.has(u.asset)).map((u) => `${u.scene}→${u.asset}`);
    add("Branding", "配布リンクの実在", broken.length === 0, broken.join(" / ") || `${usage.length}件`, "/branding");
    /* サブブランドの位置づけ（role）が空のもの。ロゴだけ存在して定義が無い状態を晒す */
    const subs = (bDoc.subbrands ?? []) as Array<{ name: string; role: string }>;
    const noRole = subs.filter((x) => !x.role).map((x) => x.name);
    add("Branding", "サブブランドの位置づけが未定義", noRole.length === 0,
      noRole.join(" / ") || `${subs.length}件すべて定義済み`, "/branding");
  } catch {
    add("Branding", "配布リンクの実在", false, "保管庫が読めない");
  }

  /* 取込の検収待ち（段D）。消し込みはメンテナンスの受信箱 */
  const inSnap = await db.collection("intake").where("status", "==", "draft").get();
  add("メンテナンス", "取込の検収待ち", inSnap.empty,
    inSnap.docs.map((d) => `${d.data().kind}: ${String(d.data().summary ?? d.data().filename ?? "")}`).join(" / ") || "なし",
    "/maintenance?tab=hist");

  /* 受信処理に失敗したメール（記録して前進した分・レビュー2026-08-28）。放置させない */
  const mfSnap = await db.collection("mailFailures").where("needsHuman", "==", true).get();
  add("メンテナンス", "受信処理に失敗したメール", mfSnap.empty,
    mfSnap.docs.map((d) => String(d.data().subject ?? d.id)).join(" / ") || "なし", "/maintenance?tab=hist");

  /* 未紐付けメール（誰宛か分からず人待ちのもの）。消し込みはメンテナンスの受信箱 */
  const unSnap = await db.collection("unmatched").where("needsHuman", "==", true).get();
  add("メンテナンス", "紐付かなかったメール", unSnap.empty,
    unSnap.docs.map((d) => String(d.data().subject ?? "")).join(" / ") || "なし", "/maintenance?tab=hist");

  /* 台帳の整合4検査（レビューP1・2026-08-28）: 二重計上・迷子の棟・日付欠測・現金の鮮度 */
  const propIds = new Set((props.rows as Array<{ id: string }>).map((r) => r.id));
  const revAll = await db.collection("revenue").where("kind", "==", "monthly").get();
  const revKeys = new Map<string, number>();
  for (const d of revAll.docs) {
    const r = d.data() as { prop?: string; month?: string };
    if (!r.prop || !r.month) continue;
    const k = `${r.prop}|${r.month}`;
    revKeys.set(k, (revKeys.get(k) ?? 0) + 1);
  }
  const revDup = [...revKeys.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  add("定期レポート", "売上の重複（同じ棟×同じ月が2行）", revDup.length === 0,
    revDup.join(" / ") || `${revKeys.size}行すべて一意`, "/reports?tab=rev");
  const revOrphan = [...new Set(revAll.docs.map((d) => String(d.data().prop ?? ""))
    .filter((p) => p && !propIds.has(p)))];
  add("定期レポート", "売上行の棟が物件台帳に無い", revOrphan.length === 0,
    revOrphan.join(" / ") || "なし", "/reports?tab=rev");
  /* 「投資明細の日付欠測」は取り下げた（2026-08-29）。取得時の明細は date を持たない設計で、
     欠測ではなく正常——27件を毎日警告する誤報だった（facts.ts の addSince 判定を参照） */
  /* 「現金残高の鮮度」「Brandingの配布先が未定」は検査から外した（2026-08-29 発注者「タスク不要」）。
     現金カードが未着工で消しようがなく、配布先は急ぐ判断ではないため。
     必要になったらこの位置に戻す（実装は git 履歴 3c4fb66 にある） */

  /* AIの自己点検の結果（前日ぶん）。回答の中身は採点しない——道具の引き先だけを見る */
  try {
    const acSnap = await db.collection("aiChecks").get();
    const latestAc = acSnap.docs.map((d) => d.id).sort().at(-1) ?? "";
    const ac = latestAc ? acSnap.docs.find((d) => d.id === latestAc)?.data() : null;
    if (ac) {
      add("SSoTマップ", "AIの自己点検", ac.ok === true,
        ac.ok === true ? `${latestAc} 合格` : `${latestAc}: ${(ac.ng ?? []).join(" / ")}`, "/?view=health");
    }
  } catch { /* 記録が無い日は出さない（毎朝の step 側で沈黙として検知される） */ }

  /* 前提の存在（係数が消えていたらフォールバックで動くが、気づけるように） */
  const asm = new Set(asmSnap.docs.map((d) => d.id));
  add("利回り", "前提: cap-rate", asm.has("cap-rate"), "");
  add("財務", "前提: management-fee", asm.has("management-fee"), "");
  add("物件", "前提: lifecycle", asm.has("lifecycle"), "");

  const summary = { ok: checks.filter((c) => c.ok).length,
    warn: checks.filter((c) => !c.ok).length, total: checks.length, at: now.toISOString() };
  return { checks, summary, overrides };
}
