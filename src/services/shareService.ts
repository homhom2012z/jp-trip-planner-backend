import { supabaseAdmin as supabase } from "./supabase";
import { v4 as uuidv4 } from "uuid";
import { nanoid } from "nanoid";

export class ShareService {
  /**
   * Enable sharing for a user by generating a public slug.
   * If already shared, return the existing slug.
   */
  static async enableSharing(ownerId: string): Promise<string> {
    // Check if duplicate
    const { data: existing } = await supabase
      .from("profiles")
      .select("public_slug")
      .eq("id", ownerId)
      .single();

    if (existing?.public_slug) {
      return existing.public_slug;
    }

    // Generate new slug (short ID)
    const slug = nanoid(10); // 10 chars should be enough collision resistance for now

    const { error } = await supabase
      .from("profiles")
      .update({ public_slug: slug, is_public: true })
      .eq("id", ownerId);

    if (error) {
      console.error("Error enabling sharing:", error);
      throw new Error("Failed to enable sharing");
    }

    return slug;
  }

  /**
   * Disable sharing for a user.
   */
  static async disableSharing(ownerId: string): Promise<void> {
    const { error } = await supabase
      .from("profiles")
      .update({ public_slug: null, is_public: false })
      .eq("id", ownerId);

    if (error) {
      throw new Error("Failed to disable sharing");
    }
  }

  /**
   * Get public trip data by slug.
   * Returns profile info + locations + itinerary (if any).
   */
  static async getSharedTrip(slug: string) {
    // 1. Get Owner ID from Slug
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, is_public") // minimal info
      .eq("public_slug", slug)
      .single();

    if (profileError || !profile) {
      throw new Error("Trip not found");
    }

    if (!profile.is_public) {
      throw new Error("This trip is not public");
    }

    // 2. Fetch Locations from Cache
    const { data: locData, error: locError } = await supabase
      .from("cached_locations")
      .select("data")
      .eq("owner_id", profile.id)
      .single();

    if (locError && locError.code !== "PGRST116") {
      throw new Error(`Failed to fetch locations: ${locError.message}`);
    }

    // 3. Fetch Itinerary from Cache
    const { data: itinData, error: itinError } = await supabase
      .from("cached_itineraries")
      .select("data")
      .eq("owner_id", profile.id)
      .single();

    if (itinError && itinError.code !== "PGRST116") {
      // Itinerary is optional
    }

    return {
      owner: {
        email: profile.email,
      },
      locations: locData?.data || [],
      itinerary: itinData?.data || [],
    };
  }
}
