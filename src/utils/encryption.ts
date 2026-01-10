import crypto from "crypto";
import { CONFIG } from "../config";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // For AES, this is always 16

export function encrypt(text: string): string {
  if (!CONFIG.ENCRYPTION_KEY) throw new Error("Encryption key not set");

  // Key must be 32 bytes (256 bits). If string is hex, buffer it.
  // Assuming the user provides a 32-char string or 64-char hex.
  // For safety, let's assume it's a 32-byte key generated properly.
  // Ideally, use a hash of the key if it's not guaranteed 32 bytes.
  const key = Buffer.from(CONFIG.ENCRYPTION_KEY, "hex"); // Expecting hex string of 32 bytes (64 chars)

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
  if (!CONFIG.ENCRYPTION_KEY) throw new Error("Encryption key not set");

  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const key = Buffer.from(CONFIG.ENCRYPTION_KEY, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}
