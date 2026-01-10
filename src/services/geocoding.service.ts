import axios from "axios";
import { CONFIG } from "../config";

export class GeocodingService {
  /**
   * Fetches lat/lng and photo reference for a given query string.
   */
  static async fetchPlaceData(
    query: string
  ): Promise<{ lat: number; lng: number; photoRef?: string } | null> {
    if (!CONFIG.GOOGLE.MAPS_KEY) return null;
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        query
      )}&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const res = await axios.get(url);
      if (res.data.status === "OK" && res.data.results.length > 0) {
        const place = res.data.results[0];
        const loc = place.geometry.location;
        const result: { lat: number; lng: number; photoRef?: string } = {
          lat: loc.lat,
          lng: loc.lng,
        };

        if (place.photos && place.photos.length > 0) {
          result.photoRef = place.photos[0].photo_reference;
        }
        return result;
      } else {
        console.warn(`Place search failed for "${query}": ${res.data.status}`);
      }
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
}
