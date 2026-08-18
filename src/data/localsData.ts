// yah.homes — Local Guide Data (Vol.1)
// Languages: en (English), ja (Japanese), ko (Korean), zh (Traditional Chinese), th (Thai)
// Source: LocalGuideVol.1.pdf
// =============================================================

export type Lang = "en" | "ja" | "ko" | "zh" | "th";

export interface LocalSpot {
  id: number;
  name: string;
  hours: string;
  description: string;
  mapUrl: string; // Google Maps URL for QR
  imageUrl: string; // /manus-storage/... path
}

export interface LocalCategory {
  id: string;
  icon: string; // emoji icon
  title: string;
  tagline: string;
  spots: LocalSpot[];
}

export interface LocalsPageData {
  heroTitle: string;
  heroSubtitle: string;
  introTitle: string;
  introBody: string[];
  volumeLabel: string;
  categories: LocalCategory[];
  taxiCardTitle: string;
  taxiCardBody: string;
  /** {zip} {addr} は SSoT（property_facts）からページ側で差し込む。実住所を書かない */
  taxiCardJapanese: string;
  mapListTitle: string;
  mapListBody: string;
  mapListUrl: string;
  downloadPdfLabel: string;
  backToHomeLabel: string;
}

// ─── English ────────────────────────────────────────────────────────────────
const en: LocalsPageData = {
  heroTitle: "Local Guide",
  heroSubtitle: "Vol.1 — Kiyokawa, Fukuoka",
  introTitle: "Recommended Local Guide",
  introBody: [
    "Fukuoka's attractions include tonkotsu ramen, mizutaki, and motsunabe. But that's not all.",
    "In fact, Fukuoka has the largest number of fish in Japan, the largest consumption of chicken, and the largest number of yakitori restaurants in Japan. Fukuoka is home to some of the best \"everyday foods,\" both fish and meat.",
    "Kiyokawa in Chuo-ku is where you can really taste such \"normal\" Fukuoka food. Away from the hustle and bustle of the tourist areas, this area is within walking distance of many famous restaurants frequented by locals and stores that will stimulate your senses.",
    "It would be a shame to just stay here. Walk, eat, and feel as if you were living in the area. Add Fukuoka's \"hilariously rich everyday life\" to your travel memories.",
  ],
  volumeLabel: "version 1.2",
  categories: [
    {
      id: "cafe",
      icon: "☕",
      title: "Cafe & Morning",
      tagline: "If you want to start your morning slowly",
      spots: [
        {
          id: 2,
          name: "manucoffee roasters Kujira Store",
          hours: "10:00 – 19:00",
          description:
            "A local favorite street-style cafe with three locations in Tenjin. The shops play HipHop, and they offer a wide selection of items perfect for souvenirs, including coffee beans and apparel. The cafe's name comes from the history that whales once migrated to this area.",
          mapUrl: "https://maps.app.goo.gl/H2dyhvtKrQjDZt1W6",
          imageUrl: "/manus-storage/manucoffee_3bb3e07b.webp",
        },
        {
          id: 3,
          name: "REC COFFEE Yakuin Ekimae Store",
          hours: "Mon–Thu, Sun & holidays 10:00–22:00 / Fri, Sat & before holidays 10:00–24:00",
          description:
            "Specialty coffee shop from Fukuoka. The selection of beans and the extensive food menu make it the perfect place to start your morning. For those who want to start the day in peace and quiet.",
          mapUrl: "https://maps.app.goo.gl/cJsjZjyW2HTdwveCA",
          imageUrl: "/manus-storage/rec_coffee_12eb7910.webp",
        },
        {
          id: 4,
          name: "TAGSTÅ ESPRESSO STAND & GALLERY",
          hours: "Open daily 7:00 – 20:00",
          description:
            "Espresso stand with art gallery. The combination of contemporary art and coffee is recommended for mornings when your senses are switched on.",
          mapUrl: "https://maps.app.goo.gl/SLYuad9eFQEqhaho7",
          imageUrl: "/manus-storage/tagsta_433b97fb.webp",
        },
        {
          id: 5,
          name: "Chaho Furyu Fukuoka JapanTea Studio",
          hours: "Thu–Sun 11:00–18:00 / Mon 11:00–17:00 & 18:00–22:00",
          description:
            "With high class tea selections from around Japan, Furyu is the den of the tea master who can serve you a cup of tea with the art. By selecting the tea course, you can learn what is the proper way to brew teas by category.",
          mapUrl: "https://maps.app.goo.gl/TUujtXQFqMfJK6Ka9",
          imageUrl: "/manus-storage/chaho_furyu_d4c47af9.webp",
        },
      ],
    },
    {
      id: "lunch",
      icon: "🍱",
      title: "Lunch & Dinner",
      tagline: "A solid taste of the local area",
      spots: [
        {
          id: 6,
          name: "Kaiboku Inari",
          hours: "Closed Sun & holidays / 11:00–15:00",
          description:
            "Japanese restaurant that has been in business for 35 years specializes in take-out dashi inari. You will be surprised at the juicy fried tofu stewed in sweet sauce.",
          mapUrl: "https://maps.app.goo.gl/ddYg5igFRknTi3Xh8",
          imageUrl: "/manus-storage/kaiboku_inari_320df6de.webp",
        },
        {
          id: 7,
          name: "Aji fry center Omukosan",
          hours: "11:30–15:00 / 17:00–22:00",
          description:
            "Fresh horse mackerels are carefully cut, deboned, and deep-fried to a fluffy perfection. Enjoy a set meal for a hearty meal or take out for a casual meal.",
          mapUrl: "https://maps.app.goo.gl/9VkciU1b5789Rs5s6",
          imageUrl: "/manus-storage/aji_fry_568be60b.webp",
        },
        {
          id: 8,
          name: "Yakitori Atarayo",
          hours: "Mon–Thu 18:00–01:00 / Fri–Sun 17:00–01:00",
          description:
            "A stylish yakitori restaurant with glass walls. In addition to chicken sashimi and yakitori, the chilled green pepper wonder pepper is a must-try. Reservations recommended.",
          mapUrl: "https://maps.app.goo.gl/sc43YatNZ2PuPWGn9",
          imageUrl: "/manus-storage/yakitori_atarayo_dd0b7dd7.webp",
        },
        {
          id: 9,
          name: "Niku ga Ichiban",
          hours: "11:00–15:00 / 17:30–23:00",
          description:
            "If you want to try good quality meat at a reasonable price, this restaurant is a must-try. They have a wide variety of wagyu dishes which own casual but pure tastes.",
          mapUrl: "https://maps.app.goo.gl/Udmh6QsjEWaxwUbg8",
          imageUrl: "/manus-storage/niku_ga_ichiban_472aca2f.webp",
        },
        {
          id: 10,
          name: "Ramen Unari Kiyokawa",
          hours: "Closed Wed / 18:00–03:00",
          description:
            "A popular restaurant with a unique and addictive soup of tonkotsu (pork bone) and seafood. It also offers a variety of different types of ramen, such as Genovese-style ramen, and is open even in the middle of the night.",
          mapUrl: "https://maps.app.goo.gl/5Xhk8Gb7aodtHMxk7",
          imageUrl: "/manus-storage/ramen_unari_0583120f.webp",
        },
        {
          id: 11,
          name: "Inaba Udon Watanabedori",
          hours: "Weekdays 11:00–22:30 / Sat, Sun & holidays 11:00–19:30",
          description:
            "Soft udon noodles and gentle broth. You can find it anywhere, but here you will find a unique and \"just right\" bowl of udon noodles.",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/inaba_udon_410154f0.webp",
        },
        {
          id: 12,
          name: "Pikamatsu",
          hours: "Closed Sun / 11:30–19:00",
          description:
            "Fukuoka's Sara Udon is different from Nagasaki's in terms of preparation, noodles, and appearance. The \"Hakata-style\" Sara Udon is a dish similar to what is called \"Chanpon\" without soup.",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/pikamatsu_d062abb2.webp",
        },
      ],
    },
    {
      id: "market",
      icon: "🧺",
      title: "Local Market",
      tagline: "Local market full of fun. Let's shop the best quality materials.",
      spots: [
        {
          id: 13,
          name: "Yanagibashi United Market (Kamaboko from Takamatsu)",
          hours: "Varies by vendor",
          description:
            "Feel the vibrant Fukuoka food culture in this traditional market. Takamatsu's kamaboko are filling and plump. The freshly fried \"fish rokke\" are perfect for eating while walking around.",
          mapUrl: "https://maps.app.goo.gl/iyQvj1bNTddiSkJy7",
          imageUrl: "/manus-storage/yanagibashi_c23a0097.webp",
        },
        {
          id: 14,
          name: "TABEGORO Hyakushunkan Watanabe-dori Honten",
          hours: "8:00–21:00",
          description:
            "A professional supermarket run by Meidako \"Fukuya\". Fresh local vegetables, fish, and meat are available, and you can enjoy cooking for yourself or drinking in your room even when traveling. The kokumami miso squid is a white rice stealer!",
          mapUrl: "https://maps.app.goo.gl/chtcyQJKwACoYCvG6",
          imageUrl: "/manus-storage/tabegoro_dc4a81a6.webp",
        },
        {
          id: 15,
          name: "HIGHTIDE STORE FUKUOKA",
          hours: "11:00–19:00",
          description:
            "Directly managed by a stationery and sundry goods manufacturer from Fukuoka, Japan. A \"stationery store where you can stay\" with beer and coffee in the store. Perfect for recording your travels or looking for souvenirs.",
          mapUrl: "https://maps.app.goo.gl/C8EEepg632hKsW6k7",
          imageUrl: "/manus-storage/hightide_38e6510e.webp",
        },
      ],
    },
    {
      id: "culture",
      icon: "⛩",
      title: "Culture Spots",
      tagline: "Indulge yourself and learn the Japanese ways of living",
      spots: [
        {
          id: 16,
          name: "Sumiyoshi Shrine",
          hours: "9:00–17:00",
          description:
            "This prestigious shrine is the origin of the 2,100 Sumiyoshi shrines throughout Japan. Pray for the safety of your trip and say hello to the local deity.",
          mapUrl: "https://maps.app.goo.gl/Mbk1QXfotJVjJf6T7",
          imageUrl: "/manus-storage/sumiyoshi_b027ed2f.webp",
        },
      ],
    },
  ],
  taxiCardTitle: "yah.homes Kiyokawa — Taxi Card",
  taxiCardBody:
    "If you want to tell a cab driver where you are going in Japanese, show this text:",
  taxiCardJapanese:
    "「〒{zip} {addr}　目的地はホテルではなく見た目は普通の一軒家です。」",
  mapListTitle: "Google Map List",
  mapListBody: "All 16 spots are pinned on Google Maps. Scan the QR or tap the link.",
  mapListUrl: "https://maps.app.goo.gl/Q9WvY6tSinSvKEm46",
  downloadPdfLabel: "Download PDF Guide",
  backToHomeLabel: "← Back to Home",
};

