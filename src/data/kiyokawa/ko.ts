// kiyokawa の ko 版。言語ごとに分けているのは、1ファイル1,800行だと
// 1言語だけ直したつもりが他言語に波及し、差分も目視できないため（計画書 §7-2）。
// 数値（時刻・定員・評価）は持たない。{ci}/{co}/{cap} は SSoT から差し込む。
import type { KiyokawaTranslations } from "./_schema";

export const ko: KiyokawaTranslations = {

  hero: {
    propertyName: "yah.homes kiyokawa",
    tagline: "활기찬 기요카와 지구에 새로 지어진 단독 주택.",
    area: "기요카와, 추오구, 후쿠오카",
    capacity: "최대 {cap}인 · 침실 3개",
    bookNow: "지금 예약",
  },
  overview: {
    title: "숙소 개요",
    bedrooms: "침실 3개",
    beds: "더블 침대 3개 + 싱글 침대 1개",
    maxGuests: "최대 {cap}인",
    area: "기요카와 · 후쿠오카 중앙구",
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
          { icon: "hairdryer", label: "헤어드라이어" },
          { icon: "shampoo", label: "샴푸" },
          { icon: "conditioner", label: "컨디셔너" },
          { icon: "soap", label: "바디워시" },
          { icon: "bidet", label: "비데" },
          { icon: "hot-water", label: "온수" },
          { icon: "shower", label: "샤워젤" },
        ],
      },
      {
        name: "침실 & 세탁",
        items: [
          { icon: "washer", label: "드럼식 세탁건조기" },
          { icon: "hanger", label: "옷걸이" },
          { icon: "bedding", label: "침구류" },
          { icon: "blackout", label: "암막 커튼" },
          { icon: "drying-rack", label: "건조대" },
          { icon: "storage", label: "의류 수납 공간" },
        ],
      },
      {
        name: "엔터테인먼트",
        items: [
          { icon: "tv", label: "TV" },
          { icon: "audio", label: "음향 시스템" },
        ],
      },
      {
        name: "냉난방",
        items: [
          { icon: "ac", label: "에어컨" },
          { icon: "fan", label: "실링팬" },
          { icon: "heat", label: "난방" },
        ],
      },
      {
        name: "안전",
        items: [
          { icon: "camera", label: "방범 카메라 설치", note: "여관업법에 따라 실외·공용·출입구에 카메라가 설치되어 있습니다. 개인정보는 보호됩니다." },
          { icon: "smoke-alarm", label: "화재 감지기" },
          { icon: "fire-ext", label: "소화기" },
          { icon: "co-alarm", label: "일산화탄소 감지기", unavailable: true, note: "이 숙소에는 일산화탄소 감지기가 없을 수 있습니다. 자세한 내용은 호스트에게 문의하세요." },
        ],
      },
      {
        name: "인터넷 & 업무",
        items: [
          { icon: "wifi", label: "Wi-Fi" },
          { icon: "desk", label: "전용 업무 공간" },
        ],
      },
      {
        name: "주방 & 식사",
        items: [
          { icon: "kitchen", label: "풀 키친" },
          { icon: "cooking", label: "취사 가능" },
          { icon: "fridge", label: "냉장고" },
          { icon: "microwave", label: "전자레인지" },
          { icon: "cookware", label: "기본 조리도구", note: "냄비, 프라이팬, 기름, 소금·후추" },
          { icon: "tableware", label: "식기 & 수저류", note: "그릇, 젓가락, 접시, 컵 등" },
          { icon: "freezer", label: "냉동고" },
          { icon: "dishwasher", label: "식기세척기" },
          { icon: "stove", label: "가스레인지" },
          { icon: "oven", label: "오븐" },
          { icon: "kettle", label: "전기 주전자" },
          { icon: "wine", label: "와인 글라스" },
          { icon: "rice", label: "밥솥" },
          { icon: "dining", label: "다이닝 테이블" },
        ],
      },
      {
        name: "위치 특징",
        items: [
          { icon: "private-entry", label: "전용 입구" },
          { icon: "laundromat", label: "근처 코인세탁소" },
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
          { icon: "long-stay", label: "장기 투숙 가능", note: "28박 이상 가능" },
          { icon: "self-checkin", label: "셀프 체크인", note: "키 보관함" },
        ],
      },
    ],
  },
  review: {
    count: "후기 {n}개",
    superhostLabel: "슈퍼호스트",
    airbnbLabel: "Airbnb에서 보기",
  },
  propertyDescription: {
    title: "숙소 소개",
    showMore: "더 보기",
    showLess: "접기",
    intro: "후쿠오카 기요카와, 나카가와 강변에 자리한 은밀한 신축 빌라(단독 주택)입니다. 텐진과 하카타에 쉽게 접근할 수 있는 도심에 위치하면서도 강변의 여유로운 시간을 즐기실 수 있습니다.\n\n텐진까지 차로 8분. 하카타역까지 차로 10분. 공항에서 차로 18분. 완전 무인 체크인으로 프라이빗한 숙박이 가능합니다.\n\n최대 {cap}명까지 숙박 가능하며 가족이나 그룹 여행에 최적입니다.",
    highlights: [
      {
        title: "1. 최고의 수면 경험 (SIMMONS 프리미엄 매트리스)",
        body: "3개의 침실 모두에 고급 호텔에서 사용하는 SIMMONS 프리미엄 매트리스를 갖추고 있습니다. 모든 침대 옆에 콘센트가 있어 편안한 수면을 보장합니다.",
      },
      {
        title: "2. 압도적인 홈 엔터테인먼트",
        body: "55인치 대형 TV와 일본제 고품질 앰프, 플로어형 스피커를 설치했습니다. 영화관 수준의 음향으로 영화와 동영상을 즐기세요. (각종 스트리밍 서비스는 본인 계정으로 로그인하여 이용하세요)",
      },
      {
        title: "3. '살듯이 여행하는' 충실한 설비",
        body: "대형 냉장고와 풍부한 조리도구를 갖춘 넓은 풀 키친 완비. 현지 신선 식재료로 요리를 즐기실 수 있습니다. 전용 업무 데스크(1인용)와 고속 Wi-Fi도 갖추고 있어 워케이션에도 최적입니다. 2026년 5월에는 건조 기능이 있는 최신 드럼식 세탁기를 도입했습니다.\n\n전용 주차장(1대)도 무료로 이용 가능합니다.\n\n[오너 공지]\n2026년 4월: 세탁기를 드럼식 세탁건조기로 교체. 버튼 하나로 세탁부터 건조까지 완료됩니다.",
      },
    ],
    bedroomGuide: {
      title: "침실 안내",
      items: [
        "침실 1: 싱글 침대 1개",
        "침실 2: 더블 침대 2개",
        "침실 3: 더블 침대 1개",
        "(3개 침실에서 최대 {cap}명 숙박 가능)",
      ],
    },
    facilityGuide: {
      title: "시설 안내",
      items: [
        "전용 주차장 (1대)",
        "욕실 (1실)",
        "화장실 (2실: 1층과 2층)",
        "세면대",
        "주방 (3구 가스레인지)",
        "거실",
        "다이닝룸",
      ],
    },
    equipment: {
      title: "설비 & 가전",
      items: [
        "55인치 TV",
        "일본제 고품질 앰프 & 플로어형 스피커",
        "드럼식 세탁건조기",
        "냉장고 (냉동실 포함)",
        "전자레인지",
        "밥솥 (5홉)",
        "전기 주전자",
        "기본 조리도구 (냄비·프라이팬·도마·칼)",
        "식기류",
        "헤어드라이어",
      ],
    },
    amenitiesDetail: {
      title: "어메니티",
      items: [
        "슬리퍼",
        "목욕 타올 / 페이스 타올",
        "칫솔 세트",
        "샴푸 / 컨디셔너 / 바디워시",
        "옷걸이 / 세탁용 옷걸이",
        "세탁 세제",
      ],
    },
    guestAccess: {
      title: "게스트 이용 범위",
      body: "건물 전체 대여이므로 다른 게스트와 공간을 공유하지 않습니다. 모든 구역을 자유롭게 이용하실 수 있습니다.",
    },
    otherNotes: {
      title: "기타 주의사항",
      items: [
        "객실을 깨끗하게 이용해 주세요. 심한 오염이나 방치된 쓰레기가 있을 경우 추가 청소비를 청구할 수 있습니다.",
        "실내 비품의 분실이나 파손이 있을 경우 실비를 청구합니다.",
        "예약 시 신고한 인원을 초과하여 숙박하실 경우 초과 1인당 ¥5,000의 추가 요금이 부과됩니다.",
        "쓰레기는 안내에 따라 반드시 분리수거해 주세요.",
        "반려동물 동반은 금지입니다 (안내견·보조견은 사전 연락 필수).",
        "숙박 요금과 별도로 후쿠오카시 규정에 따른 숙박세가 부과됩니다.",
      ],
    },
    registration: {
      title: "등록 정보",
      body: "여관업법 허가 번호 | 후쿠오카시 보건소 | 福中保環第713001号",
    },
  },
  amenities: {
    title: "편의시설",
    items: [
      "완비된 주방 (3구 가스레인지)",
      "드럼식 세탁건조기 (세탁~건조 한 번에)",
      "고속 Wi-Fi",
      "전용 주차장 (1대, 무료)",
      "전 침실 Simmons 프리미엄 매트리스",
      "55인치 스마트 TV + 일본제 고품질 오디오",
      "전 객실 에어컨",
      "업무용 데스크 (1인)",
      "넓은 거실 & 다이닝 공간",
      "헤어드라이어, 슬리퍼, 수건 & 세면용품",
      "밥솥, 전자레인지 & 기본 조리도구",
    ],
  },
  access: {
    title: "교통 안내",
    items: [
      { from: "후쿠오카 공항", time: "차로 약 18분" },
      { from: "하카타역", time: "차로 약 10분 / 지하철 약 20분" },
      { from: "텐진", time: "차로 약 8분 / 도보 가능" },
      { from: "캐널시티 하카타", time: "차로 약 15분" },
      { from: "다자이후", time: "차로 약 30분" },
    ],
  },
  checkin: {
    title: "체크인 안내",
    time: "체크인: {ci}부터 (시간 제한 없음)",
    checkout: "체크아웃: {co}까지",
    method: "보안 잠금장치로 완전 비대면 셀프 체크인. 도착 전날에 액세스 코드를 보내드립니다.",
    idVerification: "체크인 전 신분증 확인 필요 (여권 또는 정부 발급 신분증).",
  },
  conditions: {
    title: "예약 조건",
    cancellation: "취소 정책: 체크인 {d}일 전까지 무료. 정확한 기한(일본 시간)은 예약 시 표시됩니다.",
    cleaningFee: "청소비: 요금에 포함",
    extraGuest: "추가 인원 요금: 5명까지 동일 요금・6명째부터 1인당 ¥5,000/박",
    noiseRule: "심야 소음에 주의해 주세요.",
    petRule: "반려동물 동반 불가 (사전 연락 시 안내견 가능).",
    smokingRule: "실내 흡연 금지. 지정 야외 흡연 구역 있음.",
  },
  booking: {
    title: "직접 예약하고 절약하세요",
    subtitle: "플랫폼 수수료 없이 최저가로 직접 예약하세요.",
    comingSoon: "온라인 예약 시스템 준비 중입니다. 예약은 문의해 주세요.",
  },
  faq: {
    title: "자주 묻는 질문",
    items: [
      { q: "주차 가능한가요?", a: "네, 무료 전용 주차 공간 1대가 포함되어 있습니다." },
      { q: "어린 자녀가 있는 가족에게 적합한가요?", a: "네, 가족 단위로 인기가 많습니다. 다만 아기 침대 등 유아용품은 준비되어 있지 않으니 직접 지참해 주세요. 실내에 계단이 있어 어린아이는 주의가 필요합니다." },
      { q: "체크인 절차는 어떻게 되나요?", a: "보안 잠금장치로 완전 비대면 셀프 체크인. 도착 전날에 액세스 코드를 받으시게 됩니다." },
      { q: "얼리 체크인 또는 레이트 체크아웃이 가능한가요?", a: "가용성에 따라 가능합니다. 사전에 문의해 주세요." },
      { q: "반려동물 동반이 가능한가요?", a: "죄송합니다. 반려동물은 허용되지 않습니다. 안내견은 사전 연락 후 가능합니다." },
      { q: "흡연이 가능한가요?", a: "실내 흡연은 금지되어 있습니다. 지정된 야외 흡연 공간이 있습니다." },
      { q: "취소 정책은 어떻게 되나요?", a: "공식 사이트 예약은 체크인 {d}일 전까지 무료로 취소하실 수 있습니다. 기한이 지난 경우와 무단 미투숙의 경우에는 숙박 요금 전액을 청구합니다. 정확한 기한(일본 시간)은 결제 전 화면과 확정 메일에 표시되며, 취소는 My Page에서 직접 하실 수 있습니다. 날짜·인원·객실 변경을 원하시면 취소 후 다시 예약해 주세요(무료 기간 내라면 추가 부담은 없습니다). Airbnb·Booking.com 예약은 각 서비스의 정책이 적용됩니다." },
      { q: "이동이 불편한 분도 이용 가능한가요?", a: "숙소 내부 계단이 가파릅니다. 휠체어 접근이나 배리어프리 구조가 아닙니다. 계단 이용에 불편함이 없는 분께 권장합니다." },
      { q: "결제는 어떻게 하나요?", a: "신용카드만 이용 가능하며, 예약 시 전액 결제됩니다(결제 대행: Stripe). 카드 정보는 당사가 보관하지 않으며, 현장에서 지불하실 금액은 없습니다." },
    ],
    bookButton: "지금 예약",
  },
  houseRules: {
    title: "하우스 룰",
    items: [
      { icon: "no-smoking", rule: "실내 흡연 금지. 지정된 실외 흡연 구역 이용 가능." },
      { icon: "no-pets", rule: "반려동물 금지. 안내견은 사전 연락 후 가능." },
      { icon: "quiet", rule: "조용 시간: 오후 10시 – 오전 8시. 이웃에 배려해 주세요." },
      { icon: "checkin-time", rule: "체크인: {ci}부터 (시간 제한 없음). 체크아웃: {co}까지." },
      { icon: "guests", rule: "미등록 숫소 금지. 최대 수용 인원을 준수해 주세요." },
      { icon: "trash", rule: "현지 쌓레기 분리 규정을 따라주세요. 빈이 제공됩니다." },
      { icon: "shoes", rule: "현관에서 신발을 보관해 주세요 (일본 관습)." },
      { icon: "stairs", rule: "내부 계단이 가파릅니다. 이동에 불편함이 있는 분에게는 적합하지 않습니다." },
    ],
  },
  floorPlan: {
    title: "평면도",
    subtitle: "3층 단독 주택 · 1F: 욕실 & 차고 · 2F: 거실/식당/주방 · 3F: 침실 3개 & 발코니",
    imageAlt: "청카와 평면도 – 1F 욕실 & 차고, 2F 거실/식당/주방, 3F 침실 & 발코니",
  },
  contact: {
    title: "질문이 있으신가요?",
    subtitle: "숙박에 관한 문의사항은 언제든지 연락해 주세요.",
  },
  ui: {
    overviewLabels: {
      bedrooms: "침실",
      beds: "침대",
      maxGuests: "최대 인원",
      area: "지역",
    },
    contactUsToBook: "예약 문의하기",
    successMessage: "✓ 메시지가 전송되었습니다! 곧 연락드리겠습니다.",
    namePlaceholder: "이름",
    emailPlaceholder: "이메일",
    messagePlaceholder: "메시지",
    privacyLabel: "개인정보 처리방침에 동의합니다",
    privacyLink: "개인정보 처리방침",
    sendButton: "메시지 보내기",
    sendingButton: "전송 중…",
    errorToast: "전송에 실패했습니다. 다시 시도해 주세요.",
  },
  nav: {
    backToHome: "홈으로 돌아가기",
    language: "언어",
    langNames: { en: "영어", ko: "한국어", zh: "중국어", th: "태국어" },
  },
};
