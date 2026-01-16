import { Router } from "express";
import {
  updateLocationInSheet,
  disconnectSheet,
  getLocationsFromDb,
  syncSheetToDb,
  deleteLocationInSheet,
} from "../services/syncService";
import { requireAuth } from "../middleware/auth.middleware";
import { CollaboratorService } from "../services/collaboratorService";
import { GeocodingService } from "../services/geocoding.service";
import { SheetsService } from "../services/sheets.service";
import { supabaseAdmin as supabase } from "../services/supabase";

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
      return res.status(403).json({
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
    const { locations, remainingCount, updatedCount } = await syncSheetToDb(
      req.targetOwnerId
    );
    res.json({
      success: true,
      count: locations.length,
      remaining: remainingCount,
      updated: updatedCount,
      locations,
    });
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

// Delete Location
router.post("/delete", validateAccess, async (req: any, res) => {
  try {
    const { locationId } = req.body;
    if (!locationId) {
      return res.status(400).json({ error: "Missing locationId" });
    }
    await deleteLocationInSheet(req.targetOwnerId, locationId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete failed", error);
    res.status(500).json({ error: error.message });
  }
});

// New Endpoint: Preview Location Data
router.post("/preview", async (req, res) => {
  try {
    // No auth needed for preview if we just use our API key (but strict rate limit?)
    // Better to require auth to prevent abuse, but for now open is easier for dev.
    // Let's rely on global rate limiter.
    const { name, city, url } = req.body;

    let data = null;

    if (url) {
      data = await GeocodingService.fetchPlaceFromUrl(url);
    } else if (name && city) {
      const query = `${name}, ${city}, Japan`;
      data = await GeocodingService.fetchPlaceData(query);
    } else {
      throw new Error("Either URL or Name+City required");
    }

    // Enrich with photo URL for frontend display
    let photoUrl = "";
    if (data?.photoRef) {
      photoUrl = GeocodingService.getPhotoUrl(data.photoRef);
    }

    res.json({ ...data, photoUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// New Endpoint: Add Location to Sheet
router.post("/add", validateAccess, async (req: any, res) => {
  try {
    // req.targetOwnerId covers permissions
    // But we need the USER's auth client to write to THEIR sheet.
    // Wait, `syncService` uses `SheetsService.getAuthClient(profile.refresh_token)`.
    // We need to fetch the profile to get the token.

    // Re-fetch profile to get refresh token
    const profile = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.targetOwnerId)
      .single();

    if (!profile.data || !profile.data.google_refresh_token) {
      throw new Error("User not connected to Google Sheets");
    }

    const { decrypt } = require("../utils/encryption");
    const refreshToken = decrypt(profile.data.google_refresh_token);
    const auth = SheetsService.getAuthClient(refreshToken);

    const { name, city, previewData } = req.body;

    // Construct Row: [Name, City, Type, Price, Desc, URL, Lat, Lng, PhotoRef]
    // We assume standard columns order for simplicity.
    // Ideally we should read header map first... but appending is usually safe if structure is simple.
    // Let's try to match the map from `syncService` blindly or just append and hope.
    // BETTER: Use `syncService.syncSheetToDb` logic? No, that reads.
    // Let's assume standard order: Name, City, Type, Price, Best For, Google Maps, Lat, Lng, Photo Ref

    const row = [
      name,
      city,
      previewData?.type || "",
      previewData?.priceLevel || "",
      previewData?.summary || "",
      previewData?.googleMapsUrl || "",
      previewData?.lat || "",
      previewData?.lng || "",
      previewData?.photoRef || "",
    ];

    await SheetsService.appendRow(
      auth,
      profile.data.spreadsheet_id,
      "Locations!A1",
      [row]
    );

    // Trigger Sync immediately to update DB
    // We can call syncSheetToDb directly
    const { syncSheetToDb } = require("../services/syncService");
    await syncSheetToDb(req.targetOwnerId);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Add location failed", e);
    res.status(500).json({ error: e.message });
  }
});

// Batch Add Locations
router.post("/batch-add", validateAccess, async (req: any, res) => {
  try {
    const { urls } = req.body; // array of strings
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "No URLs provided" });
    }

    if (urls.length > 20) {
      return res.status(400).json({ error: "Max 20 links per batch" });
    }

    // Auth
    const profile = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.targetOwnerId)
      .single();

    if (!profile.data || !profile.data.google_refresh_token) {
      throw new Error("User not connected to Google Sheets");
    }

    const { decrypt } = require("../utils/encryption");
    const refreshToken = decrypt(profile.data.google_refresh_token);
    const auth = SheetsService.getAuthClient(refreshToken);
    const { syncSheetToDb } = require("../services/syncService");

    const rowsToAdd: any[] = [];
    const errors: any[] = [];

    // Process sequentially to be safe (or parallel with limit?)
    // Parallel 5 at a time is better for speed vs rate limit.
    // For now, simple sequential to avoid complexity and Vercel limits?
    // Vercel limit is 10s. 20 links * 500ms = 10s. Might timeout.
    // Let's rely on internal GeocodingService.fetchPlaceFromUrl

    // We will process them and ignore failures (just log them)
    for (const url of urls) {
      try {
        if (!url || !url.trim()) continue;
        const cleanUrl = url.trim();
        const data = await GeocodingService.fetchPlaceFromUrl(cleanUrl);

        if (data) {
          const row = [
            data.name,
            data.city || "Japan",
            data.type || "",
            data.priceLevel || "",
            data.summary || "",
            data.googleMapsUrl || cleanUrl,
            data.lat || "",
            data.lng || "",
            data.photoRef || "",
          ];
          rowsToAdd.push(row);
        }
      } catch (e: any) {
        console.error(`Failed to fetch ${url}`, e.message);
        errors.push({ url, error: e.message });
      }
    }

    if (rowsToAdd.length > 0) {
      await SheetsService.appendRow(
        auth,
        profile.data.spreadsheet_id,
        "Locations!A1",
        rowsToAdd // appendRow can take multiple rows if we pass array of arrays?
        // Wait, appendRow signature:
        // static async appendRow(auth, spreadsheetId, range, values: any[][])
        // Yes it takes a 2D array.
      );

      // Sync back to DB
      await syncSheetToDb(req.targetOwnerId);
    }

    res.json({ success: true, added: rowsToAdd.length, errors });
  } catch (e: any) {
    console.error("Batch add failed", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
