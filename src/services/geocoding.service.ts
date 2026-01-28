import axios from "axios";
import { CONFIG } from "../config";

export class GeocodingService {
  /**
   * Fetches lat/lng and photo reference for a given query string.
   */
  /**
   * Fetches rich place data (lat, lng, photo, price, website, summary, etc.)
   */
  static async fetchPlaceData(query: string): Promise<{
    name: string;
    city: string; // Added city
    lat: number;
    lng: number;
    photoRef?: string;
    googleMapsUrl?: string;
    website?: string;
    priceLevel?: string;
    type?: string;
    summary?: string;
    openingHours?: {
      weekdayText?: string[];
      openNow?: boolean;
    };
    businessStatus?: string;
    utcOffsetMinutes?: number;
  } | null> {
    if (!CONFIG.GOOGLE.MAPS_KEY) return null;
    try {
      // 1. Text Search to get Place ID
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        query,
      )}&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const res = await axios.get(searchUrl);
      if (res.data.status !== "OK" || res.data.results.length === 0) {
        console.warn(`Place search failed for "${query}": ${res.data.status}`);
        return null;
      }

      const place = res.data.results[0];
      const placeId = place.place_id;

      // 2. Place Details to get rich info
      // Added 'address_components' to fields
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,geometry,photos,url,website,price_level,types,editorial_summary,address_components,opening_hours,business_status,utc_offset_minutes&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const detailsRes = await axios.get(detailsUrl);
      if (detailsRes.data.status !== "OK") {
        console.warn(`Place details failed for ID ${placeId}`);
        // Fallback to basic info from search result
        return {
          name: place.name,
          city: this.parseCityFromAddress(place.formatted_address), // Use helper fallback
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          photoRef: place.photos?.[0]?.photo_reference,
        };
      }

      const d = detailsRes.data.result;

      // 3. Map Data
      const result = {
        name: d.name,
        city: this.extractCity(d.address_components), // Extract city
        lat: d.geometry.location.lat,
        lng: d.geometry.location.lng,
        photoRef: d.photos?.[0]?.photo_reference,
        googleMapsUrl: d.url,
        website: d.website,
        priceLevel: this.mapPrice(d.price_level),
        type: this.mapType(d.types),
        summary: d.editorial_summary?.overview || "",
        openingHours: d.opening_hours
          ? {
              weekdayText: d.opening_hours.weekday_text,
              openNow: d.opening_hours.open_now,
            }
          : undefined,
        businessStatus: d.business_status,
        utcOffsetMinutes: d.utc_offset_minutes,
      };

      // Fallback: If city is still generic "Japan" after component extraction, try parsing address string
      if (result.city === "Japan" && d.formatted_address) {
        const parsed = this.parseCityFromAddress(d.formatted_address);
        if (parsed && parsed !== "Japan") {
          result.city = parsed;
        }
      }

