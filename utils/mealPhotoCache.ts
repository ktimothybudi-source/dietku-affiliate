import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const CACHE_META_KEY = 'meal_photo_cache_meta_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CacheEntry = {
  localUri: string;
  cachedAt: number;
};

type CacheMeta = Record<string, CacheEntry>;

function getBaseDirectory(): string {
  const fs = FileSystem as unknown as { cacheDirectory?: string; documentDirectory?: string };
  return fs.cacheDirectory ?? fs.documentDirectory ?? 'file:///';
}

const CACHE_DIR = `${getBaseDirectory()}meal-photo-cache/`;

async function ensureCacheDir() {
  if (Platform.OS === 'web') return;
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function readMeta(): Promise<CacheMeta> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_META_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheMeta;
  } catch {
    return {};
  }
}

async function writeMeta(meta: CacheMeta) {
  await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function extensionFromUrl(url: string): string {
  const clean = url.split('?')[0] || '';
  const maybeExt = clean.split('.').pop()?.toLowerCase();
  if (!maybeExt) return 'jpg';
  if (maybeExt === 'jpeg' || maybeExt === 'jpg' || maybeExt === 'png' || maybeExt === 'webp' || maybeExt === 'heic' || maybeExt === 'heif') {
    return maybeExt;
  }
  return 'jpg';
}

export async function cleanupExpiredMealPhotoCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  const meta = await readMeta();
  const nextMeta: CacheMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    const expired = now - value.cachedAt > MAX_AGE_MS;
    if (expired) {
      try {
        await FileSystem.deleteAsync(value.localUri, { idempotent: true });
      } catch {
        // Best effort cleanup.
      }
      continue;
    }
    nextMeta[key] = value;
  }
  await writeMeta(nextMeta);
}

/**
 * Returns a local URI for a storage photo path when available.
 * Downloads and caches the remote file for up to 7 days on this device.
 */
export async function getCachedMealPhotoUri(storagePath: string, remoteUrl: string): Promise<string> {
  if (Platform.OS === 'web') return remoteUrl;
  await ensureCacheDir();

  const key = storagePath.trim();
  const meta = await readMeta();
  const current = meta[key];
  const now = Date.now();

  if (current && now - current.cachedAt <= MAX_AGE_MS) {
    const info = await FileSystem.getInfoAsync(current.localUri);
    if (info.exists) return current.localUri;
  }

  const ext = extensionFromUrl(remoteUrl);
  const filename = `${hashString(key)}.${ext}`;
  const localUri = `${CACHE_DIR}${filename}`;
  await FileSystem.downloadAsync(remoteUrl, localUri);

  const nextMeta: CacheMeta = {
    ...meta,
    [key]: {
      localUri,
      cachedAt: now,
    },
  };
  await writeMeta(nextMeta);
  return localUri;
}
