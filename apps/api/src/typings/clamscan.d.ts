declare module "clamscan" {
  interface ClamScanOptions {
    clamdscan?: {
      host?: string;
      port?: number;
      timeout?: number;
      localFallback?: boolean;
      active?: boolean;
    };
    preference?: "clamdscan" | "clamscan";
  }

  interface ScanResult {
    isInfected: boolean;
    viruses: string[];
    file: string;
  }

  class NodeClam {
    init(options?: ClamScanOptions): Promise<NodeClam>;
    isInfected(filePath: string): Promise<ScanResult>;
  }

  export = NodeClam;
}
