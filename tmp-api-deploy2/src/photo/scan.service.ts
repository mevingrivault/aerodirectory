import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile, type ExecFileException } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private readonly enabled: boolean;
  private readonly binaryPath: string;
  private readonly timeoutMs: number;
  private readonly databasePath?: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>("CLAMSCAN_ENABLED", "true") !== "false";
    this.binaryPath = this.config.get<string>("CLAMSCAN_PATH", "clamscan");

    const configuredTimeoutMs = Number(this.config.get("CLAMSCAN_TIMEOUT_MS"));
    this.timeoutMs =
      Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : 20_000;

    const configuredDatabasePath = this.config.get<string>("CLAMSCAN_DATABASE_PATH");
    this.databasePath = configuredDatabasePath?.trim() || undefined;

    if (!this.enabled) {
      this.logger.warn("Le scan ClamAV est désactivé. À réserver au développement.");
    }
  }

  async scan(filePath: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const args = ["--no-summary", "--stdout"];
    if (this.databasePath) {
      args.push(`--database=${this.databasePath}`);
    }
    args.push(filePath);

    try {
      await execFileAsync(this.binaryPath, args, {
        timeout: this.timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      throw this.toClamException(error, filePath);
    }
  }

  private toClamException(error: unknown, filePath: string): Error {
    const execError = error as ExecFileException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };

    const stdout = execError.stdout?.trim() ?? "";
    const stderr = execError.stderr?.trim() ?? "";
    const combinedOutput = [stdout, stderr].filter(Boolean).join(" | ");

    if (execError.code === 1) {
      const threatName = this.extractThreatName(stdout || stderr);
      this.logger.warn(
        `ClamAV a détecté une menace dans ${filePath}: ${threatName ?? combinedOutput ?? "menace inconnue"}`,
      );
      return new BadRequestException(
        threatName
          ? `Fichier rejeté par l'antivirus: ${threatName}.`
          : "Fichier rejeté par l'antivirus.",
      );
    }

    if (execError.code === "ENOENT") {
      this.logger.error(
        `Binaire ClamAV introuvable (${this.binaryPath}).`,
      );
      return new ServiceUnavailableException(
        "Analyse antivirus indisponible sur le serveur.",
      );
    }

    if (execError.killed || execError.signal === "SIGTERM") {
      this.logger.error(
        `ClamAV a dépassé le timeout de ${this.timeoutMs} ms pour ${filePath}.`,
      );
      return new ServiceUnavailableException(
        "L'analyse antivirus a expiré.",
      );
    }

    this.logger.error(
      `Échec de l'analyse ClamAV pour ${filePath}: ${combinedOutput || execError.message || "erreur inconnue"}`,
    );
    return new ServiceUnavailableException(
      "L'analyse antivirus a échoué.",
    );
  }

  private extractThreatName(output: string): string | null {
    const match = output.match(/:\s(.+)\sFOUND$/m);
    return match?.[1]?.trim() ?? null;
  }
}

