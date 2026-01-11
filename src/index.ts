import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { CONFIG } from "./config";
import { checkSupabaseConnection } from "./services/supabase";
import authRoutes from "./routes/auth.routes";
import sheetsRoutes from "./routes/sheets.routes";
import locationsRoutes from "./routes/locations.routes";
import itineraryRoutes from "./routes/itinerary.routes";
import shareRoutes from "./routes/share.routes";
import collaboratorRoutes from "./routes/collaborator.routes";

const app = express();
const port = process.env.PORT || 4000;

// Security Middleware
app.use(helmet());

// Rate Limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Strict CORS: Allow localhost (dev) and production domains
const allowedOrigins = [
  "http://localhost:3000",
  "https://jp-trip-planner.vercel.app", // Adjust if needed
];

app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/auth", authRoutes);
// app.use("/api/sheets", sheetsRoutes); // Deprecated
app.use("/api/locations", locationsRoutes);
app.use("/api/itinerary", itineraryRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/collaborators", collaboratorRoutes);

// Health Check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root Route (for easy verification)
app.get("/", (req: Request, res: Response) => {
  res.json({
    service: "JP Trip Planner API",
    status: "running",
    docs: "/health",
  });
});

// Export the app for Vercel (serverless) or testing
export default app;

// Start Server locally if run directly
if (require.main === module) {
  app.listen(CONFIG.PORT, async () => {
    console.log(`[Server] Running on http://localhost:${CONFIG.PORT}`);

    // Verify DB connection on start
    await checkSupabaseConnection();
  });
}
