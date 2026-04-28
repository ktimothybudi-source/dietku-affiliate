import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { optimizeImageForUpload } from '@/utils/imageOptimization';

export const MEAL_PHOTOS_BUCKET = 'meal-photos';
const STORAGE_BUCKET = MEAL_PHOTOS_BUCKET;
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days

const MEAL_PHOTO_UUID_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/.+/i;

export function isRemoteMealPhotoUri(uri?: string | null): boolean {
  return !!uri && /^https?:\/\//i.test(uri);
}

/** True when `uri` is a storage object key we write (e.g. userId/timestamp_x.jpg). */
export function isMealPhotoStorageObjectPath(uri: string): boolean {
  return MEAL_PHOTO_UUID_PATH.test(uri);
}

/**
 * Resolve a DB/display value to a storage object path for the meal-photos bucket.
 * Returns null for local file URIs or unrecognized values.
 */
export function getMealPhotoStoragePathFromValue(uri: string): string | null {
  if (!uri) return null;
  if (!isRemoteMealPhotoUri(uri)) {
    return isMealPhotoStorageObjectPath(uri) ? uri : null;
  }
  const publicMarker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const signMarker = `/storage/v1/object/sign/${STORAGE_BUCKET}/`;
  const objectMarker = `/storage/v1/object/${STORAGE_BUCKET}/`;
  if (uri.includes(publicMarker)) {
    return decodeURIComponent(uri.split(publicMarker)[1]?.split('?')[0] || '');
  }
  if (uri.includes(signMarker)) {
    return decodeURIComponent(uri.split(signMarker)[1]?.split('?')[0] || '');
  }
  if (uri.includes(objectMarker)) {
    return decodeURIComponent(uri.split(objectMarker)[1]?.split('?')[0] || '');
  }
  return null;
}

/**
 * Normalize meal photo for persisting to `food_entries.photo_uri` (storage path), matching community posts.
 * Local camera/gallery URIs are uploaded first; existing storage paths are kept; remote Supabase URLs become paths.
 */
export async function resolveMealPhotoForDatabase(
  photoUri: string | null | undefined,
  userId: string
): Promise<string | null> {
  if (!photoUri) return null;
  if (isRemoteMealPhotoUri(photoUri)) {
    return getMealPhotoStoragePathFromValue(photoUri) ?? photoUri;
  }
  if (isMealPhotoStorageObjectPath(photoUri)) return photoUri;
  return uploadImageToSupabase(photoUri, userId);
}

function inferExtensionFromMime(mimeType?: string | null): string {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('heic')) return 'heic';
  if (normalized.includes('heif')) return 'heif';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  return 'jpg';
}

function inferContentTypeFromUri(uri: string): string {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Load image bytes for Supabase upload. RN iOS often throws "Network request failed" on fetch(file://...),
 * so local files are read via Expo FileSystem instead.
 */
async function loadImageBytesForUpload(uri: string): Promise<{ body: Uint8Array; contentType: string }> {
  const isRemote = /^https?:\/\//i.test(uri);
  if (isRemote) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    const contentType = blob.type || inferContentTypeFromUri(uri);
    const ab = await blob.arrayBuffer();
    return { body: new Uint8Array(ab), contentType };
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const contentType = inferContentTypeFromUri(uri);
  return { body: base64ToUint8Array(base64), contentType };
}

/**
 * Upload an image file to Supabase Storage
 * @param localUri - Local file URI to upload
 * @param userId - User ID for organizing files
 * @returns Storage object path of the uploaded image
 */
export async function uploadImageToSupabase(
  localUri: string,
  userId: string
): Promise<string> {
  try {
    let optimizedUri = localUri;
    try {
      optimizedUri = await optimizeImageForUpload(localUri);
    } catch (optimizationError) {
      console.warn('Image optimization before upload failed, using original URI:', optimizationError);
    }

    const { body, contentType } = await loadImageBytesForUpload(optimizedUri);
    const extension = inferExtensionFromMime(contentType) || 'jpg';

    // Generate unique filename
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

    // Upload to Supabase Storage (Uint8Array avoids fetch(file://) on iOS)
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, body, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    console.log('Image uploaded successfully (storage path):', data.path);
    return data.path;
  } catch (error) {
    console.error('Error in uploadImageToSupabase:', error);
    throw error;
  }
}

/**
 * Delete an image from Supabase Storage
 * @param imageUrl - Public URL of the image to delete
 */
export async function deleteImageFromSupabase(imageUrl: string): Promise<void> {
  try {
    // Extract path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const bucketIndex = pathParts.findIndex(part => part === STORAGE_BUCKET);
    
    if (bucketIndex === -1) {
      throw new Error('Invalid image URL');
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Error deleting image:', error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }

    console.log('Image deleted successfully:', filePath);
  } catch (error) {
    console.error('Error in deleteImageFromSupabase:', error);
    throw error;
  }
}

/**
 * Upload base64 image string to Supabase Storage
 * @param base64Image - Base64 encoded image string
 * @param userId - User ID for organizing files
 * @returns Public URL of the uploaded image
 */
export async function uploadBase64ImageToSupabase(
  base64Image: string,
  userId: string
): Promise<string> {
  try {
    // Remove data URL prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const contentTypeMatch = base64Image.match(/^data:(image\/[\w+.-]+);base64,/i);
    const contentType = contentTypeMatch?.[1] || 'image/jpeg';
    const body = base64ToUint8Array(base64Data);
    const extension = inferExtensionFromMime(contentType);

    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, body, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(data.path, SIGNED_URL_EXPIRY_SECONDS);

    if (!signedError && signedData?.signedUrl) {
      console.log('Image uploaded successfully (signed URL):', signedData.signedUrl);
      return signedData.signedUrl;
    }

    // Fallback to public URL if signed URL creation fails.
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path);
    if (!urlData?.publicUrl) {
      throw new Error('Failed to get signed/public URL');
    }
    console.log('Image uploaded successfully (public URL fallback):', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadBase64ImageToSupabase:', error);
    throw error;
  }
}
