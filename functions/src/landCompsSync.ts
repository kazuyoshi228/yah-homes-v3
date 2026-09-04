/**
 * 不動産DB（landComps）の定期更新。四半期ごとに国交省から取り直す（2026-09-03）。
 *
 * 取ってくるもの:
 *   取引価格情報（成約）… 四半期ごとに公表される。前四半期ぶんを追加する
 *   地価公示・地価調査（鑑定）… 年1回だが、同じ処理で拾えるので一緒に見る
 *
 * 大事な約束: 種類（source）を必ず分けて持つ。
 *   mlit=成約 / kouji=地価公示 / chousa=地価調査 / freins=売出
 *   高砂で調べたところ、売出は成約の2〜3倍、公示すら成約の1.6倍だった。混ぜると相場を誤る。
 *
 * APIキーは不動産情報ライブラリの利用申請で発行される。Secret Manager に
 * REINFOLIB_API_KEY として置く——コードにも台帳にも書かない。
 * キーが未設定のあいだは、取得せずに「未設定」を記録して静かに終わる（落とさない）。
 *
 * 【キーを差し替えたら、必ず再デプロイする】
 * 関数はデプロイ時点のシークレットのバージョンを掴む。差し替えただけでは古いほうを
 * 読み続ける（2026-09-04 実際に起きた——バージョン2を入れたのに関数は1を見ていた）。
 * このワークフローは functions/** の変更でしか走らないので、空コミットでは再デプロイ
 * されない。キーを更新したら、このファイルに一行でも変更を入れて push すること。
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { agencyDb } from "./agency/engine.js";

const REINFOLIB_API_KEY = defineSecret("REINFOLIB_API_KEY");
const SA = "agency-mailer@yah-homes.iam.gserviceaccount.com";
const CITY = "40133";               // 福岡市中央区
const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

/** 地名は「丁目・番・号・区」の直前まで。六本松のように漢数字を含む地名を壊さない */
const district = (a: string): string =>
  String(a).replace(/[０-９0-9]+(丁目|号|番|区).*$/, "").replace(/[０-９0-9].*$/, "").trim();

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/* 地価公示・地価調査（XPT002）はタイル座標で引く。
   福岡市中央区を覆う範囲を z=13 で4タイルぶん。ズームを上げると細かく取れるが、
   タイル数が増えるだけで中身は変わらない（1地点は1タイルにしか属さない）。 */
const WARD_BOUNDS = { north: 33.605, south: 33.560, west: 130.355, east: 130.415 };
const TILE_ZOOM = 13;

const lonToX = (lon: number, z: number): number => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** 中央区を覆うタイルの一覧 */
function wardTiles(z: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const x1 = lonToX(WARD_BOUNDS.west, z), x2 = lonToX(WARD_BOUNDS.east, z);
  const y1 = latToY(WARD_BOUNDS.north, z), y2 = latToY(WARD_BOUNDS.south, z);
  for (let x = x1; x <= x2; x += 1) for (let y = y1; y <= y2; y += 1) out.push({ x, y });
  return out;
}

/* 申請が済むまでの仮置きに使う語。Secret Manager は空の値を許さないため、
   「未設定」を空文字では表せない。ここに挙げた語が入っているあいだは、取得しない。
   実在のキーと衝突しないよう、意味のある英単語だけを並べる（2026-09-03） */
const PLACEHOLDERS = ["pending", "todo", "unset", "none", "dummy", "placeholder", "changeme", "xxx", "-"];

/** 本物のキーか。空・短すぎる・仮置きの語、のいずれでもないこと */
function isRealKey(v: string | undefined): boolean {
  const k = String(v ?? "").trim();
  if (k.length < 16) return false;                       // 発行されるキーは十分に長い
  return !PLACEHOLDERS.includes(k.toLowerCase());
}

/** いま取り込むべき四半期。公表は2四半期ほど遅れるので、8期（2年）ぶん遡る。
    まだ公表されていない四半期は404「検索結果がありません」が返るが、空として扱う。
    すでに入っている行は同じIDに当たるので、何度取っても増えない（merge） */
