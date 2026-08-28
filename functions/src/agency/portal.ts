/**
 * 業者ポータル — 「作業に入れる日」カレンダーの共通実装（公開・トークン認証）
 * 仕様: docs/spec_planting_schedule_beds24.md ＋ docs/proposal_vendor_portal_expansion_20260825.md
 *
 * 植栽（花屋アン）で実証した流れを、屋外・短時間の作業なら業者を変えて使い回せるようにした。
 * ここに文章も棟名も持たない——ぜんぶ PortalConfig と定型メール（mailTemplates）が正本。
 *
 * 作業可能日＝チェックアウト日のみ。完全空室日は出さない（販売中の在庫。後から予約が入ると
 * 作業日が潰れる。チェックアウト日は「確定済みの退去」と「16時チェックイン」に挟まれた窓）。
 * 書けるのは「日付の選択（confirmed）」と「完了報告（done止まり）」だけ。検収は人だけ。
 */
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getStorage } from "firebase-admin/storage";
import crypto from "node:crypto";
import { agencyDb } from "./engine.js";
import { logger } from "firebase-functions/v2";
import { sendNotice } from "./mailer.js";
import { loadTemplate, fill } from "./templates.js";
import { BEDS24_API, beds24WriteToken, BOOKING_PROP_IDS } from "../beds24Client.js";

export type PortalConfig = {
  /* checkout: チェックアウト日の窓から選ぶ（屋内に影響する作業。Beds24を読む）
     quarter : 四半期ごとに1日を自由に決める（屋外だけで完結する作業。Beds24を読まない） */
  /* task: 作業（部位）ごとにチェックアウト日を1つ決める。数日に分けたい作業向け */
  mode: "checkout" | "quarter" | "task";
  id: string;          // settings のドキュメントID（トークン・通知先の置き場）
  /* 1つのポータルで複数の棟を扱う場合の許可リスト。?prop= で切り替える
     （urlState の標準キーと同じ語彙。カードのパネル2と揃える・2026-08-27） */
  props?: Array<{ key: string; label: string }>;
  category: string;    // jobs.category（メンテナンスカードの区分と一致させる）
  prop: string;        // 対象の棟
  propLabel: string;
  source: string;      // jobs.source（どのポータルから来たか）
  workLabel: string;   // 「植栽作業」「外構清掃」
  window: string;      // 作業時間帯
  photoDir: string;    // 保管庫の置き場
  vendorName?: string; // 決まっていれば固定。無ければ業者が名乗る
  notifyFallback: string;
  /* 一度に回れる棟のまとまり（quarter モード）。1回の選択で棟ごとにジョブを立て、
     費用は頭割りにする——業者の操作は1回、帳簿は棟別（2026-08-27 発注者決定） */
  groups?: Array<{ key: string; label: string; props: string[]; propLabels: string[];
    availableFrom?: string;
    /* 業者に説明するまで画面に出さない。settings の showGroups に key を足すと出る
       （消すのではなく隠す＝説明が済んだら戻せる・2026-08-27 発注者指示） */
    hiddenUntilAnnounced?: boolean }>;
};

