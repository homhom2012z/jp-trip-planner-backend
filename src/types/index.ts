export interface Location {
  id: string;
  city: string;
  name: string;
  type: string;
  priceJpy: string;
  priceThb: string;
  googleMapsUrl: string;
  lat: number;
  lng: number;
  distanceFromMetro?: string;
  description?: string;
  photoUrl?: string; // Cache the photo URL if possible
  openingHours?: {
    weekdayText?: string[];
    openNow?: boolean;
  };
  businessStatus?: string;
  utcOffsetMinutes?: number;
}

export interface UserProfile {
  id: string; // Supabase Hash ID
  email: string;
  google_refresh_token: string | null; // Encrypted
  spreadsheet_id: string | null;
  created_at: string;
}

export interface CachedLocations {
  id: number;
  owner_id: string;
  sheet_id: string;
  data: Location[];
  updated_at: string;
}
