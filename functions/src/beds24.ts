/**
 * Beds24 クラウド定点観測（spec_beds24_cloud_observer.md v0.3）
 * - beds24DailyObserver : 毎朝 08:00 JST — 予約差分→シート記入→日次メール
 * - beds24WeeklyReport  : 毎週月曜 08:00 JST — 国別スコアカード週次メール
 * 認可: Sheets/GA4 は実行サービスアカウント（ADC）で取得。シートとGA4に閲覧/編集権限を事前共有。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { GoogleAuth } from "google-auth-library";
import nodemailer from "nodemailer";
import { esc, mailHtml, SITE_URL } from "./mail-template.js";

const REGION = "asia-northeast1";
const TZ = "Asia/Tokyo";
const SHEET_ID = "1DxniZSvdzb5s4Zjt_6MYgWkkFq7q7HlCxyIUZn6hMfk";
const GA4_PROPERTY = "539535968"; // www.yah.homes
const PROPS: Record<number, string> = { 278158: "清川", 291238: "高砂" };
const CAPACITY_NIGHTS_YEAR = 730; // 2棟×365（週次レポート用）

const BEDS24_TOKEN = defineSecret("BEDS24_TOKEN");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const REPORT_TO = "kazuyoshi.yamada@bonfire.co.jp";

type Booking = {
  id: number; propertyId: number; status: string; arrival: string; departure: string;
  firstName?: string; lastName?: string; referer?: string; apiSource?: string;
  country2?: string; bookingTime?: string; cancelTime?: string; numAdult?: number; numChild?: number;
};

const jstToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const nights = (b: Booking) => Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000);
const isActive = (b: Booking) => b.status === "confirmed" || b.status === "new";
const isGuest = (b: Booking) =>
  b.status !== "black" && !/オーナー|yamada|山田|sugimoto|杉本|工事|テスト/i.test(`${b.firstName ?? ""} ${b.lastName ?? ""} ${b.referer ?? ""} ${b.apiSource ?? ""}`);

async function fetchBookings(token: string): Promise<Booking[]> {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 550 * 86400000).toISOString().slice(0, 10);
  const out: Booking[] = [];
  let next: string | null =
    `https://beds24.com/api/v2/bookings?arrivalFrom=${from}&arrivalTo=${to}&pageSize=200&includeCancelled=true`;
  while (next) {
    const r: any = await fetch(next, { headers: { token } }).then((x) => x.json());
    if (!r.success) throw new Error(`Beds24 API error: ${JSON.stringify(r).slice(0, 300)}`);
    out.push(...r.data);
    next = r.pages?.nextPageExists ? r.pages.nextPageLink : null;
  }
  return out.filter((b) => PROPS[b.propertyId]); // 本番2物件のみ（テスト物件を除外）
}

async function googleToken(scopes: string[]): Promise<string> {
  const auth = new GoogleAuth({ scopes });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("failed to obtain google access token");
  return t.token;
}

async function sheetGet(range: string, tok: string): Promise<string[][]> {
  const j: any = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { authorization: `Bearer ${tok}` } }
  ).then((r) => r.json());
  return j.values ?? [];
}

async function sheetWrite(data: { range: string; values: (string | number)[][] }[], tok: string) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!r.ok) throw new Error(`sheets write failed: ${r.status} ${await r.text()}`);
}

function mailer(user: string, pass: string) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass },
  });
}

/**
 * 定点メールを送る。text は常に添える（プレーンテキスト版）が、
 * 表示は index.ts と共通の mailHtml テンプレートに載せる（日次メールと同じ枠）。
 * rows/blocks を渡さない場合は text 全体を「サマリー」ブロックに流し込む。
 */
async function sendMail(
  subject: string,
  text: string,
  opts?: {
    heading?: string;
    rows?: [string, string][];
    blocks?: { title: string; body: string }[];
    variant?: "brand" | "alert";
  },
) {
  const t = mailer(SMTP_USER.value(), SMTP_PASS.value());
  const today = jstToday();
  await t.sendMail({
    from: `"yah.homes 定点" <${SMTP_USER.value()}>`,
    to: REPORT_TO,
    subject,
    text,
    html: mailHtml({
      heading: opts?.heading ?? (subject.replace(/^【[^】]*】\s*/, "") || "定点観測"),
      badge: `週次スコアカード|${today}`,
      rows: opts?.rows,
      blocks: opts?.blocks ?? [{ title: "サマリー", body: esc(text) }],
      cta: { label: "予約管理を開く", href: `${SITE_URL}/admin/bookings/` },
      variant: opts?.variant,
    }),
  });
}

