import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";

export type PutBody = Buffer | Uint8Array | string | Readable;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.bucket = config.s3Bucket;
    this.client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async put(key: string, body: PutBody, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!result.Body) {
      throw new Error(`Empty body for object ${key}`);
    }
    return result.Body as Readable;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const status =
        typeof error === "object" &&
        error !== null &&
        "$metadata" in error &&
        typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === "number"
          ? (error as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
          : undefined;
      if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
        return false;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