// ─── Japanese ────────────────────────────────────────────────────────────────
const ja: LocalsPageData = {
  heroTitle: "ローカルガイド",
  heroSubtitle: "Vol.1 — 福岡・清川",
  introTitle: "おすすめローカルガイド",
  introBody: [
    "福岡の名物といえば、豚骨ラーメン、水炊き、もつ鍋。でも、それだけではありません。",
    "実は福岡、魚の消費量は日本一、鶏肉の消費量も日本一、焼き鳥店の数も日本一。魚も肉も、最高の「日常のごはん」が揃った街なのです。",
    "そんな福岡の「ふつう」を味わい尽くせるのが、中央区の清川。観光地の喧騒から少し離れたこのエリアには、地元の人が通う名店や、感性をくすぐるお店が徒歩圏内に集まっています。",
    "ただ泊まるだけではもったいない。歩いて、食べて、この街に暮らすように過ごしてみてください。福岡の「おかしいほど豊かな日常」を、旅の思い出に加えてもらえたら嬉しいです。",
  ],
  volumeLabel: "version 1.2",
  categories: [
    {
      id: "cafe",
      icon: "☕",
      title: "カフェ＆モーニング",
      tagline: "朝をゆっくり始めたいなら",
      spots: [
        {
          id: 2,
          name: "manucoffee roasters クジラ店",
          hours: "10:00 – 19:00",
          description:
            "天神に3店舗を構える、地元で愛されるストリートスタイルのカフェ。店内にはヒップホップが流れ、コーヒー豆やアパレルなど、お土産にぴったりのアイテムも豊富に揃います。店名は、かつてこの一帯にクジラが回遊してきたという歴史にちなんだもの。",
          mapUrl: "https://maps.app.goo.gl/H2dyhvtKrQjDZt1W6",
          imageUrl: "/manus-storage/manucoffee_3bb3e07b.webp",
        },
        {
          id: 3,
          name: "REC COFFEE 薬院駅前店",
          hours: "月〜木・日・祝 10:00–22:00 / 金・土・祝前日 10:00–24:00",
          description:
            "福岡発のスペシャルティコーヒー専門店。豆のセレクトと充実したフードメニューで、一日の始まりにぴったり。静かに朝をスタートしたい方におすすめです。",
          mapUrl: "https://maps.app.goo.gl/cJsjZjyW2HTdwveCA",
          imageUrl: "/manus-storage/rec_coffee_12eb7910.webp",
        },
        {
          id: 4,
          name: "TAGSTÅ ESPRESSO STAND & GALLERY",
          hours: "毎日 7:00 – 20:00",
          description:
            "アートギャラリーを併設したエスプレッソスタンド。現代アートとコーヒーの組み合わせは、感覚のスイッチが入る朝におすすめです。",
          mapUrl: "https://maps.app.goo.gl/SLYuad9eFQEqhaho7",
          imageUrl: "/manus-storage/tagsta_433b97fb.webp",
        },
        {
          id: 5,
          name: "Chaho Furyu 福岡 JapanTea Studio",
          hours: "木〜日 11:00–18:00 / 月 11:00–17:00 & 18:00–22:00",
          description:
            "日本各地の上質な茶葉を揃えた、茶のマスターが一服の芸を振る舞う空間。お茶のコースを選べば、種類ごとの正しい淹れ方を学ぶこともできます。",
          mapUrl: "https://maps.app.goo.gl/TUujtXQFqMfJK6Ka9",
          imageUrl: "/manus-storage/chaho_furyu_d4c47af9.webp",
        },
      ],
    },
    {
      id: "lunch",
      icon: "🍱",
      title: "ランチ＆ディナー",
      tagline: "地元の味をしっかり味わう",
      spots: [
        {
          id: 6,
          name: "海木 いなり",
          hours: "日・祝休 / 11:00–15:00",
          description:
            "創業35年の日本料理店が手がける、テイクアウト専門の出汁いなり。甘いタレでじっくり煮含めたジューシーなお揚げに、きっと驚くはずです。",
          mapUrl: "https://maps.app.goo.gl/ddYg5igFRknTi3Xh8",
          imageUrl: "/manus-storage/kaiboku_inari_320df6de.webp",
        },
        {
          id: 7,
          name: "アジフライセンター おむこさん",
          hours: "11:30–15:00 / 17:00–22:00",
          description:
            "新鮮なアジを丁寧にさばいて骨を抜き、ふわっと揚げたアジフライの専門店。定食でがっつり食べるもよし、テイクアウトで気軽に楽しむもよし。",
          mapUrl: "https://maps.app.goo.gl/9VkciU1b5789Rs5s6",
          imageUrl: "/manus-storage/aji_fry_568be60b.webp",
        },
        {
          id: 8,
          name: "焼鳥 あたらよ",
          hours: "月〜木 18:00–01:00 / 金〜日 17:00–01:00",
          description:
            "ガラス張りのスタイリッシュな焼鳥店。鶏刺しや焼鳥はもちろん、冷やしピーマン「ワンダーペッパー」もぜひ試してほしい一品。予約がおすすめです。",
          mapUrl: "https://maps.app.goo.gl/sc43YatNZ2PuPWGn9",
          imageUrl: "/manus-storage/yakitori_atarayo_dd0b7dd7.webp",
        },
        {
          id: 9,
          name: "肉が一番",
          hours: "11:00–15:00 / 17:30–23:00",
          description:
            "質のいいお肉を手頃な価格で楽しみたいなら、迷わずここへ。和牛メニューが豊富で、カジュアルながら素材の味をまっすぐ感じられます。",
          mapUrl: "https://maps.app.goo.gl/Udmh6QsjEWaxwUbg8",
          imageUrl: "/manus-storage/niku_ga_ichiban_472aca2f.webp",
        },
        {
          id: 10,
          name: "ラーメン 海鳴 清川店",
          hours: "水曜休 / 18:00–03:00",
          description:
            "豚骨と魚介を合わせた、クセになる独自のスープで人気のお店。ジェノバ風ラーメンなど変わり種メニューも揃い、深夜まで営業しているのも嬉しいところ。",
          mapUrl: "https://maps.app.goo.gl/5Xhk8Gb7aodtHMxk7",
          imageUrl: "/manus-storage/ramen_unari_0583120f.webp",
        },
        {
          id: 11,
          name: "因幡うどん 渡辺通店",
          hours: "平日 11:00–22:30 / 土日祝 11:00–19:30",
          description:
            "やわらかい麺と、やさしい出汁。うどんはどこでも食べられますが、ここには唯一無二の「ちょうどいい」一杯があります。",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/inaba_udon_410154f0.webp",
        },
        {
          id: 12,
          name: "ピカ松",
          hours: "日曜休 / 11:30–19:00",
          description:
            "福岡の皿うどんは、作り方も麺も見た目も長崎のものとは別物。「博多風」皿うどんは、いわばスープのないちゃんぽんのような一品です。",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/pikamatsu_d062abb2.webp",
        },
      ],
    },
    {
      id: "market",
      icon: "🧺",
      title: "ローカルマーケット",
      tagline: "楽しさいっぱいの地元市場で、最高の食材を買い出しに",
      spots: [
        {
          id: 13,
          name: "柳橋連合市場（高松の蒲鉾）",
          hours: "店舗により異なる",
          description:
            "福岡の食文化の活気を肌で感じられる昔ながらの市場。高松の蒲鉾はぷりっとして食べ応え十分。揚げたての「魚ロッケ」は食べ歩きにぴったりです。",
          mapUrl: "https://maps.app.goo.gl/iyQvj1bNTddiSkJy7",
          imageUrl: "/manus-storage/yanagibashi_c23a0097.webp",
        },
        {
          id: 14,
          name: "タベゴロ百旬館 渡辺通本店",
          hours: "8:00–21:00",
          description:
            "明太子の「ふくや」が手がける本格派スーパー。地元の新鮮な野菜・魚・肉が揃い、旅先でも自炊や部屋飲みが楽しめます。こくうまみそいかは、まさにご飯泥棒！",
          mapUrl: "https://maps.app.goo.gl/chtcyQJKwACoYCvG6",
          imageUrl: "/manus-storage/tabegoro_dc4a81a6.webp",
        },
        {
          id: 15,
          name: "HIGHTIDE STORE FUKUOKA",
          hours: "11:00–19:00",
          description:
            "福岡発の文具・雑貨メーカーの直営店。店内でビールやコーヒーも楽しめる「居られる文具店」です。旅の記録をつけたり、お土産探しにもぴったり。",
          mapUrl: "https://maps.app.goo.gl/C8EEepg632hKsW6k7",
          imageUrl: "/manus-storage/hightide_38e6510e.webp",
        },
      ],
    },
    {
      id: "culture",
      icon: "⛩",
      title: "カルチャースポット",
      tagline: "日本の暮らしの文化にふれる",
      spots: [
        {
          id: 16,
          name: "住吉神社",
          hours: "9:00–17:00",
          description:
            "全国に2,100社ある住吉神社の始祖とされる由緒ある神社。旅の安全を祈願して、土地の神様にご挨拶を。",
          mapUrl: "https://maps.app.goo.gl/Mbk1QXfotJVjJf6T7",
          imageUrl: "/manus-storage/sumiyoshi_b027ed2f.webp",
        },
      ],
    },
  ],
  taxiCardTitle: "yah.homes 清川 — タクシーカード",
  taxiCardBody:
    "タクシーの運転手さんに行き先を伝えるときは、この文章を見せてください：",
  taxiCardJapanese:
    "「〒{zip} {addr}　目的地はホテルではなく見た目は普通の一軒家です。」",
  mapListTitle: "Googleマップリスト",
  mapListBody: "全16スポットをGoogleマップにピン留めしています。QRを読み取るか、リンクをタップしてください。",
  mapListUrl: "https://maps.app.goo.gl/Q9WvY6tSinSvKEm46",
  downloadPdfLabel: "PDFガイドをダウンロード",
  backToHomeLabel: "← ホームに戻る",
};

