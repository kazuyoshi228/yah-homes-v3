// takasago の ko 版。言語ごとに分けているのは、1ファイル1,800行だと
// 1言語だけ直したつもりが他言語に波及し、差分も目視できないため（計画書 §7-2）。
// 数値（時刻・定員・評価）は持たない。{ci}/{co}/{cap} は SSoT から差し込む。
import type { TakasagoTranslations } from "./_schema";

export const ko: TakasagoTranslations = {

  hero: {
    propertyName: "yah.homes takasago",
    tagline: "후쿠오카 다카사고 지구 중심에 위치한 세련된 단독 주택.",
    area: "다카사고, 추오구, 후쿠오카",
    capacity: "최대 {cap}인 · 침실 {rooms}개",
    bookNow: "지금 예약",
  },
  overview: {
    title: "숙소 개요",
    bedrooms: "침실 {rooms}개",
    beds: "더블 침대 1개 + 싱글 침대 4개",
    maxGuests: "6인 (최대)",
    area: "다카사고 · 추오구, 후쿠오카",
  },
  amenityCategories: {
    title: "이 숙소에서 제공하는 것",
    showAll: "모든 편의시설 보기",
    showLess: "접기",
    categories: [
      {
        name: "욕실",
        items: [
          { icon: "bath", label: "욕조" },
          { icon: "shower", label: "샤워 부스 (독립형)" },
          { icon: "hairdryer", label: "헤어드라이어" },
          { icon: "shampoo", label: "샴푸" },
          { icon: "conditioner", label: "컨디셔너" },
          { icon: "soap", label: "바디워시" },
          { icon: "bidet", label: "비데 (워시렛)" },
          { icon: "hot-water", label: "온수" },
        ],
      },
      {
        name: "침실 & 세탁",
        items: [
          { icon: "washer", label: "세탁기" },
          { icon: "hanger", label: "옷걸이" },
          { icon: "bedding", label: "침구류" },
          { icon: "blackout", label: "암막 커튼" },
          { icon: "drying-rack", label: "빨래 건조대" },
          { icon: "storage", label: "의류 수납공간" },
        ],
      },
      {
        name: "엔터테인먼트",
        items: [
          { icon: "tv", label: "TV" },
        ],
      },
      {
        name: "냉난방",
        items: [
          { icon: "ac", label: "에어컨" },
          { icon: "fan", label: "천장 선풍기" },
          { icon: "heat", label: "난방" },
        ],
      },
      {
        name: "안전",
        items: [
          { icon: "camera", label: "보안 카메라", note: "카메라는 여관업법에 따라 외부/공용/출입구 구역에 설치되어 있습니다. 개인 공간의 프라이버시는 완전히 보호됩니다." },
          { icon: "smoke-alarm", label: "화재 경보기" },
          { icon: "fire-ext", label: "소화기" },
          { icon: "co-alarm", label: "일산화탄소 경보기", unavailable: true, note: "이 숙소에는 일산화탄소 감지기가 없을 수 있습니다. 자세한 내용은 호스트에게 문의하세요." },
        ],
      },
      {
        name: "인터넷 & 업무",
        items: [
          { icon: "wifi", label: "Wi-Fi" },
        ],
      },
      {
        name: "주방 & 식사",
        items: [
          { icon: "kitchen", label: "완비된 주방" },
          { icon: "cooking", label: "게스트용 조리 공간" },
          { icon: "fridge", label: "냉장고" },
          { icon: "microwave", label: "전자레인지" },
          { icon: "cookware", label: "기본 조리도구", note: "냄비, 프라이팬, 오일, 소금 & 후추" },
          { icon: "tableware", label: "식기 & 수저", note: "그릇, 젓가락, 접시, 컵 등" },
          { icon: "freezer", label: "냉동실" },

          { icon: "oven", label: "오븐" },
          { icon: "kettle", label: "전기 주전자" },
          { icon: "wine", label: "와인 잔" },
          { icon: "rice", label: "밥솥" },
          { icon: "dining", label: "다다미 좌식 식탁" },
        ],
      },
      {
        name: "위치 특징",
        items: [
          { icon: "private-entry", label: "개인 출입구" },
          { icon: "laundromat", label: "근처 세탁소" },
        ],
      },
      {
        name: "주차 & 시설",
        items: [
          { icon: "parking", label: "무료 전용 주차장" },
        ],
      },
      {
        name: "서비스",
        items: [
          { icon: "long-stay", label: "장기 숙박 가능", note: "28박 이상 숙박 가능" },
          { icon: "self-checkin", label: "셀프 체크인", note: "키 잠금 박스" },
        ],
      },
    ],
  },
  amenities: {
    title: "편의시설",
    items: [
      "완비된 주방",
      "세탁기",
      "고속 Wi-Fi",
      "전용 주차장 (1대, 무료)",
      "모든 침실 프리미엄 매트리스",
      "대형 스마트 TV",
      "전 객실 에어컨",
      "넓은 거실 & 식당",
      "헤어드라이어, 슬리퍼, 수건 & 세면도구",
      "밥솥, 전자레인지 & 기본 조리도구",
    ],
  },
  access: {
    title: "교통",
    items: [
      { from: "후쿠오카 공항", time: "차로 약 20분" },
      { from: "하카타역", time: "차로 약 10분 / 지하철로 약 15분" },
      { from: "텐진", time: "차로 약 5분 / 도보 가능" },
      { from: "캐널시티 하카타", time: "차로 약 10분" },
      { from: "다자이후", time: "차로 약 30분" },
    ],
  },
  checkin: {
    title: "체크인 정보",
    time: "체크인: {ci}부터 (시간 제한 없음)",
    checkout: "체크아웃: {co} 이전",
    method: "보안 잠금장치를 통한 완전 비대면 셀프 체크인. 입실 전날에 접근 코드를 보내드립니다.",
    idVerification: "체크인 전 신분증 확인 필요 (여권 또는 정부 발급 신분증).",
  },
  conditions: {
    title: "예약 조건",
    cancellation: "취소 정책: 체크인 {d}일 전까지 무료. 정확한 기한(일본 시간)은 예약 시 표시됩니다.",
    cleaningFee: "청소비: 요금에 포함",
    extraGuest: "추가 게스트 요금: 5명까지 동일 요금・6명째부터 1인당 ¥5,000/박",
    noiseRule: "야간 정숙 시간이 있습니다. 이웃을 배려해 주세요.",
    petRule: "반려동물 불가 (사전 통보 시 안내견 허용).",
    smokingRule: "실내 금연. 지정된 야외 흡연 구역 이용 가능.",
  },
  booking: {
    title: "직접 예약하고 절약하세요",
    subtitle: "최저 요금으로 직접 예약하세요 — 플랫폼 수수료 없음.",
    comingSoon: "온라인 예약 시스템 준비 중입니다. 예약을 위해 문의해 주세요.",
  },
  faq: {
    title: "자주 묻는 질문",
    items: [
      { q: "주차 가능한가요?", a: "네, 무료 전용 주차 공간 1대가 포함되어 있습니다." },
      { q: "어린 자녀가 있는 가족에게 적합한가요?", a: "네, 가족 단위로 인기가 많습니다. 다만 아기 침대 등 유아용품은 준비되어 있지 않으니 직접 지참해 주세요. 실내에 계단이 있어 어린아이는 주의가 필요합니다." },
      { q: "체크인 절차는 어떻게 되나요?", a: "보안 잠금장치를 통한 완전 비대면 셀프 체크인입니다. 도착 전날에 접근 코드를 받으시게 됩니다." },
      { q: "조기 체크인 또는 늦은 체크아웃이 가능한가요?", a: "객실 상황에 따라 다릅니다. 사전에 문의해 주세요." },
      { q: "반려동물을 데려올 수 있나요?", a: "죄송하지만 반려동물은 허용되지 않습니다. 사전 통보 시 안내견은 환영합니다." },
      { q: "흡연이 가능한가요?", a: "실내 금연입니다. 지정된 야외 흡연 구역이 있습니다." },
      { q: "취소 정책은 어떻게 되나요?", a: "공식 사이트 예약은 체크인 {d}일 전까지 무료로 취소하실 수 있습니다. 기한이 지난 경우와 무단 미투숙의 경우에는 숙박 요금 전액을 청구합니다. 정확한 기한(일본 시간)은 결제 전 화면과 확정 메일에 표시되며, 취소는 My Page에서 직접 하실 수 있습니다. 날짜·인원·객실 변경을 원하시면 취소 후 다시 예약해 주세요(무료 기간 내라면 추가 부담은 없습니다). Airbnb·Booking.com 예약은 각 서비스의 정책이 적용됩니다." },
      { q: "거동이 불편한 게스트도 이용 가능한가요?", a: "숙소 내 계단이 가파릅니다. 휠체어 접근이나 배리어 프리 시설은 없습니다. 계단 이용이 편한 게스트에게 권장합니다." },
      { q: "결제는 어떻게 하나요?", a: "신용카드만 이용 가능하며, 예약 시 전액 결제됩니다(결제 대행: Stripe). 카드 정보는 당사가 보관하지 않으며, 현장에서 지불하실 금액은 없습니다." },
    ],
    bookButton: "지금 예약",
  },
  review: {
    count: "{n}개의 리뷰",
    superhostLabel: "슈퍼호스트",
    airbnbLabel: "Airbnb에서 보기",
  },
  propertyDescription: {
    title: "이 숙소에 대하여",
    showMore: "더 보기",
    showLess: "접기",
    intro: "후쿠오카 추오구 활기찬 다카사고 지구에 위치한 세련된 단독 주택 렌탈입니다. 텐진에서 도보 거리에 위치하여 후쿠오카 중심부의 편리함과 개인 주택의 편안함을 동시에 누릴 수 있습니다.\n\n텐진까지 차로 5분. 하카타역까지 차로 10분. 공항에서 차로 20분. 완전 비대면 셀프 체크인으로 완전한 프라이버시를 보장합니다.\n\n최대 {cap}인의 가족 및 그룹에 적합합니다. 넓은 거실, 시어터 룸, 디자이너 가구가 특별한 경험을 선사합니다.",
    highlights: [
      {
        title: "1. 프리미엄 수면 경험",
        body: "모든 침실에 프리미엄 매트리스가 구비되어 있어 완전한 휴식을 취할 수 있습니다. 모든 침대 옆에 콘센트가 있어 기기를 충전할 수 있습니다.",
      },
      {
        title: "2. 시어터 룸 경험",
        body: "대형 스크린 TV를 갖춘 전용 시어터 룸을 즐기세요. 그룹과 함께하는 영화의 밤에 완벽합니다.",
      },
      {
        title: "3. 현지인처럼 생활하기 — 완비된 시설",
        body: "대형 냉장고와 풍부한 조리도구를 갖춘 넓은 주방에서 신선한 현지 재료로 요리할 수 있습니다. 고속 Wi-Fi로 워케이션에도 이상적입니다.\n\n무료 전용 주차장(1대)이 포함되어 있습니다.\n\n[호스트 공지]\n욕조 외에 별도의 샤워 부스가 있어 그룹 이용 시 더욱 편리합니다.",
      },
    ],
    bedroomGuide: {
      title: "침실 안내",
      items: [
        "침실 1: 더블 침대 1개",
        "침실 2: 싱글 침대 2개",
        "침실 3: 싱글 침대 2개",
        "(침실 {rooms}개, 최대 {cap}인)",
      ],
    },
    facilityGuide: {
      title: "시설",
      items: [
        "전용 주차장 (1대)",
        "욕실 (1개, 욕조 포함)",
        "샤워 부스 (1개, 독립형)",
        "화장실 (2개: 1층 및 2층)",
        "세면대",
        "주방",
        "거실",
        "식당",
        "시어터 룸",
      ],
    },
    equipment: {
      title: "가전 & 장비",
      items: [
        "대형 TV",
        "세탁기",
        "냉장고 (냉동실 포함)",
        "전자레인지",
        "밥솥",
        "전기 주전자",
        "기본 조리도구 (냄비, 프라이팬, 도마, 칼)",
        "식기류",
        "헤어드라이어",
      ],
    },
    amenitiesDetail: {
      title: "어메니티",
      items: [
        "슬리퍼",
        "목욕 수건 / 세면 수건",
        "칫솔 세트",
        "샴푸 / 컨디셔너 / 바디워시",
        "옷걸이 / 빨래 건조대",
        "세탁 세제",
      ],
    },
    guestAccess: {
      title: "게스트 이용 공간",
      body: "이 숙소는 전체 임대입니다 — 다른 게스트와 공간을 공유하지 않습니다. 모든 공간을 자유롭게 이용할 수 있습니다.",
    },
    otherNotes: {
      title: "기타 안내",
      items: [
        "숙소를 청결하게 유지해 주세요. 과도한 오염이나 쓰레기 방치 시 추가 청소비가 부과될 수 있습니다.",
        "분실 또는 파손된 물품은 실비로 청구됩니다.",
        "신고 인원 초과 시 초과 인원 1인당 ¥5,000의 추가 요금이 부과됩니다.",
        "제공된 안내에 따라 쓰레기를 분리수거해 주세요.",
        "반려동물은 허용되지 않습니다 (사전 통보 시 안내견 허용).",
        "숙박 요금 외에 후쿠오카시 숙박세가 부과됩니다.",
      ],
    },
    registration: {
      title: "등록 정보",
      body: "여관업법 허가 번호 | 후쿠오카시 보건소 | Fuku-Chu-Hoken-Dai 713001",
    },
  },
  houseRules: {
    title: "숙소 규칙",
    items: [
      { icon: "no-smoking", rule: "실내 금연. 지정된 야외 흡연 구역 이용 가능." },
      { icon: "no-pets", rule: "반려동물 불가. 사전 통보 시 안내견 환영." },
      { icon: "quiet", rule: "정숙 시간: 오후 10시 – 오전 8시. 이웃을 배려해 주세요." },
      { icon: "checkin-time", rule: "체크인: {ci}부터 (시간 제한 없음). 체크아웃: {co} 이전." },
      { icon: "guests", rule: "미등록 게스트 불가. 최대 수용 인원을 준수해 주세요." },
      { icon: "trash", rule: "현지 쓰레기 분리수거 규칙을 따라 주세요. 쓰레기통이 제공됩니다." },
      { icon: "shoes", rule: "입구에서 신발을 벗어 주세요 (일본 관습)." },
      { icon: "stairs", rule: "내부 계단이 가파릅니다. 거동이 불편한 게스트에게는 적합하지 않습니다." },
    ],
  },
  floorPlan: {
    title: "평면도",
    subtitle: "3층 단독 주택 · 1층: 현관 & 차고 · 2층: 거실/식당/주방, 시어터 룸, 욕실 & 샤워 부스 · 3층: 침실 {rooms}개 & 발코니",
    imageAlt: "다카사고 평면도 – 1층 현관 & 차고, 2층 거실 식당 주방, 시어터 룸, 욕실 & 샤워 부스, 3층 침실 & 발코니",
  },
  contact: {
    title: "질문이 있으신가요?",
    subtitle: "저희 팀이 숙박 관련 모든 문의를 도와드립니다.",
  },
  ui: {
    overviewLabels: {
      bedrooms: "침실",
      beds: "침대",
      maxGuests: "최대 인원",
      area: "위치",
    },
    contactUsToBook: "예약 문의하기",
    successMessage: "✓ 메시지가 전송되었습니다! 곧 연락드리겠습니다.",
    namePlaceholder: "이름",
    emailPlaceholder: "이메일",
    messagePlaceholder: "메시지",
    privacyLabel: "에 동의합니다",
    privacyLink: "개인정보 처리방침",
    sendButton: "메시지 보내기",
    sendingButton: "전송 중…",
    errorToast: "전송 실패. 다시 시도해 주세요.",
  },
  nav: {
    backToHome: "홈으로 돌아가기",
    language: "언어",
    langNames: { en: "영어", ko: "한국어", zh: "중국어", th: "태국어" },
  },
};
