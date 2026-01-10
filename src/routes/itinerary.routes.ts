import { Router } from "express";
import { z } from "zod";
import {
  syncItinerary,
  getItineraryFromDb,
  updateItineraryInSheet,
} from "../services/syncService";
import { requireAuth } from "../middleware/auth.middleware";
import { CollaboratorService } from "../services/collaboratorService";

const router = Router();

router.use(requireAuth);

// Helper to validate access
const validateAccess = async (req: any, res: any, next: any) => {
  try {
    // ownerId can be in query (GET) or body (POST)
    const targetOwnerId = req.query.ownerId || req.body.ownerId || req.user.id;
    const user = req.user!;

    const hasAccess = await CollaboratorService.hasAccess(
      targetOwnerId,
      user.email || "",
      user.id
    );

    if (!hasAccess) {
      return res
        .status(403)
        .json({
          error:
            "Access Denied: You do not have permission to view/edit this trip.",
        });
    }

    // Attach targetOwnerId to req for convenience
    req.targetOwnerId = targetOwnerId;
    next();
  } catch (e) {
    console.error("Access Validation Error:", e);
    return res
      .status(500)
      .json({ error: "Internal Server Error during access check" });
  }
};

// Validation Schemas
const OwnerIdSchema = z.object({
  ownerId: z.string().uuid().or(z.string().min(1)).optional(), // Made optional because we default to req.user.id
});

const ItineraryItemSchema = z.object({
  day: z.string(),
  locationId: z.string(),
  order: z.number(),
  note: z.string().optional(),
});

const UpdateItinerarySchema = z.object({
  ownerId: z.string().min(1),
  items: z.array(ItineraryItemSchema),
});

// GET /api/itinerary/sync?ownerId=...
router.get("/sync", validateAccess, async (req: any, res) => {
  try {
    // Trigger sync from sheet
    const data = await syncItinerary(req.targetOwnerId);
    res.json(data);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.issues });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// GET /api/itinerary?ownerId=...
router.get("/", validateAccess, async (req: any, res) => {
  try {
    const data = await getItineraryFromDb(req.targetOwnerId);
    res.json(data);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.issues });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// POST /api/itinerary/update
router.post("/update", validateAccess, async (req: any, res) => {
  try {
    const { items } = UpdateItinerarySchema.parse(req.body);

    await updateItineraryInSheet(req.targetOwnerId, items);
    res.json({ success: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.issues });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

export default router;