function recentQuarters(now: Date, back = 8): string[] {
  const out: string[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < back; i += 1) {
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
    out.push(`${y}${q}`);
  }
  return out;
}

export const landCompsSync = onSchedule(
  /* 四半期の初月の10日。取引価格情報の公表が四半期ごとなので、これで足りる */
  { schedule: "0 4 10 1,4,7,10 *", timeZone: "Asia/Tokyo", region: "asia-northeast1",
    serviceAccount: SA, secrets: [REINFOLIB_API_KEY], timeoutSeconds: 540 },
  async () => {
    const db = agencyDb();
    const key = REINFOLIB_API_KEY.value();
    const log = db.collection("syncLogs").doc(`landComps-${new Date().toISOString().slice(0, 10)}`);

    if (!isRealKey(key)) {
      /* キーがまだ本物でなくても落とさない。申請中のあいだ、毎回エラー通知が飛ぶのを避ける。
         【空だけを見てはいけない】——Secret Manager は空の値を許さないので、申請中は
         "pending" のような仮の値が入る。それを素通りさせると実際にAPIを叩いて落ちる
         （2026-09-03 別スレッドからの指摘で判明）。 */
      await log.set({ at: new Date().toISOString(), ok: false, keyState: key ? "placeholder" : "empty",
        note: "REINFOLIB_API_KEY がまだ本物ではない。不動産情報ライブラリの利用申請が済んだら、"
          + "firebase functions:secrets:set REINFOLIB_API_KEY で本物に差し替える" });
      return;
    }

    const get = async (path: string, params: Record<string, string>) => {
      const u = new URL(BASE + path);
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { "Ocp-Apim-Subscription-Key": key } });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        /* このAPIは【該当データが無いときも404を返す】（2026-09-04 実測）。
           取引価格の公表は2四半期ほど遅れるので、直近の四半期は必ず「無い」。
           それを異常として落とすと、毎回失敗する。空として扱う。 */
        if (r.status === 404 && body.includes("検索結果がありません")) return { data: [] };
        /* それ以外の失敗は本文まで残す。パスが違うのか、キーの権限か、パラメータかを
           切り分けるため。キーはURLにも本文にも含まれない作りなので、出しても漏れない */
        throw new Error(`${path} ${r.status} ${body.slice(0, 300)}`);
      }
      return r.json() as Promise<{ data?: Array<Record<string, unknown>> }>;
    };

    let added = 0, seen = 0;
    let batch = db.batch(), inBatch = 0;
    const flush = async () => { if (inBatch) { await batch.commit(); batch = db.batch(); inBatch = 0; } };

    /* ① 取引価格情報（成約）。XIT001 は四半期と市区町村で引ける */
    for (const q of recentQuarters(new Date())) {
      const year = q.slice(0, 4), quarter = q.slice(4);
      const j = await get("/XIT001", { year, quarter, city: CITY });
      for (const row of j.data ?? []) {
        seen += 1;
        const price = num(row.TradePrice);
        const area = num(row.Area);
        if (!price || !area) continue;                       // 面積か価格が無い行は使えない
        if (String(row.Type ?? "") !== "宅地(土地)") continue; // 土地だけ。建物付きは単価の意味が変わる
        const addr = String(row.DistrictName ?? "");
        const id = `mlit-${CITY}-${year}Q${quarter}-${String(row.Municipality ?? "")}${addr}-${price}-${area}`
          .replace(/[^\w.\-]/g, "_").slice(0, 400);
        batch.set(db.collection("landComps").doc(id), {
          source: "mlit", kind: "transaction",
          district: district(addr) || addr,
          station: row.NearestStation ?? null,
          walkMin: num(row.TimeToNearestStation),
          price, areaSqm: area,
          /* 単価は保存せず毎回割る——にしたいところだが、絞り込みと並び替えに使うので
             ここだけは持つ。元の price と areaSqm も残すので、いつでも検算できる */
          unitPrice: Math.round(price / area),
          quarter: `${year}Q${quarter}`, year: Number(year),
          landUse: row.Use ?? null, zone: row.CityPlanning ?? null,
          sourceName: "国土交通省 不動産情報ライブラリ 取引価格情報（土地）",
          sourceUrl: "https://www.reinfolib.mlit.go.jp/realEstatePrices/",
          sourceNote: "取引当事者へのアンケートに基づく実際の成約。売出価格ではない。数値は国交省が丸めている",
          fetchedAt: new Date().toISOString().slice(0, 10),
        }, { merge: true });
        added += 1; inBatch += 1;
        if (inBatch >= 400) await flush();
      }
    }
    await flush();

    /* ② 地価公示・地価調査（鑑定）。年1回の更新なので、1月の実行だけで足りる。
       公示は3月下旬、地価調査は9月下旬の公表なので、前年ぶんを取りにいく。
       タイル座標で引く仕様（XPT002）なので、中央区を覆うタイルを回す。 */
    let apAdded = 0;
    const month = new Date().getMonth() + 1;
    if (month === 1 || month === 4) {
      const year = new Date().getFullYear() - 1;
      for (const t of wardTiles(TILE_ZOOM)) {
        const j = await get("/XPT002", {
          response_format: "geojson", z: String(TILE_ZOOM), x: String(t.x), y: String(t.y),
          year: String(year),
        }) as unknown as { features?: Array<{ properties?: Record<string, unknown> }> };
        for (const f of j.features ?? []) {
          const p = f.properties ?? {};
          if (String(p.city_code ?? "") !== CITY) continue;      // タイルは区界と一致しないので絞る
          const price = num(p.u_current_years_price_ja);
          const no = String(p.standard_lot_number_ja ?? "");
          if (!price || !no) continue;
          /* land_price_type: 0=地価公示 / 1=地価調査。基準日が違い番号も別系統なので必ず分ける */
          const src = String(p.land_price_type) === "1" ? "chousa" : "kouji";
          const asOf = src === "chousa" ? `${year}-07-01` : `${year}-01-01`;
          const id = `${src}-${no}-${src === "chousa" ? `${year}.5` : year}`.replace(/[^\w.\-]/g, "_");
          batch.set(db.collection("landComps").doc(id), {
            source: src, kind: "appraisal", pointNo: no, pointId: p.point_id ?? null,
            district: String(p.place_name_ja ?? "") || district(String(p.location_number_ja ?? "")),
            address: `${p.ward_town_village_name_ja ?? ""}${p.location_number_ja ?? ""}`,
            station: p.nearest_station_name_ja ?? null,
            distM: num(p.u_road_distance_to_nearest_station_name_ja),
            areaSqm: num(p.u_cadastral_ja),
            zone: p.use_category_name_ja ?? null,
            year, asOf, unitPrice: price,
            changePct: num(p.year_on_year_change_rate),
            sourceName: src === "kouji" ? "国土交通省 地価公示（標準地）" : "都道府県 地価調査（基準地）",
            sourceUrl: "https://www.reinfolib.mlit.go.jp/landPrices/",
            sourceNote: "毎年の鑑定評価。地価公示は1月1日、地価調査は7月1日が基準日で、番号は別系統——混ぜないこと。1地点の評価であり実勢とは乖離しうる。取引価格情報（成約）とは別物",
            fetchedAt: new Date().toISOString().slice(0, 10),
          }, { merge: true });
          apAdded += 1; inBatch += 1;
          if (inBatch >= 400) await flush();
        }
      }
      await flush();
    }

    await log.set({ at: new Date().toISOString(), ok: true, seen, added, appraisalAdded: apAdded,
      note: month === 1 || month === 4
        ? "取引価格情報（四半期）と、地価公示・地価調査（年1回）の両方を取り込んだ"
        : "取引価格情報（四半期）を取り込んだ。地価公示・地価調査は年1回なので1月と4月の実行で拾う" });
  });