export const PORTALS: Record<string, PortalConfig> = {
  planting: {
    mode: "checkout",
    id: "planting", category: "植栽", prop: "kiyokawa", propLabel: "清川",
    source: "niwa", workLabel: "植栽作業", window: "11:00〜15:00",
    photoDir: "reports/planting-work", vendorName: "花屋アン",
    notifyFallback: "kazuyoshi.yamada@bonfire.co.jp, airstar.sugimoto@gmail.com",
  },
  exterior: {
    mode: "quarter",
    id: "exterior", category: "外構清掃", prop: "kiyokawa", propLabel: "清川",
    source: "soji", workLabel: "外構清掃", window: "時間は業者様のご都合で",
    photoDir: "reports/exterior-work", vendorName: "エプロン花子",
    groups: [
      { key: "kt", label: "清川＋高砂", props: ["kiyokawa", "takasago"], propLabels: ["清川", "高砂"] },
      { key: "ro", label: "六本松＋大手門", props: ["ropponmatsu", "otemonA", "otemonB"],
        /* 六本松のオープンは2027年2月だが、外構清掃は 2027Q2（4〜6月）から
           ——開業直後は不要という判断（2026-08-27 発注者） */
        propLabels: ["六本松", "大手門A", "大手門B"], availableFrom: "2027-04-01",
        hiddenUntilAnnounced: true },
    ],
    notifyFallback: "kazuyoshi.yamada@bonfire.co.jp, airstar.sugimoto@gmail.com",
  },
  kaiteki: {
    /* 実施内容はメールで詰める。ツールは日程だけ（2026-08-27 発注者決定）。
       部位ごとのタスク分割はやめ、必要な日数だけチェックアウト日を選んでもらう。
       task モードの実装は portal.ts に残してあるので、必要になれば戻せる */
    mode: "checkout",
    id: "kaiteki", category: "清掃", prop: "kiyokawa", propLabel: "清川",
    source: "kaiteki", workLabel: "清掃", window: "11:00〜15:00",
    photoDir: "reports/kaiteki-work", vendorName: "快適クリーン",
    /* 高砂の清掃は起点2028年。棟が増えたらここに足すだけで切替が出る */
    props: [{ key: "kiyokawa", label: "清川" }],
    notifyFallback: "kazuyoshi.yamada@bonfire.co.jp",
  },
};
/** 作業の一覧は settings に置く＝デプロイなしで増減できる（仕様 §3） */
type Task = { key: string; label: string; group: string; prop: string; propLabel: string };

/** 作業（部位）ごとの押さえ状況。taskKey が正本 */
async function takenTasks(db: FirebaseFirestore.Firestore, c: PortalConfig) {
  const snap = await db.collection("jobs")
    .where("category", "==", c.category).where("source", "==", c.source).get();
  const m = new Map<string, { date: string; jobId: string; status: string }>();
  for (const d of snap.docs) {
    const j = d.data() as { taskKey?: string; plantingDate?: string; status?: string };
    if (j.taskKey && j.plantingDate && j.status !== "cancelled") {
      m.set(j.taskKey, { date: j.plantingDate, jobId: d.id, status: String(j.status ?? "") });
    }
  }
  return m;
}


const ALLOW_ORIGIN = ["https://os.yah.homes", "https://yah-os.web.app", "http://localhost:5050"];
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const jpDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${y}年${m}月${dd}日（${"日月火水木金土"[new Date(y, m - 1, dd).getDay()]}）`;
};

/* 通知メールのHTML。Gmail は <body> のスタイルを捨てるので背景は table の bgcolor で持つ */
function noticeHtml(title: string, bodyText: string): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const bodyHtml = esc(bodyText).replace(/\n/g, "<br>");
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"></head>` +
    `<body style="margin:0;padding:0;background:#0f0f0f">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f0f" ` +
    `style="background:#0f0f0f;margin:0;padding:0;width:100%"><tr><td align="center" ` +
    `style="padding:28px 14px;font-family:-apple-system,'Hiragino Sans','Yu Gothic',sans-serif">` +
    `<table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%">` +
    `<tr><td align="center" style="padding:0 0 14px">` +
    `<img src="https://os.yah.homes/logo-yah-onblack.png" alt="yah." width="72" height="72" style="display:block;border:0">` +
    `</td></tr>` +
    `<tr><td bgcolor="#1a1a1a" style="background:#1a1a1a;border:1px solid #2e2e2e;border-radius:12px;padding:22px">` +
    `<p style="margin:0 0 14px;color:#63d297;font-size:15px;font-weight:700">${esc(title)}</p>` +
    `<p style="margin:0;color:#e2e2e2;font-size:14px;line-height:2.0">${bodyHtml}</p>` +
    `</td></tr>` +
    `<tr><td style="padding:14px 0 0;color:#6a6a6a;font-size:11px;line-height:1.7">` +
    `yah. 自動手配（AI）／このメールは業者ポータルから自動送信されています。文面はメンテナンスカード > 定型メール で編集できます` +
    `</td></tr></table></td></tr></table></body></html>`;
}

