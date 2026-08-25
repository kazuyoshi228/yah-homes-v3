/**
 * 拠点の台帳 — 「その拠点は宿泊事業の物件か」という人の判断の唯一の置き場
 *
 * 2026-08-25 まで、この判断は monthly / props / yields / utilities（サーバ）と
 * reports / utilities（画面）の6か所に直書きされていた。拠点が増えるたびに全部直す必要があり、
 * 1か所忘れるとカードごとに合計が食い違う（実際に光熱費カードだけ千人町込みになっていた）。
 *
 * 正本は Firestore の places コレクション。判断はそこだけに書く。
 */
import { agencyDb } from "./engine.js";

export interface PlaceDoc { place: string; label?: string; lodging?: boolean; prop?: string; note?: string }

let cache: { at: number; rows: PlaceDoc[] } | null = null;

/** 台帳を読む。同じ呼び出しの中で何度も引かれるので短時間だけ覚えておく */
export async function placeBook(): Promise<PlaceDoc[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const snap = await agencyDb().collection("places").get();
  const rows = snap.docs.map((d) => ({ place: d.id, ...(d.data() as Omit<PlaceDoc, "place">) }));
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * 宿泊事業の拠点だけを残す判定を返す。
 * 台帳に無い拠点は「宿泊事業」とみなす——新しい拠点が黙って集計から消える方が危ないため
 * （除きたいものは台帳に lodging:false を明記する）。
 */
export async function lodgingFilter(): Promise<(place: string) => boolean> {
  const rows = await placeBook();
  const excluded = new Set(rows.filter((r) => r.lodging === false).map((r) => r.place));
  return (place: string) => !excluded.has(place);
}
