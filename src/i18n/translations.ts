// =============================================================
// yah.homes — i18n translations
// Languages: en (English), ja (Japanese), ko (Korean), zh (Traditional Chinese), th (Thai)
// ja は「翻訳」ではなく正文（ブランド原資料が日本語のため）。
// Wonder Here ステートメントはブランドガイドライン記載の日本語版を逐語使用。
// =============================================================

export type Lang = "en" | "ja" | "ko" | "zh" | "th";

export interface Translations {
  // Navbar
  nav: {
    home: string;
    contact: string;
    about: string;
    properties: string;
    bookNow: string;
    locals: string;
    guides: string;
    language: string;
    langNames: { en: string; ja: string; ko: string; zh: string; th: string };
    menuOpen: string;
    menuClose: string;
  };
  // Access section
  access: {
    title: string;
    openInGoogleMaps: string;
  };
  // Story section fixed texts
  storySectionLabel: string;
  aboutYahHomes: string;
  checkInFindOut: string;
  // Review heading
  reviewHeading: string;
  // ComparisonTable
  comparisonTable: {
    title: string;
    headers: {
      capacity: string;
      rooms: string;
      facilities: string;
      access: string;
    };
    rows: {
      maxCapacity: string;
      bedrooms: string;
      doubleBed: string;
      singleBed: string;
      bathroom: string;
      showerBooth: string;
      toilet: string;
      privateParking: string;
      theaterRoom: string;
      fromAirport: string;
      fromStation: string;
      nearestStation: string;
      toTenjin: string;
      toHakata: string;
    };
    values: {
      available: string;
      carMin: string;
      walkMin: string;
      watanabeDori: string;
    };
  };
  // Hero
  hero: {
    catchcopy: string[];
    salesPoints: string[];
  };
  // Properties
  properties: {
    sectionLabel: string;
    bedrooms: string;
    people: string;
    galleryBtn: string;
    bookingBtn: string;
    airbnbBtn: string;
    reviewsLabel: string;
    kiyokawa: { name: string; info: string };
    takasago: { name: string; info: string };
    /** Wonder Here copy block shown above property cards */
    wonderHeadline: string;
    wonderBody: string[];
    wonderTagline: string;
  };
  // Story / Wonder Here
  story: {
    sectionLabel: string;
    heading: string;
    body: string[];
  };
  // Director
  director: {
    sectionHeading: string;
    directorName: string;
    directorTitle: string;
    intro: string[];
    section2Heading: string;
    section2Body: string[];
    section3Heading: string;
    section3Body: string[];
    section4Heading: string;
    section4Body: string[];
  };
  // Our Review / Improvement
  review: {
    heading: string;
    leadText: string;
    improvementHeading: string;
    improvementIntro: string;
    improvements: string[];
    closingText: string;
  };
  // Contact
  contact: {
    sectionLabel: string;
    heading: string;
    subheading: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    messagePlaceholder: string;
    submitBtn: string;
    successMsg: string;
    errorMsg: string;
  };
  // Features
  features: {
    heading: string;
    leadHeadline: string;
    leadBody: string;
    items: string[];
  };
  // Booking CTA
  bookingCta: {
    heading: string;
    kiyokawa: string;
    takasago: string;
  };
  // FAQ
  faq: {
    body: string;
  };
  // Footer
  footer: {
    address: string;
    rights: string;
  };
  // Locals CTA (Home page mid-section)
  localsCta: {
    sectionLabel: string;
    heading: string;
    body: string;
    btn: string;
  };
}

