import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import { randomUUID } from "crypto";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  // No public bucket URL here on purpose: every stored object is served
  // through an API endpoint that checks access first.

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>("S3_ENDPOINT");
    const region = this.config.get<string>("S3_REGION", "auto");

    this.bucket = this.config.get<string>("S3_BUCKET", "aerodirectory");

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
  ): Promise<{ key: string; filename: string }> {
    const filename = `${randomUUID()}.${ext}`;
    const key = `${folder}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return { key, filename };
  }

  /** Get an object stream by its key */
  async getObject(key: string): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: response.Body as Readable,
      contentType: response.ContentType ?? "application/octet-stream",
      contentLength: response.ContentLength,
    };
  }

  /** Delete an object by its key — throws on failure */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Avatar URL for a community member.
   *
   * Points at our own API rather than the bucket: the endpoint checks the
   * member's `showCommunityProfile` flag before streaming the file. A direct
   * bucket URL would bypass that check and expose the avatar of a member whose
   * profile is not public.
   */
  resolveAvatarUrl(userId: string, key: string | null | undefined): string | null {
    if (!key) {
      return null;
    }

    return `/auth/community/${userId}/avatar`;
  }

  /**
   * Avatar URL for the signed-in owner of the account.
   *
   * Separate from `resolveAvatarUrl` because the owner must see their own
   * avatar even while their community profile is hidden, which the public
   * endpoint refuses by design.
   */
  resolveOwnAvatarUrl(key: string | null | undefined): string | null {
    if (!key) {
      return null;
    }

    return `/auth/profile/avatar`;
  }
}
