import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommandé pour GCM
const TAG_LENGTH = 16;
const KEY_SALT = "navventura-totp-v1"; // sel fixe pour la dérivation de clé

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>("TOTP_ENCRYPTION_KEY");
    if (!secret || secret.length < 16) {
      throw new InternalServerErrorException(
        "TOTP_ENCRYPTION_KEY manquante ou trop courte (min 16 caractères)",
      );
    }
    // Dérivation d'une clé 256 bits à partir du secret via scrypt
    this.key = scryptSync(secret, KEY_SALT, 32) as Buffer;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format : iv(12) + tag(16) + ciphertext → base64
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  }
}
