/**
 * 融資の返済 — 借入ごとの残高と返済予定を、契約書の条件から機械的に出す
 *
 * 正本は契約書（PDF は yah-homes-os-archive に保管）。ここはその「読み取った条件」だけを持ち、
 * 残債や完済予定は毎回この条件から計算する（手入力の残高を持たない＝ズレようがない）。
 * 複数の借入を同じ物差しで並べられるようにするのが目的。
 */
import { agencyDb } from "./engine.js";

export interface Loan {
  id: string;
  lender: string; branch?: string; program?: string;
  repayment?: "principal-equal" | "annuity" | "bullet";   // 元金均等 ／ 元利均等 ／ 期日に一括
  principal: number;              // 借入額
  rate: number;                   // 年利（%）
  firstPayment: number;           // 初回の元金（一括返済では使わない）
  monthlyPayment: number;         // 2回目以降の元金
  lastPayment?: number;           // 最終回だけ端数になる契約があるため
  totalPayments: number;          // 回数
  firstPaymentMonth: string;      // yyyy-mm
  finalPaymentMonth?: string;
  guarantor?: string; collateral?: string;
  rateNote?: string; pdf?: string;
}

/** yyyy-mm の差（月数） */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export interface LoanState {
  loan: Loan;
  paidCount: number;              // 支払い済みの回数
  paidPrincipal: number;          // 返済済みの元金
  balance: number;                // 元金残高
  monthlyTotal: number;           // 今月の元金＋概算利息
  interestThisMonth: number;      // 残高×年利÷12（概算）
  remainingCount: number;
  progress: number;               // 返済の進み具合（%）
  notStarted?: boolean;           // 返済開始前
}

/**
 * 「いま」時点の状態。支払いは毎月末日なので、当月分はまだ払っていないものとして数える
 * （月末前に残高を少なく見せない＝安全側）。
 */
export function loanState(loan: Loan, asOf = new Date()): LoanState {
  const ym = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;

  /* まだ返済が始まっていない借入。月々の負担に足すと資金繰りを重く見誤るので0で返す
     （残債は満額のまま＝借りている事実は消さない）。 */
  if (ym < loan.firstPaymentMonth) {
    return {
      loan, paidCount: 0, paidPrincipal: 0, balance: loan.principal,
      interestThisMonth: 0, monthlyTotal: 0,
      remainingCount: loan.totalPayments, progress: 0, notStarted: true,
    };
  }

  /* 期日に一括返済する借入は、満期まで元金が1円も減らない。
     元金均等と同じ数え方をすると「返済が進んでいる」ように見えてしまうので分ける。 */
  if (loan.repayment === "bullet") {
    const due = loan.finalPaymentMonth ?? loan.firstPaymentMonth;
    const repaid = ym > due;
    const balance = repaid ? 0 : loan.principal;
    const interestThisMonth = Math.round((balance * (loan.rate / 100)) / 12);
    return {
      loan, paidCount: repaid ? 1 : 0, paidPrincipal: repaid ? loan.principal : 0,
      balance, interestThisMonth, monthlyTotal: interestThisMonth,
      remainingCount: repaid ? 0 : 1, progress: repaid ? 100 : 0,
    };
  }

  /* 元利均等は毎回の支払額が一定で、そのうち元金に回る分が少しずつ増えていく。
     閉じた式だと貸主の明細と数百円ずれるので、貸主と同じ手順（毎月の利息を円未満切り捨て）で
     1回ずつ回す。ウィズダムの240回の明細と、総返済額・利息合計まで完全に一致することを確認済み。 */
  if (loan.repayment === "annuity") {
    const i = loan.rate / 100 / 12;
    const k = Math.max(0, Math.min(monthsBetween(loan.firstPaymentMonth, ym), loan.totalPayments));
    let balance = loan.principal;
    for (let n = 1; n <= k; n++) {
      const interest = Math.floor(balance * i);
      balance -= n === loan.totalPayments ? balance : loan.monthlyPayment - interest;
    }
    const done = k >= loan.totalPayments;
    const interestThisMonth = done ? 0 : Math.floor(balance * i);
    return {
      loan, paidCount: k, paidPrincipal: loan.principal - balance, balance, interestThisMonth,
      monthlyTotal: done ? 0 : loan.monthlyPayment,
      remainingCount: loan.totalPayments - k,
      progress: Math.round(((loan.principal - balance) / loan.principal) * 1000) / 10,
    };
  }

  const elapsed = monthsBetween(loan.firstPaymentMonth, ym);   // 当月は未払いとして含めない
  const paidCount = Math.max(0, Math.min(elapsed, loan.totalPayments));
  const paidPrincipal = paidCount === 0 ? 0
    : paidCount >= loan.totalPayments ? loan.principal
    : loan.firstPayment + loan.monthlyPayment * Math.max(0, paidCount - 1);
  const balance = Math.max(0, loan.principal - paidPrincipal);
  const interestThisMonth = Math.round((balance * (loan.rate / 100)) / 12);
  const remainingCount = Math.max(0, loan.totalPayments - paidCount);
  return {
    loan, paidCount, paidPrincipal, balance, interestThisMonth,
    monthlyTotal: (remainingCount > 0 ? loan.monthlyPayment : 0) + interestThisMonth,
    remainingCount,
    progress: Math.round((paidPrincipal / loan.principal) * 1000) / 10,
  };
}