const en: Translations = {
  nav: {
    home: "Home",
    contact: "Contact",
    about: "About",
    properties: "Properties",
    bookNow: "Book Now",
    locals: "Locals",
    guides: "Guide",
    language: "Language",
    langNames: { en: "English", ja: "日本語", ko: "한국어", zh: "繁體中文", th: "ภาษาไทย" },
    menuOpen: "Open menu",
    menuClose: "Close menu",
  },
  access: {
    title: "Access",
    openInGoogleMaps: "Open in Google Maps",
  },
  storySectionLabel: "Wonder Here",
  aboutYahHomes: "About yah.homes.",
  checkInFindOut: "Check in, Find out.",
  reviewHeading: "Our Review / Improvement",
  comparisonTable: {
    title: "Comparison Table",
    headers: { capacity: "Capacity", rooms: "Rooms", facilities: "Facilities", access: "Access" },
    rows: {
      maxCapacity: "Maximum Capacity",
      bedrooms: "Bedrooms",
      doubleBed: "\u00b7 Double Bed",
      singleBed: "\u00b7 Single Bed",
      bathroom: "Bathroom",
      showerBooth: "Shower Booth",
      toilet: "Toilet",
      privateParking: "Private Parking",
      theaterRoom: "Theater Room",
      fromAirport: "From Airport",
      fromStation: "From Station",
      nearestStation: "Nearest Station",
      toTenjin: "To Tenjin",
      toHakata: "To Hakata Station",
    },
    values: {
      available: "Available",
      carMin: "{n} min by car",
      walkMin: "{n} min walk",
      watanabeDori: "Watanabe Dori",
    },
  },
  hero: {
    catchcopy: ["Check In,", "Find Out."],
    salesPoints: [
      "Convenient city-center location — within 20 min from the airport, walkable to Tenjin",
      "5-star hotel-grade Simmons mattresses in every bedroom",
      "Spacious kitchen & living-dining area",
      "Private parking available",
      "Spotless bathrooms, quality amenities & Kyushu traditional crafts",
    ],
  },
  properties: {
    sectionLabel: "Properties",
    bedrooms: "Bedrooms",
    people: "People",
    galleryBtn: "Gallery",
    bookingBtn: "See ratings on Booking.com",
    airbnbBtn: "See reviews on Airbnb",
    reviewsLabel: "reviews · Airbnb",
    kiyokawa: { name: "Kiyokawa", info: "{rooms} Bedrooms / {cap} People" },
    takasago: { name: "Takasago", info: "{rooms} Bedrooms / {cap} People" },
    wonderHeadline: "yah. Wonder here",
    wonderBody: [
      "Go deeper into this town.",
      "Beyond selfie shrines lie lived-in alleys.\nBeyond mirror-bright lobbies, nights shared with friends.\nyah. homes is your whole-house base camp\nfor tasting the city itself.",
      "Turn the key, kick off your shoes, let your body loosen.\nSleep sinks in; dawn sharpens every sense\nand pulls you to corners no guide marks.",
      "We know every bend of the backstreets,\nevery pulse of the neighborhood.\nA quiet bed waits, local secrets slipped under your door.\nKey in hand, follow the feeling — deeper in.",
    ],
    wonderTagline: "yah. homes — Check in, Find out.",
  },
  story: {
    sectionLabel: "Wonder Here",
    heading: "Your home, Away from your Home.\nyah.homes.",
    body: [
      "yah means Hello! in Japanese. We, yah.homes. is here in Fukuoka to welcome tourists from around the world. yah.homes offers whole-house stays in Fukuoka, Japan — spaces personally designed by our director to feel like a true home away from home.",
      "Each property is selected for its neighborhood character. We believe where you sleep shapes how you travel.",
    ],
  },
  director: {
    sectionHeading: "Message from Director",
    directorName: "Kazuyoshi Yamada",
    directorTitle: "yah.homes Creative Director",
    intro: [
      "Thank you for visiting the yah.homes website.",
      "My name is Kazuyoshi Yamada, and I am the Director of yah.homes.",
      "I am a passionate traveller who has journeyed through many countries. I have always felt that a peaceful and relaxing stay can profoundly shape the entire travel experience. That is why the space I have created is more than just a place to stay. It is my sincere wish that for everyone who visits, this will be a true \"home away from home\" where you can find genuine comfort and peace.",
    ],
    section2Heading:
      "A Space I Fell in Love with and Wanted to Live In, Now Shared with You",
    section2Body: [
      "I personally designed every room in our properties, at times even taking part in the construction myself. From the overall design to the smallest of materials, each room is filled with what I love and what I find comfortable.",
      "After each room is completed, I make it a point to stay there myself, living just as a guest would. I have personally stayed in every single room for a period of time. From the moment I wake up until I go to sleep, I experience the space from a guest's perspective, thoroughly examining every detail to ensure the layout is practical and the atmosphere is truly relaxing.",
      "The same principle applies to our locations. I have carefully selected only those special places where I myself would genuinely want to live. I believe the unique atmosphere and character of the land are an essential part of your stay.",
    ],
    section3Heading: "Essential Comfort, Down to the Last Detail",
    section3Body: [
      "We believe that cleanliness is the most critical element in providing our guests with a comfortable stay. Together with our professional cleaning team, we promise a spotlessly clean space, attended to in every corner.",
      "For our furnishings, we have focused on authentic, long-lasting materials. We have avoided plastic wherever possible, opting instead for the pleasant touch of wood, the rich patina of brass that deepens over time, and the refined look of stainless steel. This reflects our desire to reduce waste and to enrich the time you spend with us.",
      "From kitchenware to amenities, every item has been carefully sourced from around the world, selected only if I would be happy to use it in my own daily life.",
    ],
    section4Heading: "The Best Journeys Begin with the Best Sleep",
    section4Body: [
      "Wonderful travel memories are born from a state of well-being, both in body and mind.",
      "Essential to this is a high-quality night's sleep. To help you recover from your travels and recharge for the day ahead, we have furnished every bedroom with world-renowned Simmons beds. We want you to wake up each morning feeling truly refreshed, ready to embrace all that the day has to offer.",
      "It is our hope that the comfort and care we put into every detail will not only make your stay more enjoyable, but will become a cherished part of your travel memories.",
    ],
  },
  review: {
    heading: "Our Review / Improvement",
    leadText: "Thanks to our customers, our services have been highly evaluated. (as of June 1, 2026)",
    improvementHeading: "Our Commitment to Continuous Improvement",
    improvementIntro: "Our facility is not complete the day it opens. We are constantly improving it by incorporating our guests' feedback.",
    improvements: [
      "Upgraded electrical capacity to prevent circuit breaker trips (March 2026)",
      "Introduced a washer-dryer that finishes drying at the touch of a button (May 2026)",
      "Added ergonomic chairs for guests who work during their stay (May 2026)",
      "Replaced the roller blinds facing the main street with blackout blinds, based on guest reviews (August 2026)",
    ],
    closingText: "We will continue to listen sincerely to every guest and strive to make your stay even better.",
  },
  contact: {
    sectionLabel: "Contact",
    heading: "Get in Touch",
    subheading: "We'd love to hear from you.",
    namePlaceholder: "Your Name",
    emailPlaceholder: "Email Address",
    messagePlaceholder: "Your Message",
    submitBtn: "Send Message",
    successMsg: "Thank you! We'll be in touch soon.",
    errorMsg: "Something went wrong. Please try again.",
  },
  features: {
    heading: "Why yah.homes? - Our features and strengths",
    leadHeadline: "Fukuoka's best whole-house rental for groups and families — highly rated on major OTA sites. Not a single hotel room. Not a shared guesthouse. The entire home is yours.",
    leadBody: "",
    items: [
      "Convenient city-center location — within 20 min from the airport, walkable to Tenjin",
      "5-star hotel-grade Simmons mattresses in every bedroom",
      "Spacious kitchen & living-dining area",
      "Private parking available",
      "Spotless bathrooms, quality amenities & Kyushu traditional crafts",
    ],
  },
  bookingCta: {
    heading: "Ready To Explore Fukuoka?",
    kiyokawa: "Book Kiyokawa on Airbnb",
    takasago: "Book Takasago on Airbnb",
  },
  faq: {
    body: "For the FAQ, please refer to the information on each booking website.",
  },
  footer: {
    address: "Fukuoka, Japan",
    rights: "© 2026 yah.homes. All rights reserved.",
  },
  localsCta: {
    sectionLabel: "Local Guide",
    heading: "Find Out your Fukuoka.",
    body: "Explore the vibrant streets of Kiyokawa — our hand-picked cafes, restaurants, markets, and culture spots, curated just for you.",
    btn: "Find Out",
  },
};

