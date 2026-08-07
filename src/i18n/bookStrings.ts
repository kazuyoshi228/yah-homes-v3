// /book/ の文言（5言語）。design_booking_p1_v4.md §3〜4。
// 大きい translations.ts を汚さないよう独立ファイルにする。
import type { Locale } from "./config";

export interface BookStrings {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lead: string;
  checkin: string;
  checkout: string;
  guests: string;
  guestsUnit: (n: number) => string;
  selectDates: string;
  selectCheckout: string;
  nights: (n: number) => string;
  legendOpen: string;
  legendClosed: string;
  searching: string;
  soldOut: string;
  soldOutHint: string;
  totalLabel: string;
  totalNote: (nights: number, guests: number) => string;
  approx: string;
  freeCancelUntil: (date: string) => string;
  proceed: string;
  capacityMax: (n: number) => string;
  errorFetch: string;
  changedPrice: string;
  altDates: string;
  monthLabel: (y: number, m: number) => string;
  dow: string[];
  /** 概算表示に使う通貨（言語別） */
  fxCode: string;
  fxSymbol: string;
}

const dowJa = ["日", "月", "火", "水", "木", "金", "土"];

export const BOOK_STRINGS: Record<Locale, BookStrings> = {
  en: {
    metaTitle: "Book Direct | yah.homes",
    metaDescription: "Check availability and book our whole-house stays in central Fukuoka directly.",
    title: "Book your stay",
    lead: "Choose your dates and party size to see availability and the total price for both houses.",
    checkin: "Check-in",
    checkout: "Check-out",
    guests: "Guests",
    guestsUnit: (n) => `${n} ${n === 1 ? "guest" : "guests"}`,
    selectDates: "Select your check-in date",
    selectCheckout: "Now select your check-out date",
    nights: (n) => `${n} ${n === 1 ? "night" : "nights"}`,
    legendOpen: "Available",
    legendClosed: "Unavailable",
    searching: "Checking availability…",
    soldOut: "Not available for these dates",
    soldOutHint: "Try different dates or the other house.",
    totalLabel: "Total",
    totalNote: (nights, guests) => `${nights} ${nights === 1 ? "night" : "nights"}, ${guests} ${guests === 1 ? "guest" : "guests"} · cleaning fee included`,
    approx: "approx.",
    freeCancelUntil: (d) => `Free cancellation until ${d}`,
    proceed: "Continue with this house",
    capacityMax: (n) => `Up to ${n} guests`,
    errorFetch: "Could not load availability. Please try again shortly.",
    changedPrice: "Prices or availability have changed. Please review the updated total.",
    altDates: "Nearest available dates",
    monthLabel: (y, m) => `${["January","February","March","April","May","June","July","August","September","October","November","December"][m]} ${y}`,
    dow: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    fxCode: "USD",
    fxSymbol: "US$",
  },
  ja: {
    metaTitle: "空室検索・ご予約 | yah.homes",
    metaDescription: "福岡市中心部の一棟貸し2棟の空室と総額を確認して、公式サイトから直接ご予約いただけます。",
    title: "ご予約",
    lead: "日付と人数を選ぶと、2棟の空室状況と総額が表示されます。",
    checkin: "チェックイン",
    checkout: "チェックアウト",
    guests: "人数",
    guestsUnit: (n) => `${n}名`,
    selectDates: "チェックイン日を選択してください",
    selectCheckout: "チェックアウト日を選択してください",
    nights: (n) => `${n}泊`,
    legendOpen: "空きあり",
    legendClosed: "満室・予約不可",
    searching: "空室を確認しています…",
    soldOut: "この日程は満室です",
    soldOutHint: "日付を変更するか、もう一方の棟をご検討ください。",
    totalLabel: "合計",
    totalNote: (nights, guests) => `${nights}泊${guests}名・清掃料込み`,
    approx: "約",
    freeCancelUntil: (d) => `${d} まで無料キャンセル`,
    proceed: "この棟で進む",
    capacityMax: (n) => `最大${n}名`,
    errorFetch: "空室情報を取得できませんでした。時間をおいてお試しください。",
    changedPrice: "料金または空室状況が変わりました。最新の総額をご確認ください。",
    altDates: "空きのある近い日程",
    monthLabel: (y, m) => `${y}年${m + 1}月`,
    dow: dowJa,
    fxCode: "JPY",
    fxSymbol: "¥",
  },
  ko: {
    metaTitle: "예약 가능일 확인 · 예약 | yah.homes",
    metaDescription: "후쿠오카 중심부 독채 2개 동의 빈방과 총액을 확인하고 공식 사이트에서 바로 예약하세요.",
    title: "예약하기",
    lead: "날짜와 인원을 선택하면 두 동의 예약 가능 여부와 총액이 표시됩니다.",
    checkin: "체크인",
    checkout: "체크아웃",
    guests: "인원",
    guestsUnit: (n) => `${n}명`,
    selectDates: "체크인 날짜를 선택해 주세요",
    selectCheckout: "체크아웃 날짜를 선택해 주세요",
    nights: (n) => `${n}박`,
    legendOpen: "예약 가능",
    legendClosed: "예약 불가",
    searching: "빈방을 확인하고 있습니다…",
    soldOut: "해당 날짜는 예약이 불가합니다",
    soldOutHint: "날짜를 변경하거나 다른 동을 확인해 주세요.",
    totalLabel: "합계",
    totalNote: (nights, guests) => `${nights}박 ${guests}명 · 청소비 포함`,
    approx: "약",
    freeCancelUntil: (d) => `${d}까지 무료 취소`,
    proceed: "이 동으로 진행",
    capacityMax: (n) => `최대 ${n}명`,
    errorFetch: "빈방 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    changedPrice: "요금 또는 예약 가능 상황이 변경되었습니다. 최신 총액을 확인해 주세요.",
    altDates: "예약 가능한 가까운 날짜",
    monthLabel: (y, m) => `${y}년 ${m + 1}월`,
    dow: ["일", "월", "화", "수", "목", "금", "토"],
    fxCode: "KRW",
    fxSymbol: "₩",
  },
  zh: {
    metaTitle: "查詢空房 · 立即預訂 | yah.homes",
    metaDescription: "查詢福岡市中心整棟包棟兩棟的空房與總金額，並可直接於官方網站預訂。",
    title: "立即預訂",
    lead: "選擇日期與人數後，即可看到兩棟的空房狀況與總金額。",
    checkin: "入住",
    checkout: "退房",
    guests: "人數",
    guestsUnit: (n) => `${n}人`,
    selectDates: "請選擇入住日期",
    selectCheckout: "請選擇退房日期",
    nights: (n) => `${n}晚`,
    legendOpen: "有空房",
    legendClosed: "已滿房",
    searching: "正在查詢空房…",
    soldOut: "此日期已滿房",
    soldOutHint: "請更換日期，或查看另一棟。",
    totalLabel: "總金額",
    totalNote: (nights, guests) => `${nights}晚 ${guests}人・含清潔費`,
    approx: "約",
    freeCancelUntil: (d) => `${d} 前可免費取消`,
    proceed: "選擇這一棟",
    capacityMax: (n) => `最多 ${n} 人`,
    errorFetch: "無法取得空房資訊，請稍後再試。",
    changedPrice: "價格或空房狀況已變更，請確認最新總金額。",
    altDates: "最近的可訂日期",
    monthLabel: (y, m) => `${y}年${m + 1}月`,
    dow: ["日", "一", "二", "三", "四", "五", "六"],
    fxCode: "TWD",
    fxSymbol: "NT$",
  },
  th: {
    metaTitle: "ตรวจสอบห้องว่าง · จองเลย | yah.homes",
    metaDescription: "ตรวจสอบห้องว่างและราคารวมของบ้านเช่าทั้งหลัง 2 หลังใจกลางเมืองฟุกุโอกะ และจองผ่านเว็บไซต์ทางการได้ทันที",
    title: "จองที่พัก",
    lead: "เลือกวันที่และจำนวนผู้เข้าพัก เพื่อดูห้องว่างและราคารวมของทั้งสองหลัง",
    checkin: "เช็คอิน",
    checkout: "เช็คเอาท์",
    guests: "ผู้เข้าพัก",
    guestsUnit: (n) => `${n} ท่าน`,
    selectDates: "กรุณาเลือกวันเช็คอิน",
    selectCheckout: "กรุณาเลือกวันเช็คเอาท์",
    nights: (n) => `${n} คืน`,
    legendOpen: "ว่าง",
    legendClosed: "ไม่ว่าง",
    searching: "กำลังตรวจสอบห้องว่าง…",
    soldOut: "วันที่เลือกไม่ว่าง",
    soldOutHint: "กรุณาเปลี่ยนวันที่ หรือดูอีกหลังหนึ่ง",
    totalLabel: "ราคารวม",
    totalNote: (nights, guests) => `${nights} คืน ${guests} ท่าน · รวมค่าทำความสะอาด`,
    approx: "ประมาณ",
    freeCancelUntil: (d) => `ยกเลิกฟรีถึง ${d}`,
    proceed: "เลือกหลังนี้",
    capacityMax: (n) => `สูงสุด ${n} ท่าน`,
    errorFetch: "ไม่สามารถโหลดข้อมูลห้องว่างได้ กรุณาลองใหม่อีกครั้ง",
    changedPrice: "ราคาหรือสถานะห้องว่างมีการเปลี่ยนแปลง กรุณาตรวจสอบราคารวมล่าสุด",
    altDates: "วันที่ว่างที่ใกล้ที่สุด",
    monthLabel: (y, m) => `${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][m]} ${y}`,
    dow: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    fxCode: "THB",
    fxSymbol: "฿",
  },
};

/** 概算換算レート（1円あたり）。日次更新の暫定固定値・「≈」で概算と明示して表示する。 */
export const FX_PER_JPY: Record<string, number> = {
  JPY: 1,
  USD: 0.0067,
  TWD: 0.21,
  KRW: 9.2,
  THB: 0.23,
};
