import { Router } from "express";
import {
  updateLocationInSheet,
  disconnectSheet,
  getLocationsFromDb,
  syncSheetToDb,
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

// GET / - Get cached locations
router.get("/", validateAccess, async (req: any, res) => {
  try {
    const locations = await getLocationsFromDb(req.targetOwnerId);
    res.json({ locations });
  } catch (error: any) {
    console.error("Get Locations Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch locations" });
  }
});

// POST /sync - Force Sync from Google Sheet
router.post("/sync", validateAccess, async (req: any, res) => {
  try {
    const locations = await syncSheetToDb(req.targetOwnerId);
    res.json({ success: true, count: locations.length, locations });
  } catch (error: any) {
    console.error("Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/update", validateAccess, async (req: any, res) => {
  try {
    const { locationId, updates } = req.body;
    if (!locationId || !updates) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await updateLocationInSheet(req.targetOwnerId, locationId, updates);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Update failed", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/disconnect", validateAccess, async (req: any, res) => {
  try {
    await disconnectSheet(req.targetOwnerId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Disconnect failed", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