const ko: Translations = {
  nav: {
    home: "홈",
    contact: "문의하기",
    about: "소개",
    properties: "숙소",
    bookNow: "예약하기",
    locals: "로컬",
    guides: "가이드",
    language: "언어",
    langNames: { en: "English", ja: "日本語", ko: "한국어", zh: "繁體中文", th: "ภาษาไทย" },
    menuOpen: "메뉴 열기",
    menuClose: "메뉴 닫기",
  },
  access: {
    title: "교통 정보",
    openInGoogleMaps: "Google 지도에서 보기",
  },
  storySectionLabel: "여기서 경험하세요",
  aboutYahHomes: "yah.homes 소개.",
  checkInFindOut: "체크인하고, 발견하세요.",
  reviewHeading: "리뷰 및 개선 사항",
  comparisonTable: {
    title: "비교표",
    headers: { capacity: "수용 인원", rooms: "객실", facilities: "시설", access: "오시는 길" },
    rows: {
      maxCapacity: "최대 수용 인원",
      bedrooms: "침실",
      doubleBed: "\u00b7 더블 침대",
      singleBed: "\u00b7 싱글 침대",
      bathroom: "욕실",
      showerBooth: "샤워 부스",
      toilet: "화장실",
      privateParking: "전용 주차장",
      theaterRoom: "시어터 룸",
      fromAirport: "공항에서",
      fromStation: "역에서",
      nearestStation: "가장 가까운 역",
      toTenjin: "텐진까지",
      toHakata: "하카타역까지",
    },
    values: {
      available: "이용 가능",
      carMin: "차량 {n}분",
      walkMin: "도보 {n}분",
      watanabeDori: "渡辺通（와타나베도리）",
    },
  },
  hero: {
    catchcopy: ["체크인하고,", "발견하세요."],
    salesPoints: [
      "편리한 시내 위치 — 공항에서 차로 20분 이내, 텐진까지 도보 가능",
      "전 침실 5성급 호텔 수준의 시몬스 고급 매트리스",
      "넓은 주방과 거실·다이닝 공간",
      "전용 주차장 완비",
      "청결한 욕실, 고급 어메니티와 규슈 전통 공예품",
    ],
  },
  properties: {
    sectionLabel: "숙소",
    bedrooms: "침실",
    people: "인원",
    galleryBtn: "갤러리",
    bookingBtn: "Booking.com 평점 보기",
    airbnbBtn: "Airbnb 후기 보기",
    reviewsLabel: "개 리뷰 · Airbnb",
    kiyokawa: { name: "기요카와", info: "침실 {rooms}개 / 최대 {cap}인" },
    takasago: { name: "다카사고", info: "침실 {rooms}개 / 최대 {cap}인" },
    wonderHeadline: "yah. Wonder here",
    wonderBody: [
      "이 도시를, 더 깊이.",
      "관광 명소보다, 삶의 안쪽으로 이어지는 골목을.\n호텔보다, 친구와 웃음을 나누는 시간을.\nyah. homes는 도시 그 자체를 맛보기 위한\n당신만의 베이스캠프입니다.",
      "열쇠를 열고, 신발을 벗고, 몸의 긴장을 풉니다.\n깊은 잠이 오감을 깨우고,\n아침에 발길이 향하는 곳은 가이드북에 없는 골목.",
      "우리는 골목골목을 직접 걸어온 안내자.\n조용한 잠자리를 마련하고, 걷기 위한 힌트를 건넵니다.\n열쇠를 받았다면, 느끼는 대로——더 안쪽으로.",
    ],
    wonderTagline: "yah. homes — Check in, Find out.",
  },
  story: {
    sectionLabel: "Wonder Here",
    heading: "나의 집, 집을 떠난 나의 집.\nyah.homes.",
    body: [
      "yah는 일본어로 '안녕하세요!'를 뜻합니다. yah.homes는 전 세계 여행자를 환영하기 위해 후쿠오카에 자리하고 있습니다. yah.homes는 일본 후쿠오카에서 단독 주택 숙박을 제공합니다 — 디렉터가 직접 설계한 공간으로, 여행지에서도 진정한 '나의 집'처럼 머물 수 있습니다.",
      "각 숙소는 그 동네만의 분위기를 담아 엄선된 장소에 위치합니다. 어디서 잠드느냐가 여행의 질을 결정한다고 믿습니다.",
    ],
  },
  director: {
    sectionHeading: "디렉터 메시지",
    directorName: "Kazuyoshi Yamada",
    directorTitle: "yah.homes Creative Director",
    intro: [
      "yah.homes 웹사이트를 방문해 주셔서 감사합니다.",
      "저는 yah.homes의 디렉터 야마다 카즈요시입니다.",
      "저는 여행을 매우 좋아하며, 많은 나라를 여행해 온 오랜 여행자입니다. 편안하고 여유로운 숙박이 여행 전체의 경험을 크게 바꿀 수 있다고 항상 느껴왔습니다. 그래서 제가 만든 이 공간은 단순한 숙소가 아닙니다. 방문하시는 모든 분들이 진정한 '제2의 집'으로 느끼며 편안함과 평화를 찾을 수 있기를 진심으로 바랍니다.",
    ],
    section2Heading: "제가 사랑에 빠져 살고 싶었던 공간을, 이제 여러분과 나눕니다",
    section2Body: [
      "저는 모든 숙소의 객실을 직접 설계했으며, 때로는 시공에도 직접 참여했습니다. 전체적인 디자인부터 가장 작은 소재 하나까지, 각 방에는 제가 좋아하고 편안하게 느끼는 것들로 가득 채워져 있습니다.",
      "객실이 완성될 때마다 저는 직접 그 방에 머물며 게스트와 똑같이 생활해 봅니다. 모든 방에서 일정 기간 실제로 지내면서, 아침에 눈을 뜨는 순간부터 잠드는 순간까지 게스트의 시각으로 공간을 경험하고, 레이아웃이 실용적인지, 분위기가 진정으로 편안한지 세세하게 확인합니다.",
      "입지 선정에도 같은 원칙을 적용합니다. 제 자신이 진심으로 살고 싶다고 느끼는 특별한 장소만을 엄선했습니다. 그 땅만의 독특한 분위기와 개성이 숙박 경험의 중요한 일부라고 믿기 때문입니다.",
    ],
    section3Heading: "마지막 디테일까지, 진정한 편안함",
    section3Body: [
      "청결함이야말로 게스트에게 편안한 숙박을 제공하는 가장 중요한 요소라고 생각합니다. 전문 청소팀과 함께 구석구석까지 완벽하게 청결한 공간을 약속드립니다.",
      "가구는 진정성 있고 오래 사용할 수 있는 소재에 집중했습니다. 플라스틱은 최대한 배제하고, 나무의 따뜻한 촉감, 시간이 지날수록 깊어지는 황동의 풍미, 스테인리스 스틸의 세련된 외관을 선택했습니다. 이는 낭비를 줄이고 여러분과 함께하는 시간을 더욱 풍요롭게 만들고자 하는 저희의 바람을 담고 있습니다.",
      "주방용품부터 어메니티까지, 모든 아이템은 제가 일상에서 기꺼이 사용할 수 있는 것만을 전 세계에서 엄선했습니다.",
    ],
    section4Heading: "최고의 여행은 최고의 수면에서 시작됩니다",
    section4Body: [
      "아름다운 여행의 추억은 몸과 마음 모두 건강한 상태에서 태어납니다.",
      "그 핵심은 양질의 수면입니다. 여행의 피로를 회복하고 다음 날을 위한 에너지를 충전할 수 있도록, 모든 침실에 세계적으로 유명한 Simmons 침대를 갖추었습니다. 매일 아침 진정으로 상쾌하게 눈을 뜨고, 하루가 선사하는 모든 것을 온전히 받아들일 수 있기를 바랍니다.",
      "저희가 모든 세부 사항에 담은 편안함과 정성이 숙박을 더욱 즐겁게 만들 뿐만 아니라, 소중한 여행의 추억 중 하나가 되기를 진심으로 바랍니다.",
    ],
  },
  review: {
    heading: "리뷰 및 개선 사항",
    leadText: "고객 여러분 덕분에 저희 서비스는 높은 평가를 받고 있습니다. (2026년 6월 1일 기준)",
    improvementHeading: "지속적인 개선을 위한 노력",
    improvementIntro: "저희 시설은 문을 여는 날이 완성이 아닙니다. 게스트 여러분의 소중한 피드백을 반영하며 끊임없이 개선해 나가고 있습니다.",
    improvements: [
      "누전 차단기가 내려가지 않도록 전기 용량 증설 (2026년 3월)",
      "버튼 하나로 건조까지 끝나는 드럼 세탁건조기 도입 (2026년 5월)",
      "숙박 중 업무를 보시는 분들을 위한 인체공학 의자 도입 (2026년 5월)",
      "리뷰를 반영하여 큰길에 면한 롤스크린을 암막 롤스크린으로 교체 (2026년 8월)",
    ],
    closingText: "앞으로도 모든 게스트의 목소리에 진심으로 귀 기울이며, 더 나은 숙박 경험을 위해 최선을 다하겠습니다.",
  },
  contact: {
    sectionLabel: "문의",
    heading: "문의하기",
    subheading: "언제든지 연락주세요.",
    namePlaceholder: "이름",
    emailPlaceholder: "이메일 주소",
    messagePlaceholder: "메시지",
    submitBtn: "메시지 보내기",
    successMsg: "감사합니다! 곧 연락드리겠습니다.",
    errorMsg: "오류가 발생했습니다. 다시 시도해 주세요.",
  },
  features: {
    heading: "Why yah.homes? - 우리의 특징 & 강점",
    leadHeadline: "후쿠오카 최고의 통째 빌라 렌탈 — 주요 OTA에서 높은 평가. 호텔 방 하나가 아닙니다. 공유 게스트하우스도 아닙니다. 집 전체가 여러분만의 것입니다.",
    leadBody: "",
    items: [
      "편리한 시내 위치 — 공항에서 차로 20분 이내, 텐진까지 도보 접근 가능",
      "전 침실 5성급 호텔 수준의 시몬스 고급 매트리스",
      "넓은 주방과 거실·다이닝 공간",
      "전용 주차장 이용 가능",
      "청결한 욕실, 고급 어메니티 & 규슈 전통 공예품",
    ],
  },
  bookingCta: {
    heading: "후쿠오카를 탐험할 준비가 되셨나요?",
    kiyokawa: "Kiyokawa 에어비앤비로 예약",
    takasago: "Takasago 에어비앤비로 예약",
  },
  faq: {
    body: "자주 묻는 질문은 각 예약 사이트의 정보를 참고해 주세요.",
  },
  footer: {
    address: "일본 후쿠오카",
    rights: "© 2026 yah.homes. All rights reserved.",
  },
  localsCta: {
    sectionLabel: "로컬 가이드",
    heading: "Find Out your Fukuoka.",
    body: "후쿠오카 기요카와 동네의 진짜 매력을 발견하세요 — 카페, 레스토랑, 마켓, 문화 스팟을 엄선해 안내합니다.",
    btn: "Find Out",
  },
};

