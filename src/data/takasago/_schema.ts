// =============================================================
// yah.homes — Takasago Property Data
// Direct booking page: /properties/takasago
// Languages: en, ja, ko, zh, th
// =============================================================

export type Lang = "en" | "ja" | "ko" | "zh" | "th";

export interface TakasagoTranslations {
  hero: {
    propertyName: string;
    tagline: string;
    area: string;
    capacity: string;
    bookNow: string;
  };
  overview: {
    title: string;
    bedrooms: string;
    beds: string;
    maxGuests: string;
    area: string;
  };
  amenities: {
    title: string;
    items: string[];
  };
  amenityCategories: {
    title: string;
    showAll: string;
    showLess: string;
    categories: {
      name: string;
      items: { icon: string; label: string; note?: string; unavailable?: boolean }[];
    }[];
  };
  review: {
    /** rating は property_facts（SSoT）から取る。ここには持たない */
    count: string;
    superhostLabel: string;
    airbnbLabel: string;
  };
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
  access: {
    title: string;
    items: { from: string; time: string }[];
  };
  checkin: {
    title: string;
    time: string;
    checkout: string;
    method: string;
    idVerification: string;
  };
  conditions: {
    title: string;
    cancellation: string;
    cleaningFee: string;
    extraGuest: string;
    noiseRule: string;
    petRule: string;
    smokingRule: string;
  };
  booking: {
    title: string;
    subtitle: string;
    comingSoon: string;
  };
  houseRules: {
    title: string;
    items: { icon: string; rule: string }[];
  };
  floorPlan: {
    title: string;
    subtitle: string;
    imageAlt: string;
  };
  faq: {
    title: string;
    items: { q: string; a: string }[];
    bookButton: string;
  };
  contact: {
    title: string;
    subtitle: string;
  };
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
  nav: {
    backToHome: string;
    language: string;
    langNames: { en: string; ko: string; zh: string; th: string };
  };
}
