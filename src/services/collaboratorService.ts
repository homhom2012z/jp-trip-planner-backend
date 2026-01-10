import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";

const supabase = createClient(
  CONFIG.SUPABASE.URL,
  CONFIG.SUPABASE.SERVICE_KEY || CONFIG.SUPABASE.ANON_KEY
);

console.log(
  "[CollaboratorService] Initialized. Using Service Key:",
  !!CONFIG.SUPABASE.SERVICE_KEY
);

export class CollaboratorService {
  /**
   * List all collaborators for a specific trip owner.
   */
  static async listCollaborators(ownerId: string) {
    const { data, error } = await supabase
      .from("trip_collaborators")
      .select("email, created_at")
      .eq("trip_owner_id", ownerId);

    if (error) {
      console.error("Error listing collaborators:", error);
      throw new Error("Failed to list collaborators");
    }

    return data || [];
  }

  /**
   * Invite a collaborator (email) to the owner's trip.
   */
  static async inviteCollaborator(ownerId: string, email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    // 1. Check if already exists
    const { data: existing } = await supabase
      .from("trip_collaborators")
      .select("id")
      .eq("trip_owner_id", ownerId)
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      return; // Already invited
    }

    // 2. Insert
    const { error } = await supabase.from("trip_collaborators").insert({
      trip_owner_id: ownerId,
      email: normalizedEmail,
    });

    if (error) {
      console.error("Error inviting collaborator:", error);
      throw new Error("Failed to invite collaborator");
    }
  }

  /**
   * Remove a collaborator.
   */
  static async removeCollaborator(ownerId: string, email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    // Use ilike to match case-insensitively, ensuring we delete any mixed-case legacy records
    const { error } = await supabase
      .from("trip_collaborators")
      .delete()
      .eq("trip_owner_id", ownerId)
      .ilike("email", normalizedEmail);

    if (error) {
      console.error("Error removing collaborator:", error);
      throw new Error("Failed to remove collaborator");
    }
  }

  /**
   * Get list of trips that this email has access to (shared with them).
   * Returns a list of trip owners (profiles).
   */
  static async getSharedTrips(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    // 1. Get owner_ids from collaborators table
    const { data: collaborations, error: collabError } = await supabase
      .from("trip_collaborators")
      .select("trip_owner_id")
      .eq("email", normalizedEmail);

    if (collabError) {
      throw new Error("Failed to fetch shared trips");
    }

    if (!collaborations || collaborations.length === 0) {
      return [];
    }

    const ownerIds = collaborations.map((c) => c.trip_owner_id);

    // 2. Fetch profile details for these owners
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);

    if (profileError) {
      console.error(
        "[CollaboratorService] Error querying profiles:",
        profileError
      );
      throw new Error(
        "Failed to fetch shared trip details: " + profileError.message
      );
    }

    return profiles || [];
  }

  /**
   * Check if a user (email) has access to a target owner's trip.
   * Access granted if:
   * 1. targetOwnerId matches the user's ID (Self).
   * 2. The user's email is in the target owner's collaborators list.
   *
   * @param targetOwnerId The ID of the trip owner.
   * @param userEmail The email of the user trying to access.
   * @param userId The ID of the user trying to access (for self-check).
   */
  static async hasAccess(
    targetOwnerId: string,
    userEmail: string,
    userId: string
  ): Promise<boolean> {
    // 1. Self Check
    if (targetOwnerId === userId) {
      return true;
    }

    // 2. Collaborator Check
    const { data } = await supabase
      .from("trip_collaborators")
      .select("id")
      .eq("trip_owner_id", targetOwnerId)
      .eq("email", userEmail.toLowerCase().trim())
      .single();

    return !!data;
  }

  /**
   * Fetch a profile by ID using Service Role.
   */
  static async getOwnerProfile(ownerId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, spreadsheet_id, public_slug, is_public")
      .eq("id", ownerId)
      .single();

    if (error) {
      throw new Error("Failed to fetch owner profile: " + error.message);
    }
    return data;
  }
}
