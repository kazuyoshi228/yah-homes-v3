/**
 * 観光客数の推移 — 月次インバウンド定点（spec_tourism_stats_20260830・2026-08-30 発注者承認）
 *
 * e-Stat（政府統計API）から2系統を毎月取り込む:
 *   stay  = 外国人延べ宿泊者数（福岡県・宿泊旅行統計調査）
 *   entry = 外国人入国者数（福岡空港＋博多港・出入国管理統計）
 * 正本は tourismStats（一次事実のみ）。docID=`${metric}-${month}` で冪等。
 *
 * 分類コード（福岡県・福岡空港…）は表ごとに違うため、実行のたびに getMetaInfo から
 * 名前で引き当てる——コードを焼き込むと表の改定で静かにズレる。
 * appId は settings/tourism.appId（発注者が e-Stat 登録後に自分で入れる。AIはキー値を扱わない）。
 */
import { agencyDb } from "./engine.js";

const API = "https://api.e-stat.go.jp/rest/3.0/app/json";
/* 既定の統計表ID（settings/tourism で上書き可＝表の改定時にデプロイ不要で差し替えられる）。
   実査（2026-08-30）: 宿泊旅行統計のe-Stat DB（API対応）は全32表が2016年で止まっており、
   現行月次はExcel公表のみ＝**stayはAPIで自動化できない**。stay は取込パイプ（観光庁公表資料の
   スクショ→AI読取→検収）で手動投入する。entry は「総括 港別 入国外国人」（毎月更新・実測済み） */
const DEFAULT_SOURCES = {
  stay:  { statsDataId: "", label: "宿泊旅行統計調査（観光庁・手動投入）", pick: ["福岡県"], catTotal: "総数" },
  entry: { statsDataId: "0003449064", label: "出入国管理統計 総括 港別 入国外国人（福岡空港＋博多）",
    pick: ["福岡県_福岡（空港）", "福岡県_博多"], catTotal: "総数" },
} as const;

type ClassItem = { "@code": string; "@name": string };
type ClassObj = { "@id": string; CLASS: ClassItem | ClassItem[] };
const arr = <T,>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** e-Stat の時間名「2026年4月」→ "2026-04"。年計・四半期は null（純関数・テスト対象） */
export function parseTimeName(name: string): string | null {
  const m = name.match(/^(\d{4})年(\d{1,2})月$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
}

/** 前年同月比％（純関数・テスト対象）。前年が無い/0なら null */
export function yoy(cur: number, prev: number | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round((cur / prev - 1) * 1000) / 10;
}

async function estat(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${API}/${path}?${q}`);
  if (!res.ok) throw new Error(`e-Stat ${path}: HTTP ${res.status}`);
  return await res.json() as Record<string, unknown>;
}

/** メタ情報から「この名前を含む分類」のコードを引き当てる */
function findCodes(classObjs: ClassObj[], names: string[]): { paramId: string; codes: string[] } | null {
  for (const co of classObjs) {
    const items = arr(co.CLASS);
    const hit = names.map((n) => items.find((c) => String(c["@name"]).includes(n))).filter(Boolean) as ClassItem[];
    if (hit.length === names.length) return { paramId: String(co["@id"]), codes: hit.map((c) => c["@code"]) };
  }
  return null;
}
const cdParam = (id: string) => "cd" + id.charAt(0).toUpperCase() + id.slice(1);   // area→cdArea, cat01→cdCat01

/** 1系統ぶんを取得して {month: 合計値} にする */
async function fetchMetric(appId: string, metric: "stay" | "entry",
  src: { statsDataId: string; pick: readonly string[]; catTotal: string }): Promise<Record<string, number>> {
  const meta = await estat("getMetaInfo", { appId, statsDataId: src.statsDataId });
  const mi = (meta.GET_META_INFO as Record<string, unknown>)?.["METADATA_INF"] as Record<string, unknown>;
  const classObjs = arr((mi?.CLASS_INF as Record<string, unknown>)?.CLASS_OBJ as ClassObj[]);
  const place = findCodes(classObjs, [...src.pick]);
  if (!place) throw new Error(`${metric}: 分類に ${src.pick.join("/")} が見つからない（表の改定を疑う）`);
  const total = findCodes(classObjs.filter((c) => c["@id"] !== place.paramId), [src.catTotal]);
  const timeObj = classObjs.find((c) => c["@id"] === "time");
  const timeMap = new Map<string, string>();
  for (const t of arr(timeObj?.CLASS)) {
    const ym = parseTimeName(String(t["@name"]));
    if (ym) timeMap.set(String(t["@code"]), ym);
  }
  const params: Record<string, string> = { appId, statsDataId: src.statsDataId, limit: "3000" };
  params[cdParam(place.paramId)] = place.codes.join(",");
  if (total) params[cdParam(total.paramId)] = total.codes.join(",");
  const data = await estat("getStatsData", params);
  const root = (data.GET_STATS_DATA as Record<string, unknown>)?.["STATISTICAL_DATA"] as Record<string, unknown>;
  const values = arr((root?.DATA_INF as Record<string, unknown>)?.VALUE as Array<Record<string, string>>);
  const out: Record<string, number> = {};
  for (const v of values) {
    const ym = timeMap.get(String(v["@time"]));
    if (!ym) continue;                                   // 年計・四半期は捨てる
    const n = Number(String(v["$"]).replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;                   // "-"（秘匿・未集計）は捨てる
    out[ym] = (out[ym] ?? 0) + n;                        // entry は2港の合算になる
  }
  return out;
}

/** 毎月の取り込み本体。appId 未設定なら黙って skip（健全性は health の鮮度検査が見張る） */
export async function fetchTourismStats(): Promise<{ skipped?: string; written: number; latest: string | null }> {
  const db = agencyDb();
  const st = (await db.collection("settings").doc("tourism").get()).data() ?? {};
  const appId = String(st.appId ?? "");
  if (!appId) return { skipped: "appId未設定（settings/tourism.appId に e-Stat の appId を入れる）", written: 0, latest: null };
  let written = 0; let latest: string | null = null;
  const since = new Date(); since.setMonth(since.getMonth() - 26);   // 前年比のため26ヶ月保持
  const sinceYm = since.toISOString().slice(0, 7);
  for (const metric of ["stay", "entry"] as const) {
    const src = { ...DEFAULT_SOURCES[metric], ...((st[metric] ?? {}) as object) };
    if (!src.statsDataId) continue;   // APIで取れない系統（stay）は手動投入＝ここでは触らない
    const byMonth = await fetchMetric(appId, metric, src);
    for (const [month, value] of Object.entries(byMonth)) {
      if (month < sinceYm) continue;
      await db.collection("tourismStats").doc(`${metric}-${month}`).set({
        month, metric, value, source: src.label, fetchedAt: new Date().toISOString() });
      written++;
      if (!latest || month > latest) latest = month;
    }
  }
  return { written, latest };
}
