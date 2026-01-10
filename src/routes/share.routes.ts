import { Router } from "express";
import { z } from "zod";
import { ShareService } from "../services/shareService";

const router = Router();

const EnableShareSchema = z.object({
  ownerId: z.string().min(1),
});

const DisableShareSchema = z.object({
  ownerId: z.string().min(1),
});

const GetSharedTripSchema = z.object({
  slug: z.string().min(1),
});

// POST /api/share/enable
router.post("/enable", async (req, res) => {
  try {
    const { ownerId } = EnableShareSchema.parse(req.body);
    const slug = await ShareService.enableSharing(ownerId);
    res.json({ success: true, slug });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.issues });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// POST /api/share/disable
router.post("/disable", async (req, res) => {
  try {
    const { ownerId } = DisableShareSchema.parse(req.body);
    await ShareService.disableSharing(ownerId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/share/:slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = GetSharedTripSchema.parse(req.params);
    const data = await ShareService.getSharedTrip(slug);
    res.json(data);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

export default router;
