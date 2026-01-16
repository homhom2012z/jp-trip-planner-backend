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
  } | null> {
    if (!CONFIG.GOOGLE.MAPS_KEY) return null;
    try {
      // 1. Text Search to get Place ID
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        query
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
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,geometry,photos,url,website,price_level,types,editorial_summary,address_components&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const detailsRes = await axios.get(detailsUrl);
      if (detailsRes.data.status !== "OK") {
        console.warn(`Place details failed for ID ${placeId}`);
        // Fallback to basic info from search result
        return {
          name: place.name,
          city: "Japan", // Basic fallback
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
      };

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
          "Found coordinates but no name. Text search might be ambiguous."
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

    // 2. Administrative Area Level 1 (Prefecture) - e.g. Tokyo (when special wards not grouped as locality)
    // Note: For Tokyo 23 wards, locality is often missing, and Wards are sublocality_level_1.
    // If we want "Tokyo", level_1 is good.
    const admin1 = components.find((c) =>
      c.types.includes("administrative_area_level_1")
    );
    const ward = components.find(
      (c) => c.types.includes("ward") || c.types.includes("sublocality_level_1")
    ); // Special ward

    // If it's a ward in Tokyo, user might prefer "Tokyo" or the Ward name "Shibuya".
    // "Tokyo" is safer for grouping.
    if (admin1) {
      // If it's Tokyo, and we have a ward, maybe "Tokyo"? or "Shibuya, Tokyo"?
      // Simply returning admin1 (Prefecture) is a safe bet for "City" column generally.
      return admin1.long_name;
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
