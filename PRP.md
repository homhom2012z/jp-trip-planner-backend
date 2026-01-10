# Revised Project Requirements: User & Data Integration

## 1. User Authentication & Authorization

- **Google OAuth Integration**: Implement "Sign in with Google" to allow users to authenticate easily.
- **Access Control**: Collaborative access managed by the App.
  - **Decoupled Permissions**: The App acts as the "Master of Access". The Owner "shares" the list with specific emails within the App. The Backend uses the Owner's Google Token to fetch/update data, bypassing the need for Viewers to have direct Google Drive permissions.

## 2. Data Source: Google Sheets as "Source of Truth"

- **Spreadsheet Linking**: Connect Google account to designate a Sheet.
- **Database First & Caching**: **CRITICAL**. To prevent Rate Limiting, the App **ALWAYS** reads from the Supabase Database (Cache).
  - **Sync Logic**: A "Sync Now" button triggers a fetch from Google Sheets to update the Cache. User edits in the App update the Cache immediately and push to Google Sheets Asynchronously.
- **Template Provisioning**: Auto-generate new Sheets from templates.
- **Legacy Data Support**: Continue supporting CSV headers.

## 3. Technical Architecture

- **Backend Service (`jp-trip-planner-backend`)**: Dedicated Node.js/Express service.
- **Database (Supabase)**: Stores `profiles`, `cached_locations`, and `shared_access`.
- **Security (Encryption)**: Google Refresh Tokens **MUST** be encrypted (AES-256) before storage.

## 4. Security & Performance

- **Strict Security**: Token management and Role-Based Access Control (RBAC) in the backend.
- **Data Integrity**: Strict validation of Fixed Column structures.
