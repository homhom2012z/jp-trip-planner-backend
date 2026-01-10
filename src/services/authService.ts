import { CONFIG } from "../config";
import { google } from "googleapis";
import { supabaseAdmin } from "./supabase";
import { encrypt } from "../utils/encryption";
import { SheetsService } from "./sheets.service";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file", // To delete/manage file if needed
  "https://www.googleapis.com/auth/userinfo.email",
];

// Generate the URL for the user to authorize
export function getGoogleConfigStepUrl() {
  const oAuth2Client = new google.auth.OAuth2(
    CONFIG.GOOGLE.CLIENT_ID,
    CONFIG.GOOGLE.CLIENT_SECRET,
    CONFIG.GOOGLE.REDIRECT_URI
  );

  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force refresh token
  });
}

// Handle the Exchange and Setup
export async function linkGoogleAccount(userId: string, code: string) {
  const oAuth2Client = new google.auth.OAuth2(
    CONFIG.GOOGLE.CLIENT_ID,
    CONFIG.GOOGLE.CLIENT_SECRET,
    CONFIG.GOOGLE.REDIRECT_URI
  );

  // 1. Exchange Code
  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    // If user re-auths without prompt=consent, might not get refresh token.
    // Ideally we fail or ask them to revoke.
    console.warn(
      "No refresh token received. User might have already authorized."
    );
    // If we strictly need it, we might error out, or check if we already have one in DB.
  }

  const refreshToken = tokens.refresh_token;
  // If undefined, maybe we can proceed if we only need one-time access?
  // No, we need offline access for Sync.
  if (!refreshToken) {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("google_refresh_token")
      .eq("id", userId)
      .single();
    if (!existing?.google_refresh_token) {
      throw new Error(
        "Could not obtain Refresh Token. Please revoke access and try again."
      );
    }
    // If we have one, we can keep using it or update access token?
    // For this logic, let's assume we need it.
  }

  // 2. Encrypt Token
  const encryptedToken = refreshToken ? encrypt(refreshToken) : undefined;

  // 3. Create Spreadsheet (if one doesn't exist linked to this user?)
  // Check if user already has a sheet
  let spreadsheetId: string | undefined;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("spreadsheet_id")
    .eq("id", userId)
    .single();

  if (profile?.spreadsheet_id) {
    spreadsheetId = profile.spreadsheet_id;
  } else {
    // initialize auth for Sheets API
    oAuth2Client.setCredentials(tokens);
    const sheet = await SheetsService.createSpreadsheet(
      oAuth2Client,
      "JP Trip Planner Data"
    );
    spreadsheetId = sheet.spreadsheetId || undefined;
  }

  if (!spreadsheetId) throw new Error("Failed to create or find spreadsheet");

  // 4. Update Profile
  const updateData: any = {
    spreadsheet_id: spreadsheetId,
    updated_at: new Date().toISOString(),
  };
  if (encryptedToken) {
    updateData.google_refresh_token = encryptedToken;
  }

  // We upsert profiles. Note: 'profiles' usually created by Trigger on Auth.
  // But we make sure.
  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  if (error) throw error;

  return { success: true, spreadsheetId };
}
