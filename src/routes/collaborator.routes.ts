import { Router } from "express";
import { z } from "zod";
import { CollaboratorService } from "../services/collaboratorService";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Apply Auth Middleware to all routes
router.use(requireAuth);

// --- Validation Schemas ---
const InviteSchema = z.object({
  email: z.string().email(),
});

const EmailParamSchema = z.object({
  email: z.string().email(),
});

// --- Routes ---

// GET /api/collaborators
// List invitees for a trip (if I have access)
router.get("/", async (req, res) => {
  try {
    const requestedOwnerId = (req.query.ownerId as string) || req.user!.id;
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    if (!userEmail) {
      res.status(400).json({ error: "User email required" });
      return;
    }

    // Validate access: must be owner OR collaborator
    const hasAccess = await CollaboratorService.hasAccess(
      requestedOwnerId,
      userEmail,
      userId
    );

    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Only trip owner can list collaborators (not collaborators themselves)
    if (requestedOwnerId !== userId) {
      res
        .status(403)
        .json({ error: "Only trip owner can manage collaborators" });
      return;
    }

    const collaborators = await CollaboratorService.listCollaborators(
      requestedOwnerId
    );
    res.json(collaborators);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Invalid request" });
  }
});

// POST /api/collaborators/invite
// Invite someone to a trip (owner only)
router.post("/invite", async (req, res) => {
  try {
    const { email, ownerId: requestedOwnerId } = req.body;
    const ownerId = requestedOwnerId || req.user!.id;
    const userId = req.user!.id;

    // Only the trip owner can invite collaborators
    if (ownerId !== userId) {
      res
        .status(403)
        .json({ error: "Only trip owner can invite collaborators" });
      return;
    }

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Valid email required" });
      return;
    }

    await CollaboratorService.inviteCollaborator(ownerId, email);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to invite" });
  }
});

// DELETE /api/collaborators/:email
// Remove someone from a trip (owner only)
router.delete("/:email", async (req, res) => {
  try {
    const { email } = EmailParamSchema.parse(req.params);
    const requestedOwnerId = (req.query.ownerId as string) || req.user!.id;
    const userId = req.user!.id;

    // Only the trip owner can remove collaborators
    if (requestedOwnerId !== userId) {
      res
        .status(403)
        .json({ error: "Only trip owner can remove collaborators" });
      return;
    }

    await CollaboratorService.removeCollaborator(requestedOwnerId, email);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to remove" });
  }
});

// GET /api/collaborators/accessible
// List trips shared WITH me
router.get("/accessible", async (req, res) => {
  try {
    const email = req.user!.email;
    if (!email) {
      res.status(400).json({ error: "User email not found in token" });
      return;
    }
    const trips = await CollaboratorService.getSharedTrips(email);
    res.json(trips);
  } catch (e: any) {
    console.error("[GET /accessible] Error fetching trips:", e);
    res
      .status(400)
      .json({ error: e.message || "Failed to fetch accessible trips" });
  }
});
// GET /api/collaborator/:ownerId/profile
// Get the profile of a trip owner (if I have access)
router.get("/:ownerId/profile", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const userEmail = req.user!.email;
    const userId = req.user!.id;

    if (!userEmail) {
      res.status(400).json({ error: "User email required" });
      return;
    }

    const hasAccess = await CollaboratorService.hasAccess(
      ownerId,
      userEmail,
      userId
    );

    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Fetch profile using Service Role (via CollaboratorService helper)
    const profile = await CollaboratorService.getOwnerProfile(ownerId);
    res.json(profile);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to fetch profile" });
  }
});

export default router;