// ─── Korean ──────────────────────────────────────────────────────────────────
const ko: LocalsPageData = {
  heroTitle: "로컬 가이드",
  heroSubtitle: "Vol.1 — 기요카와, 후쿠오카",
  introTitle: "추천 로컬 가이드",
  introBody: [
    "후쿠오카의 명물로는 돈코츠 라멘, 미즈타키, 모츠나베 등이 있습니다. 하지만 그게 전부가 아닙니다.",
    "사실 후쿠오카는 일본에서 생선 소비량이 가장 많고, 닭고기 소비량도 가장 많으며, 야키토리 가게 수도 일본 최다를 자랑합니다. 생선과 고기 모두 최고의 '일상 음식'이 가득한 곳입니다.",
    "주오구의 기요카와는 그런 '평범한' 후쿠오카 음식을 제대로 맛볼 수 있는 동네입니다. 관광지의 번잡함에서 벗어나, 현지인들이 즐겨 찾는 유명 맛집과 감각을 자극하는 가게들이 도보 거리에 모여 있습니다.",
    "그냥 숙박만 하기엔 아깝습니다. 걷고, 먹고, 마치 이 동네에 사는 것처럼 느껴보세요. 후쿠오카의 '풍요로운 일상'을 여행의 추억으로 담아가세요.",
  ],
  volumeLabel: "버전 1.2",
  categories: [
    {
      id: "cafe",
      icon: "☕",
      title: "카페 & 모닝",
      tagline: "여유로운 아침을 원한다면",
      spots: [
        {
          id: 2,
          name: "manucoffee roasters 쿠지라 점",
          hours: "10:00 – 19:00",
          description:
            "텐진에 3개 지점을 둔 스트리트 스타일 카페. 힙합 음악이 흐르는 매장에서 커피 원두와 의류 등 기념품으로 좋은 아이템도 다양하게 구비되어 있습니다. 카페 이름은 예전에 이 지역으로 고래가 이동했던 역사에서 유래했습니다.",
          mapUrl: "https://maps.app.goo.gl/H2dyhvtKrQjDZt1W6",
          imageUrl: "/manus-storage/manucoffee_3bb3e07b.webp",
        },
        {
          id: 3,
          name: "REC COFFEE 야쿠인 에키마에 점",
          hours: "월~목·일·공휴일 10:00–22:00 / 금·토·공휴일 전날 10:00–24:00",
          description:
            "후쿠오카 스페셜티 커피 전문점. 다양한 원두 선택과 풍성한 푸드 메뉴로 아침을 시작하기에 완벽한 장소입니다.",
          mapUrl: "https://maps.app.goo.gl/cJsjZjyW2HTdwveCA",
          imageUrl: "/manus-storage/rec_coffee_12eb7910.webp",
        },
        {
          id: 4,
          name: "TAGSTÅ ESPRESSO STAND & GALLERY",
          hours: "매일 7:00 – 20:00",
          description:
            "아트 갤러리를 겸한 에스프레소 스탠드. 현대 미술과 커피의 조합은 감각이 깨어나는 아침에 특히 추천합니다.",
          mapUrl: "https://maps.app.goo.gl/SLYuad9eFQEqhaho7",
          imageUrl: "/manus-storage/tagsta_433b97fb.webp",
        },
        {
          id: 5,
          name: "Chaho Furyu 후쿠오카 JapanTea Studio",
          hours: "목~일 11:00–18:00 / 월 11:00–17:00 & 18:00–22:00",
          description:
            "일본 각지의 고급 차를 갖춘 다도 공간. 코스를 선택하면 차 종류별 올바른 우리는 방법을 배울 수 있습니다.",
          mapUrl: "https://maps.app.goo.gl/TUujtXQFqMfJK6Ka9",
          imageUrl: "/manus-storage/chaho_furyu_d4c47af9.webp",
        },
      ],
    },
    {
      id: "lunch",
      icon: "🍱",
      title: "런치 & 디너",
      tagline: "로컬의 진짜 맛을 경험하세요",
      spots: [
        {
          id: 6,
          name: "카이보쿠 이나리",
          hours: "일·공휴일 휴무 / 11:00–15:00",
          description:
            "35년 전통의 다시 이나리 전문 포장 음식점. 달콤한 소스에 조린 촉촉한 유부초밥에 놀라게 될 것입니다.",
          mapUrl: "https://maps.app.goo.gl/ddYg5igFRknTi3Xh8",
          imageUrl: "/manus-storage/kaiboku_inari_320df6de.webp",
        },
        {
          id: 7,
          name: "아지후라이 센터 오무코상",
          hours: "11:30–15:00 / 17:00–22:00",
          description:
            "신선한 전갱이를 정성스럽게 손질해 바삭하게 튀긴 아지후라이 전문점. 정식으로 든든하게 먹거나 테이크아웃으로 가볍게 즐길 수 있습니다.",
          mapUrl: "https://maps.app.goo.gl/9VkciU1b5789Rs5s6",
          imageUrl: "/manus-storage/aji_fry_568be60b.webp",
        },
        {
          id: 8,
          name: "야키토리 아타라요",
          hours: "월~목 18:00–01:00 / 금~일 17:00–01:00",
          description:
            "유리벽이 인상적인 세련된 야키토리 레스토랑. 닭 사시미와 야키토리 외에 차가운 청피망 '원더페퍼'도 꼭 맛보세요. 예약 추천.",
          mapUrl: "https://maps.app.goo.gl/sc43YatNZ2PuPWGn9",
          imageUrl: "/manus-storage/yakitori_atarayo_dd0b7dd7.webp",
        },
        {
          id: 9,
          name: "니쿠가 이치반",
          hours: "11:00–15:00 / 17:30–23:00",
          description:
            "합리적인 가격에 고품질 와규를 맛볼 수 있는 곳. 캐주얼하지만 순수한 맛의 와규 요리를 다양하게 즐길 수 있습니다.",
          mapUrl: "https://maps.app.goo.gl/Udmh6QsjEWaxwUbg8",
          imageUrl: "/manus-storage/niku_ga_ichiban_472aca2f.webp",
        },
        {
          id: 10,
          name: "라멘 우나리 기요카와",
          hours: "수요일 휴무 / 18:00–03:00",
          description:
            "돈코츠(돼지뼈)와 해산물의 독특하고 중독성 있는 국물로 인기 있는 라멘집. 제노베제 스타일 라멘 등 다양한 메뉴가 있으며 심야에도 영업합니다.",
          mapUrl: "https://maps.app.goo.gl/5Xhk8Gb7aodtHMxk7",
          imageUrl: "/manus-storage/ramen_unari_0583120f.webp",
        },
        {
          id: 11,
          name: "이나바 우동 와타나베도리",
          hours: "평일 11:00–22:30 / 토·일·공휴일 11:00–19:30",
          description:
            "부드러운 면과 은은한 국물의 우동. 어디서나 먹을 수 있는 음식이지만, 이곳에서는 '딱 맞는' 한 그릇을 만날 수 있습니다.",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/inaba_udon_410154f0.webp",
        },
        {
          id: 12,
          name: "피카마츠",
          hours: "일요일 휴무 / 11:30–19:00",
          description:
            "후쿠오카의 사라우동은 나가사키식과 다릅니다. '하카타식' 사라우동은 국물 없는 짬뽕과 비슷한 요리로 후쿠오카만의 독특한 맛을 자랑합니다.",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/pikamatsu_d062abb2.webp",
        },
      ],
    },
    {
      id: "market",
      icon: "🧺",
      title: "로컬 마켓",
      tagline: "즐거움 가득한 로컬 마켓에서 최고의 식재료를 쇼핑하세요",
      spots: [
        {
          id: 13,
          name: "야나기바시 연합 시장 (다카마츠 어묵)",
          hours: "점포별 상이",
          description:
            "활기찬 후쿠오카 식문화를 느낄 수 있는 전통 시장. 다카마츠의 어묵은 탱글탱글하고 풍성합니다. 갓 튀긴 '피시 로케'는 걸어 다니며 먹기에 딱 좋습니다.",
          mapUrl: "https://maps.app.goo.gl/iyQvj1bNTddiSkJy7",
          imageUrl: "/manus-storage/yanagibashi_c23a0097.webp",
        },
        {
          id: 14,
          name: "TABEGORO 햐쿠슌칸 와타나베도리 본점",
          hours: "8:00–21:00",
          description:
            "명태코 '후쿠야'가 운영하는 전문 슈퍼마켓. 신선한 현지 채소, 생선, 고기를 구입해 숙소에서 직접 요리하거나 한잔 즐길 수 있습니다. 코쿠마미 미소 오징어는 밥도둑입니다!",
          mapUrl: "https://maps.app.goo.gl/chtcyQJKwACoYCvG6",
          imageUrl: "/manus-storage/tabegoro_dc4a81a6.webp",
        },
        {
          id: 15,
          name: "HIGHTIDE STORE FUKUOKA",
          hours: "11:00–19:00",
          description:
            "후쿠오카 문구·잡화 제조업체 직영점. 맥주와 커피를 즐기며 머물 수 있는 '문구점'. 여행 기록이나 기념품 쇼핑에 완벽합니다.",
          mapUrl: "https://maps.app.goo.gl/C8EEepg632hKsW6k7",
          imageUrl: "/manus-storage/hightide_38e6510e.webp",
        },
      ],
    },
    {
      id: "culture",
      icon: "⛩",
      title: "문화 스팟",
      tagline: "일본의 생활 방식에 흠뻑 빠져보세요",
      spots: [
        {
          id: 16,
          name: "스미요시 신사",
          hours: "9:00–17:00",
          description:
            "일본 전국 2,100개 스미요시 신사의 발상지. 여행의 안전을 기원하고 지역 신에게 인사를 건네보세요.",
          mapUrl: "https://maps.app.goo.gl/Mbk1QXfotJVjJf6T7",
          imageUrl: "/manus-storage/sumiyoshi_b027ed2f.webp",
        },
      ],
    },
  ],
  taxiCardTitle: "yah.homes 기요카와 — 택시 카드",
  taxiCardBody: "택시 기사에게 목적지를 일본어로 알려주고 싶다면 이 문장을 보여주세요:",
  taxiCardJapanese:
    "「〒{zip} {addr}　目的地はホテルではなく見た目は普通の一軒家です。」",
  mapListTitle: "구글 맵 리스트",
  mapListBody: "16개 스팟이 모두 구글 맵에 핀으로 표시되어 있습니다. QR을 스캔하거나 링크를 탭하세요.",
  mapListUrl: "https://maps.app.goo.gl/Q9WvY6tSinSvKEm46",
  downloadPdfLabel: "PDF 가이드 다운로드",
  backToHomeLabel: "← 홈으로 돌아가기",
};

