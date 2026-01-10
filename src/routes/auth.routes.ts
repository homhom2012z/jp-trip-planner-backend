import { Router } from "express";
import {
  getGoogleConfigStepUrl,
  linkGoogleAccount,
} from "../services/authService";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// GET /auth/google/url - Get the URL to start OAuth
// Requires Login first? Yes, we want to link logic to the current user.
router.get("/google/url", requireAuth, (req, res) => {
  const url = getGoogleConfigStepUrl();
  res.json({ url });
});

// POST /auth/google/callback - Frontend sends 'code' here
router.post("/google/callback", requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  try {
    const result = await linkGoogleAccount(req.user!.id, code);
    res.json(result);
  } catch (error: any) {
    console.error("Link Account Error:", error);
    res.status(500).json({ error: error.message || "Failed to link account" });
  }
});

export default router;