async function notify(key: "portalSelect" | "portalChange" | "portalUnselect" | "portalReport",
  to: string, vars: Record<string, string>): Promise<void> {
  const t = await loadTemplate(key);
  const body = fill(t.body, vars);
  await sendNotice({ to, subject: fill(t.subject, vars), body,
    html: noticeHtml(fill(t.label.replace(/^ポータル: /, ""), vars), body) });
}

/** チェックアウト日を Beds24 から引く（1時間キャッシュ・直近2ヶ月） */
async function checkoutDays(db: FirebaseFirestore.Firestore, c: PortalConfig, prop?: string) {
  const target = prop ?? c.prop;
  const ref = db.collection("beds24cache").doc(target === c.prop ? c.id : `${c.id}-${target}`);
  const snap = await ref.get();
  const cached = snap.exists ? (snap.data() as { dates: string[]; at: string }) : null;
  if (cached && Date.now() - Date.parse(cached.at) < 3600e3) return { dates: cached.dates, asOf: cached.at };
  try {
    const token = await beds24WriteToken();
    const from = day(Date.now()), to = day(Date.now() + 61 * 86400000);
    const dates = new Set<string>();
    let next: string | null = `${BEDS24_API}/bookings?propertyId=${BOOKING_PROP_IDS[target]}` +
      `&departureFrom=${from}&departureTo=${to}&pageSize=200`;
    while (next) {
      const r = (await fetch(next, { headers: { token } }).then((x) => x.json())) as {
        success?: boolean; data?: Array<{ departure?: string; status?: string }>;
        pages?: { nextPageExists?: boolean; nextPageLink?: string };
      };
      if (!r.success) throw new Error(`beds24: ${JSON.stringify(r).slice(0, 200)}`);
      for (const b of r.data ?? []) {
        if (b.departure && !["cancelled", "black"].includes(String(b.status))) dates.add(b.departure);
      }
      next = r.pages?.nextPageExists ? (r.pages.nextPageLink ?? null) : null;
    }
    const sorted = [...dates].filter((d) => d >= from && d <= to).sort();
    const at = new Date().toISOString();
    await ref.set({ dates: sorted, at });
    return { dates: sorted, asOf: at };
  } catch (e) {
    if (cached) return { dates: cached.dates, asOf: cached.at };   // 落ちていたら最後の断面
    throw e;
  }
}

/** 今の四半期から4つ分の枠。外構のように在庫の制約が無い作業はここから日を決める */
function quarterSlots(now: Date, n = 4) {
  const out: Array<{ key: string; label: string; from: string; to: string }> = [];
  let y = now.getFullYear(), q = Math.floor(now.getMonth() / 3);   // 0..3
  for (let i = 0; i < n; i++) {
    const m0 = q * 3;
    const from = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(y, m0 + 3, 0)).toISOString().slice(0, 10);
    out.push({ key: `${y}Q${q + 1}`, label: `${y}年 第${q + 1}四半期（${m0 + 1}〜${m0 + 3}月）`, from, to: last });
    if (++q > 3) { q = 0; y++; }
  }
  return out;
}

/** 押さえ済みの日。ジョブが正本・取消は空きに戻る。
    group を渡すとそのまとまりだけを見る（棟ごとに複数のジョブが立つため、代表1件を返す） */
async function takenDates(db: FirebaseFirestore.Firestore, c: PortalConfig, group?: string, prop?: string) {
  const q = group
    ? db.collection("jobs").where("category", "==", c.category).where("portalGroup", "==", group)
    : db.collection("jobs").where("category", "==", c.category).where("prop", "==", prop ?? c.prop);
  const snap = await q.get();
  const m = new Map<string, string>();
  for (const d of snap.docs) {
    const j = d.data() as { plantingDate?: string; status?: string };
    if (j.plantingDate && j.status !== "cancelled" && !m.has(j.plantingDate)) m.set(j.plantingDate, d.id);
  }
  return m;
}

/** 他のポータルが同じ棟で押さえている日。ぶつかりを知らせるために引く（塞ぎはしない）。
    屋外どうしなら同日でも困らないので、判断は業者に委ねて「他の業者が入る」とだけ伝える */
