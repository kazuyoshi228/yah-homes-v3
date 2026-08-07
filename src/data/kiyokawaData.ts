// =============================================================
// yah.homes — Kiyokawa Property Data
// Direct booking page: /properties/kiyokawa
// Languages: en, ja, ko, zh, th
// =============================================================

export type Lang = "en" | "ja" | "ko" | "zh" | "th";

export interface KiyokawaTranslations {
  // Hero
  hero: {
    propertyName: string;
    tagline: string;
    area: string;
    capacity: string;
    bookNow: string;
  };
  // Property overview
  overview: {
    title: string;
    bedrooms: string;
    beds: string;
    maxGuests: string;
    area: string;
  };
  // Amenities (legacy simple list — kept for fallback)
  amenities: {
    title: string;
    items: string[];
  };
  // Amenities (AirBnB-style categorised)
  amenityCategories: {
    title: string;
    showAll: string;
    showLess: string;
    categories: {
      name: string;
      items: { icon: string; label: string; note?: string; unavailable?: boolean }[];
    }[];
  };
  // Airbnb review badge
  review: {
    rating: string;
    count: string;
    superhostLabel: string;
    airbnbLabel: string;
  };
  // Property description (collapsible)
  propertyDescription: {
    title: string;
    showMore: string;
    showLess: string;
    intro: string;
    highlights: { title: string; body: string }[];
    bedroomGuide: { title: string; items: string[] };
    facilityGuide: { title: string; items: string[] };
    equipment: { title: string; items: string[] };
    amenitiesDetail: { title: string; items: string[] };
    guestAccess: { title: string; body: string };
    otherNotes: { title: string; items: string[] };
    registration: { title: string; body: string };
  };
  // Access
  access: {
    title: string;
    items: { from: string; time: string }[];
  };
  // Check-in
  checkin: {
    title: string;
    time: string;
    checkout: string;
    method: string;
    idVerification: string;
  };
  // Booking conditions
  conditions: {
    title: string;
    cancellation: string;
    cleaningFee: string;
    extraGuest: string;
    noiseRule: string;
    petRule: string;
    smokingRule: string;
  };
  // Booking section
  booking: {
    title: string;
    subtitle: string;
    comingSoon: string;
  };
  // House Rules
  houseRules: {
    title: string;
    items: { icon: string; rule: string }[];
  };
  // Floor Plan
  floorPlan: {
    title: string;
    subtitle: string;
    imageAlt: string;
  };
  // FAQ
  faq: {
    title: string;
    items: { q: string; a: string }[];
    bookButton: string;
  };
  // Contact
  contact: {
    title: string;
    subtitle: string;
  };
  // UI labels (form, overview cards, etc.)
  ui: {
    overviewLabels: {
      bedrooms: string;
      beds: string;
      maxGuests: string;
      area: string;
    };
    contactUsToBook: string;
    successMessage: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    messagePlaceholder: string;
    privacyLabel: string;
    privacyLink: string;
    sendButton: string;
    sendingButton: string;
    errorToast: string;
  };
  // Navigation
  nav: {
    backToHome: string;
    language: string;
    langNames: { en: string; ko: string; zh: string; th: string };
  };
}

