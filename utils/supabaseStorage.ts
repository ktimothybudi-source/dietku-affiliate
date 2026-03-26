import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

const STORAGE_BUCKET = 'meal-photos';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days

function inferExtensionFromMime(mimeType?: string | null): string {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('heic')) return 'heic';
  if (normalized.includes('heif')) return 'heif';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  return 'jpg';
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
    const response = await fetch(localUri);
    const blob = await response.blob();
    const contentType = blob.type || 'image/jpeg';
    const extension = inferExtensionFromMime(contentType) || 'jpg';

    // Generate unique filename
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, blob, {
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

    // Use Expo FileSystem to create a temporary file first, then upload as blob.
    const tempUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || 'file:///'}tmp_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tempUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const response = await fetch(tempUri);
    const blob = await response.blob();
    const contentType = blob.type || 'image/jpeg';
    const extension = inferExtensionFromMime(contentType);

    // Generate unique filename
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, blob, {
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

    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    } catch {
      // no-op
    }

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