function label(b: Booking): string {
  const src = b.referer || b.apiSource || "?";
  return `${PROPS[b.propertyId] ?? b.propertyId} ${b.arrival}〜${nights(b)}泊 ` +
    `${b.firstName ?? ""} ${b.lastName ?? ""} [${src}]${b.country2 ? " " + b.country2 : ""}`;
}

function forwardNights(bookings: Booking[], today: string) {
  const fwd: Record<string, number> = { 清川: 0, 高砂: 0 };
  for (const b of bookings) {
    if (!isActive(b) || !isGuest(b)) continue;
    const start = b.arrival >= today ? b.arrival : today;
    const n = Math.max(0, Math.round((Date.parse(b.departure) - Date.parse(start)) / 86400000));
    const p = PROPS[b.propertyId];
    if (p && n > 0) fwd[p] += n;
  }
  return fwd;
}

// ---- 週次: 毎週月曜 08:00 JST（国別スコアカード） --------------------------
export const beds24WeeklyReport = onSchedule(
  { region: REGION, schedule: "0 8 * * 1", timeZone: TZ, secrets: [BEDS24_TOKEN, SMTP_USER, SMTP_PASS], timeoutSeconds: 300, serviceAccount: "yah-homes@appspot.gserviceaccount.com" },
  async () => {
    const today = jstToday();
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("sv-SE", { timeZone: TZ });
      const bookings = await fetchBookings(BEDS24_TOKEN.value());
      const weekly = bookings.filter(
        (b) => isGuest(b) && isActive(b) && (b.bookingTime ?? "").slice(0, 10) >= weekAgo
      );
      // キャンセルは「今週キャンセルされたもの」= cancelTime 基準（無い場合のみ bookingTime で近似）
      const cxl = bookings.filter(
        (b) => isGuest(b) && b.status === "cancelled" && ((b.cancelTime || b.bookingTime) ?? "").slice(0, 10) >= weekAgo
      );
      const fwd = forwardNights(bookings, today);
      const fwdTotal = fwd.清川 + fwd.高砂;

      // 国籍分類（country優先・なければ文字種）
      const nat = (b: Booking): string => {
        if (b.country2) return b.country2;
        const name = `${b.firstName ?? ""} ${b.lastName ?? ""}`;
        if (/[가-힣]/.test(name)) return "KR?";
        if (/[぀-ヿ]/.test(name)) return "JP?"; // かな含み＝日本
        if (/[一-鿿]/.test(name)) return "漢字圏(日/中)?"; // 漢字のみは日中の判別不能
        return "不明";
      };
      const byNat: Record<string, { g: number; n: number }> = {};
      for (const b of weekly) {
        const k = nat(b);
        byNat[k] = byNat[k] ?? { g: 0, n: 0 };
        byNat[k].g += 1; byNat[k].n += nights(b);
      }

      // GA4: click_airbnb 国別（直近7日）
      let ga4Lines: string[] = [];
      let clickTotal = 0;
      try {
        const tok = await googleToken(["https://www.googleapis.com/auth/analytics.readonly"]);
        const rep: any = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
              dimensions: [{ name: "countryId" }],
              metrics: [{ name: "eventCount" }],
              dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "click_airbnb" } } },
            }),
          }
        ).then((r) => r.json());
        for (const row of rep.rows ?? []) {
          const c = row.dimensionValues[0].value, v = Number(row.metricValues[0].value);
          clickTotal += v;
          ga4Lines.push(`  ${c}: ${v}件`);
        }
      } catch (e) {
        ga4Lines = [`  （GA4取得失敗: ${String(e).slice(0, 120)}）`];
      }

      // adsタブ: 直近7日の市場別費用・CV
      let adsLines: string[] = [];
      try {
        const tok = await googleToken(["https://www.googleapis.com/auth/spreadsheets"]);
        const rows = await sheetGet("ads!A:G", tok);
        // シートは「¥1,234」等の表示形式で返るため記号・桁区切りを除去して数値化
        const num = (x: unknown) => Number(String(x ?? "").replace(/[^0-9.-]/g, "")) || 0;
        const agg: Record<string, { cost: number; clicks: number; cv: number }> = {};
        for (const r of rows.slice(1)) {
          if ((r[0] ?? "") < weekAgo) continue;
          const name = (r[1] ?? "").replace("yah.homes_", "");
          agg[name] = agg[name] ?? { cost: 0, clicks: 0, cv: 0 };
          agg[name].cost += num(r[2]); agg[name].clicks += num(r[3]); agg[name].cv += num(r[5]);
        }
        adsLines = Object.entries(agg).map(([k, v]) =>
          `  ${k}: ¥${Math.round(v.cost).toLocaleString()} / ${v.clicks}クリック / CV${v.cv}` +
          (v.cv > 0 ? ` / CPA¥${Math.round(v.cost / v.cv).toLocaleString()}` : " / CVゼロ")
        );
      } catch (e) {
        adsLines = [`  （adsタブ取得失敗: ${String(e).slice(0, 120)}）`];
      }

      const weeklyNights = weekly.reduce((s, b) => s + nights(b), 0);
      // 基準帯23〜28%は click_airbnb→Airbnb予約 で校正済みのため、分子はAirbnb経由のみ
      const airbnbBookings = weekly.filter((b) => /airbnb/i.test(b.referer ?? "")).length;
      const ratio = clickTotal > 0 ? ((airbnbBookings / clickTotal) * 100).toFixed(0) : "—";

      const body = [
        `■ 週間サマリ（予約日ベース・過去7日）`,
        `新規 ${weekly.length}組 ${weeklyNights}泊 / キャンセル ${cxl.length}件`,
        `先付け残高: 清川${fwd.清川} / 高砂${fwd.高砂} / 計${fwdTotal}泊（${((fwdTotal / CAPACITY_NIGHTS_YEAR) * 100).toFixed(1)}%・適正帯28〜33%）`,
        ``,
        `■ 国籍別の新規予約`,
        ...Object.entries(byNat).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `  ${k}: ${v.g}組 ${v.n}泊`),
        ``,
        `■ click_airbnb 国別（GA4・7日）計${clickTotal}件`,
        ...ga4Lines,
        ``,
        `■ 広告 市場別（adsタブ・7日）`,
        ...adsLines,
        ``,
        `■ 手渡し→予約比率: ${ratio}%（Airbnb予約${airbnbBookings}÷click_airbnb${clickTotal}・基準帯23〜28%）`,
        ``,
        `明細（新規）:`,
        ...weekly.map((b) => `  + ${label(b)}`),
      ].join("\n");

      // HTMLは日次メールと同じ枠（mailHtml）。要点は rows に、明細は blocks に分けて載せる。
      const fwdPct = ((fwdTotal / CAPACITY_NIGHTS_YEAR) * 100).toFixed(1);
      const rows: [string, string][] = [
        ["新規予約", esc(`${weekly.length}組 / ${weeklyNights}泊`)],
        ["キャンセル", esc(`${cxl.length}件`)],
        ["先付け残高", esc(`計${fwdTotal}泊（清川${fwd.清川} / 高砂${fwd.高砂}）`)],
        ["先付け率", esc(`${fwdPct}%（適正帯 28〜33%）`)],
        ["手渡し→予約", esc(`${ratio}%（基準帯 23〜28%）`)],
      ];
      const list = (lines: string[]) => esc(lines.join("\n")) || "（データなし）";
      const blocks = [
        { title: "国籍別の新規予約", body: list(Object.entries(byNat).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k}: ${v.g}組 ${v.n}泊`)) },
        { title: `click_airbnb 国別（GA4・7日）計${clickTotal}件`, body: list(ga4Lines.map((l) => l.trim())) },
        { title: "広告 市場別（adsタブ・7日）", body: list(adsLines.map((l) => l.trim())) },
        { title: "明細（新規）", body: list(weekly.map((b) => `+ ${label(b)}`)) },
      ];
      await sendMail(
        `【週次スコアカード】新規${weekly.length}組${weeklyNights}泊・先付け${fwdTotal}泊`,
        body,
        { heading: `新規 ${weekly.length}組 ${weeklyNights}泊`, rows, blocks },
      );
      logger.info("beds24WeeklyReport done", { weekly: weekly.length });
    } catch (e) {
      logger.error("beds24WeeklyReport failed", e);
      try { await sendMail(`【週次スコアカード・エラー】${today}`, String(e), { heading: "週次スコアカードの取得に失敗", variant: "alert" }); } catch { /* noop */ }
      throw e;
    }
  }
);
