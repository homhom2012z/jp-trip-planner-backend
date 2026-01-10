# JP Trip Planner - Backend

Node.js/Express backend for the Japan Trip Planner application. Handles authentication (via Supabase), itinerary management, and Google Sheets synchronization.

## Setup

1.  **Install Dependencies**:

    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in the values:

    ```bash
    cp .env.example .env
    ```

    - `PORT`: 4000
    - `SUPABASE_URL`: Your Supabase Project URL.
    - `SUPABASE_ANON_KEY`: Your Supabase Public Anon Key.
    - `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key (Keep this secret!).
    - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google Cloud Service Account Email.
    - `GOOGLE_PRIVATE_KEY`: Google Cloud Private Key (handle newlines correctly).

3.  **Run Locally**:

    ```bash
    # Development
    npm run dev

    # Production Build
    npm run build
    npm start
    ```

## API Routes

- `/auth/*`: Auth updates (hooks)
- `/api/locations`: Manage saved locations
- `/api/itinerary`: Manage itinerary days and items
- `/api/share`: Manage trip sharing logic
- `/api/collaborators`: Invite/Remove collaborators

## Deployment (Render/Railway)

1.  Push this repository to GitHub.
2.  Connect to Render/Railway.
3.  Set Build Command: `npm install && npm run build`
4.  Set Start Command: `npm start`
5.  **Important**: Add all environment variables from `.env` to your hosting provider's dashboard.
