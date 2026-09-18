import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile, type ExecFileException } from "child_process";
import { promisify } from "util";
import { ClamdError, pingClamd, scanFileWithClamd } from "./clamd.client";

const execFileAsync = promisify(execFile);

export type ScanMode = "clamd" | "clamscan" | "disabled";

/**
 * Bounded concurrency: scans beyond the limit wait their turn instead of
 * piling up processes or sockets. Extra waiters beyond `maxQueue` are refused
 * immediately so a burst of uploads degrades into 503s, not into an OOM.
 */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueue: number,
  ) {}

  get pending(): number {
    return this.waiters.length;
  }

  get running(): number {
    return this.active;
  }

  acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }

    if (this.waiters.length >= this.maxQueue) {
      return Promise.reject(new ServiceUnavailableException("Trop d'analyses antivirus en cours. Réessayez dans un instant."));
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

@Injectable()
export class ScanService implements OnModuleInit {
  private readonly logger = new Logger(ScanService.name);
  readonly mode: ScanMode;
  private readonly binaryPath: string;
  private readonly timeoutMs: number;
  private readonly databasePath?: string;
  private readonly clamdHost: string;
  private readonly clamdPort: number;
  private readonly semaphore: Semaphore;

  constructor(private readonly config: ConfigService) {
    this.mode = this.resolveMode();
    this.binaryPath = this.config.get<string>("CLAMSCAN_PATH", "clamscan");
    this.timeoutMs = this.positiveNumber(
      this.config.get("CLAMAV_TIMEOUT_MS") ?? this.config.get("CLAMSCAN_TIMEOUT_MS"),
      20_000,
    );
    this.databasePath = this.config.get<string>("CLAMSCAN_DATABASE_PATH")?.trim() || undefined;
    this.clamdHost = this.config.get<string>("CLAMD_HOST", "clamav");
    this.clamdPort = this.positiveNumber(this.config.get("CLAMD_PORT"), 3310);

    const maxConcurrent = this.positiveNumber(this.config.get("CLAMAV_MAX_CONCURRENT"), 2);
    const maxQueue = this.positiveNumber(this.config.get("CLAMAV_MAX_QUEUE"), 20);
    this.semaphore = new Semaphore(maxConcurrent, maxQueue);

    if (this.mode === "disabled") {
      this.logger.warn("Le scan ClamAV est désactivé. À réserver au développement.");
    }
  }

  async onModuleInit() {
    if (this.mode !== "clamd") return;
    const alive = await pingClamd({ host: this.clamdHost, port: this.clamdPort, timeoutMs: 3_000 });
    if (alive) {
      this.logger.log(`clamd joignable sur ${this.clamdHost}:${this.clamdPort}`);
    } else {
      this.logger.warn(
        `clamd injoignable sur ${this.clamdHost}:${this.clamdPort} — les uploads seront refusés tant qu'il ne répond pas.`,
      );
    }
  }

  /** Current load, exposed for tests and diagnostics. */
  get load() {
    return { running: this.semaphore.running, pending: this.semaphore.pending };
  }

  async scan(filePath: string): Promise<void> {
    if (this.mode === "disabled") {
      return;
    }

    const release = await this.semaphore.acquire();
    try {
      if (this.mode === "clamd") {
        await this.scanWithClamd(filePath);
      } else {
        await this.scanWithCli(filePath);
      }
    } finally {
      release();
    }
  }

  private async scanWithClamd(filePath: string) {
    let result;
    try {
      result = await scanFileWithClamd(
        { host: this.clamdHost, port: this.clamdPort, timeoutMs: this.timeoutMs },
        filePath,
      );
    } catch (error) {
      if (error instanceof ClamdError) {
        this.logger.error(`Scan clamd échoué (${error.kind}) pour ${filePath}: ${error.message}`);
        throw new ServiceUnavailableException(
          error.kind === "timeout"
            ? "L'analyse antivirus a expiré."
            : "Analyse antivirus indisponible sur le serveur.",
        );
      }
      throw error;
    }

    if (!result.clean) {
      this.logger.warn(`ClamAV a détecté une menace dans ${filePath}: ${result.threat}`);
      throw new BadRequestException(`Fichier rejeté par l'antivirus: ${result.threat}.`);
    }
  }

  private async scanWithCli(filePath: string) {
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

  private resolveMode(): ScanMode {
    const enabledRaw =
      this.config.get<string>("CLAMAV_ENABLED") ?? this.config.get<string>("CLAMSCAN_ENABLED");
    if (enabledRaw !== undefined && String(enabledRaw).trim().toLowerCase() === "false") {
      return "disabled";
    }

    const modeRaw = this.config.get<string>("CLAMAV_MODE", "clamd").trim().toLowerCase();
    return modeRaw === "clamscan" ? "clamscan" : "clamd";
  }

  private positiveNumber(raw: unknown, fallback: number): number {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
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
      this.logger.error(`Binaire ClamAV introuvable (${this.binaryPath}).`);
      return new ServiceUnavailableException("Analyse antivirus indisponible sur le serveur.");
    }

    if (execError.killed || execError.signal === "SIGTERM") {
      this.logger.error(`ClamAV a dépassé le timeout de ${this.timeoutMs} ms pour ${filePath}.`);
      return new ServiceUnavailableException("L'analyse antivirus a expiré.");
    }

    this.logger.error(
      `Échec de l'analyse ClamAV pour ${filePath}: ${combinedOutput || execError.message || "erreur inconnue"}`,
    );
    return new ServiceUnavailableException("L'analyse antivirus a échoué.");
  }

  private extractThreatName(output: string): string | null {
    const match = output.match(/:\s(.+)\sFOUND$/m);
    return match?.[1]?.trim() ?? null;
  }
}
