// yah.homes FAQ データ — 旧 FAQSection.tsx から逐語移植（4言語×15問）
// 出典: _reference_original/client/src/components/FAQSection.tsx

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqData {
  title: string;
  categories: {
    label: string;
    items: FaqItem[];
  }[];
}

export const faqData: Record<string, FaqData> = {
  ja: {
    title: "よくあるご質問",
    categories: [
      {
        label: "物件について",
        items: [
          {
            q: "清川と高砂の違いは何ですか？",
            a: "清川は最大{kcap}名・ダブルベッド{kbd}台+シングルベッド{kbs}台・専用駐車場つきで、那珂川沿いに佇む立地です。高砂は最大{tcap}名で、薬院・渡辺通駅から徒歩圏の住宅街にあります。どちらも新築の一棟貸しで、フルキッチンとシモンズ製プレミアムマットレスを備えています。",
          },
          {
            q: "完全な一棟貸しですか？ほかのゲストが入ることはありますか？",
            a: "はい、清川・高砂とも1日1組限定・一軒家を丸ごと貸切でお使いいただく100%プライベートな一棟貸しです。滞在中にほかのゲストやホストが立ち入ることはありません。",
          },
          {
            q: "どんな旅行に向いていますか？",
            a: "寝室が分かれておりトイレも2つあるため、家族旅行・3世代旅行に特に人気です。高砂は洗面台が3つあり、朝の支度が重なる女子旅にも好評。卒業旅行や社員旅行などのグループ利用、ワークデスク完備でワーケーションにも向いています。1日1組・一軒家丸ごと貸切なので、周りに気兼ねなくお過ごしいただけます。",
          },
          {
            q: "家族旅行に向いていますか？",
            a: "はい、最も人気の使い方です。寝室が分かれておりトイレも2つあるため、小さなお子さま連れや3世代旅行でも気兼ねなく過ごせます。無料の専用駐車場つきなので、荷物の多い家族旅行でも車で玄関先まで直接アクセスできます（高砂は大型ミニバンも駐車可）。",
          },
          {
            q: "グループ旅行に向いていますか？",
            a: "はい。リビングダイニングに全員で集まれるのが一棟貸しの醍醐味です。コンロ・大型冷蔵庫・調理器具・食器を揃えたフルキッチン完備で、柳橋連合市場などで買い出しして皆で料理を楽しむ滞在が人気です。卒業旅行・女子旅・社員旅行にもどうぞ。",
          },
          {
            q: "最大何名まで泊まれますか？",
            a: "清川は最大{kcap}名、高砂は最大{tcap}名です。定員を超えるご宿泊はできません。",
          },
          {
            q: "バリアフリー対応ですか？",
            a: "どちらも3階建てで屋内階段があり、バリアフリーではありません。浴室は清川が1階、高砂が2階にあります。ご年配の方や小さなお子さま連れの場合は階段にご注意ください。ご不安な点は予約前にお問い合わせください。",
          },
          {
            q: "駐車場はありますか？大型車も停められますか？",
            a: "はい——どちらも無料の専用駐車場1台分つきです。高砂は大型ミニバン（トヨタ・アルファード実績あり）も駐車可能。清川はコンパクト〜スタンダードサイズまでで、大型車は近隣のコインパーキング（1泊約800円〜）をご利用ください。",
          },
          {
            q: "福岡で7人が一緒に泊まれる宿はありますか？",
            a: "yah.homes清川は、新築一棟貸しの家に最大{kcap}名までご宿泊いただけます（寝室{krooms}室・ダブル{kbd}台+シングル{kbs}台）。{tcap}名までのグループには高砂もご利用いただけます。",
          },
          {
            q: "福岡で6人で泊まれるヴィラはありますか？",
            a: "はい。yah.homes高砂は最大{tcap}名の一棟貸しヴィラです。寝室{trooms}室（ダブル{tbd}台+シングル{tbs}台）・トイレ{ttoilet}つ・洗面台{tsink}つで、6人グループでも朝の支度が渋滞しません。渡辺通駅から徒歩{tstation}分の都心立地。{kcap}名なら清川（最大{kcap}名）をご利用ください。",
          },
          {
            q: "天神や博多駅の近くに一棟貸しの宿はありますか？最寄り駅はどこですか？",
            a: "はい。どちらも福岡市中心部にあります。高砂は渡辺通駅1番出口から徒歩{tstation}分で、薬院も徒歩圏です。清川は渡辺通駅1番出口から徒歩{kstation}分——タクシーまたはレンタカーがおすすめです（天神まで車で約8分）。",
          },
          {
            q: "福岡の街中・都心部に一棟貸しの宿はありますか？",
            a: "はい。yah.homesは福岡の都心部（中央区）にある一棟貸し・貸別荘タイプのヴィラです。清川（中央区清川・最大{kcap}名・寝室{krooms}室・天神まで車で約8分）と高砂（中央区高砂・最大{tcap}名・渡辺通駅徒歩{tstation}分）の2棟で、どちらもセキュリティロックによる非対面のセルフチェックイン。中洲・キャナルシティ博多・柳橋連合市場へも徒歩圏です。",
          },
          {
            q: "1泊いくらですか？どこで予約できますか？",
            a: "料金はシーズン・曜日・人数により変動します。各物件ページの予約カレンダー（公式サイト）またはAirbnbに日付を入力すると正確な料金が表示されます。清掃料金や最低泊数は各物件ページの予約条件をご確認ください。",
          },
        ],
      },
      {
        label: "チェックイン・チェックアウト",
        items: [
          {
            q: "チェックイン・チェックアウトの時間は？",
            a: "チェックイン: {ci}〜（時間の制限はありません）／ チェックアウト: {co}まで。",
          },
          {
            q: "セルフチェックインはできますか？",
            a: "はい。どちらもセキュリティロックを採用しています。解錠コードは、公式サイトからのご予約ならメールで、Airbnb・Booking.com からのご予約なら各サービスのメッセージで、ご到着の前日にお送りします。対面での受け渡しはありません。到着時刻の制限もないため、深夜のご到着でも問題ありません。",
          },
          {
            q: "福岡空港から宿までのアクセスは？",
            a: "福岡空港（国際線ターミナル）から清川まで車で約{kairport}分（タクシー約2,000〜2,500円）、地下鉄+徒歩で約25分。高砂まで車で約{tairport}分です。博多駅からはどちらも徒歩約25分です。",
          },
        ],
      },
      {
        label: "設備・ハウスルール",
        items: [
          {
            q: "どんな設備・アメニティがありますか？",
            a: "両物件共通: 高速Wi-Fi、シモンズ製プレミアムマットレス、フルキッチン（コンロ・冷蔵庫・電子レンジ・炊飯器・食器洗い機）、洗濯機、全室エアコン、スマートTV、洗面用具、タオル、寝具一式。",
          },
          {
            q: "タオルは何枚ありますか？",
            a: "ゲスト1名につきバスタオル1枚とフェイスタオル1枚をご用意しています。追加が必要な場合は事前にメッセージでご相談ください（追加料金がかかる場合があります）。どちらも洗濯機（清川は乾燥機能つきドラム式）があるので、長期滞在時は洗濯もできます。",
          },
          {
            q: "近くにコンビニやスーパーはありますか？",
            a: "はい。高砂: セブンイレブンとローソンが徒歩約2分、100円ショップのセリアとスーパーのサニーが徒歩約5分。清川: ローソンが徒歩約2分、ドラッグストアも徒歩圏です。",
          },
          {
            q: "ペットは同伴できますか？",
            a: "いいえ。どちらの物件もペット同伴はできません。",
          },
          {
            q: "喫煙はできますか？",
            a: "いいえ。どちらも室内は完全禁煙です。喫煙は屋外の所定のスペースをご利用ください。",
          },
          {
            q: "騒音に関するルールはありますか？",
            a: "はい。近隣の方への配慮のため、22時以降はお静かにお願いします。パーティー・イベントの開催はできません。",
          },
          {
            q: "周辺のローカルガイドはありますか？",
            a: "あります！清川の徒歩圏から実際に歩いて選んだ、カフェ・食堂・居酒屋・市場・文化スポット16箇所のローカルガイドをご用意しています。yah.homes/ja/locals をご覧ください。",
          },
          {
            q: "宿で料理はできますか？",
            a: "はい。どちらもコンロ・冷蔵庫・電子レンジ・炊飯器・基本的な調理器具を備えたフルキッチンつきです。徒歩圏内にスーパーやコンビニがあります。",
          },
          {
            q: "キャンセルポリシーは？",
            a: "公式サイトからのご予約は、チェックイン日の{d}日前まで無料でキャンセルいただけます。期限を過ぎた場合と無連絡不泊の場合は宿泊料金の全額を申し受けます。具体的な期限（日本時間）は、ご予約時と確定メールに表示します。Airbnb・Booking.com 経由のご予約は、各サービスで表示されるポリシーが適用されます。",
          },
        ],
      },
    ],
  },
  en: {
    title: "Frequently Asked Questions",
    categories: [
      {
        label: "About the Properties",
        items: [
          {
            q: "What is the difference between Kiyokawa and Takasago?",
            a: "Kiyokawa accommodates up to {kcap} guests and features {kbd} double beds + {kbs} single bed, a private parking space, and a riverside location along the Nakagawa River. Takasago accommodates up to {tcap} guests and is located in cosy and hip residential area, a short walk from Yakuin Station. Both properties are newly built, whole-house rentals with full kitchens and SIMMONS premium mattresses.",
          },
          {
            q: "Are the properties entire homes? Can other guests enter?",
            a: "Yes, both Kiyokawa and Takasago are 100% private whole-house rentals — one group per day, with the entire house exclusively yours. No other guests or hosts will enter during your stay.",
          },
          {
            q: "What kinds of trips are the houses good for?",
            a: "With separate bedrooms and two toilets, they are especially popular for family trips and three-generation travel. Takasago has three washbasins, which groups of friends love for busy mornings. They also suit graduation trips, company retreats, and workcations (work desk provided). Since each house hosts one group per day with the whole home to yourselves, you can relax without worrying about other guests.",
          },
          {
            q: "Are the houses good for family trips?",
            a: "Yes — it's the most popular way to stay. With separate bedrooms and two toilets, families with small children and three-generation trips can settle in comfortably. Free private parking means you can drive right up to the door with all your luggage (Takasago fits large minivans).",
          },
          {
            q: "Are the houses good for group trips?",
            a: "Yes. Gathering everyone in the living-dining room is what whole-house stays are all about. The full kitchen — stove, large refrigerator, cookware, and tableware — makes cooking together part of the trip: shopping at Yanagibashi Market and cooking as a group is a guest favorite. Great for graduation trips, friend groups, and company retreats.",
          },
          {
            q: "How many guests can stay?",
            a: "Kiyokawa: up to {kcap} guests. Takasago: up to {tcap} guests. Extra guests beyond the listed capacity are not permitted.",
          },
          {
            q: "Are the properties barrier-free / wheelchair accessible?",
            a: "Both houses are three-story homes with indoor stairs and are not barrier-free. The bathroom is on the 1st floor at Kiyokawa and on the 2nd floor at Takasago. Seniors and families with toddlers should take extra care on the stairs. Please contact us before booking if you have any concerns.",
          },
          {
            q: "Is parking available? Does a large car fit?",
            a: "Yes — both houses include one free private parking space. Takasago's space fits large minivans (a Toyota Alphard fits). Kiyokawa's space fits compact to standard-size cars; for larger vehicles, coin parking lots nearby cost from about ¥800 per night.",
          },
          {
            q: "Where can 7 people stay together in Fukuoka?",
            a: "yah.homes Kiyokawa accommodates up to {kcap} guests in one newly built private house ({krooms} bedrooms, {kbd} double beds + {kbs} single bed), within walking distance of Tenjin. For groups of up to {tcap}, yah.homes Takasago is also available.",
          },
          {
            q: "Is there a villa for 6 people in Fukuoka?",
            a: "Yes. yah.homes Takasago is a whole-house villa for up to {tcap} guests — {trooms} bedrooms ({tbd} double + {tbs} single beds), {ttoilet} toilets, and {tsink} washbasins, so even a group of 6 won't queue in the morning. It's a {tstation} minute walk from Watanabe-dori Station in central Fukuoka. For {kcap} guests, choose Kiyokawa (up to {kcap}).",
          },
          {
            q: "Is there a whole-house rental near Tenjin or Hakata Station? What is the nearest station?",
            a: "Yes. Both yah.homes properties are in central Fukuoka. Takasago is a {tstation} minute walk from Watanabe-dori Station (Exit 1), with Yakuin also within walking distance. Kiyokawa is a {kstation} minute walk from Watanabe-dori Station (Exit 1) — a taxi or rental car is recommended (about 8 minutes by car to Tenjin).",
          },
          {
            q: "Is there a whole-house rental in downtown Fukuoka?",
            a: "Yes. yah.homes offers two whole-house villa rentals in downtown Fukuoka (Chuo-ku): Kiyokawa (Kiyokawa, Chuo-ku — up to {kcap} guests, {krooms} bedrooms, about 8 minutes by car to Tenjin) and Takasago (Takasago, Chuo-ku — up to {tcap} guests, {tstation} minutes on foot from Watanabe-dori Station). Both offer contactless self check-in with a security lock, and Nakasu, Canal City Hakata, and Yanagibashi Market are within walking distance.",
          },
          {
            q: "How much does it cost per night, and where can I book?",
            a: "Rates vary by season, day of the week, and number of guests. Enter your dates on the booking calendar on each property page (official site) or Airbnb to see exact prices. Cleaning fees and minimum-night requirements are listed under Booking Conditions on each property page.",
          },
        ],
      },
      {
        label: "Check-in & Check-out",
        items: [
          {
            q: "What are the check-in and check-out times?",
            a: "Check-in: from {ci} (no time limit). Check-out: by {co}.",
          },
          {
            q: "Is self check-in available?",
            a: "Yes. Both properties use a security lock system. If you book on this site we email the code; if you book via Airbnb or Booking.com it arrives in that platform\u2019s messages — the day before arrival. Nobody needs to meet you, and there is no arrival time limit, so late-night arrivals are fine.",
          },
          {
            q: "How do I get from Fukuoka Airport to the properties?",
            a: "From Fukuoka Airport (International Terminal), Kiyokawa is approximately {kairport} minutes by car (taxi approx. {ktaxifare}) or 25 minutes by subway + walk. Takasago is approximately {tairport} minutes by car. Both properties are also accessible from Hakata Station in about 25 minutes on foot.",
          },
        ],
      },
      {
        label: "Amenities & House Rules",
        items: [
          {
            q: "What amenities are provided?",
            a: "Both properties include: high-speed Wi-Fi, SIMMONS premium mattresses, fully equipped kitchen (Cooktop, refrigerator, microwave, rice cooker, dishwasher), washing machine, air conditioning in all rooms, smart TV, toiletries, towels, and bed linens.",
          },
          {
            q: "How many towels are provided?",
            a: "One bath towel and one face towel are prepared per guest. If you need more, please message us in advance (additional towels may incur a fee). Both houses have washing machines — Kiyokawa's is a washer-dryer — so you can also launder towels during longer stays.",
          },
          {
            q: "Are there convenience stores or supermarkets nearby?",
            a: "Yes. Takasago: 7-Eleven and Lawson are about a 2-minute walk, with a 100-yen shop (Seria) and the Sunny supermarket about 5 minutes away. Kiyokawa: Lawson is about a 2-minute walk, and a drugstore is also within walking distance.",
          },
          {
            q: "Are pets allowed?",
            a: "No. Pets are not permitted at either property.",
          },
          {
            q: "Is smoking allowed?",
            a: "No. Both properties are strictly non-smoking indoors. A designated outdoor smoking area is available.",
          },
          {
            q: "Are there noise restrictions?",
            a: "Yes. Please keep noise to a minimum after 10:00 PM out of respect for neighbors. Parties and events are not permitted.",
          },
          {
            q: "Is there a local guide for the area?",
            a: "Yes! We have curated a Local Guide featuring 16 recommended spots within walking distance of Kiyokawa — cafes, restaurants, izakayas, markets, and cultural spots. Visit yah.homes/locals for the full guide.",
          },
          {
            q: "Can I cook at the property?",
            a: "Yes. Both properties have fully equipped kitchens with Cooktops, refrigerators, microwaves, rice cookers, and basic cooking utensils. Grocery stores and convenience stores are within walking distance.",
          },
          {
            q: "What is your cancellation policy?",
            a: "Booking on this site: free cancellation until {d} days before check-in. After that, and for no-shows, the full amount applies. The exact deadline (Japan time) is shown when you book and in your confirmation email. Bookings made through Airbnb or Booking.com follow the policy shown on that platform.",
          },
        ],
      },
    ],
  },
  ko: {
    title: "자주 묻는 질문",
    categories: [
      {
        label: "숙소 안내",
        items: [
          {
            q: "기요카와와 다카사고의 차이점은 무엇인가요?",
            a: "기요카와는 최대 {kcap}명 수용, 더블베드 {kbd}개 + 싱글베드 {kbs}개, 전용 주차장, 나카가와 강변 위치입니다. 다카사고는 최대 {tcap}명 수용, 야쿠인·와타나베도리역 도보권 주택가 위치입니다. 두 숙소 모두 신축 독채 렌탈로 풀 키친과 SIMMONS 프리미엄 매트리스를 갖추고 있습니다.",
          },
          {
            q: "완전한 독채인가요? 다른 투숙객이 들어오나요?",
            a: "네, 두 숙소 모두 하루 한 팀 한정으로 단독주택 전체를 통째로 빌리는 100% 프라이빗 독채입니다. 체류 중 다른 투숙객이나 호스트가 출입하지 않습니다.",
          },
          {
            q: "어떤 여행에 적합한가요?",
            a: "침실이 분리되어 있고 화장실이 2개라 가족 여행·3대 여행에 특히 인기입니다. 다카사고는 세면대가 3개여서 아침 준비가 겹치는 우정 여행에도 좋습니다. 졸업 여행이나 워크숍 등 그룹 이용, 업무용 책상이 있어 워케이션에도 적합합니다. 하루 한 팀, 집 전체를 통째로 사용하므로 눈치 볼 필요 없이 지낼 수 있습니다.",
          },
          {
            q: "가족 여행에 적합한가요?",
            a: "네, 가장 인기 있는 이용 방식입니다. 침실이 분리되어 있고 화장실이 2개라 어린 자녀 동반이나 3대 여행도 편안하게 지낼 수 있습니다. 무료 전용 주차장이 있어 짐이 많은 가족 여행도 현관 앞까지 차로 바로 이동할 수 있습니다(다카사고는 대형 미니밴도 주차 가능).",
          },
          {
            q: "단체 여행에 적합한가요?",
            a: "네. 거실 다이닝에 모두가 모일 수 있는 것이 독채의 묘미입니다. 쿡탑·대형 냉장고·조리도구·식기를 갖춘 풀 키친이 있어, 야나기바시 연합시장에서 장을 보고 다 함께 요리를 즐기는 숙박이 인기입니다. 졸업 여행·우정 여행·워크숍에도 좋습니다.",
          },
          {
            q: "최대 몇 명까지 숙박 가능한가요?",
            a: "기요카와: 최대 7명. 다카사고: 최대 6명.",
          },
          {
            q: "배리어프리(휠체어 접근 가능)인가요?",
            a: "두 숙소 모두 3층 구조의 단독주택으로 실내 계단이 있으며 배리어프리가 아닙니다. 욕실은 기요카와 1층, 다카사고 2층에 있습니다. 어르신이나 유아 동반 시 계단 이용에 주의해 주세요. 우려되는 점은 예약 전에 문의해 주세요.",
          },
          {
            q: "주차 가능한가요? 대형차도 주차되나요?",
            a: "네 — 두 숙소 모두 무료 전용 주차 1대분이 있습니다. 다카사고는 대형 미니밴(토요타 알파드급)도 주차 가능합니다. 기요카와는 콤팩트~스탠다드 사이즈까지 가능하며, 대형 차량은 인근 코인 주차장(1박 약 ¥800~)을 이용해 주세요.",
          },
          {
            q: "후쿠오카에서 7명이 함께 묵을 수 있는 숙소가 있나요?",
            a: "yah.homes 기요카와는 신축 독채 한 채에 최대 {kcap}명까지 숙박할 수 있습니다(침실 {krooms}개, 더블 {kbd}+싱글 {kbs}). 텐진까지 도보권이며, 최대 {tcap}명 그룹은 다카사고도 이용 가능합니다.",
          },
          {
            q: "후쿠오카에 6인이 묵을 수 있는 숙소가 있나요?",
            a: "네. yah.homes 다카사고는 최대 {tcap}명의 독채 빌라입니다. 침실 {trooms}개(더블 {tbd}+싱글 {tbs})·화장실 {ttoilet}개·세면대 {tsink}개로, 6인 그룹도 아침 준비가 밀리지 않습니다. 와타나베도리역에서 도보 {tstation}분의 도심 입지입니다. {kcap}명이라면 기요카와(최대 {kcap}명)를 이용해 주세요.",
          },
          {
            q: "텐진이나 하카타역 근처에 독채 숙소가 있나요? 가장 가까운 역은 어디인가요?",
            a: "네. 두 숙소 모두 후쿠오카 중심부에 있습니다. 다카사고는 와타나베도리역 1번 출구에서 도보 {tstation}분이며 야쿠인도 도보권입니다. 기요카와는 와타나베도리역 1번 출구에서 도보 {kstation}분으로, 택시나 렌터카를 추천합니다(텐진까지 차로 약 8분).",
          },
          {
            q: "후쿠오카 시내 중심가에 독채 숙소가 있나요?",
            a: "네. yah.homes는 후쿠오카 도심(주오구)에 있는 독채 빌라 2채를 운영합니다: 기요카와(주오구 기요카와·최대 7명·침실 3개·텐진까지 차로 약 8분), 다카사고(주오구 다카사고·최대 6명·와타나베도리역 도보 {tstation}분). 두 곳 모두 보안 잠금장치를 통한 비대면 셀프 체크인이며, 나카스·캐널시티 하카타·야나기바시 시장까지 도보권입니다.",
          },
          {
            q: "1박 요금은 얼마인가요? 어디서 예약하나요?",
            a: "요금은 시즌·요일·인원에 따라 달라집니다. 각 숙소 페이지의 예약 캘린더(공식 사이트) 또는 Airbnb에 날짜를 입력하면 정확한 요금이 표시됩니다. 청소비와 최소 숙박일은 각 숙소 페이지의 예약 조건에서 확인할 수 있습니다.",
          },
        ],
      },
      {
        label: "체크인 & 체크아웃",
        items: [
          {
            q: "체크인/체크아웃 시간은 언제인가요?",
            a: "체크인: {ci}부터 (시간 제한 없음). 체크아웃: {co}까지. 얼리 체크인/레이트 체크아웃은 사전 문의 주세요.",
          },
          {
            q: "셀프 체크인이 가능한가요?",
            a: "네. 보안 잠금 시스템을 사용합니다. 공식 사이트에서 예약하신 경우에는 메일로, Airbnb・Booking.com 예약은 각 서비스 메시지로, 도착 전날에 도어 코드를 보내드립니다. 대면 절차는 없으며 도착 시간 제한도 없어 늦은 밤 도착도 괜찮습니다.",
          },
          {
            q: "후쿠오카 공항에서 숙소까지 어떻게 가나요?",
            a: "후쿠오카 공항 국제선 터미널에서 기요카와까지 차로 약 {kairport}분(택시 약 {ktaxifare}), 다카사고까지 차로 약 {tairport}분입니다. 하카타역에서는 도보 약 25분입니다.",
          },
        ],
      },
      {
        label: "어메니티 & 하우스 룰",
        items: [
          {
            q: "어떤 편의시설이 제공되나요?",
            a: "고속 Wi-Fi, SIMMONS 프리미엄 매트리스, 풀 키친(IH 쿡탑, 냉장고, 전자레인지, 밥솥, 식기세척기), 세탁기/건조기, 전 객실 에어컨, 스마트 TV, 세면도구, 수건, 침구류가 포함됩니다.",
          },
          {
            q: "수건은 몇 장 제공되나요?",
            a: "게스트 1인당 배스타올 1장과 페이스타올 1장이 준비되어 있습니다. 추가가 필요하시면 사전에 메시지로 문의해 주세요(추가 요금이 발생할 수 있습니다). 두 숙소 모두 세탁기가 있어(기요카와는 건조 겸용) 장기 체류 시 세탁도 가능합니다.",
          },
          {
            q: "근처에 편의점이나 슈퍼마켓이 있나요?",
            a: "네. 다카사고: 세븐일레븐과 로손이 도보 약 2분, 100엔숍 세리아와 슈퍼 서니가 도보 약 5분 거리입니다. 기요카와: 로손이 도보 약 2분, 드러그스토어도 도보권입니다.",
          },
          {
            q: "반려동물 동반이 가능한가요?",
            a: "아니요. 두 숙소 모두 반려동물 동반이 불가합니다.",
          },
          {
            q: "흡연이 가능한가요?",
            a: "아니요. 두 숙소 모두 실내는 완전 금연입니다. 흡연은 지정된 야외 공간을 이용해 주세요.",
          },
          {
            q: "소음 제한이 있나요?",
            a: "네. 오후 10시 이후에는 이웃을 위해 소음을 최소화해 주세요. 파티 및 이벤트는 불가합니다.",
          },
          {
            q: "지역 가이드가 있나요?",
            a: "네! 기요카와 도보권 내 추천 스팟 16곳을 소개하는 로컬 가이드가 있습니다. yah.homes/locals에서 확인하세요.",
          },
          {
            q: "숙소에서 요리할 수 있나요?",
            a: "네. 두 숙소 모두 IH 쿡탑, 냉장고, 전자레인지, 밥솥, 기본 조리도구를 갖춘 풀 키친이 있습니다. 도보 거리에 슈퍼마켓과 편의점이 있습니다.",
          },
          {
            q: "취소 정책은 어떻게 되나요?",
            a: "공식 사이트 예약은 체크인 {d}일 전까지 무료로 취소하실 수 있습니다. 기한이 지난 취소와 무단 불투숙의 경우 숙박 요금 전액이 부과됩니다. 정확한 기한(일본 시간)은 예약 시와 확정 메일에 표시됩니다. Airbnb・Booking.com 예약은 각 플랫폼에 표시되는 정책이 적용됩니다.",
          },
        ],
      },
    ],
  },
  zh: {
    title: "常見問題",
    categories: [
      {
        label: "關於住宿",
        items: [
          {
            q: "清川和高砂有什麼不同？",
            a: "清川最多可容納{kcap}人，設有{kbd}張雙人床+{kbs}張單人床，附私人停車位，位於那珂川河畔。高砂最多可容納{tcap}人，位於藥院、渡邊通站步行範圍內的住宅區。兩棟均為全新包棟民宿（整棟出租），配備完整廚房和SIMMONS頂級床墊。",
          },
          {
            q: "是完全獨棟嗎？其他客人會進來嗎？",
            a: "是的，兩棟皆為一天一組限定、整棟房子完全包棟的100%私人住宿。入住期間不會有其他客人或房東進入。",
          },
          {
            q: "適合什麼樣的旅行？",
            a: "臥室彼此獨立、廁所有2間，特別受家庭旅行與三代同堂旅行歡迎。高砂有3個洗手台，早上輪流梳洗的閨蜜旅行也很方便。也適合畢業旅行、員工旅遊等團體，以及附工作桌的Workcation。一天只接待一組、整棟包棟，可以完全不受打擾地度過。",
          },
          {
            q: "適合家庭旅行嗎？",
            a: "適合，這是最受歡迎的入住方式。臥室彼此獨立、廁所有2間，帶小孩或三代同堂都能住得安心。附免費專用停車位，行李多的家庭旅行也能開車直達門口（高砂可停大型休旅車）。",
          },
          {
            q: "適合親子住宿嗎？有嬰兒用品嗎？",
            a: "非常適合，家庭與親子房客眾多。整棟包棟不必顧慮其他房客，小小孩哭鬧也安心；臥室彼此獨立、廁所有2間。唯不提供嬰兒床等嬰幼兒用品，請自行準備；室內有樓梯，幼兒上下樓請多加留意。",
          },
          {
            q: "適合團體旅行嗎？",
            a: "適合。全員圍著客廳餐廳相聚，正是包棟的醍醐味。完整廚房配備瓦斯爐、大冰箱、廚具與餐具，到柳橋連合市場採買後大家一起下廚，是很受歡迎的玩法。畢業旅行、閨蜜旅行、員工旅遊都很合適。",
          },
          {
            q: "最多可以住幾個人？",
            a: "清川：最多7人。高砂：最多6人。",
          },
          {
            q: "住宿是否無障礙設施？",
            a: "兩棟皆為三層樓建築，室內有樓梯，不具備無障礙設施。浴室位置：清川在1樓、高砂在2樓。長輩或幼兒同行時上下樓梯請特別留意。如有疑慮，請於預訂前與我們聯繫。",
          },
          {
            q: "有停車位嗎？大型車停得下嗎？",
            a: "有 — 兩棟皆附1個免費專用停車位。高砂的車位可停大型休旅車（Toyota Alphard 實際可停）。清川的車位適合小型至標準尺寸車輛，大型車請利用附近的投幣停車場（每晚約¥800起）。",
          },
          {
            q: "福岡有可以7人一起入住的包棟民宿嗎？",
            a: "yah.homes 清川是一整棟新建包棟民宿，最多可入住{kcap}人（{krooms}間臥室、{kbd}張雙人床+{kbs}張單人床）。最多{tcap}人的團體也可選擇高砂包棟。",
          },
          {
            q: "福岡有適合6人入住的包棟別墅嗎？",
            a: "有。yah.homes 高砂是最多{tcap}人的包棟別墅——{trooms}間臥室（雙人床{tbd}張+單人床{tbs}張）、{ttoilet}間廁所、{tsink}個洗手台，6人團體早上梳洗也不用排隊。距渡邊通站步行{tstation}分鐘的市中心位置。{kcap}人的話請選擇清川（最多{kcap}人）。",
          },
          {
            q: "天神或博多站附近有包棟住宿嗎？最近的車站是哪一站？",
            a: "有。兩棟包棟民宿都位於福岡市中心：高砂距渡邊通站1號出口步行{tstation}分鐘，藥院也在步行範圍內；清川距渡邊通站1號出口步行{kstation}分鐘，建議搭計程車或自駕（開車到天神約8分鐘）。",
          },
          {
            q: "福岡市中心（市區）有包棟民宿嗎？",
            a: "有。yah.homes 是位於福岡市中心（中央區）的包棟別墅：清川（中央區清川・最多7人・3間臥室・開車到天神約8分鐘）與高砂（中央區高砂・最多6人・渡邊通站步行{tstation}分鐘）。兩棟皆採密碼鎖無接觸自助入住，步行可達中洲、博多運河城、柳橋連合市場。",
          },
          {
            q: "每晚房價多少？在哪裡預訂？",
            a: "房價依季節、星期與人數而異。在各房源頁面的預訂日曆（官方網站）或 Airbnb 輸入日期即可查看確切價格。清潔費與最少入住晚數請參閱各房源頁面的預訂條件。",
          },
        ],
      },
      {
        label: "入住與退房",
        items: [
          {
            q: "入住和退房時間是什麼時候？",
            a: "入住：{ci} 起（無時間限制）。退房：{co} 前。如需提前入住或延遲退房，請提前聯繫我們。",
          },
          {
            q: "可以自助入住嗎？",
            a: "可以。兩棟皆採用密碼鎖。官網預訂將以電子郵件寄送密碼，Airbnb・Booking.com 預訂則透過各平台訊息發送，時間約在抵達前一天。無需與人碰面，也沒有抵達時間限制，深夜抵達也沒問題。",
          },
          {
            q: "從福岡機場如何到達住宿？",
            a: "從福岡機場國際航廈，搭計程車至清川約{kairport}分鐘（約{ktaxifare}），至高砂約{tairport}分鐘。從博多站步行約25分鐘可到達兩處住宿。",
          },
        ],
      },
      {
        label: "設施與住宿規則",
        items: [
          {
            q: "提供哪些設施？",
            a: "兩處均提供：高速Wi-Fi、SIMMONS頂級床墊、完整廚房（IH電磁爐、冰箱、微波爐、電飯鍋、洗碗機）、洗衣機/烘乾機、全室空調、智能電視、盥洗用品、毛巾和床上用品。",
          },
          {
            q: "提供幾條毛巾？",
            a: "每位房客備有浴巾1條與洗臉毛巾1條。如需追加請事先傳訊息告知（可能酌收費用）。兩棟皆有洗衣機（清川為洗脫烘一體機），長住期間也能自行清洗。",
          },
          {
            q: "附近有便利商店或超市嗎？",
            a: "有。高砂：7-ELEVEN和LAWSON步行約2分鐘，百元店Seria與Sunny超市約5分鐘。清川：LAWSON步行約2分鐘，藥妝店也在步行範圍內。",
          },
          {
            q: "可以攜帶寵物嗎？",
            a: "不可以。兩處住宿均不允許攜帶寵物。",
          },
          {
            q: "可以吸菸嗎？",
            a: "不可以。兩處住宿室內嚴格禁菸。吸菸請利用指定的室外吸菸區。",
          },
          {
            q: "有噪音限制嗎？",
            a: "有。晚上10點後請保持安靜，以尊重鄰居。不允許舉辦派對或活動。",
          },
          {
            q: "有當地導覽嗎？",
            a: "有！我們精心整理了清川步行範圍內16個推薦景點的本地指南。請訪問yah.homes/locals查看完整指南。",
          },
          {
            q: "可以在住宿內烹飪嗎？",
            a: "可以。兩處住宿均配備完整廚房，包括IH電磁爐、冰箱、微波爐、電飯鍋和基本廚具。步行範圍內有超市和便利店。",
          },
          {
            q: "取消政策是什麼？",
            a: "官網預訂可於入住日{d}天前免費取消。逾期取消及未入住者將收取全額住宿費。確切期限（日本時間）會於預訂時與確認郵件中顯示。透過 Airbnb・Booking.com 的預訂，適用各平台顯示的政策。",
          },
        ],
      },
    ],
  },
  th: {
    title: "คำถามที่พบบ่อย",
    categories: [
      {
        label: "เกี่ยวกับที่พัก",
        items: [
          {
            q: "ความแตกต่างระหว่าง Kiyokawa และ Takasago คืออะไร?",
            a: "Kiyokawa รองรับได้สูงสุด {kcap} คน มีเตียงดับเบิล {kbd} เตียง + เตียงเดี่ยว {kbs} เตียง มีที่จอดรถส่วนตัว ตั้งอยู่ริมแม่น้ำ Nakagawa Takasago รองรับได้สูงสุด {tcap} คน อยู่ในย่านที่พักอาศัยเดินถึงสถานี Watanabe-dori และย่าน Yakuin ได้ ทั้งสองแห่งเป็นบ้านพักใหม่ทั้งหลัง มีครัวครบครัน และที่นอน SIMMONS พรีเมียม",
          },
          {
            q: "เป็นบ้านพักส่วนตัวทั้งหลังหรือไม่? มีผู้เข้าพักอื่นหรือไม่?",
            a: "ใช่ ทั้ง Kiyokawa และ Takasago รับเพียงวันละ 1 กลุ่ม และคุณได้ใช้บ้านเดี่ยวทั้งหลังแบบเหมาหมด 100% ส่วนตัว ไม่มีผู้เข้าพักอื่นหรือเจ้าของบ้านเข้ามาระหว่างที่คุณพัก",
          },
          {
            q: "เหมาะกับทริปแบบไหน?",
            a: "ห้องนอนแยกเป็นสัดส่วนและมีห้องส้วม 2 ห้อง จึงเป็นที่นิยมสำหรับทริปครอบครัวและทริปสามรุ่น Takasago มีอ่างล้างหน้า 3 จุด สะดวกสำหรับทริปเพื่อนสาวที่ต้องเตรียมตัวตอนเช้าพร้อมกัน เหมาะกับทริปฉลองเรียนจบ ทริปบริษัท และ Workcation (มีโต๊ะทำงาน) รับวันละ 1 กลุ่มและได้บ้านทั้งหลัง จึงพักผ่อนได้อย่างเป็นส่วนตัวเต็มที่",
          },
          {
            q: "เหมาะกับทริปครอบครัวไหม?",
            a: "เหมาะมาก และเป็นรูปแบบการเข้าพักที่นิยมที่สุด ห้องนอนแยกเป็นสัดส่วนและมีห้องส้วม 2 ห้อง ครอบครัวที่มีเด็กเล็กหรือทริปสามรุ่นก็พักได้สบาย มีที่จอดรถส่วนตัวฟรี ทริปครอบครัวสัมภาระเยอะก็ขับรถถึงหน้าประตูได้เลย (Takasago จอดมินิแวนขนาดใหญ่ได้)",
          },
          {
            q: "เหมาะกับทริปกลุ่มเพื่อนไหม?",
            a: "เหมาะ การได้รวมตัวกันในห้องนั่งเล่น-ห้องอาหารคือเสน่ห์ของบ้านเช่าทั้งหลัง ครัวครบครันทั้งเตา ตู้เย็นขนาดใหญ่ อุปกรณ์ครัวและจานชาม ไปจ่ายตลาดที่ตลาดยานางิบาชิแล้วมาทำอาหารด้วยกันเป็นกิจกรรมยอดนิยมของผู้เข้าพัก เหมาะกับทริปเรียนจบ ทริปเพื่อน และทริปบริษัท",
          },
          {
            q: "รองรับผู้เข้าพักได้กี่คน?",
            a: "Kiyokawa: สูงสุด {kcap} คน Takasago: สูงสุด {tcap} คน",
          },
          {
            q: "ที่พักเหมาะสำหรับผู้พิการหรือไม่?",
            a: "ทั้งสองหลังเป็นบ้าน 3 ชั้นที่มีบันไดภายใน และไม่มีสิ่งอำนวยความสะดวกสำหรับผู้พิการ ห้องอาบน้ำของ Kiyokawa อยู่ชั้น 1 ส่วน Takasago อยู่ชั้น 2 ผู้สูงอายุและครอบครัวที่มีเด็กเล็กกรุณาระมัดระวังเรื่องบันได หากมีข้อกังวลกรุณาติดต่อเราก่อนจอง",
          },
          {
            q: "มีที่จอดรถหรือไม่? รถขนาดใหญ่จอดได้ไหม?",
            a: "มี — ทั้งสองหลังมีที่จอดรถส่วนตัวฟรี 1 คัน Takasago จอดมินิแวนขนาดใหญ่ได้ (Toyota Alphard จอดได้จริง) Kiyokawa เหมาะกับรถขนาดเล็กถึงมาตรฐาน รถขนาดใหญ่สามารถใช้ลานจอดแบบหยอดเหรียญใกล้เคียง (ประมาณ ¥800 ต่อคืนขึ้นไป)",
          },
          {
            q: "มีที่พักในฟุกุโอกะที่พักด้วยกัน 7 คนได้ไหม?",
            a: "yah.homes คิโยกาวะ รองรับได้สูงสุด {kcap} คนในบ้านส่วนตัวทั้งหลัง ({krooms} ห้องนอน เตียงดับเบิล {kbd} + เตียงเดี่ยว {kbs}) เดินถึงเทนจินได้ กลุ่มไม่เกิน {tcap} คนสามารถเลือกทาคาซาโกะได้เช่นกัน",
          },
          {
            q: "มีวิลล่าสำหรับ 6 คนในฟุกุโอกะไหม?",
            a: "มี yah.homes ทาคาซาโกะ คือวิลล่าเช่าทั้งหลังสำหรับสูงสุด {tcap} คน — {trooms} ห้องนอน (เตียงดับเบิล {tbd} + เตียงเดี่ยว {tbs}), ห้องส้วม {ttoilet} ห้อง และอ่างล้างหน้า {tsink} จุด กลุ่ม 6 คนก็ไม่ต้องต่อคิวตอนเช้า อยู่ใจกลางเมือง เดินจากสถานีวาตานาเบะโดริ {tstation} นาที หากมากัน {kcap} คน เลือกคิโยกาวะ (สูงสุด {kcap} คน)",
          },
          {
            q: "มีบ้านเช่าทั้งหลังใกล้เทนจินหรือสถานีฮากาตะไหม? สถานีที่ใกล้ที่สุดคือสถานีไหน?",
            a: "มี ทั้งสองแห่งอยู่ใจกลางฟุกุโอกะ: ทาคาซาโกะ เดินจากสถานีวาตานาเบะโดริ (ทางออก 1) ประมาณ 5–10 นาที และเดินถึงย่านยาคุอินได้ คิโยกาวะ เดินจากสถานีวาตานาเบะโดริ (ทางออก 1) ประมาณ 10–15 นาที แนะนำแท็กซี่หรือรถเช่า (ขับถึงเทนจินประมาณ 8 นาที)",
          },
          {
            q: "มีวิลล่าเช่าทั้งหลังในตัวเมืองฟุกุโอกะไหม?",
            a: "มี yah.homes คือวิลล่าเช่าทั้งหลัง 2 หลังในตัวเมืองฟุกุโอกะ (เขตชูโอ): คิโยกาวะ (สูงสุด {kcap} คน, {krooms} ห้องนอน, ขับรถถึงเทนจินประมาณ 8 นาที) และทาคาซาโกะ (สูงสุด {tcap} คน, เดินจากสถานีวาตานาเบะโดริ {tstation} นาที) ทั้งสองหลังเช็คอินด้วยตนเองแบบไร้สัมผัสผ่านล็อคนิรภัย และเดินถึงนากาสุ คาแนลซิตี้ และตลาดยานางิบาชิได้",
          },
          {
            q: "ราคาต่อคืนเท่าไหร่ และจองได้ที่ไหน?",
            a: "ราคาแตกต่างกันตามฤดูกาล วันในสัปดาห์ และจำนวนผู้เข้าพัก กรอกวันที่ใน ปฏิทินการจองในหน้าของแต่ละที่พักเพื่อดูราคาที่แน่นอน (เว็บทางการ) หรือ Airbnb ค่าทำความสะอาดและจำนวนคืนขั้นต่ำดูได้ที่เงื่อนไขการจองในหน้าที่พัก",
          },
        ],
      },
      {
        label: "เช็คอิน & เช็คเอาท์",
        items: [
          {
            q: "เวลาเช็คอินและเช็คเอาท์คือเมื่อไหร่?",
            a: "เช็คอิน: ตั้งแต่ {ci} น. (ไม่จำกัดเวลา) เช็คเอาท์: ก่อน {co} น. สำหรับเช็คอินก่อนกำหนดหรือเช็คเอาท์ช้า กรุณาติดต่อล่วงหน้า",
          },
          {
            q: "สามารถเช็คอินด้วยตนเองได้หรือไม่?",
            a: "ได้ ทั้งสองหลังใช้ระบบล็อคนิรภัย หากจองผ่านเว็บไซต์ทางการเราจะส่งรหัสทางอีเมล หากจองผ่าน Airbnb หรือ Booking.com จะส่งผ่านข้อความของแพลตฟอร์มนั้น ในวันก่อนวันเข้าพัก ไม่ต้องพบเจอใคร และไม่มีข้อจำกัดเรื่องเวลามาถึง มาดึกก็ไม่มีปัญหา",
          },
          {
            q: "เดินทางจากสนามบินฟุกุโอกะไปที่พักอย่างไร?",
            a: "จากอาคารผู้โดยสารระหว่างประเทศสนามบินฟุกุโอกะ ไป Kiyokawa ใช้เวลาประมาณ {kairport} นาทีโดยรถยนต์ (แท็กซี่ประมาณ {ktaxifare}) ไป Takasago ประมาณ {tairport} นาที จากสถานีฮากาตะเดินประมาณ 25 นาที",
          },
        ],
      },
      {
        label: "สิ่งอำนวยความสะดวก & กฎของบ้าน",
        items: [
          {
            q: "มีสิ่งอำนวยความสะดวกอะไรบ้าง?",
            a: "ทั้งสองแห่งมี: Wi-Fi ความเร็วสูง, ที่นอน SIMMONS พรีเมียม, ครัวครบครัน (เตาแม่เหล็กไฟฟ้า, ตู้เย็น, ไมโครเวฟ, หม้อหุงข้าว, เครื่องล้างจาน), เครื่องซักผ้า/เครื่องอบผ้า, แอร์ทุกห้อง, Smart TV, ของใช้ส่วนตัว, ผ้าขนหนู และผ้าปูที่นอน",
          },
          {
            q: "มีผ้าขนหนูให้กี่ผืน?",
            a: "มีผ้าเช็ดตัว 1 ผืนและผ้าเช็ดหน้า 1 ผืนต่อผู้เข้าพัก 1 ท่าน หากต้องการเพิ่มกรุณาแจ้งล่วงหน้าทางข้อความ (อาจมีค่าใช้จ่ายเพิ่มเติม) ทั้งสองหลังมีเครื่องซักผ้า (Kiyokawa เป็นเครื่องซัก-อบ) จึงซักผ้าได้ระหว่างการพักระยะยาว",
          },
          {
            q: "มีร้านสะดวกซื้อหรือซูเปอร์มาร์เก็ตใกล้ๆ ไหม?",
            a: "มี Takasago: 7-Eleven และ Lawson เดินประมาณ 2 นาที ร้าน 100 เยน Seria และซูเปอร์ Sunny ประมาณ 5 นาที Kiyokawa: Lawson เดินประมาณ 2 นาที และมีร้านขายยาในระยะเดิน",
          },
          {
            q: "อนุญาตให้นำสัตว์เลี้ยงมาได้หรือไม่?",
            a: "ไม่อนุญาต ทั้งสองแห่งไม่อนุญาตให้นำสัตว์เลี้ยงมา",
          },
          {
            q: "สูบบุหรี่ได้หรือไม่?",
            a: "ไม่ได้ ทั้งสองแห่งห้ามสูบบุหรี่ในร่มอย่างเคร่งครัด แต่มีพื้นที่สูบบุหรี่กลางแจ้งที่กำหนดไว้",
          },
          {
            q: "มีข้อจำกัดเรื่องเสียงรบกวนหรือไม่?",
            a: "มี กรุณาลดเสียงหลัง 22:00 น. เพื่อเคารพเพื่อนบ้าน ไม่อนุญาตให้จัดปาร์ตี้หรืองานอีเวนต์",
          },
          {
            q: "มีคู่มือท้องถิ่นหรือไม่?",
            a: "มี! เรามีคู่มือท้องถิ่นที่คัดสรรสถานที่แนะนำ 16 แห่งในระยะเดินจาก Kiyokawa เยี่ยมชม yah.homes/locals สำหรับคู่มือฉบับเต็ม",
          },
          {
            q: "ทำอาหารในที่พักได้หรือไม่?",
            a: "ได้ ทั้งสองแห่งมีครัวครบครันพร้อมเตาแม่เหล็กไฟฟ้า ตู้เย็น ไมโครเวฟ หม้อหุงข้าว และอุปกรณ์ทำอาหารพื้นฐาน มีซูเปอร์มาร์เก็ตและร้านสะดวกซื้อในระยะระยะเดินถึง",
          },
          {
            q: "นโยบายการยกเลิกคืออะไร?",
            a: "จองผ่านเว็บไซต์ทางการ: ยกเลิกฟรีได้ถึง {d} วันก่อนวันเช็คอิน หลังจากนั้นและกรณีไม่มาพักโดยไม่แจ้ง จะคิดค่าที่พักเต็มจำนวน กำหนดเวลาที่แน่นอน (เวลาญี่ปุ่น) จะแสดงตอนจองและในอีเมลยืนยัน ส่วนการจองผ่าน Airbnb หรือ Booking.com เป็นไปตามนโยบายของแพลตฟอร์มนั้น",
          },
        ],
      },
    ],
  },
};