const zh: Translations = {
  nav: {
    home: "首頁",
    contact: "聯絡我們",
    about: "關於我們",
    properties: "房源",
    bookNow: "立即預訂",
    locals: "居民指南",
    guides: "指南",
    language: "語言",
    langNames: { en: "English", ja: "日本語", ko: "한국어", zh: "繁體中文", th: "ภาษาไทย" },
    menuOpen: "開啟選單",
    menuClose: "關閉選單",
  },
  access: {
    title: "交通資訊",
    openInGoogleMaps: "在 Google 地圖上查看",
  },
  storySectionLabel: "探索此處",
  aboutYahHomes: "關於 yah.homes.",
  checkInFindOut: "入住，探索。",
  reviewHeading: "我們的評價/改進",
  comparisonTable: {
    title: "比較表",
    headers: { capacity: "容納人數", rooms: "房間", facilities: "設施", access: "交通" },
    rows: {
      maxCapacity: "最大容納人數",
      bedrooms: "臥室",
      doubleBed: "\u00b7 雙人床",
      singleBed: "\u00b7 單人床",
      bathroom: "浴室",
      showerBooth: "淋浴間",
      toilet: "廁所",
      privateParking: "私人停車位",
      theaterRoom: "影音室",
      fromAirport: "從機場",
      fromStation: "從車站",
      nearestStation: "最近車站",
      toTenjin: "到天神",
      toHakata: "到博多車站",
    },
    values: {
      available: "有",
      carMin: "開車{n}分鐘",
      walkMin: "步行{n}分鐘",
      watanabeDori: "渡辺通",
    },
  },
  hero: {
    catchcopy: ["入住，", "探索。"],
    salesPoints: [
      "市中心便利位置 — 距機場車程20分鐘以內，步行可達天神",
      "全臥室配備五星級飯店等級 Simmons 高級床墊",
      "寬敞廚房與客廳・餐廳空間",
      "附設私人停車場",
      "潔淨衛浴、精選備品與九州傳統工藝品",
    ],
  },
  properties: {
    sectionLabel: "房源",
    bedrooms: "間臥室",
    people: "人",
    galleryBtn: "相冊",
    bookingBtn: "在 Booking.com 查看評分",
    airbnbBtn: "在 Airbnb 查看評價",
    reviewsLabel: "則評價 · Airbnb",
    kiyokawa: { name: "清川", info: "{rooms}間臥室 / 最多{cap}人" },
    takasago: { name: "高砂", info: "{rooms}間臥室 / 最多{cap}人" },
    wonderHeadline: "yah. Wonder here",
    wonderBody: [
      "這座城市，再深入一點。",
      "比起觀光名所，更想走進生活深處的巷弄。\n比起飯店，更珍惜與夥伴談笑的時光。\nyah. homes，是細細品味這座城市的\n專屬包棟基地。",
      "打開門鎖，脫下鞋子，讓身體慢慢放鬆。\n深沉的睡眠喚醒五感，\n清晨，腳步自然走向導覽書上沒有的街角。",
      "我們是走遍大街小巷的在地嚮導。\n為您備妥安靜的床鋪，遞上漫步的線索。\n接過鑰匙，順著感覺——往更深處走。",
    ],
    wonderTagline: "yah. homes — Check in, Find out.",
  },
  story: {
    sectionLabel: "Wonder Here",
    heading: "您的家，離家之外的家。\nyah.homes.",
    body: [
      "yah 在日語中是「你好！」的意思。yah.homes 在日本福岡歡迎來自世界各地的旅客。yah.homes 在日本福岡提供整棟出租住宿 — 由總監親自設計的空間，讓您在旅途中也能感受到真正的「家」。",
      "每處房源都精心挑選於具有獨特街區氛圍的地點。我們相信，您在哪裡入睡，決定了您如何旅行。",
    ],
  },
  director: {
    sectionHeading: "總監的話",
    directorName: "Kazuyoshi Yamada",
    directorTitle: "yah.homes Creative Director",
    intro: [
      "感謝您造訪我們的官方網站。",
      "我是 yah.homes 的總監山田一慶。",
      "我熱愛旅行，是走訪過許多國家的資深旅行者。我一直認為，一次寧靜舒適的住宿體驗，能夠深刻地影響整趟旅程的感受。因此，我所打造的這個空間，不僅僅是一個住宿的地方。衷心希望每一位到訪的旅客，都能在這裡找到真正的「第二個家」，感受到真實的舒適與平靜。",
    ],
    section2Heading: "我愛上並想要居住的空間，現在與您共享",
    section2Body: [
      "我親自設計了每一間客房，有時甚至親身參與施工。從整體設計到最細微的材質選擇，每個房間都充滿了我所喜愛、感到舒適的元素。",
      "每間客房完工後，我都會親自入住，像真正的房客一樣生活。我在每間房間都住了一段時間，從早晨醒來到夜晚入睡，以房客的視角體驗空間，仔細確認每個細節——格局是否實用、氛圍是否真正令人放鬆。",
      "選址也遵循同樣的原則。我只精心挑選那些我自己真心想要居住的特別地方。我相信，土地獨特的氛圍與個性，是住宿體驗不可或缺的一部分。",
    ],
    section3Heading: "極致舒適，細節到位",
    section3Body: [
      "我們認為，清潔是為房客提供舒適住宿最關鍵的要素。我們與專業清潔團隊攜手，承諾為您呈現一塵不染、每個角落都精心打理的空間。",
      "在家具選材上，我們注重真實、耐用的材質。盡可能避免使用塑料，轉而選擇木材的溫潤觸感、隨時間沉澱出深邃光澤的黃銅，以及不鏽鋼的精緻質感。這體現了我們減少浪費、讓您的每一刻都更加豐富的心意。",
      "從廚具到備品，每一件物品都是從世界各地精心挑選，只有我自己在日常生活中也樂於使用的，才會出現在這裡。",
    ],
    section4Heading: "最美好的旅程，從最優質的睡眠開始",
    section4Body: [
      "美好的旅行回憶，源自身心俱佳的狀態。",
      "而優質的睡眠是其中的關鍵。為了幫助您從旅途中恢復體力、為明天蓄積能量，我們在每間臥室都配備了享譽全球的 Simmons 床墊。希望您每天早晨都能神清氣爽地醒來，以最佳狀態迎接新的一天。",
      "我們希望，我們在每個細節中所注入的舒適與用心，不僅能讓您的住宿更加愉快，更能成為您珍貴旅行記憶的一部分。",
    ],
  },
  review: {
    heading: "我們的評價/改進",
    leadText: "感謝所有房客的支持，我們的服務獲得了高度評價。（2026年6月1日時點）",
    improvementHeading: "持續改善的承諾",
    improvementIntro: "我們的設施並非開幕當天就完善。我們不斷將房客的寶貴回饋化為實際改善，持續提升住宿品質。",
    improvements: [
      "增強電力容量，避免斷路器跳閘（2026年3月）",
      "導入一鍵即可完成烘乾的滾筒式洗脫烘衣機（2026年5月）",
      "為入住期間需工作的房客導入人體工學座椅（2026年5月）",
      "依據房客評價，將面向大馬路的捲簾更換為遮光捲簾（2026年8月）",
    ],
    closingText: "我們將持續誠心傾聽每一位房客的聲音，努力為您提供更美好的住宿體驗。",
  },
  contact: {
    sectionLabel: "聯絡",
    heading: "聯絡我們",
    subheading: "歡迎隨時與我們聯繫。",
    namePlaceholder: "您的姓名",
    emailPlaceholder: "電子郵件地址",
    messagePlaceholder: "您的訊息",
    submitBtn: "發送訊息",
    successMsg: "感謝您！我們將盡快與您聯繫。",
    errorMsg: "發生錯誤，請再試一次。",
  },
  features: {
    heading: "Why yah.homes? - 我們的特色與優勢",
    leadHeadline: "福岡最佳整棟別墅租賃 — 在各大OTA平台獲得高度評價。不是單間客房，不是共用民宿。整棟房子完全屬於您。",
    leadBody: "",
    items: [
      "便利的市中心位置，離機場車程20分鐘內，可步行至天神",
      "全室配備五星級飯店標準的Simmons高級床墊",
      "寬敞的廚房與客廳餐廳空間",
      "專屬停車場可使用",
      "潔淨的浴室、優質備品及九州傳統工藝品",
    ],
  },
  bookingCta: {
    heading: "準備探索福岡了嗎？",
    kiyokawa: "在Airbnb預訂Kiyokawa",
    takasago: "在Airbnb預訂Takasago",
  },
  faq: {
    body: "如有常見問題，請參閱各訂房網站上的相關說明。",
  },
  footer: {
    address: "日本福岡",
    rights: "© 2026 yah.homes. All rights reserved.",
  },
  localsCta: {
    sectionLabel: "居民指南",
    heading: "Find Out your Fukuoka.",
    body: "探索福岡清川一帶的魅力街道 — 精選咖啡廳、餐廳、市集與文化景點，專屬為您導覽。",
    btn: "Find Out",
  },
};

