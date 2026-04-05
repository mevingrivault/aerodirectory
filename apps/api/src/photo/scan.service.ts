import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import NodeClam from "clamscan";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private scanner: NodeClam | null = null;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>("CLAMAV_ENABLED", "true") !== "false";
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn("ClamAV scanning is DISABLED — not recommended for production");
      return;
    }
    try {
      const clam = new NodeClam();
      this.scanner = await clam.init({
        clamdscan: {
          host: this.config.get<string>("CLAMAV_HOST", "127.0.0.1"),
          port: this.config.get<number>("CLAMAV_PORT", 3310),
          timeout: 60000,
          localFallback: false,
          active: true,
        },
        preference: "clamdscan",
      });
      this.logger.log("ClamAV scanner initialized");
    } catch (err) {
      this.logger.error("ClamAV initialization failed", err);
      // scanner stays null — scan() will throw (fail-secure)
    }
  }

  /**
   * Scans a buffer. Throws if:
   * - ClamAV is unavailable (fail-secure)
   * - A virus/threat is detected
   */
  async scan(buffer: Buffer): Promise<void> {
    if (!this.enabled) return;

    if (!this.scanner) {
      throw new InternalServerErrorException(
        "Scanner antivirus indisponible. Upload refusé.",
      );
    }

    // Write to a temp file — clamscan operates on files
    const tmpPath = join(tmpdir(), `upload-${randomUUID()}`);
    try {
      await writeFile(tmpPath, buffer);
      const { isInfected, viruses } = await this.scanner.isInfected(tmpPath);
      if (isInfected) {
        this.logger.warn(`Threat detected: ${viruses.join(", ")}`);
        throw new InternalServerErrorException(
          `Fichier rejeté : menace détectée (${viruses.join(", ")})`,
        );
      }
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }
}
