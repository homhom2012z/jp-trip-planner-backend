// Vercel Serverless Function Entry Point
// This bridges the Vercel request to the Express app.

import app from "../src/index"; // We will modify src/index.ts to export 'app'

export default app;
