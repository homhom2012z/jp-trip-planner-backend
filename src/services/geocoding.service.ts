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
      // Fields: url (Google Maps), website, price_level, type, editorial_summary
      // Note: editorial_summary might not be available for all places.
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,photos,url,website,price_level,types,editorial_summary&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const detailsRes = await axios.get(detailsUrl);
      if (detailsRes.data.status !== "OK") {
        console.warn(`Place details failed for ID ${placeId}`);
        // Fallback to basic info from search result
        return {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          photoRef: place.photos?.[0]?.photo_reference,
        };
      }

      const d = detailsRes.data.result;

      // 3. Map Data
      const result = {
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
   * Generates a photo URL from a reference.
   */
  static getPhotoUrl(photoRef: string): string {
    if (!photoRef || !CONFIG.GOOGLE.MAPS_KEY) return "";
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${CONFIG.GOOGLE.MAPS_KEY}`;
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
