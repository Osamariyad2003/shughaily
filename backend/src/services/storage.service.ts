import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { config } from '../config';
import path from 'path';

class StorageService {
  private s3: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    this.bucket = config.r2.bucket;
    this.publicBaseUrl = config.r2.publicBaseUrl.replace(/\/+$/, '');
    this.s3 = new S3Client({
      region: config.r2.region,
      endpoint: config.r2.endpoint || undefined,
      credentials:
        config.r2.accessKeyId && config.r2.secretAccessKey
          ? {
              accessKeyId: config.r2.accessKeyId,
              secretAccessKey: config.r2.secretAccessKey,
            }
          : undefined,
    });
  }

  private normalizeObjectKey(keyOrUrl: string): string {
    if (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')) {
      return keyOrUrl.replace(/^\/+/, '');
    }

    try {
      const url = new URL(keyOrUrl);
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch {
      return keyOrUrl.replace(/^\/+/, '');
    }
  }

  /**
   * Upload a file buffer to S3 and return the key.
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'resumes',
  ): Promise<{ key: string; url: string }> {
    const ext = path.extname(originalName);
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    let url: string;
    if (this.publicBaseUrl) {
      url = `${this.publicBaseUrl}/${key}`;
    } else if (config.r2.endpoint) {
      const endpoint = new URL(config.r2.endpoint);
      url = `${endpoint.protocol}//${this.bucket}.${endpoint.host}/${key}`;
    } else {
      url = `https://${this.bucket}.r2.cloudflarestorage.com/${key}`;
    }

    return { key, url };
  }

  /**
   * Delete an object from S3 by key.
   */
  async delete(keyOrUrl: string): Promise<void> {
    const key = this.normalizeObjectKey(keyOrUrl);
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Generate a pre-signed URL for temporary read access (default 1 hour).
   */
  async getSignedUrl(keyOrUrl: string, expiresInSeconds = 3600): Promise<string> {
    const key = this.normalizeObjectKey(keyOrUrl);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }
}

export const storageService = new StorageService();