async function othersBusy(db: FirebaseFirestore.Firestore, c: PortalConfig) {
  const props = c.groups ? [...new Set(c.groups.flatMap((g) => g.props))] : [c.prop];
  const snap = await db.collection("jobs").where("prop", "in", props.slice(0, 10)).get();
  const m = new Map<string, string[]>();
  for (const d of snap.docs) {
    const j = d.data() as { plantingDate?: string; status?: string; source?: string; vendorName?: string };
    if (!j.plantingDate || j.status === "cancelled" || !j.source) continue;
    if (j.source === c.source) continue;                    // 自分のポータルは除く
    if (!["niwa", "soji", "kaiteki"].includes(j.source)) continue;
    const who = j.vendorName || "他の業者";
    const cur = m.get(j.plantingDate) ?? [];
    if (!cur.includes(who)) m.set(j.plantingDate, [...cur, who]);
  }
  return m;
}

/** 同じ選択で立った兄弟ジョブ（棟ごと）をまとめて動かすために引く */
async function batchJobs(db: FirebaseFirestore.Firestore, batch: string) {
  const snap = await db.collection("jobs").where("portalBatch", "==", batch).get();
  return snap.docs.filter((d) => (d.data() as { status?: string }).status !== "cancelled");
}

/** 書き込みのレート制限（トークン漏れ時のノイズ抑え） */
async function rateOk(db: FirebaseFirestore.Firestore, c: PortalConfig) {
  const hour = new Date().toISOString().slice(0, 13);
  const ref = db.collection("beds24cache").doc(`${c.id}Rate`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? (s.data() as { hour: string; n: number }) : { hour, n: 0 };
    const n = d.hour === hour ? d.n + 1 : 1;
    tx.set(ref, { hour, n });
    return n <= 10;
  });
}

/** トークンの発行・再発行（オーナー側の画面から呼ぶ） */
export async function portalToken(db: FirebaseFirestore.Firestore, id: string, rotate: boolean): Promise<string> {
  const ref = db.collection("settings").doc(id);
  const s = await ref.get();
  const cur = s.exists ? String((s.data() as { token?: string }).token ?? "") : "";
  if (cur && !rotate) return cur;
  const token = crypto.randomBytes(24).toString("base64url");
  await ref.set({ token, updatedAt: new Date().toISOString() }, { merge: true });
  return token;
}

