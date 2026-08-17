/* ページ・コンポーネント固有の5言語文言の集約先（リファクタ④・2026-08-17）。
   以前はインライン辞書が各ページに散在し、「日本語だけ直して他4言語が残る」
   事故（2026-08-16 チェックアウト時刻で実際に発生）の温床だった。
   5言語は必ずここで横に並べて編集する。新しいページ固有文言もここに追加すること。
   役割分担: 汎用UI= uiStrings.ts / 予約フロー= bookStrings.ts / サイト全体コピー= translations.ts
   ※account/checkout の大型辞書と SPEC_LABELS は、ページ変数や中央辞書を組み替える
     「式」であり純リテラルではないため移動対象外（中身の文言は bookStrings 等が正）。 */

export const howtoUI = {
  ja: {
    eyebrow: "チェックイン案内", sub: "ご到着までの流れ",
    s1: "住所と地図", s1sub: "まずはこの場所へ",
    s2: "玄関の場所", s2sub: "建物に着いたら",
    s3: "鍵のお受け取り", s3sub: "キーボックスを開ける",
    s4: "駐車場", s4sub: "お車でお越しの方へ",
    mapBtn: "Google マップで開く",
    entranceCaption: "赤い丸が玄関ドアです。",
    pin: "暗証番号", pinNote: "暗証番号は、公式サイトのご予約はご案内メールに、Airbnb・Booking.com のご予約は各サイトのメッセージにお送りしています。見当たらない場合は下記のお電話へ。",
    keyAfter: "番号を合わせるとキーボックスが開きます。中の鍵で解錠し、ご入室ください。ご滞在中は鍵をお持ちください。",
    garageTitle: "車庫のサイズ",
    garageNote: "駐車場は狭くなっております。お車がこの寸法に収まるかどうか、事前にご確認ください。収まらない場合は、周辺のコインパーキングをご利用ください。",
    largeTitle: "大型車もご利用いただけます",
    largeBody: "アルファードなどの大型車も駐車可能です。",
    helpTitle: "お困りのとき",
    helpBody: "鍵が取り出せない、場所が分からないなど、お困りの際は下記へお電話ください。ご予約いただいたサイトのメッセージからでもご連絡いただけます。",
    helpCall: "電話でのご連絡",
  },
  en: {
    eyebrow: "Check-in guide", sub: "Getting to the house",
    s1: "Address & map", s1sub: "Head here first",
    s2: "Finding the entrance", s2sub: "Once you arrive",
    s3: "Getting the key", s3sub: "Opening the key box",
    s4: "Parking", s4sub: "If you come by car",
    mapBtn: "Open in Google Maps",
    entranceCaption: "The red circle marks the front door.",
    pin: "PIN", pinNote: "Your PIN was sent by email (official-site bookings) or via the booking site\u2019s messages (Airbnb / Booking.com). If you cannot find it, please call the number below.",
    keyAfter: "Set the dials to the PIN and the box opens. Unlock the door with the key inside, and keep it with you during your stay.",
    garageTitle: "Garage dimensions",
    garageNote: "The parking space is narrow. Please check that your car fits within these dimensions. If not, please use a nearby coin parking.",
    largeTitle: "Large vehicles welcome",
    largeBody: "Large vehicles such as the Toyota Alphard can be parked here.",
    helpTitle: "Need help?",
    helpBody: "If you cannot get the key out, or you cannot find the house, please call us. You can also message us through your booking site.",
    helpCall: "Call us",
  },
  ko: {
    eyebrow: "체크인 안내", sub: "도착까지의 흐름",
    s1: "주소와 지도", s1sub: "먼저 이곳으로",
    s2: "현관 위치", s2sub: "건물에 도착하시면",
    s3: "열쇠 수령", s3sub: "키박스 여는 법",
    s4: "주차장", s4sub: "차로 오시는 분께",
    mapBtn: "Google 지도에서 열기",
    entranceCaption: "빨간 동그라미가 현관문입니다.",
    pin: "비밀번호", pinNote: "비밀번호는 공식 사이트 예약은 안내 메일로, Airbnb・Booking.com 예약은 각 사이트의 메시지로 보내드렸습니다. 찾을 수 없으면 아래 전화번호로 연락해 주세요.",
    keyAfter: "번호를 맞추면 키박스가 열립니다. 안에 있는 열쇠로 문을 열고 들어가 주세요. 숙박 중에는 열쇠를 지참해 주세요.",
    garageTitle: "차고 크기",
    garageNote: "주차 공간이 좁습니다. 차량이 이 치수에 들어가는지 미리 확인해 주세요. 들어가지 않는 경우 주변 코인 주차장을 이용해 주세요.",
    largeTitle: "대형차도 이용 가능합니다",
    largeBody: "알파드 등 대형차도 주차하실 수 있습니다.",
    helpTitle: "곤란하실 때는",
    helpBody: "열쇠를 꺼낼 수 없거나 위치를 찾기 어려우실 때는 아래로 전화해 주세요. 예약하신 사이트의 메시지로도 연락하실 수 있습니다.",
    helpCall: "전화 연락",
  },
  zh: {
    eyebrow: "入住指南", sub: "抵達前的流程",
    s1: "地址與地圖", s1sub: "請先前往這裡",
    s2: "玄關位置", s2sub: "抵達建築物後",
    s3: "領取鑰匙", s3sub: "打開密碼鎖盒",
    s4: "停車場", s4sub: "開車前來的旅客",
    mapBtn: "在 Google 地圖開啟",
    entranceCaption: "紅色圓圈處為大門。",
    pin: "密碼", pinNote: "密碼已寄送：官網預訂請查看通知郵件，Airbnb・Booking.com 預訂請查看該網站的訊息。找不到時請撥打下方電話。",
    keyAfter: "轉到正確號碼後密碼盒即可打開。請用裡面的鑰匙開門進入，住宿期間請隨身攜帶鑰匙。",
    garageTitle: "車庫尺寸",
    garageNote: "停車空間較為狹窄。請事先確認您的車輛是否符合此尺寸。若無法停放，請利用附近的計時停車場。",
    largeTitle: "大型車亦可停放",
    largeBody: "Alphard 等大型車輛也可停放。",
    helpTitle: "遇到問題時",
    helpBody: "若無法取出鑰匙或找不到位置，請撥打下方電話。亦可透過您預訂的網站訊息與我們聯繫。",
    helpCall: "電話聯繫",
  },
  th: {
    eyebrow: "คู่มือเช็คอิน", sub: "ขั้นตอนก่อนถึงที่พัก",
    s1: "ที่อยู่และแผนที่", s1sub: "เดินทางมาที่นี่ก่อน",
    s2: "ตำแหน่งทางเข้า", s2sub: "เมื่อมาถึงอาคาร",
    s3: "การรับกุญแจ", s3sub: "วิธีเปิดกล่องกุญแจ",
    s4: "ที่จอดรถ", s4sub: "สำหรับผู้ที่มาด้วยรถยนต์",
    mapBtn: "เปิดใน Google Maps",
    entranceCaption: "วงกลมสีแดงคือประตูทางเข้า",
    pin: "รหัส", pinNote: "รหัสถูกส่งให้แล้ว: จองผ่านเว็บไซต์ทางการดูในอีเมลแจ้งเตือน จองผ่าน Airbnb・Booking.com ดูในข้อความของเว็บไซต์นั้น หากหาไม่พบกรุณาโทรตามหมายเลขด้านล่าง",
    keyAfter: "เมื่อตั้งรหัสถูกต้อง กล่องจะเปิดออก กรุณาใช้กุญแจด้านในเปิดประตูเข้าห้องพัก และพกกุญแจติดตัวไว้ตลอดการเข้าพัก",
    garageTitle: "ขนาดที่จอดรถ",
    garageNote: "ที่จอดรถค่อนข้างแคบ กรุณาตรวจสอบล่วงหน้าว่ารถของคุณอยู่ในขนาดนี้หรือไม่ หากไม่พอดี กรุณาใช้ที่จอดรถแบบหยอดเหรียญบริเวณใกล้เคียง",
    largeTitle: "รองรับรถขนาดใหญ่",
    largeBody: "รถขนาดใหญ่เช่น Toyota Alphard ก็สามารถจอดได้",
    helpTitle: "หากพบปัญหา",
    helpBody: "หากไม่สามารถนำกุญแจออกมาได้ หรือหาที่พักไม่พบ กรุณาโทรหาเราตามหมายเลขด้านล่าง หรือติดต่อผ่านข้อความในเว็บไซต์ที่คุณจองก็ได้",
    helpCall: "โทรหาเรา",
  },
};