const th: Translations = {
  nav: {
    home: "หน้าแรก",
    contact: "ติดต่อเรา",
    about: "เกี่ยวกับเรา",
    properties: "ที่พัก",
    bookNow: "จองเลย",
    locals: "คู่มือท้องถิ่น",
    guides: "คู่มือ",
    language: "ภาษา",
    langNames: { en: "English", ja: "日本語", ko: "한국어", zh: "繁體中文", th: "ภาษาไทย" },
    menuOpen: "เปิดเมนู",
    menuClose: "ปิดเมนู",
  },
  access: {
    title: "การเดินทาง",
    openInGoogleMaps: "เปิดใน Google Maps",
  },
  storySectionLabel: "สัมผัสประสบการณ์ที่นี่",
  aboutYahHomes: "เกี่ยวกับ yah.homes.",
  checkInFindOut: "เช็คอิน ค้นพบ",
  reviewHeading: "ความคิดเห็นและการปรับปรุงของเรา",
  comparisonTable: {
    title: "ตารางเปรียบเทียบ",
    headers: { capacity: "ความจุ", rooms: "ห้องพัก", facilities: "สิ่งอำนวยความสะดวก", access: "การเดินทาง" },
    rows: {
      maxCapacity: "ความจุสูงสุด",
      bedrooms: "ห้องนอน",
      doubleBed: "\u00b7 เตียงคู่",
      singleBed: "\u00b7 เตียงเดี่ยว",
      bathroom: "ห้องน้ำ",
      showerBooth: "ห้องอาบน้ำ",
      toilet: "สุขา",
      privateParking: "ที่จอดรถส่วนตัว",
      theaterRoom: "ห้องโฮมเธียเตอร์",
      fromAirport: "จากสนามบิน",
      fromStation: "จากสถานี",
      nearestStation: "สถานีที่ใกล้ที่สุด",
      toTenjin: "ไปยังเทนจิน",
      toHakata: "ไปยังสถานีฮากาตะ",
    },
    values: {
      available: "มีให้บริการ",
      carMin: "รถยนต์ {n} นาที",
      walkMin: "เดิน {n} นาที",
      watanabeDori: "Watanabe Dori",
    },
  },
  hero: {
    catchcopy: ["เช็คอิน,", "ค้นพบ."],
    salesPoints: [
      "ทำเลใจกลางเมือง — จากสนามบินขับรถ 20 นาที เดินถึงเทนจิน",
      "ที่นอน Simmons ระดับ 5 ดาวในทุกห้องนอน",
      "ครัวและพื้นที่นั่งเล่น-รับประทานอาหารกว้างขวาง",
      "มีที่จอดรถส่วนตัว",
      "ห้องน้ำสะอาด สิ่งอำนวยความสะดวกคุณภาพ และงานหัตถกรรมดั้งเดิมของคิวชู",
    ],
  },
  properties: {
    sectionLabel: "ที่พัก",
    bedrooms: "ห้องนอน",
    people: "คน",
    galleryBtn: "แกลเลอรี่",
    bookingBtn: "ดูคะแนนบน Booking.com",
    airbnbBtn: "ดูรีวิวบน Airbnb",
    reviewsLabel: "รีวิว · Airbnb",
    kiyokawa: { name: "คิโยคาวะ", info: "{rooms} ห้องนอน / สูงสุด {cap} คน" },
    takasago: { name: "ทากาซาโกะ", info: "{rooms} ห้องนอน / สูงสุด {cap} คน" },
    wonderHeadline: "yah. Wonder here",
    wonderBody: [
      "เมืองนี้ — ลึกลงไปอีก",
      "มากกว่าแลนด์มาร์กท่องเที่ยว คือตรอกซอยที่ทอดสู่ชีวิตจริง\nมากกว่าโรงแรม คือช่วงเวลาหัวเราะร่วมกับเพื่อน\nyah. homes คือเบสแคมป์ทั้งหลัง\nสำหรับลิ้มรสเมืองนี้ด้วยตัวคุณเอง",
      "ไขกุญแจ ถอดรองเท้า ปล่อยกายให้ผ่อนคลาย\nการหลับลึกช่วยลับประสาทสัมผัสทั้งห้าให้คมชัด\nยามเช้า เท้าพาคุณไปยังมุมถนนที่ไม่มีในไกด์บุ๊ก",
      "เราคือผู้นำทางที่เดินซอกซอยเหล่านี้มาจนชำนาญ\nจัดเตรียมที่นอนอันเงียบสงบ พร้อมส่งต่อเคล็ดลับสำหรับการเดินเล่น\nรับกุญแจแล้ว ก็ปล่อยไปตามความรู้สึก——ลึกเข้าไปอีก",
    ],
    wonderTagline: "yah. homes — Check in, Find out.",
  },
  story: {
    sectionLabel: "Wonder Here",
    heading: "บ้านของคุณ ห่างจากบ้านของคุณ\nyah.homes.",
    body: [
      "yah แปลว่า สวัสดี! ในภาษาญี่ปุ่น yah.homes ตั้งอยู่ที่ฟุกุโอกะเพื่อต้อนรับนักท่องเที่ยวจากทั่วโลก yah.homes มอบที่พักแบบเช่าทั้งหลังในฟุกุโอกะ ประเทศญี่ปุ่น — พื้นที่ที่ผู้อำนวยการออกแบบด้วยตนเอง เพื่อให้คุณรู้สึกเหมือนอยู่บ้านจริงๆ แม้อยู่ต่างแดน",
      "แต่ละที่พักถูกเลือกสรรจากย่านที่มีเสน่ห์เฉพาะตัว เราเชื่อว่าสถานที่ที่คุณนอนหลับ คือสิ่งที่กำหนดคุณภาพของการเดินทาง",
    ],
  },
  director: {
    sectionHeading: "ข้อความจากผู้อำนวยการ",
    directorName: "Kazuyoshi Yamada",
    directorTitle: "yah.homes Creative Director",
    intro: [
      "ขอบคุณที่เข้าชมเว็บไซต์ของเรา",
      "ผมชื่อ คาซุโยชิ ยามาดะ ผู้อำนวยการของ yah.homes",
      "ผมรักการเดินทางและเป็นนักท่องเที่ยวตัวยงที่ได้ไปเยือนหลายประเทศ ผมรู้สึกเสมอมาว่าการพักผ่อนที่สงบและผ่อนคลายสามารถส่งผลอย่างลึกซึ้งต่อประสบการณ์การเดินทางทั้งหมด นั่นคือเหตุผลที่ที่พักที่ผมสร้างขึ้นมาไม่ใช่แค่สถานที่พักอาศัย ความปรารถนาอันจริงใจของผมคือทุกคนที่มาเยือนจะได้สัมผัสกับ \"บ้านหลังที่สองที่แท้จริง\" ที่เต็มไปด้วยความสะดวกสบายและความสงบ",
    ],
    section2Heading: "พื้นที่ที่ผมหลงรักและอยากอยู่อาศัย บัดนี้แบ่งปันให้คุณแล้ว",
    section2Body: [
      "ผมออกแบบห้องพักทุกห้องด้วยตนเอง บางครั้งถึงกับลงมือก่อสร้างเอง ตั้งแต่การออกแบบโดยรวมไปจนถึงวัสดุที่เล็กที่สุด ทุกห้องเต็มไปด้วยสิ่งที่ผมรักและรู้สึกสบาย",
      "หลังจากห้องแต่ละห้องเสร็จสมบูรณ์ ผมจะพักอยู่ที่นั่นด้วยตนเอง ใช้ชีวิตเหมือนแขกจริงๆ ผมพักในทุกห้องมาระยะหนึ่ง ตั้งแต่ตื่นนอนจนถึงเข้านอน ผมสัมผัสพื้นที่จากมุมมองของแขก ตรวจสอบทุกรายละเอียดอย่างละเอียดถี่ถ้วนเพื่อให้แน่ใจว่าผังห้องใช้งานได้จริงและบรรยากาศผ่อนคลายอย่างแท้จริง",
      "หลักการเดียวกันนี้ใช้กับทำเลที่ตั้งด้วย ผมเลือกเฉพาะสถานที่พิเศษที่ผมเองอยากอาศัยอยู่จริงๆ เท่านั้น ผมเชื่อว่าบรรยากาศและเอกลักษณ์เฉพาะของพื้นที่นั้นเป็นส่วนสำคัญของการพักอาศัย",
    ],
    section3Heading: "ความสะดวกสบายที่จำเป็น ใส่ใจทุกรายละเอียด",
    section3Body: [
      "เราเชื่อว่าความสะอาดคือองค์ประกอบที่สำคัญที่สุดในการมอบการพักที่สะดวกสบายให้แก่แขก ร่วมกับทีมทำความสะอาดมืออาชีพ เราสัญญาว่าจะมอบพื้นที่ที่สะอาดหมดจดทุกมุม",
      "สำหรับเฟอร์นิเจอร์ เราเน้นวัสดุที่แท้จริงและทนทาน หลีกเลี่ยงพลาสติกให้มากที่สุด เลือกใช้ไม้ที่ให้สัมผัสอบอุ่น ทองเหลืองที่มีความงามเพิ่มขึ้นตามกาลเวลา และสแตนเลสที่ดูเรียบหรู สิ่งนี้สะท้อนถึงความต้องการของเราที่จะลดของเสียและทำให้เวลาที่คุณอยู่กับเราเต็มไปด้วยคุณค่า",
      "ตั้งแต่เครื่องครัวไปจนถึงสิ่งอำนวยความสะดวก ทุกชิ้นถูกคัดสรรอย่างพิถีพิถันจากทั่วโลก โดยเลือกเฉพาะสิ่งที่ผมยินดีใช้ในชีวิตประจำวันของตนเองเท่านั้น",
    ],
    section4Heading: "การเดินทางที่ดีที่สุดเริ่มต้นจากการนอนหลับที่ดีที่สุด",
    section4Body: [
      "ความทรงจำการเดินทางที่งดงามเกิดจากสภาวะที่ดีทั้งกายและใจ",
      "สิ่งสำคัญคือการนอนหลับที่มีคุณภาพ เพื่อช่วยให้คุณฟื้นตัวจากการเดินทางและชาร์จพลังสำหรับวันถัดไป เราจัดเตรียมเตียง Simmons ชื่อดังระดับโลกในทุกห้องนอน เราต้องการให้คุณตื่นนอนทุกเช้าด้วยความสดชื่นอย่างแท้จริง พร้อมรับทุกสิ่งที่วันใหม่มอบให้",
      "เราหวังว่าความสะดวกสบายและความใส่ใจที่เราใส่ไว้ในทุกรายละเอียดจะไม่เพียงทำให้การพักของคุณสนุกสนานยิ่งขึ้น แต่จะกลายเป็นส่วนหนึ่งของความทรงจำการเดินทางที่คุณหวงแหน",
    ],
  },
  review: {
    heading: "ความคิดเห็นและการปรับปรุงของเรา",
    leadText: "ขอบคุณลูกค้าทุกท่านที่ทำให้บริการของเราได้รับการประเมินสูง (ณ วันที่ 1 มิถุนายน 2026)",
    improvementHeading: "ความมุ่งมั่นในการพัฒนาอย่างต่อเนื่อง",
    improvementIntro: "สถานที่ของเราไม่ได้สมบูรณ์ในวันเปิดตัว เรานำคำติชมอันมีค่าจากแขกทุกท่านมาปรับปรุงอย่างต่อเนื่อง",
    improvements: [
      "เพิ่มกำลังไฟฟ้าเพื่อป้องกันเบรกเกอร์ตัด (มีนาคม 2026)",
      "ติดตั้งเครื่องซัก-อบผ้าแบบดรัม กดปุ่มเดียวจบถึงขั้นตอนอบแห้ง (พฤษภาคม 2026)",
      "เพิ่มเก้าอี้เพื่อสุขภาพสำหรับแขกที่ทำงานระหว่างเข้าพัก (พฤษภาคม 2026)",
      "เปลี่ยนม่านม้วนด้านที่ติดถนนใหญ่เป็นม่านกันแสง ตามความเห็นของแขก (สิงหาคม 2026)",
    ],
    closingText: "เราจะยังคงเอาใจใส่ฟังเสียงของแขกทุกคนอย่างจริงใจ และมุ่งมั่นที่จะมอบประสบการณ์การพักที่ดียิ่งขึ้นให้คุณ",
  },
  contact: {
    sectionLabel: "ติดต่อ",
    heading: "ติดต่อเรา",
    subheading: "ยินดีรับฟังจากคุณเสมอ",
    namePlaceholder: "ชื่อของคุณ",
    emailPlaceholder: "อีเมล",
    messagePlaceholder: "ข้อความของคุณ",
    submitBtn: "ส่งข้อความ",
    successMsg: "ขอบคุณ! เราจะติดต่อกลับเร็วๆ นี้",
    errorMsg: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  },
  features: {
    heading: "Why yah.homes? - คุณสมบัติและจุดเด่นของเรา",
    leadHeadline: "วิล่าเช่าทั้งหลังที่ดีที่สุดในฟุกุโอกะ — ได้รับการประเมินสูงบน OTA ชั้นนำ ไม่ใช่ห้องพักโรงแรม ไม่ใช่เกสต์เฮาส์ร่วม บ้านทั้งหลังเป็นของคุณ",
    leadBody: "",
    items: [
      "ทำเลใจกลางเมือง — จากสนามบินเพียง 20 นาที เดินไปเทนจินได้",
      "ทุกห้องนอนมีที่นอน Simmons ระดับ 5 ดาว",
      "ครัวและห้องนั่งเล่นขนาดใหญ่",
      "มีที่จอดรถส่วนตัว",
      "ห้องน้ำสะอาด อุปกรณ์คุณภาพสูง & งานหัตถกรรมดั้งเดิมของคิวชู",
    ],
  },
  bookingCta: {
    heading: "พร้อมสำรวจฟุกุโอกะแล้วหรือยัง?",
    kiyokawa: "จอง Kiyokawa ผ่าน Airbnb",
    takasago: "จอง Takasago ผ่าน Airbnb",
  },
  faq: {
    body: "สำหรับคำถามที่พบบ่อย กรุณาดูข้อมูลบนเว็บไซต์จองแต่ละแห่ง",
  },
  footer: {
    address: "ฟุกุโอกะ ประเทศญี่ปุ่น",
    rights: "© 2026 yah.homes. All rights reserved.",
  },
  localsCta: {
    sectionLabel: "Local Guide",
    heading: "Find Out your Fukuoka.",
    body: "สำรวจเสน่ห์ของย่าน Kiyokawa ฟุกุโอกะ — คาเฟ่ ร้านอาหาร ตลาด และสถานที่ทางวัฒนธรรม คัดสรรเพื่อคุณโดยเฉพาะ",
    btn: "Find Out",
  },
};

