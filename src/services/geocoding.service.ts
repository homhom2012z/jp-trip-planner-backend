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
      // Fields: name, url, website, price_level, type, editorial_summary
      // Added 'name' to fields
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,geometry,photos,url,website,price_level,types,editorial_summary&key=${CONFIG.GOOGLE.MAPS_KEY}`;

      const detailsRes = await axios.get(detailsUrl);
      if (detailsRes.data.status !== "OK") {
        console.warn(`Place details failed for ID ${placeId}`);
        // Fallback to basic info from search result
        return {
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          photoRef: place.photos?.[0]?.photo_reference,
        };
      }

      const d = detailsRes.data.result;

      // 3. Map Data
      const result = {
        name: d.name,
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
      let finalUrl = url;

      // 1. Expand Short URL (maps.app.goo.gl)
      if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
        try {
          // axios won't follow redirects automatically if we just want the header location?
          // Actually axios follows redirects by default. We just want the final URL.
          const response = await axios.head(url, {
            validateStatus: (status) => status >= 200 && status < 400,
          });
          finalUrl = response.request.res.responseUrl || url;
        } catch (e) {
          console.warn("Failed to expand URL", e);
          // Try GET if HEAD failed (sometimes servers block HEAD)
          try {
            const response = await axios.get(url, {
              validateStatus: (status) => status >= 200 && status < 400,
            });
            finalUrl = response.request.res.responseUrl || url;
          } catch (ex) {
            console.error("Failed to expand URL via GET", ex);
            return null;
          }
        }
      }

      // 2. Extract Identifier
      // Case A: .../maps/place/Name/data... (Name is url encoded)
      // Case B: .../maps/place/...@lat,lng...
      // Case C: ... cid=... (CID is Place ID related, often decimal)
      // Case D: Place ID directly? Not common in public URLs.

      console.log("Parsing Expanded URL:", finalUrl);
      const urlObj = new URL(finalUrl);

      // Check for CID (decimal representation of FTID/PlaceID features?)
      // Actually CID in maps URL is often used for specific POIs.
      // Example: https://www.google.com/maps?cid=123456789...
      const cid = urlObj.searchParams.get("cid");
      if (cid) {
        // Warning: CID is NOT the standard Place ID (ChIJ...).
        // Converting CID to Place ID is complex directly.
        // EASIER: The URL often contains the name in the path if it's a "/maps/place/..." URL.
      }

      // Regex for "/maps/place/NAME/@..."
      const placeMatch = finalUrl.match(/\/maps\/place\/([^/]+)\//);
      if (placeMatch && placeMatch[1]) {
        let name = decodeURIComponent(placeMatch[1]);
        // Replace + with space
        name = name.replace(/\+/g, " ");

        // Sometimes name is just coordinates "lat,lng". Check if it looks like coords.
        if (!name.match(/^-?\d+\.\d+,-?\d+\.\d+$/)) {
          console.log("Extracted Name from URL:", name);
          return this.fetchPlaceData(name);
        }
      }

      // If we can't get a name, maybe we can get coordinates?
      // Regex for "@lat,lng,"
      const coordsMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordsMatch) {
        // If we only have coords, we can't get rich details easily without a "Reverse Geocode" -> "Place Details" flow.
        // But GeocodingService.fetchPlaceData expects a query string.
        // We can try to reverse geocode?
        // For now, let's just return null if no Name found, as user expects rich data.
        // OR, try a text search with lat,lng?
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
