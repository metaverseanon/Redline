import { Platform } from 'react-native';

const BUCKET_NAME = 'user-images';

const SUPABASE_URL = 'https://zlyqrrmiegtxlpifwxxv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseXFycm1pZWd0eGxwaWZ3eHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDkzODcsImV4cCI6MjA4NTc4NTM4N30.mbtqib3AQzhRnUT2Db9X9d5Btw7-hpNhRW7cF9Ev_QE';

function getCredentials() {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  console.log('[SUPABASE_CREDS] URL length:', url.length, 'KEY length:', key.length);
  return { url, key };
}

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://') || uri.startsWith('blob:') || uri.startsWith('data:');
}

async function doUpload(uploadUrl: string, key: string, localUri: string, fileName: string): Promise<Response> {
  if (Platform.OS === 'web') {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const contentType = blob.type || 'image/jpeg';
    console.log('[UPLOAD] Web blob size:', blob.size, 'type:', contentType);
    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: blob,
    });
  } else {
    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      name: fileName,
      type: 'image/jpeg',
    } as any);
    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'x-upsert': 'true',
      },
      body: formData,
    });
  }
}

export async function uploadImage(
  localUri: string,
  userId: string,
  type: 'profile' | 'car',
  carId?: string,
): Promise<string | null> {
  const { url, key } = getCredentials();

  if (isRemoteUrl(localUri)) {
    console.log('[IMAGE_UPLOAD] Already a remote URL, skipping upload');
    return localUri;
  }

  if (!isLocalFileUri(localUri)) {
    console.log('[IMAGE_UPLOAD] Not a valid local URI:', localUri.substring(0, 60));
    return null;
  }

  try {
    const timestamp = Date.now();
    const ext = 'jpg';
    const baseName = type === 'car' && carId
      ? `${userId}/cars/${carId}_${timestamp}.${ext}`
      : `${userId}/${type}_${timestamp}.${ext}`;

    const uploadUrl = `${url}/storage/v1/object/${BUCKET_NAME}/${baseName}`;
    console.log('[IMAGE_UPLOAD] Uploading', type, 'to:', uploadUrl.substring(0, 80));

    const uploadResponse = await doUpload(uploadUrl, key, localUri, `${type}_${timestamp}.${ext}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[IMAGE_UPLOAD] Upload failed:', uploadResponse.status, errorText);
      return null;
    }

    const publicUrl = `${url}/storage/v1/object/public/${BUCKET_NAME}/${baseName}`;
    console.log('[IMAGE_UPLOAD] Success:', publicUrl.substring(0, 80));
    return publicUrl;
  } catch (error) {
    console.error('[IMAGE_UPLOAD] Error:', error);
    return null;
  }
}

export async function uploadProfilePicture(localUri: string, userId: string): Promise<string | null> {
  return uploadImage(localUri, userId, 'profile');
}

export async function uploadCarPicture(localUri: string, userId: string, carId: string): Promise<string | null> {
  return uploadImage(localUri, userId, 'car', carId);
}

export async function uploadPostImage(localUri: string, userId: string, postId: string): Promise<string | null> {
  const { url, key } = getCredentials();

  console.log('[POST_UPLOAD] === START ===');
  console.log('[POST_UPLOAD] localUri:', localUri?.substring(0, 100));
  console.log('[POST_UPLOAD] userId:', userId, 'postId:', postId);

  if (isRemoteUrl(localUri)) {
    console.log('[POST_UPLOAD] Already remote URL');
    return localUri;
  }

  if (!isLocalFileUri(localUri)) {
    console.error('[POST_UPLOAD] Not a valid local URI:', localUri?.substring(0, 100));
    return null;
  }

  try {
    const timestamp = Date.now();
    const fileName = `${userId}/posts/${postId}_${timestamp}.jpg`;
    const uploadUrl = `${url}/storage/v1/object/${BUCKET_NAME}/${fileName}`;

    console.log('[POST_UPLOAD] Uploading to:', uploadUrl.substring(0, 80));

    const uploadResponse = await doUpload(uploadUrl, key, localUri, `post_${postId}_${timestamp}.jpg`);

    console.log('[POST_UPLOAD] Response status:', uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[POST_UPLOAD] FAILED:', uploadResponse.status, errorText);
      return null;
    }

    const publicUrl = `${url}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
    console.log('[POST_UPLOAD] Success:', publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('[POST_UPLOAD] Exception:', error?.message);
    return null;
  }
}
