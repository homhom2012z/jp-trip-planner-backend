import { supabaseAdmin } from "./supabase";
import { decrypt } from "../utils/encryption";
import { Location } from "../types";
import { CONFIG } from "../config";
import { GeocodingService } from "./geocoding.service";
import { SheetsService } from "./sheets.service";

// Transform Raw Rows (Arrays) to Location Objects
function transformRowsToLocations(rows: string[][], colMap: any): Location[] {
  // Helper to get value
  const getVal = (row: string[], idx: number) => (idx >= 0 ? row[idx] : "");

  return rows.slice(1).map((row, idx) => {
    const photoRef = getVal(row, colMap.photo);
    let photoUrl = undefined;

    // Check if user manually pasted a URL
    if (photoRef?.startsWith("http")) {
      photoUrl = photoRef;
    } else if (photoRef) {
      photoUrl = GeocodingService.getPhotoUrl(photoRef);
    }

    return {
      id: `loc-${idx}`, // Generate ID based on index for now
      name: getVal(row, colMap.name) || "Unknown",
      city: getVal(row, colMap.city) || "Japan",
      type: getVal(row, colMap.type) || "Spot",
      priceJpy: getVal(row, colMap.price) || "-",
      priceThb: "-", // Calc?
      description: getVal(row, colMap.desc) || "",
      googleMapsUrl: getVal(row, colMap.url) || "#",
      lat: parseFloat(getVal(row, colMap.lat)) || 0,
      lng: parseFloat(getVal(row, colMap.lng)) || 0,
      photoUrl, // Derived from PhotoRef or Manual URL
    };
  });
}