      return result;
    } catch (e) {
      console.error("Place search error", e);
    }
    return null;
  }

  /**
   * Fetches place data from a Google Maps URL (short or long).
   */
  static async fetchPlaceFromUrl(url: string): Promise<{
    name: string;
    city: string;
    lat: number;
    lng: number;
    photoRef?: string;
    googleMapsUrl?: string;
    website?: string;
    priceLevel?: string;
    type?: string;
    summary?: string;
    openingHours?: {
      weekdayText?: string[];
      openNow?: boolean;
    };
    businessStatus?: string;
    utcOffsetMinutes?: number;
  } | null> {
    try {
      // 1. Sanitize/Extract URL
      const urlMatch = url.match(/https?:\/\/[^\s"]+/);
      let finalUrl = urlMatch ? urlMatch[0] : url.trim();

      console.log("Processing URL:", finalUrl);

      // 2. Expand Short URL (maps.app.goo.gl, goo.gl, share.google.com etc.)
      const isShort =
        finalUrl.includes("goo.gl") ||
        finalUrl.includes("maps.app.goo.gl") ||
        finalUrl.includes("share.google.com") ||
        (!finalUrl.includes("maps.google") &&
          !finalUrl.includes("google.com/maps"));

      if (isShort) {
        try {
          const response = await axios.head(finalUrl, {
            validateStatus: (status) => status >= 200 && status < 400,
            maxRedirects: 5,
          });
          const responseUrl = response.request?.res?.responseUrl;

          if (responseUrl) {
            finalUrl = responseUrl;
          }
        } catch (e: any) {
          console.warn("HEAD expansion failed, trying GET...", e.message);
          try {
            // Fallback to GET
            const response = await axios.get(finalUrl, {
              validateStatus: (status) => status >= 200 && status < 400,
            });
            const responseUrl = response.request?.res?.responseUrl;

            finalUrl = responseUrl || finalUrl;
          } catch (ex) {
            console.error("Failed to expand URL via GET", ex);
          }
        }
      }

      console.log("Parsing Expanded URL:", finalUrl);

      // 3. Extract Identifier
      // Support domain/maps/place/NAME/...
      const placeMatch = finalUrl.match(/\/maps\/place\/([^/]+)\//);
      if (placeMatch && placeMatch[1]) {
        let name = decodeURIComponent(placeMatch[1]);
        name = name.replace(/\+/g, " ");

        // Check if it looks like coords "lat,lng" (no name)
        if (!name.match(/^-?\d+\.\d+,-?\d+\.\d+$/)) {
          console.log("Extracted Name from URL:", name);
          return this.fetchPlaceData(name);
        }
      }

      // Check for Query Param ?q=NAME
      const urlObj = new URL(finalUrl);
      const queryQ = urlObj.searchParams.get("q");
      if (queryQ) {
        console.log("Extracted Name from Query:", queryQ);
        return this.fetchPlaceData(queryQ);
      }

      // If we can't get a name, maybe we can get coordinates?
      const coordsMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordsMatch) {
        console.warn(
          "Found coordinates but no name. Text search might be ambiguous.",
        );
      }

      return null;
    } catch (e) {
      console.error("URL Parsing Error", e);
      return null;
    }
  }

  /**
   * Generates a photo URL from a reference.
   */
  static getPhotoUrl(photoRef: string): string {
    if (!photoRef || !CONFIG.GOOGLE.MAPS_KEY) return "";
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${CONFIG.GOOGLE.MAPS_KEY}`;
  }

  static extractCity(components: any[]): string {
    if (!components) return "Japan";

    // 1. Locality (City) - e.g. Osaka, Kyoto
    const locality = components.find((c) => c.types.includes("locality"));
    if (locality) return locality.long_name;

    // 2. Postal Town (often used in UK/Japan for mailing city)
    const postalTown = components.find((c) => c.types.includes("postal_town"));
    if (postalTown) return postalTown.long_name;

    // 3. Administrative Area Level 1 (Prefecture) - e.g. Tokyo
    const admin1 = components.find((c) =>
      c.types.includes("administrative_area_level_1"),
    );

    // 4. Sublocality Level 1 (Wards in Tokyo)
    const ward = components.find(
      (c) =>
        c.types.includes("ward") || c.types.includes("sublocality_level_1"),
    );

    // If it's Tokyo, and we have a ward, maybe "Tokyo"? or "Shibuya, Tokyo"?
    // "Tokyo" is safer for grouping.
    if (admin1) {
      return admin1.long_name;
    }

    // Capture Ward if we have nothing else (rare but possible)
    if (ward) return ward.long_name;

    return "Japan";
  }

  // Helper to parse string address
  public static parseCityFromAddress(address: string): string {
    if (!address) return "Japan";
    
    // Common patterns in Japanese Google addresses:
    // "〒542-0071 Osaka, Chuo Ward, Dotonbori, 1 Chome−7−21, Japan"
    // "1-7-1 Nishishinsaibashi, Chuo Ward, Osaka, 542-0086, Japan"
    // "Shibuya City, Tokyo, Japan"
    
    const parts = address.split(",").map((p) => p.trim());
    
    // Remove "Japan" and zip code patterns
    const cleaned = parts.filter(
      (p) => 
        p !== "Japan" && 
        !p.match(/^〒?\d{3}-?\d{4}$/) && // Japanese zip codes
        !p.match(/^\d{1,2}-\d/) // Street addresses like "1-7-21"
    );
    
    if (cleaned.length === 0) return "Japan";
    
    // Look for known prefectures/cities
    const knownCities = [
      "Tokyo", "Osaka", "Kyoto", "Yokohama", "Nagoya", 
      "Sapporo", "Fukuoka", "Kobe", "Sendai", "Hiroshima",
      "Nara", "Kanazawa", "Hakone", "Nikko", "Kamakura",
      "Uji", "Takayama", "Matsumoto", "Naha"
    ];
    
    // Search through parts for a known city
    for (const part of cleaned) {
      for (const city of knownCities) {
        if (part.includes(city)) {
          return city;
        }
      }
    }
    
    // If no known city found, try to pick the most likely candidate
    // Typically: [Street], [Ward], [City], [Prefecture]
    // We want the City or Prefecture (2nd to last or last)
    
    // Remove ward-like patterns (contains "Ward" or ends with "区")
    const withoutWards = cleaned.filter(p => 
      !p.includes("Ward") && 
      !p.includes("区") &&
      !p.includes("City") // Remove "Shibuya City" format
    );
    
    if (withoutWards.length > 0) {
      // Return the last meaningful part
      const lastPart = withoutWards[withoutWards.length - 1];
      // Clean up "City" suffix if present
      return lastPart.replace(/\s+City$/, "").trim();
    }
    
    // Absolute fallback: return the last part
    return cleaned[cleaned.length - 1].replace(/\s+City$/, "").trim();
  }
    return "Japan";
  }

  // Helpers
  private static mapPrice(level: number): string {
    if (level === undefined || level === null) return "";
    // 0: Free, 1: Cheap, 2: Moderate, 3: Expensive, 4: Very Expensive
    if (level === 0) return "Free";
    if (level === 1) return "¥";
    if (level === 2) return "¥¥";
    if (level === 3) return "¥¥¥";
    if (level === 4) return "¥¥¥¥";
    return "";
  }

  private static mapType(types: string[]): string {
    if (!types || types.length === 0) return "";
    // Priority mapping
    const important = [
      "restaurant",
      "cafe",
      "bar",
      "bakery",
      "museum",
      "park",
      "shrine",
      "temple",
      "hotel",
      "lodging",
      "store",
      "shopping_mall",
      "tourist_attraction",
      "night_club",
    ];
    // Find the first matching important type
    const match = important.find((t) => types.includes(t));
    if (match) {
      // Capitalize
      return match.charAt(0).toUpperCase() + match.slice(1);
    }
    // Fallback to first type
    return (
      types[0].charAt(0).toUpperCase() + types[0].slice(1).replace("_", " ")
    );
  }
}