/** 全借入の一覧＋合計。複数本になっても同じ物差しで並ぶ */
export async function loanSummary(asOf = new Date()) {
  const snap = await agencyDb().collection("finance").where("kind", "==", "loan").get();
  const rows = snap.docs
    .map((d) => loanState({ id: d.id, ...(d.data() as object) } as Loan, asOf))
    .sort((a, b) => a.loan.firstPaymentMonth.localeCompare(b.loan.firstPaymentMonth));
  const sum = (f: (r: LoanState) => number) => rows.reduce((a, r) => a + f(r), 0);
  /* 加重平均利率: 残債の大きい借入ほど効くので、残債で重み付けする（単純平均だと実感とずれる） */
  const bal = sum((r) => r.balance);
  const weightedRate = bal === 0 ? 0
    : Math.round((rows.reduce((a, r) => a + r.balance * r.loan.rate, 0) / bal) * 1000) / 1000;

  return {
    rows,
    total: {
      principal: sum((r) => r.loan.principal),
      balance: sum((r) => r.balance),
      monthlyPrincipal: sum((r) => (r.remainingCount > 0 ? r.loan.monthlyPayment : 0)),
      monthlyTotal: sum((r) => r.monthlyTotal),
      count: rows.length,
      notStarted: rows.filter((r) => r.notStarted).length,
      /* 全部が返済期に入ったときの月々。資金繰りを見るときはこちらが効く */
      monthlyWhenAllRunning: rows.reduce((a, r) =>
        a + (r.loan.repayment === "bullet" ? 0 : r.loan.monthlyPayment), 0),
      repaid: sum((r) => r.paidPrincipal),
      /* 返済率は「元金をどれだけ返したか」。利息は資産にならないので分子に入れない */
      repaidRate: Math.round((sum((r) => r.paidPrincipal) / sum((r) => r.loan.principal)) * 1000) / 10,
      weightedRate,
      interestThisMonth: sum((r) => r.interestThisMonth),
      /* 直近1年に出ていく利息の概算。今の残債×加重平均利率で見る */
      interestPerYear: Math.round((bal * weightedRate) / 100),
      finalMonth: rows.map((r) => r.loan.finalPaymentMonth ?? "").sort().at(-1) ?? "",
      /* 満期に一括で返す必要がある額。ここが資金繰りの崖になる */
      bulletBalance: sum((r) => (r.loan.repayment === "bullet" ? r.balance : 0)),
      bulletDue: rows.filter((r) => r.loan.repayment === "bullet" && r.balance > 0)
        .map((r) => r.loan.finalPaymentMonth ?? "").sort()[0] ?? "",
    },
    asOf: asOf.toISOString().slice(0, 10),
  };
}