const ja: Translations = {
  nav: {
    home: "ホーム",
    contact: "お問い合わせ",
    about: "yah.homesについて",
    properties: "施設",
    bookNow: "予約する",
    locals: "ローカル",
    guides: "ガイド",
    language: "言語",
    langNames: { en: "English", ja: "日本語", ko: "한국어", zh: "繁體中文", th: "ภาษาไทย" },
    menuOpen: "メニューを開く",
    menuClose: "メニューを閉じる",
  },
  access: {
    title: "アクセス",
    openInGoogleMaps: "Google マップで開く",
  },
  storySectionLabel: "Wonder Here",
  aboutYahHomes: "yah.homes について",
  checkInFindOut: "Check in, Find out.",
  reviewHeading: "レビューと継続的な改善への取り組み",
  comparisonTable: {
    title: "比較表",
    headers: { capacity: "定員", rooms: "客室", facilities: "設備", access: "アクセス" },
    rows: {
      maxCapacity: "最大宿泊人数",
      bedrooms: "寝室",
      doubleBed: "· ダブルベッド",
      singleBed: "· シングルベッド",
      bathroom: "バスルーム",
      showerBooth: "シャワーブース",
      toilet: "トイレ",
      privateParking: "専用駐車場",
      theaterRoom: "シアタールーム",
      fromAirport: "空港から",
      fromStation: "駅から",
      nearestStation: "最寄り駅",
      toTenjin: "天神まで",
      toHakata: "博多駅まで",
    },
    values: {
      available: "あり",
      carMin: "車で{n}分",
      walkMin: "徒歩{n}分",
      watanabeDori: "渡辺通",
    },
  },
  hero: {
    // ブランドキャッチは英語ロゴタイプのまま（ブランドガイドライン準拠）
    catchcopy: ["Check In,", "Find Out."],
    salesPoints: [
      "空港から車で20分以内・天神へも徒歩圏の好立地",
      "全寝室に5つ星ホテル級のシモンズ製プレミアムマットレス",
      "広々としたキッチンとリビングダイニング",
      "専用駐車場あり",
      "清潔なバスルーム、上質なアメニティ。九州の伝統工芸品を配置。",
    ],
  },
  properties: {
    sectionLabel: "物件",
    bedrooms: "寝室",
    people: "名",
    galleryBtn: "ギャラリー",
    bookingBtn: "Booking.com の評価を見る",
    airbnbBtn: "Airbnb のレビューを見る",
    reviewsLabel: "件のレビュー · Airbnb",
    kiyokawa: { name: "清川", info: "寝室{rooms}室 / 最大{cap}名" },
    takasago: { name: "高砂", info: "寝室{rooms}室 / 最大{cap}名" },
    wonderHeadline: "yah. Wonder here",
    // ブランドガイドライン「yah. homes Statement (Jpn)」逐語
    wonderBody: [
      "この街を、もっと深く。",
      "観光名所より、暮らしの奥へ続く路地。\nホテルより、仲間と笑いあえるひととき。\nyah. homes は、街そのものを味わうためのベースキャンプ。",
      "鍵を開け、靴を脱ぎ、体をほどく。\n深い眠りが五感を研ぎ澄まし、\n朝、足が向かうのはガイドにない街角。",
      "私たちは路地を歩き込んだ案内人。\n静かな寝床を整え、歩くためのヒントをお渡しします。\n鍵を受け取ったら、感じるままに――奥へ、奥へ。",
    ],
    wonderTagline: "yah. homes — 街ごと、まるごと。",
  },
  story: {
    sectionLabel: "Wonder Here",
    heading: "Your Home, Away from Home.\nyah.homes.",
    body: [
      "yah は「やあ！」——日本語の気さくな挨拶から生まれた名前です。yah.homes は、世界中から福岡を訪れる旅人を迎えるための一棟貸しの宿です。ディレクターが自ら設計した空間で、旅先でも「本当の我が家」のようにくつろいでいただけます。",
      "物件はどれも、街の個性で選んだ場所にあります。宿の質も、旅のかたちを決める大きな要因である、と信じているからです。",
    ],
  },
  director: {
    sectionHeading: "ディレクターメッセージ",
    directorName: "Kazuyoshi Yamada",
    directorTitle: "yah.homes Creative Director",
    intro: [
      "yah.homes のウェブサイトをご覧いただき、ありがとうございます。",
      "yah.homes ディレクターの山田一慶です。",
      "私は多くの国を旅してきた、無類の旅好きです。心からくつろげる滞在が、旅全体の体験を大きく変える——そのことをいつも感じてきました。だからこそ、私がつくったこの空間は、ただ泊まるための場所ではありません。訪れるすべての方にとって、本当の意味での「第二の家」となり、心からの安らぎを見つけていただけることを願っています。",
    ],
    section2Heading: "私が惚れ込み、住みたいと思った空間を、あなたへ",
    section2Body: [
      "すべての客室を自ら設計し、時には施工にも自分の手で参加しました。全体のデザインから最も小さな素材のひとつまで、それぞれの部屋は、私が愛するもの、心地よいと感じるもので満たされています。",
      "部屋が完成するたびに、私は必ずそこに泊まり、ゲストと同じように暮らしてみます。すべての部屋で一定期間を過ごしました。朝目覚めてから眠りにつくまで、ゲストの目線で空間を体験し、間取りは実用的か、雰囲気は本当にくつろげるか、細部まで確かめています。",
      "立地についても同じ原則です。私自身が心から住みたいと思える特別な場所だけを選びました。その土地ならではの空気や個性は、滞在の大切な一部だと信じています。",
    ],
    section3Heading: "本質的な心地よさを、細部まで",
    section3Body: [
      "清潔さこそ、快適な滞在をお届けするための最も重要な要素だと考えています。プロの清掃チームとともに、隅々まで手入れの行き届いた空間をお約束します。",
      "家具や内装には、本物の、長く使える素材を選びました。プラスチックをできる限り避け、木の心地よい手ざわり、時とともに深まる真鍮の艶、ステンレスの端正な佇まいを大切にしています。無駄を減らし、ここで過ごす時間を豊かにしたい——その思いの表れです。",
      "キッチン用品からアメニティまで、すべての品は世界中から吟味し、私自身が日々の暮らしで喜んで使えるものだけを選んでいます。",
    ],
    section4Heading: "最高の旅は、最高の眠りから",
    section4Body: [
      "素晴らしい旅の思い出は、心身ともに満たされた状態から生まれます。",
      "その核心にあるのが、質の高い眠りです。旅の疲れを癒やし、明日への力を蓄えていただけるよう、すべての寝室に世界的に名高いシモンズ製ベッドを備えました。毎朝すっきりと目覚め、その日のすべてを存分に味わっていただきたいのです。",
      "細部に込めた心地よさと心配りが、滞在を楽しくするだけでなく、大切な旅の記憶のひとつになれば幸いです。",
    ],
  },
  review: {
    heading: "レビューと継続的な改善への取り組み",
    leadText: "お客様のおかげで、高い評価をいただいています。（2026年6月1日時点）",
    improvementHeading: "継続的な改善への取り組み",
    improvementIntro: "私たちの宿は、オープンした日が完成形ではありません。ゲストの皆さまの声を反映し、日々改善を続けています。",
    improvements: [
      "ブレーカーが落ちないよう電気容量を増強（2026年3月）",
      "ボタン一つで乾燥まで完了するドラム式洗濯乾燥機を導入（2026年5月）",
      "滞在中に仕事をされる方のためのエルゴノミクスチェアを導入（2026年5月）",
      "レビューを反映して、大通りに面したロールスクリーンを遮光ロールスクリーンに変更（2026年8月）",
    ],
    closingText: "これからも一人ひとりの声に誠実に耳を傾け、より良い滞在をお届けできるよう努めてまいります。",
  },
  contact: {
    sectionLabel: "Contact",
    heading: "お問い合わせ",
    subheading: "お気軽にご連絡ください。",
    namePlaceholder: "お名前",
    emailPlaceholder: "メールアドレス",
    messagePlaceholder: "メッセージ",
    submitBtn: "送信する",
    successMsg: "ありがとうございます。追ってご連絡いたします。",
    errorMsg: "送信に失敗しました。もう一度お試しください。",
  },
  features: {
    heading: "Why yah.homes? — 私たちの特徴と強み",
    leadHeadline:
      "グループ・家族旅行のための、福岡の一棟貸しの宿 — 主要予約サイトで高評価を取得。ホテルの一室でも、シェアするゲストハウスでもなく、家一棟がまるごとあなたのものです。",
    leadBody: "",
    items: [
      "空港から車で20分以内・天神へも徒歩圏の好立地",
      "全寝室に5つ星ホテル級のシモンズ製プレミアムマットレス",
      "広々としたキッチンとリビングダイニング",
      "専用駐車場あり",
      "清潔なバスルーム、上質なアメニティ。九州の伝統工芸品を配置。",
    ],
  },
  bookingCta: {
    heading: "Ready To Explore Fukuoka?",
    kiyokawa: "清川を Airbnb で予約",
    takasago: "高砂を Airbnb で予約",
  },
  faq: {
    body: "よくあるご質問は、各予約サイトの情報もあわせてご確認ください。",
  },
  footer: {
    address: "日本・福岡",
    rights: "© 2026 yah.homes. All rights reserved.",
  },
  localsCta: {
    sectionLabel: "ローカルガイド",
    heading: "Find Out your Fukuoka.",
    body: "清川界隈の路地へ——カフェ、食堂、市場、文化スポット。私たちが実際に歩いて選んだ場所だけをご案内します。",
    btn: "Find Out",
  },
};

