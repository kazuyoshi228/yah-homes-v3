// kiyokawa の zh 版。言語ごとに分けているのは、1ファイル1,800行だと
// 1言語だけ直したつもりが他言語に波及し、差分も目視できないため（計画書 §7-2）。
// 数値（時刻・定員・評価）は持たない。{ci}/{co}/{cap} は SSoT から差し込む。
import type { KiyokawaTranslations } from "./_schema";

export const zh: KiyokawaTranslations = {

  hero: {
    propertyName: "yah.homes kiyokawa",
    tagline: "位於充滿活力的清川地區，全新打造的獨棟民宅。",
    area: "清川，中央區，福岡",
    capacity: "最多 {cap} 人 · {rooms} 間臥室",
    bookNow: "立即預訂",
  },
  overview: {
    title: "房源概覽",
    bedrooms: "{rooms} 間臥室",
    beds: "雙人床 3 張 + 單人床 1 張",
    maxGuests: "最多 {cap} 人",
    area: "清川 · 福岡市中央區",
  },
  amenityCategories: {
    title: "此房源提供的設施",
    showAll: "查看全部設施",
    showLess: "收起",
    categories: [
      {
        name: "浴室",
        items: [
          { icon: "bath", label: "浴缸" },
          { icon: "hairdryer", label: "吹風機" },
          { icon: "shampoo", label: "洗髮精" },
          { icon: "conditioner", label: "護髮素" },
          { icon: "soap", label: "沐浴乳" },
          { icon: "bidet", label: "溫水沖洗馬桶" },
          { icon: "hot-water", label: "熱水" },
          { icon: "shower", label: "沐浴凝膠" },
        ],
      },
      {
        name: "臥室 & 洗衣",
        items: [
          { icon: "washer", label: "滾筒式洗烘一體機" },
          { icon: "hanger", label: "衣架" },
          { icon: "bedding", label: "床用用品" },
          { icon: "blackout", label: "遮光窗簾" },
          { icon: "drying-rack", label: "曬衣架" },
          { icon: "storage", label: "衣物收納空間" },
        ],
      },
      {
        name: "娛樂設施",
        items: [
          { icon: "tv", label: "電視" },
          { icon: "audio", label: "音響系統" },
        ],
      },
      {
        name: "冷暖氣",
        items: [
          { icon: "ac", label: "冷氣" },
          { icon: "fan", label: "天花板風扇" },
          { icon: "heat", label: "暖氣" },
        ],
      },
      {
        name: "宅邸安全",
        items: [
          { icon: "camera", label: "房內安全監控攝影機", note: "依日本旅館業法規定，屋外、公共區域及出入口設有監控攝影機。您的隱私完全受到保護。" },
          { icon: "smoke-alarm", label: "煙霧偵測器" },
          { icon: "fire-ext", label: "滅火器" },
          { icon: "co-alarm", label: "一氧化碳偵測器", unavailable: true, note: "此房源可能沒有安裝一氧化碳偵測器，請聯絡房主了解詳情。" },
        ],
      },
      {
        name: "網路 & 辦公",
        items: [
          { icon: "wifi", label: "Wi-Fi" },
          { icon: "desk", label: "專用工作區" },
        ],
      },
      {
        name: "廚房 & 餐點",
        items: [
          { icon: "kitchen", label: "完整廚房" },
          { icon: "cooking", label: "可自行烹飪" },
          { icon: "fridge", label: "冰箱" },
          { icon: "microwave", label: "微波爐" },
          { icon: "cookware", label: "基本廚具", note: "鍋具、平底鍋、食用油、鹽胡椒" },
          { icon: "tableware", label: "餐具 & 餐具組", note: "碗、筷子、盤子、杯子等" },
          { icon: "freezer", label: "冷凍庫" },
          { icon: "dishwasher", label: "洗碗機" },
          { icon: "stove", label: "爐灶" },
          { icon: "oven", label: "烤箱" },
          { icon: "kettle", label: "電熱水壺" },
          { icon: "wine", label: "紅酒杯" },
          { icon: "rice", label: "電麻米鍋" },
          { icon: "dining", label: "餐桌" },
        ],
      },
      {
        name: "地點特色",
        items: [
          { icon: "private-entry", label: "專用入口" },
          { icon: "laundromat", label: "附近有自助洗衣店" },
        ],
      },
      {
        name: "停車 & 其他設施",
        items: [
          { icon: "parking", label: "免費專用停車位" },
        ],
      },
      {
        name: "服務",
        items: [
          { icon: "long-stay", label: "可長期入住", note: "可入住 28 晚以上" },
          { icon: "self-checkin", label: "自助入住", note: "鑰匙保管箱" },
        ],
      },
    ],
  },
  review: {
    count: "{n} 則評價",
    superhostLabel: "超級房主",
    airbnbLabel: "在 Airbnb 上查看",
  },
  propertyDescription: {
    title: "房源介紹",
    showMore: "查看更多",
    showLess: "收起",
    intro: "位於福岡市清川那珂川河畔的全新隱居別墅（整棟居宅）。在市中心便可前往天神與博多，同時享受河畔的寧靜時光。\n\n開車至天神約 {tenjinCar} 分鐘。開車至博多站約 {hakataCar} 分鐘。自機場開車約 {airport} 分鐘。完全無接觸式自助入住，可享受完全私密的住宿體驗。\n\n最多可容納 7 位客人，適合家庭或團體旅行。寬敞的客廳與設計感十足的家具，為您創造特別的住宿體驗。",
    highlights: [
      {
        title: "1. 極致睡眠體驗（SIMMONS 頂級床墊）",
        body: "{rooms} 間臥室均配備頂級酒店所使用的 SIMMONS 頂級床墊。每張床邊均設有插座，確保您得到充分休息。",
      },
      {
        title: "2. 震撼影院級家庭娛樂",
        body: "55 吋大型電視配合日本製高品質擴大機與地板型音箱，帶來影院級音響體驗。（請使用自己的影音平台帳號登入）",
      },
      {
        title: "3. 「就像居家一樣旅行」充實設備",
        body: "寬敞的全配備廚房配有大型冰箱與豐富廚具，可使用當地新鮮食材烹飪。專用工作機及高速 Wi-Fi 適合工作度假。於 2026 年 4 月安裝全新滾筒式洗烘一體機。\n\n免費專用停車位（1 格）包含在內。\n\n[房主公告]\n2026 年 4 月：洗衣機升級為滾筒式洗烘一體機。按一鍵即可完成洗滌到烘乾全程。",
      },
    ],
    bedroomGuide: {
      title: "臥室介紹",
      items: [
        "臥室 1：單人床 1 張",
        "臥室 2：雙人床 2 張",
        "臥室 3：雙人床 1 張",
        "（{rooms} 間臥室最多可容納 7 位）",
      ],
    },
    facilityGuide: {
      title: "設施介紹",
      items: [
        "專用停車位（1 格）",
        "浴室（{bath} 間）",
        "廁所（{toilet} 間：1F 與 2F）",
        "洗手台",
        "廚房（3 口燃氣爐）",
        "客廳",
        "餐廳",
      ],
    },
    equipment: {
      title: "設備 & 家電",
      items: [
        "55 吋電視",
        "日本製高品質擴大機 & 地板型音箱",
        "滾筒式洗烘一體機",
        "冰箱（含冷凍庫）",
        "微波爐",
        "電麻米鍋（5 杯）",
        "電熱水壺",
        "基本廚具（鍋、平底鍋、砧板、菜刀）",
        "餐具組",
        "吹風機",
      ],
    },
    amenitiesDetail: {
      title: "備品",
      items: [
        "拖鞋",
        "浴巾 / 洗臉巾",
        "牙刷組",
        "洗髮精 / 護髮素 / 沐浴乳",
        "衣架 / 曬衣架",
        "洗衣精",
      ],
    },
    guestAccess: {
      title: "客人可使用的區域",
      body: "此房源為整棟出租，您不需與其他客人共用任何空間。所有區域均可自由使用。",
    },
    otherNotes: {
      title: "其他注意事項",
      items: [
        "請保持房間整潔。若有嚴重髒亂或遺棄垃圾，將另行收取清潔費。",
        "房內物品遺失或損壞，將按實際費用收取。",
        "入住人數超出申報人數，每位加收 ¥{xfee} 。",
        "請依照垃圾桶說明進行分類。",
        "禁止攜帶寵物（導盲犬需事先告知）。",
        "除房費外，還需支付福岡市規定的容宿稅。",
      ],
    },
    registration: {
      title: "登錄資訊",
      body: "旅館業法許可證號 | 福岡市衛生局 | 福中保環第713001號",
    },
  },
  amenities: {
    title: "設施",
    items: [
      "設備齊全的廚房（3 口燃氣爐）",
      "滾筒式洗烘一體機",
      "高速 Wi-Fi",
      "私人停車場（1 輛，免費）",
      "全臥室 Simmons 頂級床墊",
      "55 吋智慧型電視 + 日本製高品質音響",
      "全室冷暖氣",
      "工作桌（1 人）",
      "寬敞的客廳 & 餐廳",
      "吹風機、拖鞋、毛巾 & 盥洗用品",
      "電鍋、微波爐 & 基本廚具",
    ],
  },
  access: {
    title: "交通資訊",
    items: [
      { from: "福岡機場", time: "開車約 18 分鐘" },
      { from: "博多站", time: "開車約 10 分鐘 / 地鐵約 20 分鐘" },
      { from: "天神", time: "開車約 {tenjinCar} 分鐘 / 步行可達" },
      { from: "渡邊通站（1號出口）", time: "步行約{station}分鐘" },
      { from: "Canal City 博多", time: "開車約 15 分鐘" },
      { from: "太宰府", time: "開車約 {dazaifu} 分鐘" },
    ],
  },
  checkin: {
    title: "入住資訊",
    time: "入住：{ci} 起（無時間限制）",
    checkout: "退房：{co} 前",
    method: "透過密碼鎖完全無接觸自助入住。抵達前 24 小時將發送存取碼。",
    idVerification: "入住前需進行身份驗證（護照或政府核發身份證件）。",
  },
  conditions: {
    title: "預訂條件",
    cancellation: "取消政策：入住日 {d} 天前可免費取消。確切期限（日本時間）將於預訂時顯示。",
    cleaningFee: "清潔費：已包含在費率中",
    extraGuest: "額外住客費：{bg}人以內同一價格・第{bgx}人起每人每晚 ¥{xfee}",
    noiseRule: "請注意深夜噪音，體諒鄰居。",
    petRule: "不允許攜帶寵物（事先通知的導盲犬除外）。",
    smokingRule: "室內禁止吸菸，室外有指定吸菸區。",
  },
  booking: {
    title: "直接預訂，享受最優惠價格",
    subtitle: "直接向我們預訂，無需支付平台手續費。",
  },
  faq: {
    title: "常見問題",
    items: [
      { q: "有停車位嗎？", a: "有，包含一個免費私人停車位。" },
      { q: "適合帶幼兒的家庭嗎？", a: "適合，家庭房客很多。唯不提供嬰兒床、高腳椅等嬰幼兒用品，請自行準備。室內有樓梯，帶幼兒請多加留意。" },
      { q: "入住流程是什麼？", a: "透過密碼鎖完全無接觸自助入住。抵達前 24 小時您將收到存取碼，無需與任何人會面。" },
      { q: "可以提早入住或延遲退房嗎？", a: "視空房情況而定，請提前聯絡我們。" },
      { q: "可以攜帶寵物嗎？", a: "很抱歉，本房源不允許攜帶寵物。導盲犬請事先通知。" },
      { q: "可以吸菸嗎？", a: "室內禁止吸菸，室外有指定吸菸區。" },
      { q: "取消政策是什麼？", a: "透過官網預訂者，可於入住日 {d} 天前免費取消。逾期取消及未告知未入住者，將收取全額住宿費。確切期限（日本時間）會顯示於付款前畫面與確認信中，並可自行於 My Page 取消。如需變更日期、人數或房型，請先取消再重新預訂（於免費期限內不會產生額外費用）。透過 Airbnb、Booking.com 的預訂則適用各平台政策。" },
      { q: "行動不便的旅客可以入住嗎？", a: "請注意，房源內部樓梯較陡，不適合輪椅使用者或需要無障礙設施的旅客。建議能夠自行上下樓梯的旅客入住。" },
      { q: "如何付款？", a: "僅接受信用卡，於預訂時全額付款（金流服務：Stripe）。本公司不會保存您的信用卡資料，現場無需再支付任何費用。" },
    ],
    bookButton: "立即預訂",
  },
  houseRules: {
    title: "住宿規則",
    items: [
      { icon: "no-smoking", rule: "室內禁止吸菸，室外設有指定吸菸區。" },
      { icon: "no-pets", rule: "不允許攜帶寵物。導盲犬請事先告知。" },
      { icon: "quiet", rule: "安靜時間：晚上 10 點 – 上午 8 點。請尊重鄰居。" },
      { icon: "checkin-time", rule: "入住：{ci} 起（無時間限制）。退房：{co} 前。" },
      { icon: "guests", rule: "禁止未登記人員入住。請遵守最大入住人數。" },
      { icon: "trash", rule: "請遵守當地垃圾分類規定，已提供垃圾桶。" },
      { icon: "shoes", rule: "請在玄關脫鞋（日本習俗）。" },
      { icon: "stairs", rule: "內部樓梯較陡，不適合行動不便的旅客。" },
    ],
  },
  floorPlan: {
    title: "平面圖",
    subtitle: "3 層獨棟居宅 · 1F：浴室 & 車庫 · 2F：客廳/餐廳/廚房 · 3F：{rooms} 間臥室 & 陽台",
    imageAlt: "清川平面圖 – 1F 浴室 & 車庫，2F 客廳/餐廳/廚房，3F 臥室 & 陽台",
  },
  contact: {
    title: "有任何問題嗎？",
    subtitle: "我們的團隊很樂意協助您解答任何住宿相關問題。",
  },
  ui: {
    overviewLabels: {
      bedrooms: "臥室",
      beds: "床位",
      maxGuests: "最多住客",
      area: "地區",
    },
    contactUsToBook: "聯絡我們預訂",
    successMessage: "✓ 訊息已送出！我們將盡快回覆您。",
    namePlaceholder: "姓名",
    emailPlaceholder: "電子郵件",
    messagePlaceholder: "訊息",
    privacyLabel: "我同意",
    privacyLink: "隱私政策",
    sendButton: "送出訊息",
    sendingButton: "傳送中…",
    errorToast: "傳送失敗，請稍後再試。",
  },
  nav: {
    backToHome: "返回首頁",
    language: "語言",
    langNames: { en: "英語", ko: "韓語", zh: "中文", th: "泰語" },
  },
};
