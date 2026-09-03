/**
 * 導出値の定義（この会社での正本）。
 *
 * ここに書いた式が唯一の定義であり、【他の場所で同じ計算を書き直さない】。
 * 2026-09-02 の点検で、NOI が4か所で違う数字を指していた:
 *   props.ts   手取り＋その他−光熱費−固定資産税−保険−修繕積立
 *   yields.ts  手取り−光熱費−固定資産税−保険−修繕積立（その他収入なし）
 *   cashflow.ts 手取り−固定費−光熱費−修繕積立−会社維持経費
 *   提案書      手取り−固定費−光熱費−会社維持経費
 * 同じ言葉が違う数字を指していたため、ここへ一本化した。
 *
 * 台帳の assumptions/noi-definition が「なぜそう決めたか」の正本。
 * 式を変えるときは、まずあちらを直してからここを直すこと。
 */

/** 数値として読む。未登録・空文字・null は 0 として扱う（推測で埋めない） */
export const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/* ── NOI ────────────────────────────────────────────────
   修繕積立は【引かない】（2026-09-02 発注者決定）。
   積立は将来の修繕に備えて取り分けるお金であって、その年に発生した費用ではない。
   買い手も自分の積立方針で決めるため、収益還元の分子には入れないのが実務。
   銀行が返済余力を見るときは noiAfterReserve を併記する。 */

export interface PropertyNoiInput {
  stayPayout: number;      // 宿泊の手取り（運営会社の報告のpayout）
  otherIncome?: number;    // 宿泊以外の収入（貸せる面積の賃料相当）
  utilities: number;       // 光熱費
  tax: number;             // 固定資産税
  insurance: number;       // 保険
}

/** 棟別NOI。会社維持経費は棟に紐づかないので入れない（全社NOIで引く） */
export const propertyNoi = (i: PropertyNoiInput): number =>
  num(i.stayPayout) + num(i.otherIncome) - num(i.utilities) - num(i.tax) - num(i.insurance);

export interface CompanyNoiInput {
  income: number;          // 手取り収入の合計（宿泊以外を含む）
  fixed: number;           // 固定費（固定資産税＋保険）
  utilities: number;
  overhead: number;        // 会社維持経費
}

/** 全社NOI。収益還元（企業価値）の分子はこれ */
export const companyNoi = (i: CompanyNoiInput): number =>
  num(i.income) - num(i.fixed) - num(i.utilities) - num(i.overhead);

/** 銀行向け。積立を引いた後の姿も出せるようにしておく */
export const noiAfterReserve = (noi: number, reserve: number): number => num(noi) - num(reserve);

/* ── 利回り・企業価値 ─────────────────────────────── */

/** 実質利回り（%）。取得価額が無ければ null——0で割らない */
export const netYield = (noi: number, price: number): number | null =>
  price ? Math.round((num(noi) / price) * 10000) / 100 : null;

/** 収益還元価値。還元利回りが未設定なら 0 */
export const capValue = (noi: number, capRate: number): number =>
  capRate > 0 ? Math.round(num(noi) / capRate) : 0;

/** 部分年は12ヶ月に換算してから還元する
    ——4ヶ月ぶんのNOIをそのまま割ると価値が3分の1に出る（2026-09-01 発注者指摘） */
export const annualize = (raw: number, months: number): number =>
  months > 0 && months < 12 ? Math.round((num(raw) * 12) / months) : Math.round(num(raw));

/* ── 返済余力 ─────────────────────────────────────── */

/** DSCR。返済がゼロなら null——Infinity を返して「余裕がある」と誤読させない */
export const dscr = (noi: number, debtService: number): number | null =>
  debtService > 0 ? Math.round((num(noi) / debtService) * 100) / 100 : null;

/* ── 証券担保ローン ───────────────────────────────── */

export interface CollateralInput {
  marketValue: number;     // 担保になる有価証券の時価（その証券会社の預かり分だけ）
  loanBalance: number;
  ratio: number;           // 担保掛目（投信0.6など）
  forcedSaleThreshold: number; // 約款: 担保評価額が融資金のこの割合を下回ると売却
}

/** 掛目の上限に対する余力。マイナスなら超過している */
export const collateralHeadroom = (i: CollateralInput): number =>
  Math.round(num(i.marketValue) * num(i.ratio) - num(i.loanBalance));

/** 強制売却ラインを「時価」に直した額。これを下回ると担保が処分される */
export const forcedSaleLine = (i: CollateralInput): number =>
  i.ratio > 0 ? Math.round((num(i.loanBalance) * num(i.forcedSaleThreshold)) / num(i.ratio)) : 0;

/** 強制売却までに耐えられる下落率（%） */
export const dropTolerance = (i: CollateralInput): number | null => {
  const line = forcedSaleLine(i);
  return i.marketValue > 0 ? Math.round((1 - line / num(i.marketValue)) * 1000) / 10 : null;
};
