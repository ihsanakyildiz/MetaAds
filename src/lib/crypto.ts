import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;

  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY 32 byte (64 hex karakter) olmalıdır.");
  }

  return Buffer.from(hex, "hex");
}

export function encrypt(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string) {
  const [ivHex, tagHex, dataHex] = payload.split(":");

  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Geçersiz şifreli veri.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function maskSecret(value: string, visible = 4) {
  if (value.length <= visible) {
    return "••••";
  }

  return `${value.slice(0, visible)}••••••••`;
}
