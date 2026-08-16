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
    /** rating は property_facts（SSoT）から取る。ここには持たない */
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
