import { google } from "googleapis";
import { CONFIG } from "../config";

const sheets = google.sheets("v4");

export class SheetsService {
  /**
   * Get OAuth2 Client with Refresh Token
   */
  static getAuthClient(refreshToken: string) {
    const oAuth2Client = new google.auth.OAuth2(
      CONFIG.GOOGLE.CLIENT_ID,
      CONFIG.GOOGLE.CLIENT_SECRET,
      CONFIG.GOOGLE.REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    return oAuth2Client;
  }

  /**
   * Read Spreadsheet Data (Raw)
   */
  static async getValues(auth: any, spreadsheetId: string, range: string) {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range,
    });
    return response.data.values;
  }

  /**
   * Update Cell/Range
   */
  static async updateRange(
    auth: any,
    spreadsheetId: string,
    range: string,
    values: any[][]
  ) {
    const response = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values,
      },
    });
    return response.data;
  }

  /**
   * Batch Update Values
   */
  static async batchUpdateValues(
    auth: any,
    spreadsheetId: string,
    data: { range: string; values: any[][] }[]
  ) {
    const response = await sheets.spreadsheets.values.batchUpdate({
      auth,
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    return response.data;
  }

  /**
   * Clear Range
   */
  static async clearValues(auth: any, spreadsheetId: string, range: string) {
    const response = await sheets.spreadsheets.values.clear({
      auth,
      spreadsheetId,
      range,
    });
    return response.data;
  }

  /**
   * Add Sheet (Tab)
   */
  static async addSheet(auth: any, spreadsheetId: string, title: string) {
    const response = await sheets.spreadsheets.batchUpdate({
      auth,
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
              },
            },
          },
        ],
      },
    });
    return response.data;
  }

  /**
   * Get Spreadsheet Metadata
   */
  static async getMetadata(auth: any, spreadsheetId: string) {
    const response = await sheets.spreadsheets.get({
      auth,
      spreadsheetId,
    });
    return response.data;
  }

  /**
   * Create New Spreadsheet
   */
  static async createSpreadsheet(auth: any, title: string) {
    const response = await sheets.spreadsheets.create({
      auth,
      requestBody: {
        properties: {
          title,
        },
        sheets: [
          {
            properties: {
              title: "Locations", // Default sheet
            },
          },
        ],
      },
    });
    return response.data;
  }

  /**
   * Append Row to Sheet
   */
  static async appendRow(
    auth: any,
    spreadsheetId: string,
    range: string,
    values: any[][]
  ) {
    const response = await sheets.spreadsheets.values.append({
      auth,
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values,
      },
    });
    return response.data;
  }
}