// Sync Strategy: Read Google -> Write DB
export async function syncSheetToDb(ownerId: string) {
  // 1. Get User Profile with Encrypted Token
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("google_refresh_token, spreadsheet_id")
    .eq("id", ownerId)
    .single();

  if (
    error ||
    !profile ||
    !profile.spreadsheet_id ||
    !profile.google_refresh_token
  ) {
    throw new Error("User profile incomplete or missing sheet.");
  }

  // 2. Decrypt Token & Get Auth Client
  const refreshToken = decrypt(profile.google_refresh_token);
  const auth = SheetsService.getAuthClient(refreshToken);

  // 3. Fetch from Google
  // Extend range to cover potential extra columns
  const rows = await SheetsService.getValues(
    auth,
    profile.spreadsheet_id,
    "Locations!A:Z"
  );

  if (!rows || rows.length === 0) return [];

  // 3.1 Dynamic Header Mapping
  const headerRow = rows[0].map((h: string) => h.toLowerCase().trim());
  const colMap = {
    name: headerRow.indexOf("restaurant name"), // Or just "Name"
    city: headerRow.indexOf("city"),
    type: headerRow.indexOf("cuisine type"), // Or "Type"
    price: headerRow.indexOf("price (jpy)"),
    desc: headerRow.indexOf("best for"), // description
    url: headerRow.indexOf("google maps"),
    lat: headerRow.indexOf("latitude"),
    lng: headerRow.indexOf("longitude"),
    photo: headerRow.indexOf("photo reference"),
  };

  // Fallback if headers are completely missing/wrong names (Legacy support)
  // Indices: 0, 1, 2, 3, 4, 5, 6, 7, 8
  if (colMap.name === -1) colMap.name = 0;
  if (colMap.city === -1) colMap.city = 1;
  if (colMap.type === -1) colMap.type = 2;
  if (colMap.price === -1) colMap.price = 3;
  if (colMap.desc === -1) colMap.desc = 4;
  if (colMap.url === -1) colMap.url = 5;
  if (colMap.lat === -1) colMap.lat = 6;
  if (colMap.lng === -1) colMap.lng = 7;
  if (colMap.photo === -1) colMap.photo = 8;

  // Check and Repair Headers (if lat/lng columns completely missing from index)
  // If the sheet has fewer columns than where 'longitude' should be, we might need to add them.
  // Ideally, if "Latitude" is missing, we append it to the header.
  if (colMap.lat === -1 || colMap.lng === -1 || colMap.photo === -1) {
    console.log("[Sync] repairing/appending missing headers...");
    const newHeaders = [...rows[0]];
    if (colMap.lat === -1) {
      newHeaders.push("Latitude");
      colMap.lat = newHeaders.length - 1;
    }
    if (colMap.lng === -1) {
      newHeaders.push("Longitude");
      colMap.lng = newHeaders.length - 1;
    }
    if (colMap.photo === -1) {
      newHeaders.push("Photo Reference");
      colMap.photo = newHeaders.length - 1;
    }
    // Update Header Row
    await SheetsService.updateRange(
      auth,
      profile.spreadsheet_id,
      "Locations!A1",
      [newHeaders]
    );
  }

  // Helper to get value for updates
  const getVal = (row: string[], idx: number) => (idx >= 0 ? row[idx] : "");

  const locations = transformRowsToLocations(rows, colMap);
  const updates: {
    rowIdx: number;
    lat: number;
    lng: number;
    photoRef: string;
  }[] = [];

  // Identify items needing fetch
  let itemsToFetch = locations
    .map((loc, i) => ({ loc, i }))
    .filter(({ loc, i }) => {
      const rawRow = rows[i + 1];
      const hasPhotoRef = rawRow && getVal(rawRow, colMap.photo);
      return loc.name !== "Unknown" && (!loc.lat || !loc.lng || !hasPhotoRef);
    });

  if (itemsToFetch.length > 0) {
    // VERCEL FREE TIER FIX:
    // Limit to 5 items per Sync request to prevent 10s timeout.
    // User will need to click "Sync" multiple times if they have many new locations.
    const BATCH_SIZE = 5;
    if (itemsToFetch.length > BATCH_SIZE) {
      console.log(
        `[Sync] Too many items (${itemsToFetch.length}), processing first ${BATCH_SIZE} only...`
      );
      itemsToFetch = itemsToFetch.slice(0, BATCH_SIZE);
    } else {
      console.log(`[Sync] Enriching ${itemsToFetch.length} locations...`);
    }

    // Batch in chunks if necessary, but Maps API is robust.
    const results = await Promise.all(
      itemsToFetch.map(async ({ loc }) => {
        const query = `${loc.name}, ${loc.city}, Japan`;
        return {
          loc,
          data: await GeocodingService.fetchPlaceData(query),
        };
      })
    );

    // Process Results
    results.forEach(({ loc, data }, idx) => {
      const originalIndex = itemsToFetch[idx].i; // index in 'locations' array

      if (data) {
        if (!loc.lat || !loc.lng) {
          loc.lat = data.lat;
          loc.lng = data.lng;
        }
        const photoRef = data.photoRef || "";

        updates.push({
          rowIdx: originalIndex + 2, // 1-based + 1 header
          lat: loc.lat!,
          lng: loc.lng!,
          photoRef,
        });

        // Update local photoUrl
        if (photoRef) {
          loc.photoUrl = GeocodingService.getPhotoUrl(photoRef);
        }
      }
    });
  }

  // 3.6 Batch Write Back to Google Sheets
  if (updates.length > 0) {
    console.log(`[Sync] Batch updating ${updates.length} rows in Sheet...`);

    const getColLetter = (n: number) => String.fromCharCode(65 + n); // A=65

    const batchData = updates
      .map((u) => {
        const changes = [];
        if (colMap.lat !== -1)
          changes.push({
            range: `Locations!${getColLetter(colMap.lat)}${u.rowIdx}`,
            values: [[u.lat]],
          });
        if (colMap.lng !== -1)
          changes.push({
            range: `Locations!${getColLetter(colMap.lng)}${u.rowIdx}`,
            values: [[u.lng]],
          });
        if (colMap.photo !== -1)
          changes.push({
            range: `Locations!${getColLetter(colMap.photo)}${u.rowIdx}`,
            values: [[u.photoRef]],
          });
        return changes;
      })
      .flat();

    await SheetsService.batchUpdateValues(
      auth,
      profile.spreadsheet_id,
      batchData
    );
  }

  // 4. Update Supabase Cache
  const { error: upsertError } = await supabaseAdmin
    .from("cached_locations")
    .upsert(
      {
        owner_id: ownerId,
        sheet_id: profile.spreadsheet_id,
        data: locations,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );

  if (upsertError) throw upsertError;

  return locations;
}

// Read Strategy: Read DB (Fast)
export async function getLocationsFromDb(ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("cached_locations")
    .select("data")
    .eq("owner_id", ownerId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "no rows returned"
    throw error;
  }

  // "Database First" means we return what we have.
  return data?.data || [];
}

// Update Single Location
export async function updateLocationInSheet(
  ownerId: string,
  locationId: string,
  updates: Partial<Location>
) {
  // 1. Get User Profile
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("google_refresh_token, spreadsheet_id")
    .eq("id", ownerId)
    .single();

  if (error || !profile?.spreadsheet_id || !profile?.google_refresh_token) {
    throw new Error("User profile incomplete.");
  }

  // 2. Parse Row Index from ID (loc-0 -> Row 2)
  const rowIndex = parseInt(locationId.replace("loc-", "")) + 2;
  if (isNaN(rowIndex)) throw new Error("Invalid Location ID");

  // 3. Decrypt & Auth
  const refreshToken = decrypt(profile.google_refresh_token);
  const auth = SheetsService.getAuthClient(refreshToken);

  // 4. Determine Column & Value to Update
  // We map fields to Column Letters: A=Name, B=City, C=Type, D=Price
  // Note: We only support basic field updates for now.
  // TODO: Use Dynamic Header Logic here too if we want true robustness, but for now fixed A-D is legacy behavior.
  // Warning: If user moves columns, this breaks.
  // For safety, let's assume standard A-D for now as implementing dynamic read here is costly (double fetch).

  const changes = [];
  if (updates.name)
    changes.push({ range: `Locations!A${rowIndex}`, values: [[updates.name]] });
  if (updates.city)
    changes.push({ range: `Locations!B${rowIndex}`, values: [[updates.city]] });
  if (updates.type)
    changes.push({ range: `Locations!C${rowIndex}`, values: [[updates.type]] });
  if (updates.priceJpy)
    changes.push({
      range: `Locations!D${rowIndex}`,
      values: [[updates.priceJpy]],
    });

  if (changes.length > 0) {
    await SheetsService.batchUpdateValues(
      auth,
      profile.spreadsheet_id,
      changes
    );
  }

  // 5. Update Cache (Optimistic)
  // Fetch current cache, modify one item, save back
  const { data: cache } = await supabaseAdmin
    .from("cached_locations")
    .select("data")
    .eq("owner_id", ownerId)
    .single();

  if (cache?.data) {
    const newLocations = (cache.data as Location[]).map((loc) => {
      if (loc.id === locationId) {
        return { ...loc, ...updates };
      }
      return loc;
    });

    await supabaseAdmin
      .from("cached_locations")
      .update({ data: newLocations, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId);
  }

  return { success: true };
}

// Disconnect Sheet
export async function disconnectSheet(ownerId: string) {
  // 1. Clear profile spreadsheet_id
  await supabaseAdmin
    .from("profiles")
    .update({ spreadsheet_id: null })
    .eq("id", ownerId);

  // 2. Delete cache
  await supabaseAdmin.from("cached_locations").delete().eq("owner_id", ownerId);

  return { success: true };
}
// ... (previous code)

// ITINERARY FUNCTIONS

// Transform Itinerary Rows
function transformRowsToItinerary(rows: string[][]) {
  // Header: Day (A), LocationId (B), Order (C), Note (D)
  return rows
    .slice(1)
    .map((row, idx) => ({
      day: row[0] || "Unscheduled",
      locationId: row[1] || "",
      order: row[2] ? parseInt(row[2]) : idx,
      note: row[3] || "",
    }))
    .filter((item) => item.locationId); // Only keeps rows with valid Location IDs
}

// Sync Itinerary
export async function syncItinerary(ownerId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("google_refresh_token, spreadsheet_id")
    .eq("id", ownerId)
    .single();

  if (error || !profile?.spreadsheet_id || !profile?.google_refresh_token) {
    throw new Error("User profile incomplete.");
  }

  const refreshToken = decrypt(profile.google_refresh_token);
  const auth = SheetsService.getAuthClient(refreshToken);

  // 1. Ensure Tab Exists (by trying to read it)
  let rows = await SheetsService.getValues(
    auth,
    profile.spreadsheet_id,
    "Itinerary!A:D"
  );

  // If null, it might not exist. Create it.
  if (!rows) {
    console.log("[Sync] Itinerary sheet missing, creating...");
    try {
      await SheetsService.updateRange(
        auth,
        profile.spreadsheet_id,
        "Itinerary!A1:D1",
        [["Day", "Location ID", "Order", "Notes"]]
      );
      rows = []; // Empty initially
    } catch (e) {
      console.error("Failed to create Itinerary tab", e);
      // It might be that the sheet *exists* but is empty? Or "Locations" is the only one.
      // For now assume we might need to addSheet if the range update failed due to missing sheet.
      // Simplified: User might need to create it, or we rely on them having "Locations".
      // Let's assume write works if we just write to A1.
    }
  }

  const itineraryData = rows ? transformRowsToItinerary(rows) : [];

  // Update Cache
  const { error: upsertError } = await supabaseAdmin
    .from("cached_itineraries")
    .upsert(
      {
        owner_id: ownerId,
        sheet_id: profile.spreadsheet_id,
        data: itineraryData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );

  if (upsertError) throw upsertError;

  return itineraryData;
}

export async function getItineraryFromDb(ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("cached_itineraries")
    .select("data")
    .eq("owner_id", ownerId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data?.data || [];
}

// Update Itinerary (Full Rewrite of Sheet for consistency)
// This is called after Drag & Drop. We receive the FULL new state.
export async function updateItineraryInSheet(
  ownerId: string,
  itineraryItems: any[]
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("google_refresh_token, spreadsheet_id")
    .eq("id", ownerId)
    .single();

  if (!profile || !profile.google_refresh_token || !profile.spreadsheet_id) {
    throw new Error("No profile or missing sheet/token");
  }

  const refreshToken = decrypt(profile.google_refresh_token);
  const auth = SheetsService.getAuthClient(refreshToken);

  // Convert to Rows
  // We overwrite the whole sheet range to ensure order is correct
  // Sorted by Day then Order
  const sortedItems = [...itineraryItems].sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day);
    return a.order - b.order;
  });

  const rows = sortedItems.map((item) => [
    item.day,
    item.locationId,
    item.order,
    item.note,
  ]);

  // 1. Check if "Itinerary" tab exists
  const metadata = await SheetsService.getMetadata(
    auth,
    profile.spreadsheet_id
  );
  const itinerarySheet = metadata.sheets?.find(
    (s: any) => s.properties?.title === "Itinerary"
  );

  if (!itinerarySheet) {
    console.log("[Sync] Itinerary sheet missing during update, creating...");
    try {
      await SheetsService.addSheet(auth, profile.spreadsheet_id, "Itinerary");
      // Initialize Headers
      await SheetsService.updateRange(
        auth,
        profile.spreadsheet_id,
        "Itinerary!A1:D1",
        [["Day", "Location ID", "Order", "Notes"]]
      );
    } catch (e: any) {
      // If it fails because it already exists (race condition?), ignore
      if (!e.message?.includes("already exists")) {
        console.error("Failed to create Itinerary sheet", e);
        throw new Error("Failed to create Itinerary sheet");
      }
    }
  } else {
    // If it exists, clear it to clean up old data
    // We only clear A2:D (keeping headers)
    await SheetsService.clearValues(
      auth,
      profile.spreadsheet_id,
      "Itinerary!A2:D"
    );
  }

  // 2. Write new data (if any)
  if (rows.length > 0) {
    const range = `Itinerary!A2:D${rows.length + 1}`;
    await SheetsService.updateRange(auth, profile.spreadsheet_id, range, rows);
  }

  // Update Cache
  await supabaseAdmin.from("cached_itineraries").upsert(
    {
      owner_id: ownerId,
      sheet_id: profile.spreadsheet_id,
      data: sortedItems,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );

  return { success: true };
}