// ─── Traditional Chinese ─────────────────────────────────────────────────────
const zh: LocalsPageData = {
  heroTitle: "在地指南",
  heroSubtitle: "Vol.1 — 清川，福岡",
  introTitle: "推薦在地指南",
  introBody: [
    "說到福岡的名物，大家會想到豚骨拉麵、水炊鍋、內臟鍋……但這些只是冰山一角。",
    "其實，福岡是日本魚類消費量最多、雞肉消費量最大、烤雞串店數量最多的城市。無論是魚還是肉，這裡都有最頂級的「日常料理」。",
    "中央區的清川，正是能真正品嚐這種「普通」福岡美食的地方。遠離觀光區的喧囂，步行範圍內就有許多當地人常去的名店，以及令人感官大開的商店。",
    "只是住在這裡太可惜了。走走、吃吃，感受彷彿生活在這個街區的氛圍，把福岡「豐富得令人發笑的日常生活」帶回你的旅行記憶中。",
  ],
  volumeLabel: "版本 1.2",
  categories: [
    {
      id: "cafe",
      icon: "☕",
      title: "咖啡廳 & 早晨",
      tagline: "想要悠閒開始早晨的你",
      spots: [
        {
          id: 2,
          name: "manucoffee roasters 鯨魚店",
          hours: "10:00 – 19:00",
          description:
            "天神地區擁有三家分店的街頭風格咖啡廳。店內播放嘻哈音樂，咖啡豆和服飾等伴手禮選擇豐富。店名源自鯨魚曾經洄游至此地的歷史。",
          mapUrl: "https://maps.app.goo.gl/H2dyhvtKrQjDZt1W6",
          imageUrl: "/manus-storage/manucoffee_3bb3e07b.webp",
        },
        {
          id: 3,
          name: "REC COFFEE 藥院站前店",
          hours: "週一至四、日及假日 10:00–22:00 / 週五、六及假日前夕 10:00–24:00",
          description:
            "福岡精品咖啡專門店。豐富的豆款選擇與完整的餐點菜單，是開啟美好早晨的最佳場所。",
          mapUrl: "https://maps.app.goo.gl/cJsjZjyW2HTdwveCA",
          imageUrl: "/manus-storage/rec_coffee_12eb7910.webp",
        },
        {
          id: 4,
          name: "TAGSTÅ ESPRESSO STAND & GALLERY",
          hours: "每日 7:00 – 20:00",
          description:
            "附設藝廊的義式濃縮咖啡站。當代藝術與咖啡的組合，特別推薦在感官清醒的早晨前往。",
          mapUrl: "https://maps.app.goo.gl/SLYuad9eFQEqhaho7",
          imageUrl: "/manus-storage/tagsta_433b97fb.webp",
        },
        {
          id: 5,
          name: "Chaho Furyu 福岡 JapanTea Studio",
          hours: "週四至日 11:00–18:00 / 週一 11:00–17:00 & 18:00–22:00",
          description:
            "匯集日本各地高級茶葉的茶道空間。選擇茶道課程，可以學習各類茶葉的正確沖泡方式。",
          mapUrl: "https://maps.app.goo.gl/TUujtXQFqMfJK6Ka9",
          imageUrl: "/manus-storage/chaho_furyu_d4c47af9.webp",
        },
      ],
    },
    {
      id: "lunch",
      icon: "🍱",
      title: "午餐 & 晚餐",
      tagline: "品嚐道地在地風味",
      spots: [
        {
          id: 6,
          name: "海木稻荷",
          hours: "週日及假日公休 / 11:00–15:00",
          description:
            "擁有35年歷史的外帶高湯稻荷壽司專門店。用甜醬汁燉煮的多汁豆皮，保證讓你驚艷。",
          mapUrl: "https://maps.app.goo.gl/ddYg5igFRknTi3Xh8",
          imageUrl: "/manus-storage/kaiboku_inari_320df6de.webp",
        },
        {
          id: 7,
          name: "鯵炸中心 御向桑",
          hours: "11:30–15:00 / 17:00–22:00",
          description:
            "新鮮竹筴魚精心處理後炸至蓬鬆完美。可選擇定食套餐飽足享用，或外帶輕鬆品嚐。",
          mapUrl: "https://maps.app.goo.gl/9VkciU1b5789Rs5s6",
          imageUrl: "/manus-storage/aji_fry_568be60b.webp",
        },
        {
          id: 8,
          name: "烤雞串 當夜",
          hours: "週一至四 18:00–01:00 / 週五至日 17:00–01:00",
          description:
            "玻璃牆設計的時尚烤雞串餐廳。除了雞肉生魚片和烤雞串，冰鎮青椒「神奇椒」也是必點。建議預約。",
          mapUrl: "https://maps.app.goo.gl/sc43YatNZ2PuPWGn9",
          imageUrl: "/manus-storage/yakitori_atarayo_dd0b7dd7.webp",
        },
        {
          id: 9,
          name: "肉が一番",
          hours: "11:00–15:00 / 17:30–23:00",
          description:
            "想以實惠價格品嚐優質肉品，這家店絕對不能錯過。提供多樣化的和牛料理，風格休閒卻味道純粹。",
          mapUrl: "https://maps.app.goo.gl/Udmh6QsjEWaxwUbg8",
          imageUrl: "/manus-storage/niku_ga_ichiban_472aca2f.webp",
        },
        {
          id: 10,
          name: "拉麵 唸鳴 清川",
          hours: "週三公休 / 18:00–03:00",
          description:
            "以豚骨與海鮮獨特湯底著稱的人氣拉麵店。還提供熱那亞風味拉麵等多種選擇，深夜也照常營業。",
          mapUrl: "https://maps.app.goo.gl/5Xhk8Gb7aodtHMxk7",
          imageUrl: "/manus-storage/ramen_unari_0583120f.webp",
        },
        {
          id: 11,
          name: "稻葉烏龍麵 渡邊通",
          hours: "平日 11:00–22:30 / 週六、日及假日 11:00–19:30",
          description:
            "柔軟的麵條與溫和的湯頭。雖然烏龍麵隨處可見，但這裡有著獨特而「恰到好處」的一碗。",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/inaba_udon_410154f0.webp",
        },
        {
          id: 12,
          name: "Pikamatsu",
          hours: "週日公休 / 11:30–19:00",
          description:
            "福岡的皿烏龍與長崎式不同。「博多式」皿烏龍是一道類似無湯汁強棒麵的料理，是福岡獨有的美食。",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/pikamatsu_d062abb2.webp",
        },
      ],
    },
    {
      id: "market",
      icon: "🧺",
      title: "在地市場",
      tagline: "充滿樂趣的在地市場，讓我們選購最優質的食材",
      spots: [
        {
          id: 13,
          name: "柳橋聯合市場（高松魚板）",
          hours: "各攤位不同",
          description:
            "感受充滿活力的福岡飲食文化的傳統市場。高松的魚板飽滿多汁，現炸的「魚肉可樂餅」非常適合邊走邊吃。",
          mapUrl: "https://maps.app.goo.gl/iyQvj1bNTddiSkJy7",
          imageUrl: "/manus-storage/yanagibashi_c23a0097.webp",
        },
        {
          id: 14,
          name: "TABEGORO 百旬館 渡邊通本店",
          hours: "8:00–21:00",
          description:
            "由明太子「福屋」經營的專業超市。新鮮的當地蔬菜、魚類和肉類一應俱全，旅行時也能在房間自炊或小酌。黑豆味噌魷魚是白飯殺手！",
          mapUrl: "https://maps.app.goo.gl/chtcyQJKwACoYCvG6",
          imageUrl: "/manus-storage/tabegoro_dc4a81a6.webp",
        },
        {
          id: 15,
          name: "HIGHTIDE STORE FUKUOKA",
          hours: "11:00–19:00",
          description:
            "福岡文具雜貨製造商直營店。店內提供啤酒和咖啡，是一家「可以久待的文具店」。非常適合記錄旅行或尋找伴手禮。",
          mapUrl: "https://maps.app.goo.gl/C8EEepg632hKsW6k7",
          imageUrl: "/manus-storage/hightide_38e6510e.webp",
        },
      ],
    },
    {
      id: "culture",
      icon: "⛩",
      title: "文化景點",
      tagline: "沉浸其中，感受日本的生活方式",
      spots: [
        {
          id: 16,
          name: "住吉神社",
          hours: "9:00–17:00",
          description:
            "日本全國2,100座住吉神社的發祥地。祈求旅途平安，向當地守護神打聲招呼吧。",
          mapUrl: "https://maps.app.goo.gl/Mbk1QXfotJVjJf6T7",
          imageUrl: "/manus-storage/sumiyoshi_b027ed2f.webp",
        },
      ],
    },
  ],
  taxiCardTitle: "yah.homes 清川 — 計程車卡",
  taxiCardBody: "如果想用日文告訴計程車司機目的地，請出示以下文字：",
  taxiCardJapanese:
    "「〒{zip} {addr}　目的地はホテルではなく見た目は普通の一軒家です。」",
  mapListTitle: "Google 地圖清單",
  mapListBody: "所有16個景點都已標記在 Google 地圖上。掃描 QR 碼或點擊連結。",
  mapListUrl: "https://maps.app.goo.gl/Q9WvY6tSinSvKEm46",
  downloadPdfLabel: "下載 PDF 指南",
  backToHomeLabel: "← 返回首頁",
};

