import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';
import path from 'path';

const s3 = config.aws.region
  ? new S3Client({
      region: config.aws.region,
      credentials: config.aws.accessKeyId
        ? { accessKeyId: config.aws.accessKeyId, secretAccessKey: config.aws.secretAccessKey }
        : undefined,
    })
  : null;

class StorageService {
  private bucket = config.aws.bucket;

  private buildKey(folder: string, fileName: string): string {
    const ext = path.extname(fileName);
    return `${folder}/${uuid()}${ext}`;
  }

  async getSignedUploadUrl(fileName: string, mimeType: string, folder='documents'): Promise<{ uploadUrl: string; s3Key: string; url: string }> {
    if (!s3 || !this.bucket) {
      const s3Key = `${folder}/${uuid()}-${fileName}`;
      return { uploadUrl: '', s3Key, url: `/uploads/${s3Key}` };
    }
    const s3Key = this.buildKey(folder, fileName);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: s3Key, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const url = `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${s3Key}`;
    return { uploadUrl, s3Key, url };
  }

  async getSignedDownloadUrl(s3Key: string, expiresIn=3600): Promise<string> {
    if (!s3 || !this.bucket) return `/uploads/${s3Key}`;
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
      return await getSignedUrl(s3, command, { expiresIn });
    } catch (err) {
      logger.error('Failed to generate signed download URL:', err);
      return '';
    }
  }

  async deleteFile(s3Key: string): Promise<void> {
    if (!s3 || !this.bucket) return;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }));
    } catch (err) {
      logger.error('Failed to delete S3 file:', err);
    }
  }
}

export const storageService = new StorageService();
