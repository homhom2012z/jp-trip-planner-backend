import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../services/supabase";

// Add user to Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Missing Authorization Header" });
    return; // Ensure return to stop execution
  }

  const token = authHeader.replace("Bearer ", "");

  // Verify JWT using Supabase
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Invalid Token" });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email || user.user_metadata?.email,
  };

  next();
}
