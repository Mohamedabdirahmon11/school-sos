const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected file could not be read as an image.'));
    image.src = url;
  });
}

export async function fileToJpegDataUrl(file: File, maxDimension = 1400, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a PNG, JPG, or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image must be 8 MB or smaller before compression.');
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image compression is not supported in this browser.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 2_800_000) throw new Error('Compressed image is too large. Please choose a smaller image.');
  return dataUrl;
}
