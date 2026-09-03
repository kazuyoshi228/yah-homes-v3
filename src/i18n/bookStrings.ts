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
  minStay: string;      // {n} に必要泊数
  upstreamFailed: string;
  tooLate: string;
  tooFar: string;
  priceFrom: string;    // {v} に金額
  /** 定員超過（満室ではない。{n}=その棟の定員） */
  overCapacity: string;
  overCapacityHint: string;
  totalLabel: string;
  rackLabel: string;
  discountApplied: string;
  totalNote: (nights: number, guests: number) => string;
  /** 1人1泊あたり（{v}=金額）。総額は信頼の柱なので置き換えず、説得力のある単位を並記する。
      記事側は「1人あたり約¥10,600」で売っているのに、決済直前で総額だけになっていた（2026-08-18） */
  perGuestNight: (v: string) => string;
  approx: string;
  freeCancelUntil: (date: string) => string;
  /** 料金ボックス用。金額の直後で「押しても課金されない」ことを伝える */
  notChargedYet: string;
  /** 満室で行き止まりになった人に、空きが出たら知らせる導線 */
  alert: {
    title: string; lead: (d: string, g: number) => string;
    placeholder: string; submit: string;
    sending: string; done: string; fail: string; invalid: string;
    privacy: string;
  };
  proceed: string;
  capacityMax: (n: number) => string;
  errorFetch: string;
  /** 取得の進行・失敗まわり（design_booking_p1_v4.md §3.4） */
  loadingSlow: string;
  loadingTooLong: string;
  retry: string;
  conditionsChanged: string;
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
    overCapacity: "Up to {n} guests",
    overCapacityHint: "This house sleeps {n}. Please reduce the number of guests, or choose the other house — changing dates will not change the capacity.",
    soldOutHint: "Try different dates or the other house.",
    minStay: "These dates need a minimum stay of {n} nights",
    upstreamFailed: "We could not check availability just now. Please try again in a moment.",
    tooLate: "Bookings for these dates have closed (until 23:59 the day before check-in).",
    tooFar: "These dates are not open for booking yet.",
    priceFrom: "From {v} / night",
    totalLabel: "Total",
    rackLabel: "List price",
    discountApplied: "Discount applied",
    totalNote: (nights, guests) => `${nights} ${nights === 1 ? "night" : "nights"}, ${guests} ${guests === 1 ? "guest" : "guests"} · room, lodging tax and cleaning fee included`,
    perGuestNight: (v) => `${v} per guest, per night`,
    approx: "approx.",
    freeCancelUntil: (d) => `Free cancellation until ${d}`,
    notChargedYet: "You won't be charged yet",
    alert: {
      title: "Get notified if these dates open up",
      lead: (d, g) => `We'll email you once if ${d} for ${g} guests becomes available.`,
      placeholder: "your@email.com", submit: "Notify me",
      sending: "Sending…", done: "Thanks — we'll email you if these dates open up.",
      fail: "Could not send. Please try again later.", invalid: "Please check your email address.",
      privacy: 'One email only. See our <a href="{privacyHref}">privacy policy</a> for how we handle it.',
    },
    proceed: "Book now",
    capacityMax: (n) => `Up to ${n} guests`,
    errorFetch: "Could not load availability. Please try again shortly.",
    loadingSlow: "Still checking availability. This will only take a moment.",
    loadingTooLong: "This is taking longer than usual. Please try again.",
    retry: "Try again",
    conditionsChanged: "Your search changed. Checking the latest availability…",
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
    overCapacity: "この棟は最大{n}名までです",
    overCapacityHint: "ご人数を{n}名以下にするか、もう一方の棟をご検討ください。日程を変えても定員は変わりません。",
    soldOutHint: "日付を変更するか、もう一方の棟をご検討ください。",
    minStay: "この日程は{n}泊からのご予約となります",
    upstreamFailed: "ただいま空室を確認できませんでした。少し時間をおいてお試しください。",
    tooLate: "この日程はお申し込みの期限を過ぎています（チェックイン前日23:59まで）。",
    tooFar: "この日程はまだ受付を開始しておりません。",
    priceFrom: "{v}〜 / 泊",
    totalLabel: "合計",
    rackLabel: "定価",
    discountApplied: "割引適用",
    totalNote: (nights, guests) => `${nights}泊${guests}名・宿泊料・宿泊税・清掃料込み`,
    perGuestNight: (v) => `1人1泊あたり ${v}`,
    approx: "約",
    freeCancelUntil: (d) => `${d} まで無料キャンセル`,
    notChargedYet: "このボタンではまだ課金されません",
    alert: {
      title: "空きが出たらお知らせします",
      lead: (d, g) => `${d}・${g}名の空室が出た場合に、1回だけメールでお知らせします。`,
      placeholder: "your@email.com", submit: "通知を受け取る",
      sending: "送信中…", done: "ご登録ありがとうございます。空きが出ましたらお知らせします。",
      fail: "送信できませんでした。時間をおいてお試しください。", invalid: "メールアドレスをご確認ください。",
      privacy: '配信はこの1通のみです。取り扱いは<a href="{privacyHref}">プライバシーポリシー</a>をご覧ください。',
    },
    proceed: "予約する",
    capacityMax: (n) => `最大${n}名`,
    errorFetch: "空室情報を取得できませんでした。時間をおいてお試しください。",
    loadingSlow: "空室状況を確認中です。まもなく表示します。",
    loadingTooLong: "確認に時間がかかっています。もう一度お試しください。",
    retry: "再試行する",
    conditionsChanged: "条件が変わりました。最新の空室を確認しています。",
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
    overCapacity: "이 숙소는 최대 {n}명까지입니다",
    overCapacityHint: "인원을 {n}명 이하로 변경하시거나 다른 숙소를 확인해 주세요. 날짜를 바꿔도 정원은 동일합니다.",
    soldOutHint: "날짜를 변경하거나 다른 동을 확인해 주세요.",
    minStay: "이 일정은 {n}박부터 예약하실 수 있습니다",
    upstreamFailed: "지금은 예약 가능 여부를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    tooLate: "이 일정은 예약 마감되었습니다(체크인 전날 23:59까지).",
    tooFar: "이 일정은 아직 예약을 받고 있지 않습니다.",
    priceFrom: "{v}〜 / 1박",
    totalLabel: "합계",
    rackLabel: "정가",
    discountApplied: "할인 적용",
    totalNote: (nights, guests) => `${nights}박 ${guests}명 · 숙박료・숙박세・청소비 포함`,
    perGuestNight: (v) => `1인 1박당 ${v}`,
    approx: "약",
    freeCancelUntil: (d) => `${d}까지 무료 취소`,
    notChargedYet: "아직 결제되지 않습니다",
    alert: {
      title: "빈방이 생기면 알려드립니다",
      lead: (d, g) => `${d}・${g}명의 빈방이 생기면 한 번만 메일로 알려드립니다.`,
      placeholder: "your@email.com", submit: "알림 받기",
      sending: "전송 중…", done: "등록해 주셔서 감사합니다. 빈방이 생기면 알려드리겠습니다.",
      fail: "전송하지 못했습니다. 잠시 후 다시 시도해 주세요.", invalid: "이메일 주소를 확인해 주세요.",
      privacy: '메일은 이 1통뿐입니다. 취급은 <a href="{privacyHref}">개인정보 처리방침</a>을 참고해 주세요.',
    },
    proceed: "예약하기",
    capacityMax: (n) => `최대 ${n}명`,
    errorFetch: "빈방 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    loadingSlow: "빈방 상황을 확인하고 있습니다. 곧 표시됩니다.",
    loadingTooLong: "확인에 시간이 걸리고 있습니다. 다시 시도해 주세요.",
    retry: "다시 시도",
    conditionsChanged: "조건이 변경되었습니다. 최신 빈방을 확인하고 있습니다…",
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
    overCapacity: "本棟最多可住{n}人",
    overCapacityHint: "請將人數調整為{n}人以下，或改選另一棟。更換日期並不會改變可住人數。",
    soldOutHint: "請更換日期，或查看另一棟。",
    minStay: "此日期最少需連住 {n} 晚",
    upstreamFailed: "目前無法確認空房狀況，請稍後再試。",
    tooLate: "此日期已截止受理（可預訂至入住前一天 23:59）。",
    tooFar: "此日期尚未開放預訂。",
    priceFrom: "{v} 起 / 晚",
    totalLabel: "總金額",
    rackLabel: "定價",
    discountApplied: "已套用折扣",
    totalNote: (nights, guests) => `${nights}晚 ${guests}人・含住宿費・住宿稅・清潔費`,
    perGuestNight: (v) => `每人每晚 ${v}`,
    approx: "約",
    freeCancelUntil: (d) => `${d} 前可免費取消`,
    notChargedYet: "點擊後尚不會扣款",
    alert: {
      title: "有空房時通知您",
      lead: (d, g) => `若 ${d}・${g}人 出現空房，我們會以電子郵件通知您一次。`,
      placeholder: "your@email.com", submit: "接收通知",
      sending: "傳送中…", done: "已完成登錄。出現空房時我們會通知您。",
      fail: "無法傳送，請稍後再試。", invalid: "請確認您的電子郵件地址。",
      privacy: '僅會寄送這一封。資料處理方式請見<a href="{privacyHref}">私隱政策</a>。',
    },
    proceed: "立即預訂",
    capacityMax: (n) => `最多 ${n} 人`,
    errorFetch: "無法取得空房資訊，請稍後再試。",
    loadingSlow: "正在確認空房狀況，即將顯示。",
    loadingTooLong: "確認需要較長時間，請再試一次。",
    retry: "重新查詢",
    conditionsChanged: "查詢條件已變更，正在確認最新空房…",
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
    overCapacity: "ที่พักนี้รองรับได้สูงสุด {n} ท่าน",
    overCapacityHint: "กรุณาลดจำนวนผู้เข้าพักให้ไม่เกิน {n} ท่าน หรือเลือกอีกหลังหนึ่ง การเปลี่ยนวันที่ไม่ได้เปลี่ยนจำนวนที่รองรับ",
    soldOutHint: "กรุณาเปลี่ยนวันที่ หรือดูอีกหลังหนึ่ง",
    minStay: "วันที่นี้ต้องเข้าพักอย่างน้อย {n} คืน",
    upstreamFailed: "ขณะนี้ไม่สามารถตรวจสอบห้องว่างได้ กรุณาลองใหม่อีกครั้ง",
    tooLate: "ปิดรับจองสำหรับวันที่นี้แล้ว (จองได้ถึง 23:59 ของวันก่อนเช็คอิน)",
    tooFar: "ยังไม่เปิดรับจองสำหรับวันที่นี้",
    priceFrom: "เริ่มต้น {v} / คืน",
    totalLabel: "ราคารวม",
    rackLabel: "ราคาปกติ",
    discountApplied: "รวมส่วนลดแล้ว",
    totalNote: (nights, guests) => `${nights} คืน ${guests} ท่าน · รวมค่าห้อง ภาษีที่พัก และค่าทำความสะอาด`,
    perGuestNight: (v) => `${v} ต่อคนต่อคืน`,
    approx: "ประมาณ",
    freeCancelUntil: (d) => `ยกเลิกฟรีถึง ${d}`,
    notChargedYet: "ยังไม่มีการเรียกเก็บเงิน",
    alert: {
      title: "แจ้งเตือนเมื่อมีห้องว่าง",
      lead: (d, g) => `หาก ${d}・${g} คน มีห้องว่าง เราจะแจ้งท่านทางอีเมลหนึ่งครั้ง`,
      placeholder: "your@email.com", submit: "รับการแจ้งเตือน",
      sending: "กำลังส่ง…", done: "ลงทะเบียนเรียบร้อย เราจะแจ้งท่านเมื่อมีห้องว่าง",
      fail: "ส่งไม่สำเร็จ กรุณาลองใหม่ภายหลัง", invalid: "กรุณาตรวจสอบอีเมลของท่าน",
      privacy: 'ส่งเพียงฉบับเดียว ดูการจัดการข้อมูลได้ที่<a href="{privacyHref}">นโยบายความเป็นส่วนตัว</a>',
    },
    proceed: "จองเลย",
    capacityMax: (n) => `สูงสุด ${n} ท่าน`,
    errorFetch: "ไม่สามารถโหลดข้อมูลห้องว่างได้ กรุณาลองใหม่อีกครั้ง",
    loadingSlow: "กำลังตรวจสอบห้องว่าง อีกสักครู่จะแสดงผล",
    loadingTooLong: "ใช้เวลานานกว่าปกติ กรุณาลองใหม่อีกครั้ง",
    retry: "ลองใหม่",
    conditionsChanged: "เงื่อนไขเปลี่ยนแปลง กำลังตรวจสอบห้องว่างล่าสุด…",
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
