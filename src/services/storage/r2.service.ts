import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';

export class StorageService {
  private static s3Client: S3Client | null = null;

  private static getClient(): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: config.r2.endpoint,
        credentials: {
          accessKeyId: config.r2.accessKeyId,
          secretAccessKey: config.r2.secretAccessKey,
        },
      });
    }
    return this.s3Client;
  }

  // Generates short-lived pre-signed URL for direct binary upload
  static async generateUploadUrl(key: string, contentType: string, expiresIn = 300): Promise<string> {
    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(client, command, { expiresIn });
  }

  // Generates short-lived pre-signed URL for private file access
  static async generateDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
    });
    return await getSignedUrl(client, command, { expiresIn });
  }

  // Permanently deletes an object from R2 storage
  static async deleteObject(key: string): Promise<void> {
    const client = this.getClient();
    const command = new DeleteObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
    });
    await client.send(command);
  }
}