export const inquiryStrings = {
  en: { title: "Your inquiry", lead: "Replies from us appear here. Feel free to continue the conversation.",
    you: "You", host: "yah.homes", placeholder: "Type your message", send: "Send", sending: "Sending...",
    fail: "Could not send. Please try again.", gone: "This link has expired. Please contact us again from the contact form.",
    goneCta: "Open the contact form", loading: "Loading..." },
  ja: { title: "お問い合わせ", lead: "運営からのご返信はこちらに表示されます。続きもこのままお送りいただけます。",
    you: "お客様", host: "yah.homes", placeholder: "メッセージを入力", send: "送信", sending: "送信中...",
    fail: "送信できませんでした。もう一度お試しください。", gone: "このリンクは期限切れです。お手数ですが、もう一度お問い合わせフォームからご連絡ください。",
    goneCta: "お問い合わせフォームへ", loading: "読み込み中..." },
  ko: { title: "문의", lead: "운영의 답변이 여기에 표시됩니다. 이어서 보내실 수 있습니다.",
    you: "고객님", host: "yah.homes", placeholder: "메시지를 입력하세요", send: "보내기", sending: "보내는 중...",
    fail: "보내지 못했습니다. 다시 시도해 주세요.", gone: "이 링크는 만료되었습니다. 문의 양식에서 다시 연락해 주세요.",
    goneCta: "문의 양식 열기", loading: "불러오는 중..." },
  zh: { title: "您的諮詢", lead: "我們的回覆會顯示在這裡，您也可以直接繼續對話。",
    you: "您", host: "yah.homes", placeholder: "請輸入訊息", send: "送出", sending: "傳送中...",
    fail: "傳送失敗，請再試一次。", gone: "此連結已過期。請再次透過聯絡表單與我們聯繫。",
    goneCta: "前往聯絡表單", loading: "讀取中..." },
  th: { title: "คำถามของคุณ", lead: "คำตอบจากเราจะแสดงที่นี่ และคุณสามารถสนทนาต่อได้เลย",
    you: "คุณ", host: "yah.homes", placeholder: "พิมพ์ข้อความ", send: "ส่ง", sending: "กำลังส่ง...",
    fail: "ส่งไม่สำเร็จ กรุณาลองอีกครั้ง", gone: "ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อเราอีกครั้งผ่านแบบฟอร์ม",
    goneCta: "เปิดแบบฟอร์มติดต่อ", loading: "กำลังโหลด..." },
};