export const translations: Record<Lang, Translations> = { en, ja, ko, zh, th };

// langPaths: the home URL for each language
export const langPaths: Record<Lang, string> = {
  en: "/home",
  ja: "/ja/home",
  ko: "/ko/home",
  zh: "/zh/home",
  th: "/th/home",
};

// pathToLang: detect language from URL path prefix
export function detectLangFromPath(pathname: string): Lang {
  if (pathname.startsWith("/ja/")) return "ja";
  if (pathname.startsWith("/ko/")) return "ko";
  if (pathname.startsWith("/zh/")) return "zh";
  if (pathname.startsWith("/th/")) return "th";
  return "en";
}

// Legacy map kept for backward compatibility
export const pathToLang: Record<string, Lang> = {
  "/home": "en",
  "/about": "en",
  "/locals": "en",
  "/properties/kiyokawa": "en",
  "/ko/home": "ko",
  "/ko/about": "ko",
  "/ko/locals": "ko",
  "/ko/properties/kiyokawa": "ko",
  "/zh/home": "zh",
  "/zh/about": "zh",
  "/zh/locals": "zh",
  "/zh/properties/kiyokawa": "zh",
  "/th/home": "th",
  "/th/about": "th",
  "/th/locals": "th",
  "/th/properties/kiyokawa": "th",
  "/": "en",
};
