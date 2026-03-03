import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  mkdir,
  readdir,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import { extname, join } from 'path';

type IncomingFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type UploadDriver = 'local' | 's3';

type DynamicS3 = {
  S3Client: new (config: Record<string, unknown>) => unknown;
  PutObjectCommand: new (config: Record<string, unknown>) => unknown;
  ListObjectsV2Command: new (config: Record<string, unknown>) => unknown;
  DeleteObjectsCommand: new (config: Record<string, unknown>) => unknown;
};

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir: string;
  private readonly maxFileBytes: number;
  private readonly cleanupDays: number;
  private readonly uploadDriver: UploadDriver;
  private readonly uploadPublicBaseUrl: string | null;
  private readonly s3Endpoint: string | null;
  private readonly s3Region: string;
  private readonly s3Bucket: string | null;
  private readonly s3AccessKeyId: string | null;
  private readonly s3SecretAccessKey: string | null;
  private readonly s3ForcePathStyle: boolean;

  private s3Client: { send: (command: unknown) => Promise<unknown> } | null = null;
  private s3Sdk: DynamicS3 | null = null;
  private lastCleanupRunAt = 0;

  constructor(private readonly configService: ConfigService) {
    const uploadDirName = this.configService.get<string>('UPLOAD_DIR', 'uploads');
    const maxFileMb = Number(this.configService.get<string>('UPLOAD_MAX_FILE_MB', '5'));
    this.cleanupDays = Number(this.configService.get<string>('UPLOAD_CLEANUP_DAYS', '30'));
    this.uploadDriver =
      (this.configService.get<string>('UPLOAD_DRIVER', 'local') as UploadDriver) ||
      'local';
    this.uploadPublicBaseUrl = this.normalizeOptionalUrl(
      this.configService.get<string>('UPLOAD_PUBLIC_BASE_URL', ''),
    );
    this.uploadDir = join(process.cwd(), uploadDirName);
    this.maxFileBytes = Math.max(1, maxFileMb) * 1024 * 1024;

    this.s3Endpoint = this.normalizeOptionalUrl(
      this.configService.get<string>('S3_ENDPOINT', ''),
    );
    this.s3Region = this.configService.get<string>('S3_REGION', 'us-east-1');
    this.s3Bucket = this.normalizeOptionalString(
      this.configService.get<string>('S3_BUCKET', ''),
    );
    this.s3AccessKeyId = this.normalizeOptionalString(
      this.configService.get<string>('S3_ACCESS_KEY_ID', ''),
    );
    this.s3SecretAccessKey = this.normalizeOptionalString(
      this.configService.get<string>('S3_SECRET_ACCESS_KEY', ''),
    );
    this.s3ForcePathStyle =
      this.configService.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true';
  }

  async saveImage(
    file: IncomingFile | undefined,
    requestMeta?: { protocol?: string; host?: string },
  ) {
    this.validateIncomingFile(file);
    await this.maybeRunCleanup();

    if (this.uploadDriver === 's3') {
      return this.uploadToS3(file as IncomingFile, requestMeta);
    }

    return this.uploadToLocal(file as IncomingFile, requestMeta);
  }

  private validateIncomingFile(file: IncomingFile | undefined): void {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }

    if (file.size > this.maxFileBytes) {
      throw new PayloadTooLargeException(
        `Image exceeds ${Math.floor(this.maxFileBytes / (1024 * 1024))}MB limit`,
      );
    }
  }

  private async uploadToLocal(
    file: IncomingFile,
    requestMeta?: { protocol?: string; host?: string },
  ) {
    await mkdir(this.uploadDir, { recursive: true });

    const extension = this.resolveExtension(file);
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const fullPath = join(this.uploadDir, fileName);
    await writeFile(fullPath, file.buffer);

    const imagePath = `/uploads/${fileName}`;
    const publicUrl =
      this.uploadPublicBaseUrl ||
      (requestMeta?.host ? `${requestMeta.protocol ?? 'http'}://${requestMeta.host}` : '');

    return {
      fileName,
      imageUrl: imagePath,
      url: publicUrl ? `${publicUrl}${imagePath}` : imagePath,
      mimeType: file.mimetype,
      size: file.size,
      driver: 'local',
    };
  }

  private async uploadToS3(
    file: IncomingFile,
    requestMeta?: { protocol?: string; host?: string },
  ) {
    if (!this.s3Bucket || !this.s3AccessKeyId || !this.s3SecretAccessKey) {
      throw new InternalServerErrorException(
        'S3 configuration is incomplete. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.',
      );
    }

    const sdk = await this.getS3Sdk();
    const client = await this.getOrCreateS3Client();
    const extension = this.resolveExtension(file);
    const key = this.buildS3ObjectKey(extension);

    const putCommand = new sdk.PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private',
    });
    await client.send(putCommand);

    const imagePath = `/uploads/${key}`;
    const publicUrl = this.uploadPublicBaseUrl || this.buildDefaultS3PublicUrl(key);
    const fallbackUrl = requestMeta?.host
      ? `${requestMeta.protocol ?? 'http'}://${requestMeta.host}${imagePath}`
      : imagePath;

    return {
      fileName: key,
      imageUrl: imagePath,
      url: publicUrl || fallbackUrl,
      mimeType: file.mimetype,
      size: file.size,
      driver: 's3',
    };
  }

  private buildDefaultS3PublicUrl(key: string): string | null {
    if (!this.s3Endpoint || !this.s3Bucket) {
      return null;
    }

    const endpoint = this.s3Endpoint.replace(/\/$/, '');
    if (this.s3ForcePathStyle) {
      return `${endpoint}/${this.s3Bucket}/${key}`;
    }

    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${this.s3Bucket}.${parsed.host}/${key}`;
  }

  private buildS3ObjectKey(extension: string): string {
    const date = new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `issues/${year}/${month}/${day}/${randomUUID()}${extension}`;
  }

  private async maybeRunCleanup(): Promise<void> {
    const now = Date.now();
    const everyMs = 60 * 60 * 1000;
    if (now - this.lastCleanupRunAt < everyMs) {
      return;
    }
    this.lastCleanupRunAt = now;

    try {
      if (this.uploadDriver === 's3') {
        await this.cleanupS3();
      } else {
        await this.cleanupLocal();
      }
    } catch (error) {
      this.logger.warn(
        `Upload cleanup failed: ${(error as Error).message || 'unknown error'}`,
      );
    }
  }

  private async cleanupLocal(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
    const entries = await readdir(this.uploadDir);
    const cutoff = Date.now() - this.cleanupDays * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const fullPath = join(this.uploadDir, entry);
      const fileStat = await stat(fullPath);
      if (!fileStat.isFile()) {
        continue;
      }
      if (fileStat.mtimeMs < cutoff) {
        await unlink(fullPath);
      }
    }
  }

  private async cleanupS3(): Promise<void> {
    if (!this.s3Bucket) {
      return;
    }

    const sdk = await this.getS3Sdk();
    const client = await this.getOrCreateS3Client();
    const cutoff = Date.now() - this.cleanupDays * 24 * 60 * 60 * 1000;

    const listed = (await client.send(
      new sdk.ListObjectsV2Command({
        Bucket: this.s3Bucket,
        Prefix: 'issues/',
        MaxKeys: 1000,
      }),
    )) as {
      Contents?: Array<{ Key?: string; LastModified?: Date }>;
    };

    const staleKeys = (listed.Contents || [])
      .filter(
        (item) =>
          item.Key &&
          item.LastModified &&
          item.LastModified.getTime() < cutoff,
      )
      .map((item) => ({ Key: item.Key as string }));

    if (staleKeys.length === 0) {
      return;
    }

    await client.send(
      new sdk.DeleteObjectsCommand({
        Bucket: this.s3Bucket,
        Delete: {
          Objects: staleKeys,
          Quiet: true,
        },
      }),
    );
  }

  private async getOrCreateS3Client(): Promise<{
    send: (command: unknown) => Promise<unknown>;
  }> {
    if (this.s3Client) {
      return this.s3Client;
    }

    const sdk = await this.getS3Sdk();
    this.s3Client = new sdk.S3Client({
      region: this.s3Region,
      endpoint: this.s3Endpoint || undefined,
      credentials: {
        accessKeyId: this.s3AccessKeyId || '',
        secretAccessKey: this.s3SecretAccessKey || '',
      },
      forcePathStyle: this.s3ForcePathStyle,
    }) as { send: (command: unknown) => Promise<unknown> };

    return this.s3Client;
  }

  private async getS3Sdk(): Promise<DynamicS3> {
    if (this.s3Sdk) {
      return this.s3Sdk;
    }

    try {
      const dynamicImporter = new Function(
        'moduleName',
        'return import(moduleName);',
      ) as (moduleName: string) => Promise<unknown>;
      const s3 = (await dynamicImporter(
        '@aws-sdk/client-s3',
      )) as unknown as DynamicS3;
      this.s3Sdk = s3;
      return s3;
    } catch {
      throw new InternalServerErrorException(
        'S3 driver selected but @aws-sdk/client-s3 is not installed',
      );
    }
  }

  private resolveExtension(file: IncomingFile): string {
    const mapped = MIME_EXTENSION_MAP[file.mimetype];
    if (mapped) {
      return mapped;
    }

    const nameExt = extname(file.originalname || '').toLowerCase();
    if (nameExt) {
      return nameExt;
    }

    return '.bin';
  }

  private normalizeOptionalUrl(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed.replace(/\/$/, '') : null;
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
  }
}
