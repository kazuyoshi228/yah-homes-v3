// kiyokawa の en 版。言語ごとに分けているのは、1ファイル1,800行だと
// 1言語だけ直したつもりが他言語に波及し、差分も目視できないため（計画書 §7-2）。
// 数値（時刻・定員・評価）は持たない。{ci}/{co}/{cap} は SSoT から差し込む。
import type { KiyokawaTranslations } from "./_schema";

export const en: KiyokawaTranslations = {

  hero: {
    propertyName: "yah.homes kiyokawa",
    tagline: "Newly built single family home in the vibrant Kiyokawa district.",
    area: "Kiyokawa, Chuo-ku, Fukuoka",
    capacity: "Up to {cap} guests · {rooms} Bedrooms",
    bookNow: "Book Now",
  },
  overview: {
    title: "Property Overview",
    bedrooms: "{rooms} Bedrooms",
    beds: "{bd} Double Beds + {bs} Single Bed",
    maxGuests: "{cap} guests (max)",
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
      "{tv}-inch Smart TV + high-quality Japanese audio system",
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
    time: "Check-in: from {ci} (no time limit)",
    checkout: "Check-out: by {co}",
    method: "Fully contactless self check-in via security lock. The access code is sent the day before arrival.",
    idVerification: "ID verification required before check-in (passport or government-issued ID).",
  },
  conditions: {
    title: "Booking Conditions",
    cancellation: "Cancellation: free until {d} days before check-in. The exact deadline (JST) is shown when you book.",
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
        a: "Fully contactless self check-in via security lock. You'll receive the access code the day before arrival. No need to meet anyone.",
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
        a: "Booking on our official site: free cancellation until {d} days before check-in; after that, and for no-shows, the full amount is charged. The exact deadline (JST) is shown before you pay and in your confirmation email, and you can cancel yourself from My Page. To change dates, party size or house, cancel and rebook \u2014 within the free period there is no extra cost. Airbnb and Booking.com reservations follow that platform\u2019s policy.",
      },
      {
        q: "Is the property accessible for guests with mobility limitations?",
        a: "Please note that the staircase inside the property is steep. The home is not wheelchair accessible or barrier-free. We recommend this property for guests who are comfortable using stairs.",
      },
      {
        q: "How do I pay?",
        a: "Credit card only, paid in full at the time of booking (processed by Stripe). We never store your card details, and there is nothing to pay on arrival.",
      },
    ],
    bookButton: "Book Now",
  },
  review: {
    count: "{n} reviews",
    superhostLabel: "Superhost",
    airbnbLabel: "View on Airbnb",
  },
  propertyDescription: {
    title: "About This Space",
    showMore: "Show more",
    showLess: "Show less",
    intro: "A brand-new hidden-gem villa (entire house) nestled along the Nakagawa River in Kiyokawa, Fukuoka. Enjoy the tranquil riverside atmosphere while staying in the heart of the city with easy access to Tenjin and Hakata.\n\n8 min by car to Tenjin. 10 min by car to Hakata Station. 18 min by car from the airport. Fully contactless self check-in for a completely private stay.\n\nPerfect for families and groups of up to {cap} guests. Spacious living area and designer furniture create a truly special experience.",
    highlights: [
      {
        title: "1. Premium Sleep Experience (SIMMONS Mattresses)",
        body: "All three bedrooms feature SIMMONS premium mattresses — the same brand used in luxury hotels. Every bedside has a power outlet to ensure a fully restorative night's sleep.",
      },
      {
        title: "2. Cinematic Home Entertainment",
        body: "Enjoy a {tv}-inch large-screen TV paired with a high-quality Japanese-made amplifier and floor-standing speakers. Experience movies and streaming content with cinema-grade audio. (Please log in with your own streaming service account.)",
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
        "(Up to {cap} guests across {rooms} bedrooms)",
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
        "{tv}-inch TV",
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
      { icon: "checkin-time", rule: "Check-in: from {ci} (no time limit). Check-out: by {co}." },
      { icon: "guests", rule: "No unregistered guests. Maximum occupancy must be observed." },
      { icon: "trash", rule: "Please follow local garbage sorting rules. Bins are provided." },
      { icon: "shoes", rule: "Please remove shoes at the entrance (Japanese custom)." },
      { icon: "stairs", rule: "Steep staircase inside. Not suitable for guests with mobility limitations." },
    ],
  },
  floorPlan: {
    title: "Floor Plan",
    subtitle: "3-storey single-family home · 1F: Bathroom & Garage · 2F: Living/Dining/Kitchen · 3F: {rooms} Bedrooms & Balcony",
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
};
