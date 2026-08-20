import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

export type StoredObject = {
  key: string;
  byteSize: number;
  contentType: string;
};

export interface StorageAdapter {
  readonly name: string;
  put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  static keyFor(companyId: string, checksum: string, filename: string): string {
    const safeCompany = companyId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeChecksum = checksum.replace(/[^a-fA-F0-9]/g, '').slice(0, 64) || 'file';
    const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'receipt';
    return `${safeCompany}/${safeChecksum}-${base}`;
  }

  private resolveKey(key: string): string {
    if (!key || path.isAbsolute(key) || key.includes('..') || key.includes('\\')) {
      throw new Error('Invalid storage key');
    }
    const resolved = path.resolve(this.root, key);
    const prefix = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (resolved !== this.root && !resolved.startsWith(prefix)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    return { key, byteSize: buffer.byteLength, contentType };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }
}

let cached: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const config = env();
  if (config.STORAGE_DRIVER === 's3') {
    throw new Error('S3 storage is configured but the S3 adapter has not been enabled yet. Use STORAGE_DRIVER=local for V1.');
  }
  cached = new LocalStorageAdapter(config.STORAGE_LOCAL_DIR);
  return cached;
}

export function resetStorageCache(): void {
  cached = null;
}
