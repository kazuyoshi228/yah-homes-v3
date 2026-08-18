// takasago の zh 版。言語ごとに分けているのは、1ファイル1,800行だと
// 1言語だけ直したつもりが他言語に波及し、差分も目視できないため（計画書 §7-2）。
// 数値（時刻・定員・評価）は持たない。{ci}/{co}/{cap} は SSoT から差し込む。
import type { TakasagoTranslations } from "./_schema";

export const zh: TakasagoTranslations = {

  hero: {
    propertyName: "yah.homes takasago",
    tagline: "位於福岡高砂地區中心的時尚整棟住宅。",
    area: "高砂，中央區，福岡",
    capacity: "最多 {cap} 人 · {rooms} 間臥室",
    bookNow: "立即預訂",
  },
  overview: {
    title: "房源概覽",
    bedrooms: "{rooms} 間臥室",
    beds: "1 張雙人床 + 4 張單人床",
    maxGuests: "最多 {cap} 人",
    area: "高砂 · 中央區，福岡",
  },
  amenityCategories: {
    title: "此房源提供的設施",
    showAll: "顯示所有設施",
    showLess: "收起",
    categories: [
      {
        name: "浴室",
        items: [
          { icon: "bath", label: "浴缸" },
          { icon: "shower", label: "獨立淋浴間" },
          { icon: "hairdryer", label: "吹風機" },
          { icon: "shampoo", label: "洗髮精" },
          { icon: "conditioner", label: "潤髮乳" },
          { icon: "soap", label: "沐浴乳" },
          { icon: "bidet", label: "免治馬桶" },
          { icon: "hot-water", label: "熱水" },
        ],
      },
      {
        name: "臥室 & 洗衣",
        items: [
          { icon: "washer", label: "洗衣機" },
          { icon: "hanger", label: "衣架" },
          { icon: "bedding", label: "床上用品" },
          { icon: "blackout", label: "遮光窗簾" },
          { icon: "drying-rack", label: "晾衣架" },
          { icon: "storage", label: "衣物收納空間" },
        ],
      },
      {
        name: "娛樂",
        items: [
          { icon: "tv", label: "電視" },
        ],
      },
      {
        name: "冷暖氣",
        items: [
          { icon: "ac", label: "冷氣" },
          { icon: "fan", label: "吊扇" },
          { icon: "heat", label: "暖氣" },
        ],
      },
      {
        name: "居家安全",
        items: [
          { icon: "camera", label: "房源安全攝影機", note: "依旅館業法規定，攝影機安裝於戶外/公共/入口區域。您的隱私受到完全保護。" },
          { icon: "smoke-alarm", label: "煙霧警報器" },
          { icon: "fire-ext", label: "滅火器" },
          { icon: "co-alarm", label: "一氧化碳警報器", unavailable: true, note: "此房源可能未配備一氧化碳偵測器。詳情請聯絡房東。" },
        ],
      },
      {
        name: "網路 & 辦公",
        items: [
          { icon: "wifi", label: "Wi-Fi" },
        ],
      },
      {
        name: "廚房 & 餐飲",
        items: [
          { icon: "kitchen", label: "完整廚房" },
          { icon: "cooking", label: "房客烹飪空間" },
          { icon: "fridge", label: "冰箱" },
          { icon: "microwave", label: "微波爐" },
          { icon: "cookware", label: "基本廚具", note: "鍋具、平底鍋、油、鹽和胡椒" },
          { icon: "tableware", label: "餐具 & 刀叉", note: "碗、筷子、盤子、杯子等" },
          { icon: "freezer", label: "冷凍庫" },
          { icon: "oven", label: "烤箱" },
          { icon: "kettle", label: "電熱水壺" },
          { icon: "wine", label: "紅酒杯" },
          { icon: "rice", label: "電飯鍋" },
          { icon: "dining", label: "榻榻米矮餐桌" },
        ],
      },
      {
        name: "地點特色",
        items: [
          { icon: "private-entry", label: "獨立入口" },
          { icon: "laundromat", label: "附近有自助洗衣店" },
        ],
      },
      {
        name: "停車 & 設施",
        items: [
          { icon: "parking", label: "免費私人停車位" },
        ],
      },
      {
        name: "服務",
        items: [
          { icon: "long-stay", label: "可長期住宿", note: "可入住 28 晚或以上" },
          { icon: "self-checkin", label: "自助入住", note: "鑰匙保管箱" },
        ],
      },
    ],
  },
  amenities: {
    title: "設施",
    items: [
      "完整廚房",
      "洗衣機",
      "高速 Wi-Fi",
      "私人停車位（1 輛，免費）",
      "所有臥室均配備高級床墊",
      "大螢幕智慧電視",
      "所有房間均有冷氣",
      "寬敞的客廳 & 餐廳",
      "吹風機、拖鞋、毛巾 & 盥洗用品",
      "電飯鍋、微波爐 & 基本廚具",
    ],
  },
  access: {
    title: "交通",
    items: [
      { from: "福岡機場", time: "開車約 20 分鐘" },
      { from: "博多站", time: "開車約 10 分鐘 / 地鐵約 15 分鐘" },
      { from: "天神", time: "開車約 5 分鐘 / 可步行" },
      { from: "Canal City 博多", time: "開車約 10 分鐘" },
      { from: "太宰府", time: "開車約 {dazaifu} 分鐘" },
    ],
  },
  checkin: {
    title: "入住資訊",
    time: "入住：{ci} 起（無時間限制）",
    checkout: "退房：{co} 前",
    method: "透過密碼鎖完全無接觸自助入住。入住前 24 小時將傳送門禁密碼。",
    idVerification: "入住前需進行身份驗證（護照或政府核發的身份證件）。",
  },
  conditions: {
    title: "預訂條件",
    cancellation: "取消政策：入住日 {d} 天前可免費取消。確切期限（日本時間）將於預訂時顯示。",
    cleaningFee: "清潔費：已含在費率中",
    extraGuest: "額外房客費：{bg}人以內同一價格・第{bgx}人起每人每晚 ¥{xfee}",
    noiseRule: "有安靜時段規定。請體諒鄰居。",
    petRule: "不允許攜帶寵物（事先通知可攜帶導盲犬）。",
    smokingRule: "室內禁止吸菸。有指定戶外吸菸區。",
  },
  booking: {
    title: "直接預訂更划算",
    subtitle: "直接向我們預訂享最優惠價格 — 無平台手續費。",
    comingSoon: "線上預訂系統即將推出。請聯絡我們進行預訂。",
  },
  faq: {
    title: "常見問題",
    items: [
      { q: "有停車位嗎？", a: "有，包含一個免費的私人停車位。" },
      { q: "適合帶幼兒的家庭嗎？", a: "適合，家庭房客很多。唯不提供嬰兒床、高腳椅等嬰幼兒用品，請自行準備。室內有樓梯，帶幼兒請多加留意。" },
      { q: "入住流程是什麼？", a: "透過密碼鎖完全無接觸自助入住。您將在抵達前 24 小時收到門禁密碼，無需與任何人見面。" },
      { q: "可以提早入住或延遲退房嗎？", a: "視房間狀況而定。請提前聯絡我們。" },
      { q: "可以攜帶寵物嗎？", a: "很遺憾，不允許攜帶寵物。事先通知可攜帶導盲犬。" },
      { q: "可以吸菸嗎？", a: "房源內禁止吸菸。有指定的戶外吸菸區。" },
      { q: "取消政策是什麼？", a: "透過官網預訂者，可於入住日 {d} 天前免費取消。逾期取消及未告知未入住者，將收取全額住宿費。確切期限（日本時間）會顯示於付款前畫面與確認信中，並可自行於 My Page 取消。如需變更日期、人數或房型，請先取消再重新預訂（於免費期限內不會產生額外費用）。透過 Airbnb、Booking.com 的預訂則適用各平台政策。" },
      { q: "行動不便的房客可以入住嗎？", a: "請注意，房源內的樓梯較陡。該住宅不提供輪椅通道或無障礙設施。我們建議能夠輕鬆上下樓梯的房客入住。" },
      { q: "如何付款？", a: "僅接受信用卡，於預訂時全額付款（金流服務：Stripe）。本公司不會保存您的信用卡資料，現場無需再支付任何費用。" },
    ],
    bookButton: "立即預訂",
  },
  review: {
    count: "{n} 則評論",
    superhostLabel: "超讚房東",
    airbnbLabel: "在 Airbnb 上查看",
  },
  propertyDescription: {
    title: "關於此房源",
    showMore: "顯示更多",
    showLess: "收起",
    intro: "位於福岡中央區充滿活力的高砂地區的時尚整棟住宅出租。步行即可到達天神，讓您同時享受福岡市中心的便利和私人住宅的舒適。\n\n開車 5 分鐘到天神。開車 10 分鐘到博多站。從機場開車 20 分鐘。完全無接觸自助入住，確保完全的隱私。\n\n非常適合最多 {cap} 人的家庭和團體。寬敞的客廳、影音室和設計師家具創造了難忘的住宿體驗。",
    highlights: [
      {
        title: "1. 優質睡眠體驗",
        body: "所有臥室均配備高級床墊，確保真正的休息。每個床頭都有電源插座，讓您的設備保持充電。",
      },
      {
        title: "2. 影音室體驗",
        body: "享受配備{tv}吋大螢幕電視的專用影音室。非常適合與您的團體一起度過電影之夜。",
      },
      {
        title: "3. 像當地人一樣生活 — 設施完備",
        body: "配備大型冰箱和充足廚具的寬敞廚房讓您可以用新鮮的當地食材烹飪。高速 Wi-Fi 使其非常適合工作假期。\n\n包含免費私人停車位（1 個）。\n\n[房東公告]\n除浴缸外，還有獨立淋浴間，為團體入住提供額外便利。",
      },
    ],
    bedroomGuide: {
      title: "臥室指南",
      items: [
        "臥室 1：1 張雙人床",
        "臥室 2：2 張單人床",
        "臥室 3：2 張單人床",
        "（{rooms} 間臥室，最多 {cap} 人）",
      ],
    },
    facilityGuide: {
      title: "設施",
      items: [
        "私人停車位（1 個）",
        "浴室（1 間，含浴缸）",
        "淋浴間（1 間，獨立）",
        "廁所（{toilet} 間：1 樓和 2 樓）",
        "洗臉盆",
        "廚房",
        "客廳",
        "餐廳",
        "影音室",
      ],
    },
    equipment: {
      title: "家電 & 設備",
      items: [
        "{tv}吋大螢幕電視",
        "洗衣機",
        "冰箱（含冷凍庫）",
        "微波爐",
        "電飯鍋",
        "電熱水壺",
        "基本廚具（鍋具、平底鍋、砧板、刀具）",
        "餐具",
        "吹風機",
      ],
    },
    amenitiesDetail: {
      title: "備品",
      items: [
        "拖鞋",
        "浴巾 / 毛巾",
        "牙刷組",
        "洗髮精 / 潤髮乳 / 沐浴乳",
        "衣架 / 晾衣架",
        "洗衣精",
      ],
    },
    guestAccess: {
      title: "房客使用空間",
      body: "這是整棟出租 — 您不需要與其他房客共用任何空間。所有區域均可自由使用。",
    },
    otherNotes: {
      title: "其他注意事項",
      items: [
        "請保持房源清潔。過度髒亂或留下垃圾可能會收取額外清潔費。",
        "遺失或損壞的物品將按實際費用收費。",
        "超出申報人數將收取每人 ¥{xfee} 的附加費。",
        "請按照提供的垃圾分類指南分類垃圾。",
        "不允許攜帶寵物（事先通知可攜帶導盲犬）。",
        "除住宿費外，還需繳納福岡市規定的住宿稅。",
      ],
    },
    registration: {
      title: "登記資訊",
      body: "旅館業法許可證號 | 福岡市衛生局 | Fuku-Chu-Hoken-Dai 713001",
    },
  },
  houseRules: {
    title: "住宿規則",
    items: [
      { icon: "no-smoking", rule: "室內禁止吸菸。有指定戶外吸菸區。" },
      { icon: "no-pets", rule: "不允許攜帶寵物。事先通知可攜帶導盲犬。" },
      { icon: "quiet", rule: "安靜時段：晚上 10 點 – 早上 8 點。請體諒鄰居。" },
      { icon: "checkin-time", rule: "入住：{ci} 起（無時間限制）。退房：{co} 前。" },
      { icon: "guests", rule: "不允許未登記的房客。必須遵守最大入住人數。" },
      { icon: "trash", rule: "請遵守當地垃圾分類規定。提供垃圾桶。" },
      { icon: "shoes", rule: "請在入口處脫鞋（日本習俗）。" },
      { icon: "stairs", rule: "室內樓梯較陡。不適合行動不便的房客。" },
    ],
  },
  floorPlan: {
    title: "平面圖",
    subtitle: "3 層獨棟住宅 · 1F：玄關 & 車庫 · 2F：客廳/餐廳/廚房、影音室、浴室 & 淋浴間 · 3F：{rooms} 間臥室 & 陽台",
    imageAlt: "高砂平面圖 – 1F 玄關 & 車庫，2F 客廳餐廳廚房、影音室、浴室 & 淋浴間，3F 臥室 & 陽台",
  },
  contact: {
    title: "有問題嗎？",
    subtitle: "我們的團隊很樂意協助解答您的任何住宿問題。",
  },
  ui: {
    overviewLabels: {
      bedrooms: "臥室",
      beds: "床鋪",
      maxGuests: "最多入住人數",
      area: "地區",
    },
    contactUsToBook: "聯絡我們預訂",
    successMessage: "✓ 訊息已發送！我們將盡快回覆您。",
    namePlaceholder: "姓名",
    emailPlaceholder: "電子郵件",
    messagePlaceholder: "訊息",
    privacyLabel: "我同意",
    privacyLink: "隱私政策",
    sendButton: "發送訊息",
    sendingButton: "發送中…",
    errorToast: "發送失敗。請再試一次。",
  },
  nav: {
    backToHome: "返回首頁",
    language: "語言",
    langNames: { en: "英文", ko: "韓文", zh: "中文", th: "泰文" },
  },
};