// ─── Thai ─────────────────────────────────────────────────────────────────────
const th: LocalsPageData = {
  heroTitle: "คู่มือท้องถิ่น",
  heroSubtitle: "Vol.1 — คิโยคาวะ, ฟุกุโอกะ",
  introTitle: "คู่มือท้องถิ่นแนะนำ",
  introBody: [
    "เมื่อพูดถึงฟุกุโอกะ หลายคนนึกถึงราเมนทงคตสึ มิซุทากิ และโมสึนาเบะ แต่นั่นยังไม่ใช่ทั้งหมด",
    "ความจริงแล้ว ฟุกุโอกะมีจำนวนร้านปลาสดมากที่สุดในญี่ปุ่น บริโภคเนื้อไก่มากที่สุด และมีร้านยากิโทริมากที่สุดในประเทศ ทั้งปลาและเนื้อ ล้วนเป็น \"อาหารประจำวัน\" ระดับสุดยอด",
    "คิโยคาวะในชูโอกุ คือย่านที่คุณจะได้สัมผัสรสชาติ \"ปกติ\" ของฟุกุโอกะอย่างแท้จริง ห่างจากความวุ่นวายของย่านท่องเที่ยว แต่เดินถึงร้านอาหารชื่อดังที่คนท้องถิ่นชื่นชอบและร้านค้าที่กระตุ้นประสาทสัมผัส",
    "แค่พักอยู่ที่นี่คงไม่พอ เดิน กิน และรู้สึกราวกับว่าคุณอาศัยอยู่ในย่านนี้ เก็บ \"ชีวิตประจำวันอันอุดมสมบูรณ์\" ของฟุกุโอกะไว้เป็นความทรงจำในการเดินทาง",
  ],
  volumeLabel: "เวอร์ชัน 1.2",
  categories: [
    {
      id: "cafe",
      icon: "☕",
      title: "คาเฟ่ & เช้า",
      tagline: "สำหรับผู้ที่อยากเริ่มเช้าอย่างช้าๆ",
      spots: [
        {
          id: 2,
          name: "manucoffee roasters สาขา Kujira",
          hours: "10:00 – 19:00",
          description:
            "คาเฟ่สไตล์สตรีทที่มี 3 สาขาในเทนจิน เปิดเพลงฮิปฮอปในร้าน มีสินค้าหลากหลายเหมาะเป็นของฝาก ทั้งเมล็ดกาแฟและเสื้อผ้า ชื่อร้านมาจากประวัติศาสตร์ที่วาฬเคยอพยพมายังบริเวณนี้",
          mapUrl: "https://maps.app.goo.gl/H2dyhvtKrQjDZt1W6",
          imageUrl: "/manus-storage/manucoffee_3bb3e07b.webp",
        },
        {
          id: 3,
          name: "REC COFFEE สาขา Yakuin Ekimae",
          hours: "จ-พฤ อา และวันหยุด 10:00–22:00 / ศ ส และวันก่อนหยุด 10:00–24:00",
          description:
            "ร้านกาแฟสเปเชียลตี้จากฟุกุโอกะ เมล็ดกาแฟหลากหลายและเมนูอาหารครบครัน เหมาะสำหรับเริ่มต้นเช้าอย่างสงบ",
          mapUrl: "https://maps.app.goo.gl/cJsjZjyW2HTdwveCA",
          imageUrl: "/manus-storage/rec_coffee_12eb7910.webp",
        },
        {
          id: 4,
          name: "TAGSTÅ ESPRESSO STAND & GALLERY",
          hours: "ทุกวัน 7:00 – 20:00",
          description:
            "แผงเอสเปรสโซพร้อมแกลเลอรีศิลปะ การผสมผสานระหว่างศิลปะร่วมสมัยและกาแฟ แนะนำเป็นพิเศษสำหรับเช้าที่ประสาทสัมผัสตื่นตัว",
          mapUrl: "https://maps.app.goo.gl/SLYuad9eFQEqhaho7",
          imageUrl: "/manus-storage/tagsta_433b97fb.webp",
        },
        {
          id: 5,
          name: "Chaho Furyu Fukuoka JapanTea Studio",
          hours: "พฤ-อา 11:00–18:00 / จ 11:00–17:00 & 18:00–22:00",
          description:
            "พื้นที่ชาโดะที่รวบรวมชาคุณภาพสูงจากทั่วญี่ปุ่น เลือกคอร์สชาเพื่อเรียนรู้วิธีชงชาที่ถูกต้องตามประเภท",
          mapUrl: "https://maps.app.goo.gl/TUujtXQFqMfJK6Ka9",
          imageUrl: "/manus-storage/chaho_furyu_d4c47af9.webp",
        },
      ],
    },
    {
      id: "lunch",
      icon: "🍱",
      title: "กลางวัน & เย็น",
      tagline: "สัมผัสรสชาติท้องถิ่นอย่างแท้จริง",
      spots: [
        {
          id: 6,
          name: "Kaiboku Inari",
          hours: "ปิดอา & วันหยุด / 11:00–15:00",
          description:
            "ร้านอาหารญี่ปุ่นอายุ 35 ปี เชี่ยวชาญอินาริซูชิสูตรดาชิแบบซื้อกลับบ้าน คุณจะประหลาดใจกับเต้าหู้ทอดฉ่ำที่ตุ๋นในซอสหวาน",
          mapUrl: "https://maps.app.goo.gl/ddYg5igFRknTi3Xh8",
          imageUrl: "/manus-storage/kaiboku_inari_320df6de.webp",
        },
        {
          id: 7,
          name: "Aji fry center Omukosan",
          hours: "11:30–15:00 / 17:00–22:00",
          description:
            "ปลาอาจิสดถูกตัดและแล่อย่างพิถีพิถัน ทอดจนกรอบนอกนุ่มใน เพลิดเพลินกับเซ็ตอาหารหรือซื้อกลับบ้าน",
          mapUrl: "https://maps.app.goo.gl/9VkciU1b5789Rs5s6",
          imageUrl: "/manus-storage/aji_fry_568be60b.webp",
        },
        {
          id: 8,
          name: "Yakitori Atarayo",
          hours: "จ-พฤ 18:00–01:00 / ศ-อา 17:00–01:00",
          description:
            "ร้านยากิโทริสไตล์ทันสมัยพร้อมผนังกระจก นอกจากซาชิมิไก่และยากิโทริ พริกเขียวเย็น Wonder Pepper ก็ต้องลอง แนะนำให้จองล่วงหน้า",
          mapUrl: "https://maps.app.goo.gl/sc43YatNZ2PuPWGn9",
          imageUrl: "/manus-storage/yakitori_atarayo_dd0b7dd7.webp",
        },
        {
          id: 9,
          name: "Niku ga Ichiban",
          hours: "11:00–15:00 / 17:30–23:00",
          description:
            "หากต้องการลองเนื้อคุณภาพดีในราคาสมเหตุสมผล ร้านนี้คือคำตอบ มีเมนูวากิวหลากหลายในสไตล์ลำลองแต่รสชาติบริสุทธิ์",
          mapUrl: "https://maps.app.goo.gl/Udmh6QsjEWaxwUbg8",
          imageUrl: "/manus-storage/niku_ga_ichiban_472aca2f.webp",
        },
        {
          id: 10,
          name: "Ramen Unari Kiyokawa",
          hours: "ปิดพุธ / 18:00–03:00",
          description:
            "ร้านราเมนยอดนิยมที่มีน้ำซุปทงคตสึและอาหารทะเลเป็นเอกลักษณ์ มีราเมนหลายสไตล์รวมถึงสไตล์เจนัว และเปิดถึงดึก",
          mapUrl: "https://maps.app.goo.gl/5Xhk8Gb7aodtHMxk7",
          imageUrl: "/manus-storage/ramen_unari_0583120f.webp",
        },
        {
          id: 11,
          name: "Inaba Udon Watanabedori",
          hours: "วันธรรมดา 11:00–22:30 / ส อา & วันหยุด 11:00–19:30",
          description:
            "เส้นอุด้งนุ่มและน้ำซุปอ่อนโยน หาได้ทั่วไปแต่ที่นี่มีชามที่ \"พอดี\" อย่างเป็นเอกลักษณ์",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/inaba_udon_410154f0.webp",
        },
        {
          id: 12,
          name: "Pikamatsu",
          hours: "ปิดอา / 11:30–19:00",
          description:
            "ซาราอุด้งสไตล์ฮากาตะต่างจากนางาซากิ เป็นเมนูคล้ายจัมปงแต่ไม่มีน้ำซุป เป็นอาหารเฉพาะของฟุกุโอกะ",
          mapUrl: "https://maps.app.goo.gl/X83GgtJ4Eds3qkZu7",
          imageUrl: "/manus-storage/pikamatsu_d062abb2.webp",
        },
      ],
    },
    {
      id: "market",
      icon: "🧺",
      title: "ตลาดท้องถิ่น",
      tagline: "ตลาดท้องถิ่นที่เต็มไปด้วยความสนุก มาช้อปวัตถุดิบคุณภาพดีที่สุดกัน",
      spots: [
        {
          id: 13,
          name: "ตลาดรวม Yanagibashi (คามาโบโกะจาก Takamatsu)",
          hours: "แตกต่างตามร้านค้า",
          description:
            "สัมผัสวัฒนธรรมอาหารฟุกุโอกะที่คึกคักในตลาดดั้งเดิมแห่งนี้ คามาโบโกะของ Takamatsu อิ่มและอวบ ปลาทอดสด \"Fish Rokke\" เหมาะสำหรับกินเดินเที่ยว",
          mapUrl: "https://maps.app.goo.gl/iyQvj1bNTddiSkJy7",
          imageUrl: "/manus-storage/yanagibashi_c23a0097.webp",
        },
        {
          id: 14,
          name: "TABEGORO Hyakushunkan Watanabe-dori Honten",
          hours: "8:00–21:00",
          description:
            "ซูเปอร์มาร์เก็ตระดับมืออาชีพที่บริหารโดย Meidako \"Fukuya\" มีผัก ปลา และเนื้อสดจากท้องถิ่น ทำอาหารเองหรือดื่มในห้องพักได้แม้ขณะเดินทาง ปลาหมึกมิโซะโคคุมามิเป็นตัวขโมยข้าว!",
          mapUrl: "https://maps.app.goo.gl/chtcyQJKwACoYCvG6",
          imageUrl: "/manus-storage/tabegoro_dc4a81a6.webp",
        },
        {
          id: 15,
          name: "HIGHTIDE STORE FUKUOKA",
          hours: "11:00–19:00",
          description:
            "ร้านโดยตรงจากผู้ผลิตเครื่องเขียนและของใช้จากฟุกุโอกะ \"ร้านเครื่องเขียนที่คุณอยู่ได้\" พร้อมเบียร์และกาแฟในร้าน เหมาะสำหรับบันทึกการเดินทางหรือหาของฝาก",
          mapUrl: "https://maps.app.goo.gl/C8EEepg632hKsW6k7",
          imageUrl: "/manus-storage/hightide_38e6510e.webp",
        },
      ],
    },
    {
      id: "culture",
      icon: "⛩",
      title: "สถานที่ทางวัฒนธรรม",
      tagline: "ดื่มด่ำและเรียนรู้วิถีชีวิตแบบญี่ปุ่น",
      spots: [
        {
          id: 16,
          name: "ศาลเจ้าสุมิโยชิ",
          hours: "9:00–17:00",
          description:
            "ต้นกำเนิดของศาลเจ้าสุมิโยชิ 2,100 แห่งทั่วญี่ปุ่น ขอพรความปลอดภัยในการเดินทางและทักทายเทพเจ้าท้องถิ่น",
          mapUrl: "https://maps.app.goo.gl/Mbk1QXfotJVjJf6T7",
          imageUrl: "/manus-storage/sumiyoshi_b027ed2f.webp",
        },
      ],
    },
  ],
  taxiCardTitle: "yah.homes คิโยคาวะ — บัตรแท็กซี่",
  taxiCardBody: "หากต้องการบอกคนขับแท็กซี่เป็นภาษาญี่ปุ่น ให้แสดงข้อความนี้:",
  taxiCardJapanese:
    "「〒{zip} {addr}　目的地はホテルではなく見た目は普通の一軒家です。」",
  mapListTitle: "รายการ Google Maps",
  mapListBody: "สปอต 16 แห่งทั้งหมดถูกปักหมุดบน Google Maps สแกน QR หรือแตะลิงก์",
  mapListUrl: "https://maps.app.goo.gl/Q9WvY6tSinSvKEm46",
  downloadPdfLabel: "ดาวน์โหลด PDF Guide",
  backToHomeLabel: "← กลับหน้าหลัก",
};

export const localsData: Record<Lang, LocalsPageData> = { en, ja, ko, zh, th };