export const guidesIndexMeta = {
  ja: {
    title: "福岡ガイド | yah.homes — 一棟貸し・ヴィラ・エリアの選び方",
    description: "福岡の一棟貸し・ヴィラ選びやエリアの歩き方を、現地確認の一次情報でガイド。yah.homes編集。",
    heading: "福岡ガイド",
    empty: "ガイド記事は準備中です。",
  },
  en: {
    title: "Fukuoka Guide | yah.homes",
    description: "First-hand guides to choosing a whole-house stay and exploring Fukuoka, by yah.homes.",
    heading: "Fukuoka Guide",
    empty: "Guides are coming soon.",
  },
  ko: {
    title: "후쿠오카 가이드 | yah.homes",
    description: "후쿠오카 독채 숙소 선택과 지역 정보를 현지 확인 정보로 안내합니다.",
    heading: "후쿠오카 가이드",
    empty: "가이드를 준비 중입니다.",
  },
  zh: {
    title: "福岡指南 | yah.homes — 包棟民宿・區域攻略",
    description: "以實地確認的第一手資訊，介紹福岡包棟民宿的選擇方式與區域攻略。",
    heading: "福岡指南",
    empty: "指南準備中。",
  },
  th: {
    title: "คู่มือฟุกุโอกะ | yah.homes",
    description: "คู่มือเลือกที่พักทั้งหลังและเที่ยวฟุกุโอกะ จากข้อมูลที่ตรวจสอบจริง",
    heading: "คู่มือฟุกุโอกะ",
    empty: "กำลังเตรียมคู่มือ",
  },
};

export const guideMidctaLabels = {
  ja: { kiyokawa: "清川を予約する →", takasago: "高砂を予約する →" },
  en: { kiyokawa: "Book Kiyokawa →", takasago: "Book Takasago →" },
  zh: { kiyokawa: "預訂清川 →", takasago: "預訂高砂 →" },
  ko: { kiyokawa: "기요카와 예약하기 →", takasago: "다카사고 예약하기 →" },
  th: { kiyokawa: "จอง Kiyokawa →", takasago: "จอง Takasago →" },
};

