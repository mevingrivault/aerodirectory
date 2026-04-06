declare module "file-type" {
  export function fileTypeFromBuffer(
    buffer: Buffer,
  ): Promise<{ ext: string; mime: string } | undefined>;
}