/** 公開エンドポイントの本体。plantingCal / exteriorCal から設定を渡して使う */
export async function handlePortal(c: PortalConfig, req: Request, res: Response): Promise<void> {
  const origin = String(req.headers.origin ?? "");
  if (ALLOW_ORIGIN.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST");
  }
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const db = agencyDb();
    const t = String(req.query.t ?? (req.body as { t?: string } | undefined)?.t ?? "");
    const slug = String(req.query.s ?? (req.body as { s?: string } | undefined)?.s ?? "");
    const st = await db.collection("settings").doc(c.id).get();
    const sd = (st.data() ?? {}) as { token?: string; slug?: string; notifyTo?: string; notes?: string;
      showGroups?: string[]; tasks?: unknown[]; deadlineDays?: number };
    const token = String(sd.token ?? "");
    const notifyTo = String(sd.notifyTo ?? "") || c.notifyFallback;
    /* 認可はスラッグ（業者の短縮URL＝不変）優先。トークン（?t=）は後方互換で残すが、
       git/URLに露出した鍵はローテーション済みで旧値は死んでいる（レビュー2026-08-28 #5）。
       業者に渡したURLは一切変わらない——変わるのは内部の鍵だけ */
    const bySlug = !!sd.slug && !!slug && slug === sd.slug;
    const byToken = !!token && !!t && t === token;
    if (!bySlug && !byToken) { res.status(404).send("not found"); return; }

    /* 対象の棟。許可リストに無い値は既定へ落とす（勝手な棟を触らせない） */
    const wanted = String(req.query.prop ?? (req.body as { prop?: string } | undefined)?.prop ?? "");
    const allowed = c.props ?? [{ key: c.prop, label: c.propLabel }];
    const cur = allowed.find((x) => x.key === wanted) ?? allowed[0];

    if (req.method === "GET") {
      const base = { ok: true, mode: c.mode, prop: cur.key, propLabel: cur.label,
        props: allowed, workLabel: c.workLabel, vendorName: c.vendorName ?? "",
        window: c.window, notes: sd.notes ?? "" };
      if (c.mode === "task") {
        const [{ dates, asOf }, taken] = await Promise.all([checkoutDays(db, c), takenTasks(db, c)]);
        const tasks = (sd.tasks ?? []) as Task[];
        /* 水まわりは最初の1件を決めてから deadlineDays 以内に終わらせる（仕様 §2） */
        const first = tasks.map((t) => taken.get(t.key)?.date).filter(Boolean).sort()[0];
        const deadline = first ? day(Date.parse(first) + Number(sd.deadlineDays ?? 30) * 86400000) : null;
        const busyT = await othersBusy(db, c);
        res.json({ ...base, asOf, days: dates, deadline, deadlineGroup: "水まわり",
          busy: Object.fromEntries(busyT),
          tasks: tasks.map((t) => ({ ...t, date: null, jobId: null, status: null, ...(taken.get(t.key) ?? {}) })) });
        return;
      }
      if (c.mode === "quarter") {
        const today = day(Date.now());
        const slots = quarterSlots(new Date());
        /* 説明前のまとまりは出さない（業者を混乱させないため） */
        const shown = (c.groups ?? []).filter((g) => !g.hiddenUntilAnnounced || (sd.showGroups ?? []).includes(g.key));
        const groups = await Promise.all(shown.map(async (g) => {
          const taken = await takenDates(db, c, g.key);
          return {
            key: g.key, label: g.label, availableFrom: g.availableFrom ?? null,
            quarters: slots.map((q) => {
              const hit = [...taken.entries()].find(([d]) => d >= q.from && d <= q.to);
              const from = q.from < today ? today : q.from;
              /* 未オープンの棟は、開業日より前の四半期を選べなくする */
              const blocked = !!g.availableFrom && q.to < g.availableFrom;
              return { ...q, from: g.availableFrom && from < g.availableFrom ? g.availableFrom : from,
                blocked, date: hit?.[0] ?? null, jobId: hit?.[1] ?? null };
            }),
          };
        }));
        res.json({ ...base, asOf: new Date().toISOString(), groups,
          busy: Object.fromEntries(await othersBusy(db, c)) });
        return;
      }
      const [{ dates, asOf }, taken] = await Promise.all([
        checkoutDays(db, c, cur.key), takenDates(db, c, undefined, cur.key)]);
      const busy = await othersBusy(db, c);
      res.json({ ...base, asOf, busy: Object.fromEntries(busy),
        days: dates.map((d) => ({ date: d, taken: taken.has(d), busy: busy.get(d) ?? null })) });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }

    const body = (req.body ?? {}) as {
      action?: string; date?: string; from?: string; group?: string; task?: string; vendor?: string; text?: string;
      photos?: Array<{ name?: string; b64?: string }>;
    };
    if (!(await rateOk(db, c))) { res.status(429).json({ ok: false, error: "しばらく待ってから送ってください" }); return; }
    const now = new Date().toISOString();
    const vars = (o: Record<string, string>) => ({ propLabel: c.propLabel, workLabel: c.workLabel, ...o });

    if (body.action === "select") {
      const date = String(body.date ?? "");
      const vendor = c.vendorName ?? String(body.vendor ?? "").slice(0, 60);
      if (c.mode === "task") {
        const tasks = (sd.tasks ?? []) as Task[];
        const task = tasks.find((x) => x.key === String(body.task ?? ""));
        if (!task) { res.status(400).json({ ok: false, error: "作業が指定されていません" }); return; }
        const takenT = await takenTasks(db, c);
        if (takenT.has(task.key)) { res.status(409).json({ ok: false, error: `${task.label}は ${takenT.get(task.key)!.date} で決まっています` }); return; }
        const { dates } = await checkoutDays(db, c);
        if (!dates.includes(date)) { res.status(400).json({ ok: false, error: "この日は作業できません（予約状況が変わった可能性）" }); return; }
        /* 水まわりは最初の1件から1ヶ月以内（仕様 §2）。屋外には期限を置かない */
        if (task.group === "水まわり") {
          const first = tasks.filter((x) => x.group === "水まわり")
            .map((x) => takenT.get(x.key)?.date).filter(Boolean).sort()[0];
          if (first) {
            const limit = day(Date.parse(first) + Number(sd.deadlineDays ?? 30) * 86400000);
            if (date > limit) { res.status(400).json({ ok: false, error: `水まわりは ${limit} までに終わらせてください` }); return; }
          }
        }
        const ref = await db.collection("jobs").add({
          type: "spot", source: c.source, category: c.category, prop: task.prop,
          title: `${task.label}（${task.propLabel}・${date}）`,
          dueMonth: date.slice(0, 7), plantingDate: date, vendorName: vendor,
          taskKey: task.key, taskGroup: task.group,
          status: "confirmed", createdAt: now,
          note: "業者がカレンダーから日程を選択（自動確定・取消はメンテナンスカードで）",
          timeline: [{ at: now, status: "confirmed", by: "vendor", note: `${vendor || "業者"} が ${date} を選択（${c.source}・${task.label}）` }],
        });
        await notify("portalSelect", notifyTo,
          vars({ jobId: ref.id, plantingDate: jpDate(date), vendorName: vendor || "—",
            propLabel: task.propLabel, workLabel: task.label })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
        res.json({ ok: true, jobId: ref.id });
        return;
      }
      const g = c.groups?.find((x) => x.key === String(body.group ?? "")
        && (!x.hiddenUntilAnnounced || (sd.showGroups ?? []).includes(x.key)));
      const taken = await takenDates(db, c, g?.key, cur.key);
      if (c.mode === "quarter") {
        if (c.groups && !g) { res.status(400).json({ ok: false, error: "対象のまとまりが指定されていません" }); return; }
        const qs = quarterSlots(new Date());
        const q = qs.find((x) => date >= x.from && date <= x.to);
        if (!q) { res.status(400).json({ ok: false, error: "選べるのは今の四半期から4つ先までです" }); return; }
        if (date < day(Date.now())) { res.status(400).json({ ok: false, error: "過ぎた日は選べません" }); return; }
        if (g?.availableFrom && date < g.availableFrom) {
          res.status(400).json({ ok: false, error: `${g.label}は ${g.availableFrom} 以降で選んでください` }); return;
        }
        const dup = [...taken.keys()].find((d) => d >= q.from && d <= q.to);
        if (dup) { res.status(409).json({ ok: false, error: `${q.label}は ${dup} で決まっています` }); return; }
        /* まとまりで1回選ぶと、棟ごとにジョブが立つ。費用は頭割り（2026-08-27 発注者決定）。
           業者の操作は1回・帳簿は棟別、を両立させる */
        if (g) {
          const batch = crypto.randomBytes(9).toString("base64url");
          const share = Math.round((1 / g.props.length) * 1000) / 1000;
          const ids: string[] = [];
          for (const [i, prop] of g.props.entries()) {
            const ref = await db.collection("jobs").add({
              type: "spot", source: c.source, category: c.category, prop,
              title: `${c.workLabel}（${g.propLabels[i]}・${date}）`,
              dueMonth: date.slice(0, 7), plantingDate: date, vendorName: vendor,
              portalGroup: g.key, portalBatch: batch, costShare: share,
              status: "confirmed", createdAt: now,
              note: `業者がカレンダーから日程を選択（${g.label} をまとめて実施・費用は頭割り ${Math.round(share * 100)}%）`,
              timeline: [{ at: now, status: "confirmed", by: "vendor", note: `${vendor || "業者"} が ${date} を選択（${c.source}・${g.label}）` }],
            });
            ids.push(ref.id);
          }
          await notify("portalSelect", notifyTo,
            vars({ jobId: ids[0], plantingDate: jpDate(date), vendorName: vendor || "—",
              propLabel: g.label })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
          res.json({ ok: true, jobId: ids[0], jobIds: ids });
          return;
        }
      } else {
        const { dates } = await checkoutDays(db, c, cur.key);
        if (!dates.includes(date)) { res.status(400).json({ ok: false, error: "この日は作業できません（予約状況が変わった可能性）" }); return; }
        if (taken.has(date)) { res.status(409).json({ ok: false, error: "この日は既に選択されています" }); return; }
      }
      const ref = await db.collection("jobs").add({
        type: "spot", source: c.source, category: c.category, prop: cur.key,
        title: `${c.workLabel}（${cur.label}・${date} ${c.window}）`,
        dueMonth: date.slice(0, 7), plantingDate: date, vendorName: vendor,
        status: "confirmed", createdAt: now,
        note: "業者がカレンダーから日程を選択（自動確定・取消はメンテナンスカードで）",
        timeline: [{ at: now, status: "confirmed", by: "vendor", note: `${vendor || "業者"} が ${date} を選択（${c.source}）` }],
      });
      await notify("portalSelect", notifyTo,
        vars({ jobId: ref.id, plantingDate: jpDate(date), vendorName: vendor || "—" })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
      res.json({ ok: true, jobId: ref.id });
      return;
    }

    /* 日程の変更。取消→再選択の2手を1手にする。ジョブは同じものを動かす＝履歴が切れない */
    if (body.action === "change") {
      const from = String(body.from ?? ""), date = String(body.date ?? "");
      const taken = await takenDates(db, c, String(body.group ?? "") || undefined, cur.key);
      const jobId = taken.get(from);
      if (!jobId) { res.status(404).json({ ok: false, error: "変更元の日が見つかりません" }); return; }
      if (date === from) { res.json({ ok: true, jobId }); return; }
      if (taken.has(date)) { res.status(409).json({ ok: false, error: "その日は既に決まっています" }); return; }
      if (date < day(Date.now())) { res.status(400).json({ ok: false, error: "過ぎた日は選べません" }); return; }
      if (c.mode === "quarter") {
        const q = quarterSlots(new Date()).find((x) => from >= x.from && from <= x.to);
        if (!q || date < q.from || date > q.to) {
          res.status(400).json({ ok: false, error: "同じ四半期のなかで選んでください" }); return;
        }
      } else {
        const { dates } = await checkoutDays(db, c);
        if (!dates.includes(date)) { res.status(400).json({ ok: false, error: "この日は作業できません" }); return; }
      }
      const ref = db.collection("jobs").doc(jobId);
      const j = (await ref.get()).data() as { status?: string; source?: string; vendorName?: string;
        timeline?: unknown[]; portalBatch?: string; title?: string };
      if (j.source !== c.source || j.status !== "confirmed") {
        res.status(409).json({ ok: false, error: "この日は変更できません（報告済みか、こちらで確定済み）" }); return;
      }
      /* まとまりで立てたジョブは兄弟もいっしょに動かす（棟ごとに日がズレない） */
      const sibs = j.portalBatch ? await batchJobs(db, j.portalBatch) : [];
      const targets = sibs.length ? sibs : [await ref.get()];
      for (const d of targets) {
        const cur = d.data() as { timeline?: unknown[]; title?: string };
        await d.ref.set({
          plantingDate: date, dueMonth: date.slice(0, 7),
          title: String(cur.title ?? "").replace(/・\d{4}-\d{2}-\d{2}/, `・${date}`),
          timeline: [...(cur.timeline ?? []), { at: now, status: "confirmed", by: "vendor", note: `業者が日程を変更: ${from} → ${date}（${c.source}）` }],
        }, { merge: true });
      }
      await notify("portalChange", notifyTo,
        vars({ jobId, plantingDate: jpDate(date), beforeDate: jpDate(from), vendorName: String(j.vendorName ?? "—") })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
      res.json({ ok: true, jobId });
      return;
    }

    /* 選び直し。done（報告済み）以降は取り消せない */
    if (body.action === "unselect") {
      const date = String(body.date ?? "");
      const jobId = c.mode === "task"
        ? [...(await takenTasks(db, c)).values()].find((x) => x.date === date)?.jobId
        : (await takenDates(db, c, String(body.group ?? "") || undefined, cur.key)).get(date);
      if (!jobId) { res.status(404).json({ ok: false, error: "この日は選択されていません" }); return; }
      const ref = db.collection("jobs").doc(jobId);
      const j = (await ref.get()).data() as { status?: string; source?: string; vendorName?: string;
        timeline?: unknown[]; portalBatch?: string };
      if (j.source !== c.source || j.status !== "confirmed") {
        res.status(409).json({ ok: false, error: "この日は取り消せません（報告済みか、こちらで確定済み）" }); return;
      }
      const sibs2 = j.portalBatch ? await batchJobs(db, j.portalBatch) : [];
      for (const d of (sibs2.length ? sibs2 : [await ref.get()])) {
        const cur = d.data() as { timeline?: unknown[] };
        await d.ref.set({ status: "cancelled",
          timeline: [...(cur.timeline ?? []), { at: now, status: "cancelled", by: "vendor", note: `業者がカレンダーから取消（${c.source}）` }],
        }, { merge: true });
      }
      await notify("portalUnselect", notifyTo,
        vars({ jobId, plantingDate: jpDate(date), vendorName: String(j.vendorName ?? "—") })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
      res.json({ ok: true });
      return;
    }

    if (body.action === "report") {
      const date = String(body.date ?? "");
      const text = String(body.text ?? "").slice(0, 2000);
      if (!date || !text) { res.status(400).json({ ok: false, error: "日付と作業内容を入れてください" }); return; }
      const photos: string[] = [];
      const bucket = getStorage().bucket("yah-homes-os-archive");
      for (const [i, ph] of (body.photos ?? []).slice(0, 5).entries()) {
        const buf = Buffer.from(String(ph.b64 ?? ""), "base64");
        if (!buf.length || buf.length > 5 * 1024 * 1024) continue;
        const safe = String(ph.name ?? "photo").replace(/[^\w.\-]/g, "_").slice(0, 60);
        const path = `${c.photoDir}/${date.slice(0, 7)}/${date}_${i + 1}_${safe}`;
        await bucket.file(path).save(buf, { contentType: "image/jpeg" });
        photos.push(`gs://yah-homes-os-archive/${path}`);
      }
      const ev = { at: now, status: "done", by: "vendor", note: `業者報告: ${text}` };
      let jobId = (await takenDates(db, c, String(body.group ?? "") || undefined)).get(date);
      if (jobId) {
        const ref = db.collection("jobs").doc(jobId);
        const j0 = (await ref.get()).data() as { portalBatch?: string };
        /* まとまりで立てたジョブは兄弟もいっしょに done にする（片方だけ残らない） */
        const sibs = j0.portalBatch ? await batchJobs(db, j0.portalBatch) : [];
        for (const d of (sibs.length ? sibs : [await ref.get()])) {
          const cur = d.data() as { timeline?: unknown[]; photos?: string[] };
          await d.ref.set({ status: "done", vendorReported: true, reportText: text, reportedAt: now,
            photos: [...(cur.photos ?? []), ...photos], timeline: [...(cur.timeline ?? []), ev] }, { merge: true });
        }
      } else {
        /* 選択なしの飛び込み報告は、vendorReported付きの突発ジョブとして残す */
        const ref = await db.collection("jobs").add({
          type: "spot", source: c.source, category: c.category, prop: c.prop,
          title: `${c.workLabel}（${c.propLabel}・${date}・報告のみ）`, dueMonth: date.slice(0, 7),
          plantingDate: date, status: "done", vendorReported: true, reportText: text,
          reportedAt: now, createdAt: now, photos, timeline: [ev],
        });
        jobId = ref.id;
      }
      await notify("portalReport", notifyTo,
        vars({ jobId, plantingDate: jpDate(date), reportText: text, photoCount: String(photos.length) })).catch((e) => logger.error("portal/notify 失敗", { portal: c.id, error: String(e) }));
      res.json({ ok: true, jobId, photos: photos.length });
      return;
    }

    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
}