export const kiyokawaData: Record<Lang, KiyokawaTranslations> = {
  en: {
    hero: {
      propertyName: "yah. Kiyokawa",
      tagline: "Newly built single family home in the vibrant Kiyokawa district.",
      area: "Kiyokawa, Chuo-ku, Fukuoka",
      capacity: "Up to 7 guests · 3 Bedrooms",
      bookNow: "Book Now",
    },
    overview: {
      title: "Property Overview",
      bedrooms: "3 Bedrooms",
      beds: "3 Double Beds + 1 Single Bed",
      maxGuests: "7 guests (max)",
      area: "Kiyokawa · Chuo-ku, Fukuoka",
    },
    amenityCategories: {
      title: "What this place offers",
      showAll: "Show all amenities",
      showLess: "Show less",
      categories: [
        {
          name: "Bathroom",
          items: [
            { icon: "bath", label: "Bathtub" },
            { icon: "hairdryer", label: "Hair dryer" },
            { icon: "shampoo", label: "Shampoo" },
            { icon: "conditioner", label: "Conditioner" },
            { icon: "soap", label: "Body wash" },
            { icon: "bidet", label: "Bidet (washlet)" },
            { icon: "hot-water", label: "Hot water" },
            { icon: "shower", label: "Shower gel" },
          ],
        },
        {
          name: "Bedroom & Laundry",
          items: [
            { icon: "washer", label: "Drum-type washer-dryer" },
            { icon: "hanger", label: "Hangers" },
            { icon: "bedding", label: "Bed linens" },
            { icon: "blackout", label: "Blackout curtains" },
            { icon: "drying-rack", label: "Clothes drying rack" },
            { icon: "storage", label: "Clothing storage" },
          ],
        },
        {
          name: "Entertainment",
          items: [
            { icon: "tv", label: "TV" },
            { icon: "audio", label: "Sound system" },
          ],
        },
        {
          name: "Heating & Cooling",
          items: [
            { icon: "ac", label: "Air conditioning" },
            { icon: "fan", label: "Ceiling fan" },
            { icon: "heat", label: "Heating" },
          ],
        },
        {
          name: "Home Safety",
          items: [
            { icon: "camera", label: "Security cameras on property", note: "Cameras are installed at outdoor/shared/entry areas as required by the Ryokan Business Act. Your privacy is fully protected." },
            { icon: "smoke-alarm", label: "Smoke alarm" },
            { icon: "fire-ext", label: "Fire extinguisher" },
            { icon: "co-alarm", label: "Carbon monoxide alarm", unavailable: true, note: "This listing may not have a carbon monoxide detector. Please contact the host for details." },
          ],
        },
        {
          name: "Internet & Office",
          items: [
            { icon: "wifi", label: "Wi-Fi" },
            { icon: "desk", label: "Dedicated workspace" },
          ],
        },
        {
          name: "Kitchen & Dining",
          items: [
            { icon: "kitchen", label: "Full kitchen" },
            { icon: "cooking", label: "Cooking space for guests" },
            { icon: "fridge", label: "Refrigerator" },
            { icon: "microwave", label: "Microwave" },
            { icon: "cookware", label: "Basic cookware", note: "Pots, pans, oil, salt & pepper" },
            { icon: "tableware", label: "Tableware & cutlery", note: "Bowls, chopsticks, plates, cups, etc." },
            { icon: "freezer", label: "Freezer" },
            { icon: "dishwasher", label: "Dishwasher" },
            { icon: "stove", label: "Stove" },
            { icon: "oven", label: "Oven" },
            { icon: "kettle", label: "Electric kettle" },
            { icon: "wine", label: "Wine glasses" },
            { icon: "rice", label: "Rice cooker" },
            { icon: "dining", label: "Dining table" },
          ],
        },
        {
          name: "Location Features",
          items: [
            { icon: "private-entry", label: "Private entrance" },
            { icon: "laundromat", label: "Laundromat nearby" },
          ],
        },
        {
          name: "Parking & Facilities",
          items: [
            { icon: "parking", label: "Free on-site parking" },
          ],
        },
        {
          name: "Services",
          items: [
            { icon: "long-stay", label: "Long-term stays allowed", note: "Stays of 28 nights or more available" },
            { icon: "self-checkin", label: "Self check-in", note: "Key lockbox" },
          ],
        },
      ],
    },
    amenities: {
      title: "Amenities",
      items: [
        "Fully equipped kitchen (3-burner gas stove)",
        "Drum-type washer & dryer (wash-to-dry in one cycle)",
        "High-speed Wi-Fi",
        "Private parking (1 car, free)",
        "Simmons premium mattresses in all bedrooms",
        "55-inch Smart TV + high-quality Japanese audio system",
        "Air conditioning in all rooms",
        "Work desk (1 person)",
        "Spacious living & dining area",
        "Hair dryer, slippers, towels & toiletries",
        "Rice cooker, microwave & basic cookware",
      ],
    },
    access: {
      title: "Access",
      items: [
        { from: "Fukuoka Airport", time: "~18 min by car" },
        { from: "Hakata Station", time: "~10 min by car / ~20 min by subway" },
        { from: "Tenjin", time: "~8 min by car / walkable" },
        { from: "Canal City Hakata", time: "~15 min by car" },
        { from: "Dazaifu", time: "~30 min by car" },
      ],
    },
    checkin: {
      title: "Check-in Information",
      time: "Check-in: 4:00 PM – 11:00 PM",
      checkout: "Check-out: by 10:00 AM",
      method: "Fully contactless self check-in via security lock. Access code will be sent 24 hours before arrival.",
      idVerification: "ID verification required before check-in (passport or government-issued ID).",
    },
    conditions: {
      title: "Booking Conditions",
      cancellation: "Cancellation: Please contact us for details.",
      cleaningFee: "Cleaning fee: Included in the rate",
      extraGuest: "Rate covers up to 5 guests; ¥5,000 per additional guest per night",
      noiseRule: "Quiet hours apply. Please be considerate of neighbours.",
      petRule: "No pets allowed (service animals with prior notice excepted).",
      smokingRule: "No smoking indoors. Designated outdoor area available.",
    },
    booking: {
      title: "Book Direct & Save",
      subtitle: "Reserve directly with us for the best rate — no platform fees.",
      comingSoon: "Online booking system coming soon. Please contact us to reserve.",
    },
    faq: {
      title: "Frequently Asked Questions",
      items: [
        {
          q: "Is parking available?",
          a: "Yes, one private parking space is included free of charge.",
        },
        {
          q: "Is the property suitable for families with young children?",
          a: "Yes, families are very welcome. Please note we do not provide baby equipment such as cribs or high chairs — please bring your own. The house also has indoor stairs, so keep an eye on little ones.",
        },
        {
          q: "What is the check-in process?",
          a: "Fully contactless self check-in via security lock. You'll receive the access code 24 hours before arrival. No need to meet anyone.",
        },
        {
          q: "Is early check-in or late check-out available?",
          a: "Subject to availability. Please contact us in advance.",
        },
        {
          q: "Are pets allowed?",
          a: "Unfortunately, pets are not permitted. Service animals are welcome with prior notice.",
        },
        {
          q: "Is smoking allowed?",
          a: "No smoking inside the property. A designated outdoor area is available.",
        },
        {
          q: "What is the cancellation policy?",
          a: "Please contact us for details.",
        },
        {
          q: "Is the property accessible for guests with mobility limitations?",
          a: "Please note that the staircase inside the property is steep. The home is not wheelchair accessible or barrier-free. We recommend this property for guests who are comfortable using stairs.",
        },
        {
          q: "How do I pay?",
          a: "We accept bank transfer and credit card. Please contact us directly to confirm payment details when making a reservation.",
        },
      ],
      bookButton: "Book Now",
    },
    review: {
      rating: "4.77",
      count: "47 reviews",
      superhostLabel: "Superhost",
      airbnbLabel: "View on Airbnb",
    },
    propertyDescription: {
      title: "About This Space",
      showMore: "Show more",
      showLess: "Show less",
      intro: "A brand-new hidden-gem villa (entire house) nestled along the Nakagawa River in Kiyokawa, Fukuoka. Enjoy the tranquil riverside atmosphere while staying in the heart of the city with easy access to Tenjin and Hakata.\n\n8 min by car to Tenjin. 10 min by car to Hakata Station. 18 min by car from the airport. Fully contactless self check-in for a completely private stay.\n\nPerfect for families and groups of up to 7 guests. Spacious living area and designer furniture create a truly special experience.",
      highlights: [
        {
          title: "1. Premium Sleep Experience (SIMMONS Mattresses)",
          body: "All three bedrooms feature SIMMONS premium mattresses — the same brand used in luxury hotels. Every bedside has a power outlet to ensure a fully restorative night's sleep.",
        },
        {
          title: "2. Cinematic Home Entertainment",
          body: "Enjoy a 55-inch large-screen TV paired with a high-quality Japanese-made amplifier and floor-standing speakers. Experience movies and streaming content with cinema-grade audio. (Please log in with your own streaming service account.)",
        },
        {
          title: "3. Live Like a Local — Fully Equipped",
          body: "A spacious full kitchen with a large refrigerator and ample cookware lets you cook with fresh local ingredients. A dedicated work desk (for 1) and high-speed Wi-Fi make it ideal for workcation stays. In May 2026, a new drum-type washer-dryer was installed — wash and dry with a single button press, perfect for long stays.\n\nFree private parking (1 space) is included, making it a great base for driving tours.\n\n[Owner's Notice]\nApril 2026: Washing machine upgraded to a drum-type washer-dryer. One button completes the full wash-to-dry cycle.",
        },
      ],
      bedroomGuide: {
        title: "Bedroom Guide",
        items: [
          "Bedroom 1: 1 single bed",
          "Bedroom 2: 2 double beds",
          "Bedroom 3: 1 double bed",
          "(Up to 7 guests across 3 bedrooms)",
        ],
      },
      facilityGuide: {
        title: "Facilities",
        items: [
          "Private parking (1 space)",
          "Bathroom (1)",
          "Toilet (2: 1F and 2F)",
          "Washbasin",
          "Kitchen (3-burner gas stove)",
          "Living room",
          "Dining room",
        ],
      },
      equipment: {
        title: "Appliances & Equipment",
        items: [
          "55-inch TV",
          "High-quality Japanese-made amplifier & floor-standing speakers",
          "Drum-type washer-dryer",
          "Refrigerator (with freezer)",
          "Microwave",
          "Rice cooker (5-cup)",
          "Electric kettle",
          "Basic cookware (pots, pans, cutting board, knives)",
          "Tableware",
          "Hair dryer",
        ],
      },
      amenitiesDetail: {
        title: "Amenities",
        items: [
          "Slippers",
          "Bath towels / face towels",
          "Toothbrush set",
          "Shampoo / conditioner / body wash",
          "Hangers / laundry hangers",
          "Laundry detergent",
        ],
      },
      guestAccess: {
        title: "Guest Access",
        body: "This is an entire property rental — you will not share any space with other guests. All areas are freely available for your use.",
      },
      otherNotes: {
        title: "Other Notes",
        items: [
          "Please keep the property clean. Additional cleaning fees may apply for excessive mess or left rubbish.",
          "Lost or damaged items will be charged at replacement cost.",
          "Exceeding the declared number of guests will incur a surcharge of ¥5,000 per extra person.",
          "Please sort rubbish according to the bin guide provided.",
          "Pets are not allowed (guide dogs permitted with prior notice).",
          "A city accommodation tax (set by Fukuoka City) applies in addition to the room rate.",
        ],
      },
      registration: {
        title: "Registration",
        body: "Ryokan Business Act Permit No. | Fukuoka City Health Department | Fuku-Chu-Hoken-Dai 713001",
      },
    },
    houseRules: {
      title: "House Rules",
      items: [
        { icon: "no-smoking", rule: "No smoking indoors. Designated outdoor area available." },
        { icon: "no-pets", rule: "No pets allowed. Service animals welcome with prior notice." },
        { icon: "quiet", rule: "Quiet hours: 10 PM – 8 AM. Please be considerate of neighbours." },
        { icon: "checkin-time", rule: "Check-in: 4:00 PM – 10:00 PM. Check-out: by 11:00 AM." },
        { icon: "guests", rule: "No unregistered guests. Maximum occupancy must be observed." },
        { icon: "trash", rule: "Please follow local garbage sorting rules. Bins are provided." },
        { icon: "shoes", rule: "Please remove shoes at the entrance (Japanese custom)." },
        { icon: "stairs", rule: "Steep staircase inside. Not suitable for guests with mobility limitations." },
      ],
    },
    floorPlan: {
      title: "Floor Plan",
      subtitle: "3-storey single-family home · 1F: Bathroom & Garage · 2F: Living/Dining/Kitchen · 3F: 3 Bedrooms & Balcony",
      imageAlt: "Kiyokawa floor plan – 1F bathroom & garage, 2F living dining kitchen, 3F bedrooms & balcony",
    },
    contact: {
      title: "Have a Question?",
      subtitle: "Our team is happy to help with any inquiries about your stay.",
    },
    ui: {
      overviewLabels: {
        bedrooms: "Bedrooms",
        beds: "Beds",
        maxGuests: "Max Guests",
        area: "Area",
      },
      contactUsToBook: "Contact Us to Book",
      successMessage: "✓ Message sent! We'll get back to you shortly.",
      namePlaceholder: "Name",
      emailPlaceholder: "Email",
      messagePlaceholder: "Message",
      privacyLabel: "I agree to the",
      privacyLink: "privacy policy",
      sendButton: "Send Message",
      sendingButton: "Sending…",
      errorToast: "Failed to send. Please try again.",
    },
    nav: {
      backToHome: "Back to Home",
      language: "Language",
      langNames: { en: "English", ko: "Korean", zh: "Chinese", th: "Thai" },
    },
  },

  ja: {
    hero: {
      propertyName: "yah. 清川",
      tagline: "那珂川のほとり、清川の街に佇む新築一棟貸しの宿。",
      area: "福岡市中央区清川",
      capacity: "最大7名様 · 寝室3室",
      bookNow: "予約する",
    },
    overview: {
      title: "物件概要",
      bedrooms: "寝室3室",
      beds: "ダブルベッド3台 + シングルベッド1台",
      maxGuests: "最大7名様",
      area: "福岡市中央区清川",
    },
    amenityCategories: {
      title: "この宿の設備・アメニティ",
      showAll: "すべての設備を表示",
      showLess: "閉じる",
      categories: [
        {
          name: "バスルーム",
          items: [
            { icon: "bath", label: "浴槽" },
            { icon: "hairdryer", label: "ドライヤー" },
            { icon: "shampoo", label: "シャンプー" },
            { icon: "conditioner", label: "コンディショナー" },
            { icon: "soap", label: "ボディソープ" },
            { icon: "bidet", label: "温水洗浄便座" },
            { icon: "hot-water", label: "給湯" },
            { icon: "shower", label: "シャワージェル" },
          ],
        },
        {
          name: "寝室・ランドリー",
          items: [
            { icon: "washer", label: "ドラム式洗濯乾燥機" },
            { icon: "hanger", label: "ハンガー" },
            { icon: "bedding", label: "ベッドリネン" },
            { icon: "blackout", label: "遮光カーテン" },
            { icon: "drying-rack", label: "室内物干し" },
            { icon: "storage", label: "衣類収納" },
          ],
        },
        {
          name: "エンターテインメント",
          items: [
            { icon: "tv", label: "テレビ" },
            { icon: "audio", label: "オーディオシステム" },
          ],
        },
        {
          name: "冷暖房",
          items: [
            { icon: "ac", label: "エアコン" },
            { icon: "fan", label: "シーリングファン" },
            { icon: "heat", label: "暖房" },
          ],
        },
        {
          name: "安全設備",
          items: [
            { icon: "camera", label: "敷地内防犯カメラ", note: "旅館業法の定めにより、屋外・共用部・出入口に防犯カメラを設置しています。客室内への設置はなく、プライバシーは守られます。" },
            { icon: "smoke-alarm", label: "煙感知器" },
            { icon: "fire-ext", label: "消火器" },
            { icon: "co-alarm", label: "一酸化炭素警報器", unavailable: true, note: "本施設には一酸化炭素警報器の設置がない場合があります。詳細はホストまでお問い合わせください。" },
          ],
        },
        {
          name: "インターネット・ワークスペース",
          items: [
            { icon: "wifi", label: "Wi-Fi" },
            { icon: "desk", label: "専用ワークスペース" },
          ],
        },
        {
          name: "キッチン・ダイニング",
          items: [
            { icon: "kitchen", label: "フルキッチン" },
            { icon: "cooking", label: "自炊可能" },
            { icon: "fridge", label: "冷蔵庫" },
            { icon: "microwave", label: "電子レンジ" },
            { icon: "cookware", label: "基本の調理器具", note: "鍋・フライパン・油・塩こしょう" },
            { icon: "tableware", label: "食器・カトラリー", note: "茶碗・箸・皿・グラスなど" },
            { icon: "freezer", label: "冷凍庫" },
            { icon: "dishwasher", label: "食器洗い乾燥機" },
            { icon: "stove", label: "ガスコンロ" },
            { icon: "oven", label: "オーブン" },
            { icon: "kettle", label: "電気ケトル" },
            { icon: "wine", label: "ワイングラス" },
            { icon: "rice", label: "炊飯器" },
            { icon: "dining", label: "ダイニングテーブル" },
          ],
        },
        {
          name: "ロケーション",
          items: [
            { icon: "private-entry", label: "専用玄関" },
            { icon: "laundromat", label: "近隣にコインランドリー" },
          ],
        },
        {
          name: "駐車場・施設",
          items: [
            { icon: "parking", label: "無料駐車場（敷地内1台）", note: "コンパクト〜スタンダードサイズまで駐車可能。大型車は近隣のコインパーキング（1泊約800円〜）をご利用ください。" },
          ],
        },
        {
          name: "サービス",
          items: [
            { icon: "long-stay", label: "長期滞在可", note: "28泊以上のご滞在も承ります" },
            { icon: "self-checkin", label: "セルフチェックイン", note: "キーボックス" },
          ],
        },
      ],
    },
    amenities: {
      title: "設備・アメニティ",
      items: [
        "フルキッチン（3口ガスコンロ）",
        "ドラム式洗濯乾燥機（洗濯から乾燥までおまかせ）",
        "高速Wi-Fi",
        "専用駐車場（1台・無料）",
        "全寝室にシモンズ（SIMMONS）製プレミアムマットレス",
        "55インチスマートTV + 日本製の高品質オーディオ",
        "全室エアコン完備",
        "ワークデスク（1名用）",
        "ゆったりとしたリビング・ダイニング",
        "ドライヤー・スリッパ・タオル・洗面用品",
        "炊飯器・電子レンジ・基本の調理器具",
      ],
    },
    access: {
      title: "アクセス",
      items: [
        { from: "福岡空港", time: "車で約18分" },
        { from: "博多駅", time: "車で約10分 / 地下鉄で約20分" },
        { from: "天神", time: "車で約8分" },
        { from: "渡辺通駅（1番出口）", time: "徒歩10〜15分" },
        { from: "キャナルシティ博多", time: "車で約15分" },
        { from: "太宰府", time: "車で約30分" },
      ],
    },
    checkin: {
      title: "チェックインのご案内",
      time: "チェックイン: 16:00〜23:00",
      checkout: "チェックアウト: 10:00まで",
      method: "セキュリティロックによる完全非対面のセルフチェックインです。ご到着の24時間前に解錠コードをお送りします。",
      idVerification: "チェックイン前に本人確認が必要です（パスポートまたは公的な身分証明書）。",
    },
    conditions: {
      title: "ご予約条件",
      cancellation: "キャンセル：詳しくは、お問い合わせください。",
      cleaningFee: "清掃料金: 宿泊料金に含まれています",
      extraGuest: "追加人数料金: 5名まで同一料金・6名目以降1名につき¥5,000/泊",
      noiseRule: "深夜の騒音はお控えください。近隣へのご配慮をお願いいたします。",
      petRule: "ペットの同伴はご遠慮ください（補助犬は事前にご連絡ください）。",
      smokingRule: "室内は禁煙です。屋外に指定の喫煙場所がございます。",
    },
    booking: {
      title: "公式サイトからの直接予約がお得です",
      subtitle: "プラットフォーム手数料のかからない直接予約で、最もお得な料金をご案内します。",
      comingSoon: "オンライン予約システムは現在準備中です。ご予約はお問い合わせフォームよりご連絡ください。",
    },
    faq: {
      title: "よくあるご質問",
      items: [
        {
          q: "駐車場はありますか？",
          a: "はい、敷地内に専用駐車場1台分を無料でご利用いただけます（コンパクト〜スタンダードサイズまで）。大型車の場合は、近隣のコインパーキング（1泊約800円〜）をご利用ください。",
        },
        {
          q: "小さな子ども連れでも利用できますか？",
          a: "はい、ご家族に人気です。ただし、ベビーベッド等の乳幼児用品のご用意はありません。恐れ入りますがお持ち込みをお願いします。室内に階段がありますので、小さなお子さまはご注意ください。",
        },
        {
          q: "チェックインはどのように行いますか？",
          a: "セキュリティロックによる完全非対面のセルフチェックインです。ご到着の24時間前に解錠コードをお送りしますので、スタッフと顔を合わせることなくご入室いただけます。",
        },
        {
          q: "アーリーチェックインやレイトチェックアウトはできますか？",
          a: "空き状況により承ります。事前にお問い合わせください。",
        },
        {
          q: "ペットは同伴できますか？",
          a: "申し訳ございませんが、ペットの同伴はお断りしております。補助犬は事前にご連絡いただければご一緒いただけます。",
        },
        {
          q: "喫煙はできますか？",
          a: "室内は禁煙です。屋外に指定の喫煙場所がございます。",
        },
        {
          q: "キャンセルポリシーを教えてください。",
          a: "詳しくは、お問い合わせください。",
        },
        {
          q: "足の不自由な方でも利用できますか？",
          a: "屋内階段の勾配が急なため、車椅子でのご利用やバリアフリーには対応しておりません。階段の上り下りに不安のない方におすすめいたします。",
        },
        {
          q: "支払い方法を教えてください。",
          a: "銀行振込およびクレジットカードがご利用いただけます。ご予約の際に直接お問い合わせいただければ、お支払い方法の詳細をご案内いたします。",
        },
      ],
      bookButton: "予約する",
    },
    review: {
      rating: "4.77",
      count: "レビュー47件",
      superhostLabel: "スーパーホスト",
      airbnbLabel: "Airbnbで見る",
    },
    propertyDescription: {
      title: "この宿について",
      showMore: "もっと見る",
      showLess: "閉じる",
      intro: "福岡市清川、那珂川沿いに佇む隠れ家のような新築ヴィラ（一棟貸し）です。天神や博多へのアクセスが良好な都心にありながら、川沿いの穏やかな時間をお楽しみいただけます。\n\n天神まで車で8分、博多駅まで車で10分、福岡空港から車で18分。地下鉄七隈線・渡辺通駅（1番出口）から徒歩10〜15分、コンビニ（ローソン）も徒歩2分と、暮らすように過ごせる立地です。完全無人チェックインを採用しており、プライベートな滞在が可能です。\n\n延床面積109㎡・3階建ての一軒家に最大7名様までご宿泊いただけるため、ご家族やグループでのご旅行に最適です。ゆったりとしたリビングとデザイン性の高い家具が、特別な時間を演出します。",
      highlights: [
        {
          title: "1. 極上の睡眠体験（SIMMONS製プレミアムマットレス）",
          body: "3つあるすべての寝室に、高級ホテルで採用されているシモンズ（SIMMONS）社のプレミアムマットレスを導入しています。すべてのベッドサイドにコンセントを完備し、旅の疲れをしっかり癒す快適な眠りをお約束します。",
        },
        {
          title: "2. 大迫力のホームエンターテイメント",
          body: "55インチの大型テレビと、日本製の高品質アンプ、トールボーイ型スピーカーを設置しています。映画館さながらの音響で、映画や配信コンテンツをお楽しみください。（各種配信サービスはご自身のアカウントでログインのうえご利用ください）",
        },
        {
          title: "3. 「暮らすように旅する」充実の設備",
          body: "大型冷蔵庫や豊富な調理器具を備えた、広々としたフルキッチンを完備。地元の新鮮な食材でのお料理をお楽しみいただけます。専用のワークデスク（1名用）や高速Wi-Fiも備えており、ワーケーションにも最適です。ボタンひとつで洗濯から乾燥まで完了するドラム式洗濯乾燥機もあり、長期のご滞在にも便利です。\n\n専用駐車場（1台）も無料でご利用いただけますので、ドライブ旅行の拠点としてもおすすめです。\n\n【オーナーからのお知らせ】\n2026年5月: 洗濯機をドラム式洗濯乾燥機に入れ替えました。ボタンひとつで洗濯から乾燥まで完了します。",
        },
      ],
      bedroomGuide: {
        title: "寝室のご案内",
        items: [
          "寝室1: シングルベッド1台",
          "寝室2: ダブルベッド2台",
          "寝室3: ダブルベッド1台",
          "（3つの寝室で最大7名様までご宿泊いただけます）",
        ],
      },
      facilityGuide: {
        title: "施設のご案内",
        items: [
          "専用駐車場（1台）",
          "バスルーム（1室・1階）",
          "トイレ（2室: 1階と2階）",
          "洗面台",
          "キッチン（3口ガスコンロ）",
          "リビング",
          "ダイニング",
        ],
      },
      equipment: {
        title: "設備・家電",
        items: [
          "55インチテレビ",
          "日本製の高品質アンプ & トールボーイ型スピーカー",
          "ドラム式洗濯乾燥機",
          "冷蔵庫（冷凍室付き）",
          "電子レンジ",
          "炊飯器（5合炊き）",
          "電気ケトル",
          "基本の調理器具（鍋・フライパン・まな板・包丁）",
          "食器類",
          "ドライヤー",
        ],
      },
      amenitiesDetail: {
        title: "アメニティ",
        items: [
          "スリッパ",
          "バスタオル / フェイスタオル",
          "歯ブラシセット",
          "シャンプー / コンディショナー / ボディソープ",
          "ハンガー / 洗濯用ハンガー",
          "洗濯洗剤",
        ],
      },
      guestAccess: {
        title: "ゲストが利用できる範囲",
        body: "一棟貸しのため、ほかのお客様と空間を共有することはありません。すべてのスペースをご自由にお使いいただけます。",
      },
      otherNotes: {
        title: "その他の注意事項",
        items: [
          "お部屋は清潔にご利用ください。著しい汚れやゴミの放置があった場合、追加の清掃費を申し受けることがあります。",
          "室内備品の紛失・破損があった場合は、実費を申し受けます。",
          "申告人数を超えてご宿泊された場合、超過1名につき¥5,000の追加料金を申し受けます。",
          "ゴミはご案内に従って分別をお願いいたします。",
          "ペットの同伴はご遠慮ください（補助犬は事前にご連絡ください）。",
          "宿泊料金とは別に、福岡市の定める宿泊税がかかります。",
        ],
      },
      registration: {
        title: "登録情報",
        body: "旅館業法許可番号 | 福岡市保健所 | 福中保環第713001号",
      },
    },
    houseRules: {
      title: "ハウスルール",
      items: [
        { icon: "no-smoking", rule: "室内は禁煙です。屋外に指定の喫煙場所がございます。" },
        { icon: "no-pets", rule: "ペットの同伴はご遠慮ください。補助犬は事前にご連絡ください。" },
        { icon: "quiet", rule: "静粛時間: 22:00〜翌8:00。近隣へのご配慮をお願いいたします。" },
        { icon: "checkin-time", rule: "チェックイン: 16:00〜23:00。チェックアウト: 10:00まで。" },
        { icon: "guests", rule: "ご予約者以外のご宿泊はお断りしております。定員は必ずお守りください。" },
        { icon: "trash", rule: "地域のゴミ分別ルールに従ってください。分別用のゴミ箱をご用意しています。" },
        { icon: "shoes", rule: "玄関で靴をお脱ぎください。" },
        { icon: "stairs", rule: "屋内階段の勾配が急です。階段の上り下りに不安のある方にはおすすめできません。" },
      ],
    },
    floorPlan: {
      title: "間取り",
      subtitle: "3階建て一軒家 · 1階: バスルーム・ガレージ · 2階: リビング/ダイニング/キッチン · 3階: 寝室3室・バルコニー",
      imageAlt: "清川の間取り図 – 1階 バスルーム・ガレージ、2階 リビングダイニングキッチン、3階 寝室・バルコニー",
    },
    contact: {
      title: "ご不明な点はございませんか？",
      subtitle: "ご滞在に関するご質問は、お気軽にお問い合わせください。",
    },
    ui: {
      overviewLabels: {
        bedrooms: "寝室",
        beds: "ベッド",
        maxGuests: "最大人数",
        area: "エリア",
      },
      contactUsToBook: "予約のお問い合わせ",
      successMessage: "✓ メッセージを送信しました。追ってご連絡いたします。",
      namePlaceholder: "お名前",
      emailPlaceholder: "メールアドレス",
      messagePlaceholder: "メッセージ",
      privacyLabel: "プライバシーポリシーに同意します",
      privacyLink: "プライバシーポリシー",
      sendButton: "送信する",
      sendingButton: "送信中…",
      errorToast: "送信に失敗しました。もう一度お試しください。",
    },
    nav: {
      backToHome: "ホームに戻る",
      language: "言語",
      langNames: { en: "英語", ko: "韓国語", zh: "中国語", th: "タイ語" },
    },
  },

  ko: {
    hero: {
      propertyName: "yah. 기요카와",
      tagline: "활기찬 기요카와 지구에 새로 지어진 단독 주택.",
      area: "기요카와, 추오구, 후쿠오카",
      capacity: "최대 7인 · 침실 3개",
      bookNow: "지금 예약",
    },
    overview: {
      title: "숙소 개요",
      bedrooms: "침실 3개",
      beds: "더블 침대 3개 + 싱글 침대 1개",
      maxGuests: "최대 7인",
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
      rating: "4.77",
      count: "후기 47개",
      superhostLabel: "슈퍼호스트",
      airbnbLabel: "Airbnb에서 보기",
    },
    propertyDescription: {
      title: "숙소 소개",
      showMore: "더 보기",
      showLess: "접기",
      intro: "후쿠오카 기요카와, 나카가와 강변에 자리한 은밀한 신축 빌라(단독 주택)입니다. 텐진과 하카타에 쉽게 접근할 수 있는 도심에 위치하면서도 강변의 여유로운 시간을 즐기실 수 있습니다.\n\n텐진까지 차로 8분. 하카타역까지 차로 10분. 공항에서 차로 18분. 완전 무인 체크인으로 프라이빗한 숙박이 가능합니다.\n\n최대 7명까지 숙박 가능하며 가족이나 그룹 여행에 최적입니다.",
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
          "(3개 침실에서 최대 7명 숙박 가능)",
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
      time: "체크인: 오후 4시 – 오후 11시",
      checkout: "체크아웃: 오전 10시까지",
      method: "보안 잠금장치로 완전 비대면 셀프 체크인. 도착 24시간 전에 액세스 코드가 전송됩니다.",
      idVerification: "체크인 전 신분증 확인 필요 (여권 또는 정부 발급 신분증).",
    },
    conditions: {
      title: "예약 조건",
      cancellation: "취소 정책: 자세한 내용은 문의해 주세요.",
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
        { q: "체크인 절차는 어떻게 되나요?", a: "보안 잠금장치로 완전 비대면 셀프 체크인. 도착 24시간 전에 액세스 코드를 받게 됩니다." },
        { q: "얼리 체크인 또는 레이트 체크아웃이 가능한가요?", a: "가용성에 따라 가능합니다. 사전에 문의해 주세요." },
        { q: "반려동물 동반이 가능한가요?", a: "죄송합니다. 반려동물은 허용되지 않습니다. 안내견은 사전 연락 후 가능합니다." },
        { q: "흡연이 가능한가요?", a: "실내 흡연은 금지되어 있습니다. 지정된 야외 흡연 공간이 있습니다." },
        { q: "취소 정책은 어떻게 되나요?", a: "자세한 내용은 문의해 주세요." },
        { q: "이동이 불편한 분도 이용 가능한가요?", a: "숙소 내부 계단이 가파릅니다. 휠체어 접근이나 배리어프리 구조가 아닙니다. 계단 이용에 불편함이 없는 분께 권장합니다." },
        { q: "결제는 어떻게 하나요?", a: "배송 이체 및 신용카드를 받습니다. 예약 시 직접 연락하시면 결제 방법을 안내해 드리겠습니다." },
      ],
      bookButton: "지금 예약",
    },
    houseRules: {
      title: "하우스 룰",
      items: [
        { icon: "no-smoking", rule: "실내 흡연 금지. 지정된 실외 흡연 구역 이용 가능." },
        { icon: "no-pets", rule: "반려동물 금지. 안내견은 사전 연락 후 가능." },
        { icon: "quiet", rule: "조용 시간: 오후 10시 – 오전 8시. 이웃에 배려해 주세요." },
        { icon: "checkin-time", rule: "체크인: 오후 4시 – 오후 10시. 체크아웃: 오전 11시까지." },
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
  },

  zh: {
    hero: {
      propertyName: "yah. 清川",
      tagline: "位於充滿活力的清川地區，全新打造的獨棟民宅。",
      area: "清川，中央區，福岡",
      capacity: "最多 7 人 · 3 間臥室",
      bookNow: "立即預訂",
    },
    overview: {
      title: "房源概覽",
      bedrooms: "3 間臥室",
      beds: "雙人床 3 張 + 單人床 1 張",
      maxGuests: "最多 7 人",
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
      rating: "4.77",
      count: "47 則評價",
      superhostLabel: "超級房主",
      airbnbLabel: "在 Airbnb 上查看",
    },
    propertyDescription: {
      title: "房源介紹",
      showMore: "查看更多",
      showLess: "收起",
      intro: "位於福岡市清川那珂川河畔的全新隱居別墅（整棟居宅）。在市中心便可前往天神與博多，同時享受河畔的寧靜時光。\n\n開車至天神約 8 分鐘。開車至博多站約 10 分鐘。自機場開車約 18 分鐘。完全無接觸式自助入住，可享受完全私密的住宿體驗。\n\n最多可容納 7 位客人，適合家庭或團體旅行。寬敞的客廳與設計感十足的家具，為您創造特別的住宿體驗。",
      highlights: [
        {
          title: "1. 極致睡眠體驗（SIMMONS 頂級床墊）",
          body: "3 間臥室均配備頂級酒店所使用的 SIMMONS 頂級床墊。每張床邊均設有插座，確保您得到充分休息。",
        },
        {
          title: "2. 震撼影院級家庭娛樂",
          body: "55 吋大型電視配合日本製高品質擴大機與地板型音箱，帶來影院級音響體驗。（請使用自己的影音平台帳號登入）",
        },
        {
          title: "3. 「就像居家一樣旅行」充實設備",
          body: "寬敞的全配備廚房配有大型冰箱與豐富廚具，可使用當地新鮮食材烹飪。專用工作機及高速 Wi-Fi 適合工作度假。於 2026 年 5 月安裝全新滾筒式洗烘一體機。\n\n免費專用停車位（1 格）包含在內。\n\n[房主公告]\n2026 年 4 月：洗衣機升級為滾筒式洗烘一體機。按一鍵即可完成洗滌到烘乾全程。",
        },
      ],
      bedroomGuide: {
        title: "臥室介紹",
        items: [
          "臥室 1：單人床 1 張",
          "臥室 2：雙人床 2 張",
          "臥室 3：雙人床 1 張",
          "（3 間臥室最多可容納 7 位）",
        ],
      },
      facilityGuide: {
        title: "設施介紹",
        items: [
          "專用停車位（1 格）",
          "浴室（1 間）",
          "廁所（2 間：1F 與 2F）",
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
          "入住人數超出申報人數，每位加收 ¥5,000 。",
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
        { from: "天神", time: "開車約 8 分鐘 / 步行可達" },
        { from: "Canal City 博多", time: "開車約 15 分鐘" },
        { from: "太宰府", time: "開車約 30 分鐘" },
      ],
    },
    checkin: {
      title: "入住資訊",
      time: "入住：下午 4:00 – 晚上 11:00",
      checkout: "退房：上午 10:00 前",
      method: "透過密碼鎖完全無接觸自助入住。抵達前 24 小時將發送存取碼。",
      idVerification: "入住前需進行身份驗證（護照或政府核發身份證件）。",
    },
    conditions: {
      title: "預訂條件",
      cancellation: "取消政策：詳情請與我們聯繫。",
      cleaningFee: "清潔費：已包含在費率中",
      extraGuest: "額外住客費：5人以內同一價格・第6人起每人每晚 ¥5,000",
      noiseRule: "請注意深夜噪音，體諒鄰居。",
      petRule: "不允許攜帶寵物（事先通知的導盲犬除外）。",
      smokingRule: "室內禁止吸菸，室外有指定吸菸區。",
    },
    booking: {
      title: "直接預訂，享受最優惠價格",
      subtitle: "直接向我們預訂，無需支付平台手續費。",
      comingSoon: "線上預訂系統即將推出。請聯絡我們進行預訂。",
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
        { q: "取消政策是什麼？", a: "詳情請與我們聯繫。" },
        { q: "行動不便的旅客可以入住嗎？", a: "請注意，房源內部樓梯較陡，不適合輪椅使用者或需要無障礙設施的旅客。建議能夠自行上下樓梯的旅客入住。" },
        { q: "如何付款？", a: "我們接受銀行轉帳及信用卡付款。預訂時請直接聯絡我們以確認付款方式。" },
      ],
      bookButton: "立即預訂",
    },
    houseRules: {
      title: "住宿規則",
      items: [
        { icon: "no-smoking", rule: "室內禁止吸菸，室外設有指定吸菸區。" },
        { icon: "no-pets", rule: "不允許攜帶寵物。導盲犬請事先告知。" },
        { icon: "quiet", rule: "安靜時間：晚上 10 點 – 上午 8 點。請尊重鄰居。" },
        { icon: "checkin-time", rule: "入住：下午 4 點 – 晚上 10 點。退房：上午 11 點前。" },
        { icon: "guests", rule: "禁止未登記人員入住。請遵守最大入住人數。" },
        { icon: "trash", rule: "請遵守當地垃圾分類規定，已提供垃圾桶。" },
        { icon: "shoes", rule: "請在玄關脫鞋（日本習俗）。" },
        { icon: "stairs", rule: "內部樓梯較陡，不適合行動不便的旅客。" },
      ],
    },
    floorPlan: {
      title: "平面圖",
      subtitle: "3 層獨棟居宅 · 1F：浴室 & 車庫 · 2F：客廳/餐廳/廚房 · 3F：3 間臥室 & 陽台",
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
  },

  th: {
    hero: {
      propertyName: "yah. คิโยคาวะ",
      tagline: "บ้านเดี่ยวสร้างใหม่ในย่านคิโยคาวะที่คึกคัก",
      area: "คิโยคาวะ, เขตชูโอ, ฟุกุโอกะ",
      capacity: "รับได้สูงสุด 7 คน · 3 ห้องนอน",
      bookNow: "จองเลย",
    },
    overview: {
      title: "ภาพรวมที่พัก",
      bedrooms: "3 ห้องนอน",
      beds: "เตียงดับเบิล 3 เตียง + เตียงเดี่ยว 1 เตียง",
      maxGuests: "สูงสุด 7 คน",
      area: "คิโยคาวะ · เขตชูโอ, ฟุกุโอกะ",
    },
    amenityCategories: {
      title: "สิ่งที่สถานที่นี้มีให้",
      showAll: "ดูสิ่งอำนวยความสะดวกทั้งหมด",
      showLess: "ย่อ",
      categories: [
        {
          name: "ห้องน้ำ",
          items: [
            { icon: "bath", label: "อ่างอาบน้ำ" },
            { icon: "hairdryer", label: "ไดร์เป่าผม" },
            { icon: "shampoo", label: "แชมพู" },
            { icon: "conditioner", label: "ครีมนวดผม" },
            { icon: "soap", label: "เจลอาบน้ำ" },
            { icon: "bidet", label: "ชักโครกอัจฉริยะ (วอชเล็ต)" },
            { icon: "hot-water", label: "น้ำร้อน" },
            { icon: "shower", label: "เจลอาบน้ำ" },
          ],
        },
        {
          name: "ห้องนอน & ซักผ้า",
          items: [
            { icon: "washer", label: "เครื่องซักอบผ้าดรัม" },
            { icon: "hanger", label: "ไม้แขวนเสื้อ" },
            { icon: "bedding", label: "ผ้าปูที่นอน" },
            { icon: "blackout", label: "ม่านกันแสง" },
            { icon: "drying-rack", label: "ราวตากผ้า" },
            { icon: "storage", label: "พื้นที่เก็บเสื้อผ้า" },
          ],
        },
        {
          name: "ความบันเทิง",
          items: [
            { icon: "tv", label: "ทีวี" },
            { icon: "audio", label: "ระบบเสียง" },
          ],
        },
        {
          name: "ระบบปรับอากาศ",
          items: [
            { icon: "ac", label: "เครื่องปรับอากาศ" },
            { icon: "fan", label: "พัดลมเพดาน" },
            { icon: "heat", label: "ระบบทำความร้อน" },
          ],
        },
        {
          name: "ความปลอดภัย",
          items: [
            { icon: "camera", label: "กล้องวงจรปิดในบริเวณที่พัก", note: "ติดตั้งกล้องตามกฎหมายธุรกิจโรงแรมญี่ปุ่น บริเวณภายนอก พื้นที่ส่วนกลาง และทางเข้า ความเป็นส่วนตัวของท่านได้รับการคุ้มครอง" },
            { icon: "smoke-alarm", label: "เครื่องตรวจจับควัน" },
            { icon: "fire-ext", label: "ถังดับเพลิง" },
            { icon: "co-alarm", label: "เครื่องตรวจจับก๊าซคาร์บอนมอนอกไซด์", unavailable: true, note: "ที่พักนี้อาจไม่มีเครื่องตรวจจับก๊าซคาร์บอนมอนอกไซด์ กรุณาติดต่อเจ้าของที่พักเพื่อสอบถาม" },
          ],
        },
        {
          name: "อินเทอร์เน็ต & สำนักงาน",
          items: [
            { icon: "wifi", label: "Wi-Fi" },
            { icon: "desk", label: "พื้นที่ทำงานส่วนตัว" },
          ],
        },
        {
          name: "ครัว & อาหาร",
          items: [
            { icon: "kitchen", label: "ครัวครบครัน" },
            { icon: "cooking", label: "พื้นที่ทำอาหารสำหรับผู้เข้าพัก" },
            { icon: "fridge", label: "ตู้เย็น" },
            { icon: "microwave", label: "ไมโครเวฟ" },
            { icon: "cookware", label: "อุปกรณ์ทำครัวพื้นฐาน", note: "หม้อ กระทะ น้ำมัน เกลือและพริกไทย" },
            { icon: "tableware", label: "ภาชนะและช้อนส้อม", note: "ชาม ตะเกียบ จาน แก้ว ฯลฯ" },
            { icon: "freezer", label: "ช่องแช่แข็ง" },
            { icon: "dishwasher", label: "เครื่องล้างจาน" },
            { icon: "stove", label: "เตาแก๊ส" },
            { icon: "oven", label: "เตาอบ" },
            { icon: "kettle", label: "กาต้มน้ำไฟฟ้า" },
            { icon: "wine", label: "แก้วไวน์" },
            { icon: "rice", label: "หม้อหุงข้าว" },
            { icon: "dining", label: "โต๊ะอาหาร" },
          ],
        },
        {
          name: "ลักษณะทำเล",
          items: [
            { icon: "private-entry", label: "ทางเข้าส่วนตัว" },
            { icon: "laundromat", label: "ร้านซักผ้าหยอดเหรียญใกล้เคียง" },
          ],
        },
        {
          name: "ที่จอดรถ & สิ่งอำนวยความสะดวก",
          items: [
            { icon: "parking", label: "ที่จอดรถส่วนตัวฟรี" },
          ],
        },
        {
          name: "บริการ",
          items: [
            { icon: "long-stay", label: "รองรับการพักระยะยาว", note: "พักได้ 28 คืนขึ้นไป" },
            { icon: "self-checkin", label: "เช็คอินด้วยตัวเอง", note: "กล่องกุญแจ" },
          ],
        },
      ],
    },
    review: {
      rating: "4.77",
      count: "47 รีวิว",
      superhostLabel: "ซูเปอร์โฮสต์",
      airbnbLabel: "ดูบน Airbnb",
    },
    propertyDescription: {
      title: "เกี่ยวกับที่พักนี้",
      showMore: "ดูเพิ่มเติม",
      showLess: "ย่อ",
      intro: "วิลล่าใหม่สุดลับ (บ้านทั้งหลัง) ริมแม่น้ำนากากาวะ ในย่านคิโยคาวะ ฟุกุโอกะ เพลิดเพลินกับบรรยากาศริมน้ำอันเงียบสงบ ขณะที่ยังอยู่ใจกลางเมืองที่เดินทางสะดวกไปเทนจินและฮากาตะ\n\nขับรถไปเทนจิน 8 นาที ขับรถไปสถานีฮากาตะ 10 นาที ขับรถจากสนามบิน 18 นาที เช็คอินด้วยตัวเองแบบไม่ต้องพบใคร เพื่อการพักผ่อนที่เป็นส่วนตัวอย่างสมบูรณ์\n\nรองรับได้สูงสุด 7 คน เหมาะสำหรับครอบครัวหรือกลุ่มเพื่อน ห้องนั่งเล่นกว้างขวางและเฟอร์นิเจอร์ดีไซน์สวยงาม สร้างประสบการณ์พิเศษให้กับคุณ",
      highlights: [
        {
          title: "1. ประสบการณ์การนอนหลับระดับพรีเมียม (ที่นอน SIMMONS)",
          body: "ห้องนอนทั้ง 3 ห้องติดตั้งที่นอน SIMMONS ระดับพรีเมียม เช่นเดียวกับที่ใช้ในโรงแรมหรู ทุกข้างเตียงมีปลั๊กไฟ รับประกันการนอนหลับที่สบายและฟื้นฟูร่างกาย",
        },
        {
          title: "2. ความบันเทิงระดับโรงภาพยนตร์ที่บ้าน",
          body: "ทีวีขนาด 55 นิ้วพร้อมแอมป์คุณภาพสูงจากญี่ปุ่นและลำโพงแบบตั้งพื้น มอบประสบการณ์เสียงระดับโรงภาพยนตร์ (กรุณาล็อกอินด้วยบัญชีสตรีมมิ่งของท่านเอง)",
        },
        {
          title: "3. 'ท่องเที่ยวเหมือนอยู่บ้าน' อุปกรณ์ครบครัน",
          body: "ครัวครบครันพร้อมตู้เย็นขนาดใหญ่และอุปกรณ์ทำครัวมากมาย ให้คุณทำอาหารด้วยวัตถุดิบสดใหม่จากท้องถิ่น โต๊ะทำงานส่วนตัวและ Wi-Fi ความเร็วสูงเหมาะสำหรับ workcation ในเดือนพฤษภาคม 2566 ติดตั้งเครื่องซักอบผ้าดรัมรุ่นใหม่\n\nที่จอดรถส่วนตัวฟรี (1 คัน) รวมอยู่ในราคา\n\n[ประกาศจากเจ้าของ]\nเมษายน 2566: เปลี่ยนเครื่องซักผ้าเป็นเครื่องซักอบผ้าดรัม กดปุ่มเดียวครบทั้งซักและอบ",
        },
      ],
      bedroomGuide: {
        title: "แนะนำห้องนอน",
        items: [
          "ห้องนอน 1: เตียงเดี่ยว 1 เตียง",
          "ห้องนอน 2: เตียงดับเบิล 2 เตียง",
          "ห้องนอน 3: เตียงดับเบิล 1 เตียง",
          "(3 ห้องนอน รองรับได้สูงสุด 7 คน)",
        ],
      },
      facilityGuide: {
        title: "สิ่งอำนวยความสะดวก",
        items: [
          "ที่จอดรถส่วนตัว (1 คัน)",
          "ห้องน้ำ (1 ห้อง)",
          "ห้องส้วม (2 ห้อง: ชั้น 1 และชั้น 2)",
          "อ่างล้างหน้า",
          "ครัว (เตาแก๊ส 3 หัว)",
          "ห้องนั่งเล่น",
          "ห้องอาหาร",
        ],
      },
      equipment: {
        title: "อุปกรณ์ & เครื่องใช้ไฟฟ้า",
        items: [
          "ทีวี 55 นิ้ว",
          "แอมป์คุณภาพสูงจากญี่ปุ่น & ลำโพงแบบตั้งพื้น",
          "เครื่องซักอบผ้าดรัม",
          "ตู้เย็น (มีช่องแช่แข็ง)",
          "ไมโครเวฟ",
          "หม้อหุงข้าว (5 ถ้วย)",
          "กาต้มน้ำไฟฟ้า",
          "อุปกรณ์ทำครัวพื้นฐาน (หม้อ กระทะ เขียง มีด)",
          "ภาชนะ",
          "ไดร์เป่าผม",
        ],
      },
      amenitiesDetail: {
        title: "ของใช้ส่วนตัว",
        items: [
          "รองเท้าแตะ",
          "ผ้าขนหนูอาบน้ำ / ผ้าเช็ดหน้า",
          "ชุดแปรงสีฟัน",
          "แชมพู / ครีมนวดผม / เจลอาบน้ำ",
          "ไม้แขวนเสื้อ / ไม้แขวนซักผ้า",
          "ผงซักฟอก",
        ],
      },
      guestAccess: {
        title: "พื้นที่สำหรับผู้เข้าพัก",
        body: "ที่พักนี้เป็นการเช่าทั้งหลัง คุณไม่ต้องแบ่งปันพื้นที่กับผู้เข้าพักอื่น สามารถใช้ทุกพื้นที่ได้อย่างอิสระ",
      },
      otherNotes: {
        title: "หมายเหตุอื่น ๆ",
        items: [
          "กรุณาดูแลรักษาความสะอาด หากมีความสกปรกมากเกินไปหรือทิ้งขยะไว้ อาจมีการเรียกเก็บค่าทำความสะอาดเพิ่มเติม",
          "หากของในห้องสูญหายหรือเสียหาย จะเรียกเก็บตามราคาจริง",
          "หากจำนวนผู้เข้าพักเกินกว่าที่แจ้งไว้ จะเรียกเก็บ ¥5,000 ต่อคนที่เกิน",
          "กรุณาแยกขยะตามคำแนะนำที่ให้ไว้",
          "ไม่อนุญาตให้นำสัตว์เลี้ยงมา (สุนัขนำทางได้รับการยกเว้นหากแจ้งล่วงหน้า)",
          "นอกจากค่าที่พักแล้ว ยังมีภาษีที่พักตามระเบียบของเมืองฟุกุโอกะ",
        ],
      },
      registration: {
        title: "ข้อมูลการจดทะเบียน",
        body: "ใบอนุญาตธุรกิจโรงแรม | สำนักงานสาธารณสุขเมืองฟุกุโอกะ | Fuku-Chu-Hoken-Dai 713001",
      },
    },
    amenities: {
      title: "สิ่งอำนวยความสะดวก",
      items: [
        "ครัวพร้อมอุปกรณ์ครบครัน (เตาแก๊ส 3 หัว)",
        "เครื่องซักอบผ้าดรัมแบบ all-in-one",
        "Wi-Fi ความเร็วสูง",
        "ที่จอดรถส่วนตัว (1 คัน, ฟรี)",
        "ที่นอน Simmons ระดับพรีเมียมทุกห้องนอน",
        "เปลเด็กและเก้าอี้สูงสำหรับเด็ก (ตามคำขอ)",
        "Smart TV 55 นิ้ว + ระบบเสียงคุณภาพสูงจากญี่ปุ่น",
        "เครื่องปรับอากาศทุกห้อง",
        "โต๊ะทำงาน (1 คน)",
        "ห้องนั่งเล่นและห้องอาหารกว้างขวาง",
        "ไดร์เป่าผม, รองเท้าแตะ, ผ้าขนหนู & ของใช้ส่วนตัว",
        "หม้อหุงข้าว, ไมโครเวฟ & อุปกรณ์ทำครัวพื้นฐาน",
      ],
    },
    access: {
      title: "การเดินทาง",
      items: [
        { from: "สนามบินฟุกุโอกะ", time: "ประมาณ 18 นาทีโดยรถยนต์" },
        { from: "สถานีฮากาตะ", time: "ประมาณ 10 นาทีโดยรถยนต์ / 20 นาทีโดยรถไฟใต้ดิน" },
        { from: "เทนจิน", time: "ประมาณ 8 นาทีโดยรถยนต์ / เดินได้" },
        { from: "Canal City Hakata", time: "ประมาณ 15 นาทีโดยรถยนต์" },
        { from: "ดาไซฟุ", time: "ประมาณ 30 นาทีโดยรถยนต์" },
      ],
    },
    checkin: {
      title: "ข้อมูลการเช็คอิน",
      time: "เช็คอิน: 16:00 – 23:00 น.",
      checkout: "เช็คเอาต์: ก่อน 10:00 น.",
      method: "เช็คอินด้วยตัวเองแบบไม่ต้องพบใครผ่านล็อคนิรภัย รหัสเข้าถึงจะส่งให้ 24 ชั่วโมงก่อนเดินทางมาถึง",
      idVerification: "ต้องยืนยันตัวตนก่อนเช็คอิน (หนังสือเดินทางหรือบัตรประชาชน)",
    },
    conditions: {
      title: "เงื่อนไขการจอง",
      cancellation: "นโยบายยกเลิก: กรุณาติดต่อเราสำหรับรายละเอียด",
      cleaningFee: "ค่าทำความสะอาด: รวมอยู่ในราคาแล้ว",
      extraGuest: "ราคาเดียวกันสูงสุด 5 ท่าน・ตั้งแต่ท่านที่ 6 คิด ¥5,000 ต่อท่านต่อคืน",
      noiseRule: "กรุณาระวังเสียงรบกวนในช่วงกลางคืน",
      petRule: "ไม่อนุญาตให้นำสัตว์เลี้ยงมา (สุนัขนำทางได้หากแจ้งล่วงหน้า)",
      smokingRule: "ห้ามสูบบุหรี่ภายในที่พัก มีพื้นที่สูบบุหรี่กลางแจ้งที่กำหนดไว้",
    },
    booking: {
      title: "จองตรงและประหยัดกว่า",
      subtitle: "จองตรงกับเราเพื่อราคาดีที่สุด ไม่มีค่าธรรมเนียมแพลตฟอร์ม",
      comingSoon: "ระบบจองออนไลน์กำลังจะมาเร็วๆ นี้ กรุณาติดต่อเราเพื่อทำการจอง",
    },
    faq: {
      title: "คำถามที่พบบ่อย",
      items: [
        { q: "มีที่จอดรถไหม?", a: "มีที่จอดรถส่วนตัว 1 คัน ฟรี" },
        { q: "เหมาะสำหรับครอบครัวที่มีเด็กเล็กไหม?", a: "เหมาะมาก ครอบครัวเข้าพักกันเยอะ แต่เราไม่มีอุปกรณ์สำหรับทารก เช่น เปลเด็กหรือเก้าอี้สูง กรุณานำมาเอง และในบ้านมีบันได โปรดดูแลเด็กเล็กอย่างใกล้ชิด" },
        { q: "ขั้นตอนเช็คอินเป็นอย่างไร?", a: "เช็คอินด้วยตัวเองแบบไม่ต้องพบใครผ่านล็อคนิรภัย คุณจะได้รับรหัสเข้าถึง 24 ชั่วโมงก่อนมาถึง" },
        { q: "สามารถเช็คอินก่อนหรือเช็คเอาต์หลังได้ไหม?", a: "ขึ้นอยู่กับความพร้อมของห้องพัก กรุณาติดต่อล่วงหน้า" },
        { q: "นำสัตว์เลี้ยงมาได้ไหม?", a: "ขออภัย ที่พักนี้ไม่อนุญาตให้นำสัตว์เลี้ยงมา สุนัขนำทางได้หากแจ้งล่วงหน้า" },
        { q: "สูบบุหรี่ได้ไหม?", a: "ห้ามสูบบุหรี่ภายในที่พัก มีพื้นที่สูบบุหรี่กลางแจ้งที่กำหนดไว้" },
        { q: "นโยบายยกเลิกเป็นอย่างไร?", a: "กรุณาติดต่อเราสำหรับรายละเอียด" },
        { q: "ผู้ที่มีปัญหาการเคลื่อนไหวสามารถเข้าพักได้ไหม?", a: "โปรดทราบว่าบันไดภายในที่พักค่อนข้างชัน ไม่เหมาะสำหรับผู้ใช้รถเข็นหรือผู้ที่ต้องการสิ่งอำนวยความสะดวกสำหรับผู้พิการ แนะนำสำหรับผู้ที่สามารถขึ้นลงบันไดได้สะดวก" },
        { q: "ชำระเงินอย่างไร?", a: "รับชำระผ่านโอนเงินและบัตรเครดิต กรุณาติดต่อเราโดยตรงเพื่อยืนยันวิธีการชำระเงินเมื่อทำการจอง" },
      ],
      bookButton: "จองเลย",
    },
    houseRules: {
      title: "กฎของที่พัก",
      items: [
        { icon: "no-smoking", rule: "ห้ามสูบบุหรี่ในอาคาร มีพื้นที่สูบบุหรี่กลางแจ้งที่กำหนด" },
        { icon: "no-pets", rule: "ไม่อนุญาตให้นำสัตว์เลี้ยงเข้าพัก สุนัขนำทางได้รับการยกเว้นหากแจ้งล่วงหน้า" },
        { icon: "quiet", rule: "ช่วงเวลาเงียบ: 22:00 – 08:00 น. กรุณาเคารพเพื่อนบ้าน" },
        { icon: "checkin-time", rule: "เช็คอิน: 16:00 – 22:00 น. เช็คเอาท์: ก่อน 11:00 น." },
        { icon: "guests", rule: "ห้ามนำผู้ที่ไม่ได้ลงทะเบียนเข้าพัก กรุณาปฏิบัติตามจำนวนผู้เข้าพักสูงสุด" },
        { icon: "trash", rule: "กรุณาแยกขยะตามกฎท้องถิ่น มีถังขยะให้บริการ" },
        { icon: "shoes", rule: "กรุณาถอดรองเท้าที่ทางเข้า (ธรรมเนียมญี่ปุ่น)" },
        { icon: "stairs", rule: "บันไดภายในค่อนข้างชัน ไม่เหมาะสำหรับผู้ที่มีปัญหาด้านการเคลื่อนไหว" },
      ],
    },
    floorPlan: {
      title: "ผังพื้น",
      subtitle: "บ้านเดี่ยว 3 ชั้น · ชั้น 1: ห้องน้ำ & โรงรถ · ชั้น 2: ห้องนั่งเล่น/ห้องอาหาร/ครัว · ชั้น 3: 3 ห้องนอน & ระเบียง",
      imageAlt: "ผังพื้นคิโยคาวะ – ชั้น 1 ห้องน้ำ & โรงรถ, ชั้น 2 ห้องนั่งเล่น/ห้องอาหาร/ครัว, ชั้น 3 ห้องนอน & ระเบียง",
    },
    contact: {
      title: "มีคำถามไหม?",
      subtitle: "ทีมงานของเรายินดีช่วยเหลือทุกข้อสงสัยเกี่ยวกับการเข้าพัก",
    },
    ui: {
      overviewLabels: {
        bedrooms: "ห้องนอน",
        beds: "เตียง",
        maxGuests: "จำนวนผู้เข้าพักสูงสุด",
        area: "พื้นที่",
      },
      contactUsToBook: "ติดต่อเราเพื่อจอง",
      successMessage: "✓ ส่งข้อความแล้ว! เราจะติดต่อกลับในเร็วๆ นี้",
      namePlaceholder: "ชื่อ",
      emailPlaceholder: "อีเมล",
      messagePlaceholder: "ข้อความ",
      privacyLabel: "ฉันยอมรับ",
      privacyLink: "นโยบายความเป็นส่วนตัว",
      sendButton: "ส่งข้อความ",
      sendingButton: "กำลังส่ง…",
      errorToast: "ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    },
    nav: {
      backToHome: "กลับหน้าหลัก",
      language: "ภาษา",
      langNames: { en: "อังกฤษ", ko: "เกาหลี", zh: "จีน", th: "ไทย" },
    },
  },
};