export const guideMidctaLead = {
  ja: {
    featured: "📍 この記事で紹介している物件に泊まれます",
    generic: "📍 この記事の筆者は、福岡・都心で一棟貸し2棟を運営しています",
  },
  en: {
    featured: "📍 You can stay at the houses featured in this article",
    generic: "📍 The author runs two whole-house rentals in central Fukuoka",
  },
  zh: {
    featured: "📍 可以入住本文介紹的包棟民宿",
    generic: "📍 本文作者在福岡市中心經營兩棟包棟民宿",
  },
  ko: {
    featured: "📍 이 글에서 소개한 독채 숙소에 묵을 수 있습니다",
    generic: "📍 이 글의 필자는 후쿠오카 도심에서 독채 숙소 2곳을 운영합니다",
  },
  th: {
    featured: "📍 คุณสามารถพักที่บ้านที่แนะนำในบทความนี้ได้",
    generic: "📍 ผู้เขียนบทความนี้ดูแลบ้านเช่าทั้งหลัง 2 หลังในใจกลางฟุกุโอกะ",
  },
};

export const propertyCardDirectLabel = { en: "Book direct — best rate", ja: "公式サイトで予約（最安）", ko: "공식 사이트에서 예약(최저가)", zh: "官網預訂（最優惠）", th: "จองผ่านเว็บทางการ (ราคาดีที่สุด)" };

export const comparisonRatingLabel = {
  en: "Airbnb Rating",
  ja: "Airbnb評価",
  ko: "에어비앤비 평점",
  zh: "Airbnb 評分",
  th: "คะแนน Airbnb",
};

export const propertyDirect = {
  en: { note: "Booking direct on our site is the best rate.", cta: "Check availability & book", priceFrom: "From {v} / night", decide: ["Check availability and the all-in total right here.", "Cleaning fee and lodging tax are included in the price shown. Nothing to pay on arrival.", "Free cancellation until {d} days before check-in.", "Secure card payment handled by Stripe. We never store your card details.", "Questions before booking? We reply within 24 hours."] },
  ja: { note: "公式サイトからの直接予約がお得です。", cta: "空室を見て予約する", priceFrom: "{v}〜 / 泊", decide: ["空室と総額を、この場でご確認いただけます。", "表示総額に清掃料・宿泊税を含みます。現地でのお支払いはありません。", "無料キャンセルは、チェックイン日の{d}日前まで。", "安全なカード決済。処理は Stripe が行い、カード情報を当社は保存しません。", "ご予約前のご質問には、24時間以内に返信します。"] },
  ko: { note: "공식 사이트에서 직접 예약하시는 것이 가장 저렴합니다.", cta: "예약 가능일 보고 예약하기", priceFrom: "{v}〜 / 1박", decide: ["빈방과 총액을 이 자리에서 확인하실 수 있습니다.", "표시 금액에 청소비·숙박세가 포함됩니다. 현장에서 지불하실 금액은 없습니다.", "무료 취소는 체크인 {d}일 전까지 가능합니다.", "안전한 카드 결제. 결제는 Stripe가 처리하며 카드 정보는 보관하지 않습니다.", "예약 전 문의에는 24시간 이내에 답변드립니다."] },
  zh: { note: "透過官網直接預訂最為優惠。", cta: "查詢空房並預訂", priceFrom: "{v} 起 / 晚", decide: ["可在此直接確認空房與總金額。", "顯示金額已含清潔費與住宿稅，現場無需再付款。", "入住日 {d} 天前可免費取消。", "安全的信用卡付款，由 Stripe 處理，本公司不會保存卡片資料。", "預訂前的疑問，我們會在 24 小時內回覆。"] },
  th: { note: "การจองผ่านเว็บไซต์ทางการของเราคุ้มค่าที่สุด", cta: "ดูห้องว่างและจอง", priceFrom: "เริ่มต้น {v} / คืน", decide: ["ตรวจสอบห้องว่างและราคารวมได้ที่นี่", "ราคาที่แสดงรวมค่าทำความสะอาดและภาษีที่พักแล้ว ไม่มีค่าใช้จ่ายเพิ่มเมื่อเดินทางถึง", "ยกเลิกฟรีได้ถึง {d} วันก่อนวันเช็คอิน", "ชำระด้วยบัตรอย่างปลอดภัยผ่าน Stripe เราไม่จัดเก็บข้อมูลบัตรของท่าน", "มีคำถามก่อนจอง? เราตอบภายใน 24 ชั่วโมง"] },
};
