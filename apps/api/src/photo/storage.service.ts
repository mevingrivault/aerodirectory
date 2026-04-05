import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>("S3_ENDPOINT");
    const region = this.config.get<string>("S3_REGION", "auto");

    this.bucket = this.config.get<string>("S3_BUCKET", "aerodirectory");
    this.publicUrl = this.config.get<string>("S3_PUBLIC_URL", "");

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: this.config.get<string>("S3_ACCESS_KEY", ""),
        secretAccessKey: this.config.get<string>("S3_SECRET_KEY", ""),
      },
      forcePathStyle: true, // required for MinIO/SeaweedFS/R2
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" created`);
      } catch (err) {
        this.logger.warn(`Could not verify/create bucket: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Upload a processed buffer to S3-compatible storage.
   * Returns the stored key (path within the bucket).
   */
  async upload(
    buffer: Buffer,
    ext: string,
    mimeType: string,
    folder = "photos",
  ): Promise<{ key: string; filename: string; url: string }> {
    const filename = `${randomUUID()}.${ext}`;
    const key = `${folder}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Private by default — served via signed URLs or proxy
        ACL: "private" as never,
      }),
    );

    const url = this.publicUrl ? `${this.publicUrl}/${key}` : key;
    return { key, filename, url };
  }

  /** Delete an object by its key */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete object ${key}`, err);
    }
  }
}
