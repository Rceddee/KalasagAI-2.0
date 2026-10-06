/**
 * Cloudinary Free Storage Uploader for Photos & Video Evidence
 * Uploads media files via unsigned HTTP POST requests to Cloudinary CDN
 */
export async function uploadToCloudinary(mediaData: string, isVideo: boolean = false): Promise<string> {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error('Photo uploads are not configured. Remove the photo or try again later.');
  }

  const resourceType = isVideo ? 'video' : 'image';
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append('file', mediaData);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'kalasag_incidents');

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Cloudinary upload failed:', errorText);
    throw new Error('Photo upload failed. Check your connection, or remove the photo and try again.');
  }

  const data = await res.json();
  if (typeof data.secure_url !== 'string' || !data.secure_url) {
    throw new Error('Photo upload completed without a usable image link. Please try again.');
  }
  return data.secure_url;
}
