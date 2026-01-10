import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { syncSheetToDb } from "../services/syncService";

const router = Router();

// POST /api/locations/sync - Force Sync from Google Sheet
router.post("/sync", requireAuth, async (req, res) => {
  try {
    const locations = await syncSheetToDb(req.user!.id);
    res.json({ success: true, count: locations.length, locations });
  } catch (error: any) {
    console.error("Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
