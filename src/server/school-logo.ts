export const SCHOOL_LOGO_BUCKET = 'school-logos';
export const SCHOOL_LOGO_MAX_BYTES = 1_572_864;

export type SchoolLogoImage = {
  extension: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

export function detectSchoolLogoImage(bytes: Uint8Array, declaredContentType?: string): SchoolLogoImage | null {
  if (!bytes || bytes.byteLength < 12 || bytes.byteLength > SCHOOL_LOGO_MAX_BYTES) return null;

  let image: SchoolLogoImage | null = null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    image = { extension: 'png', contentType: 'image/png' };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    image = { extension: 'jpg', contentType: 'image/jpeg' };
  } else if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    image = { extension: 'webp', contentType: 'image/webp' };
  }

  return image && (!declaredContentType || declaredContentType.split(';')[0].trim().toLowerCase() === image.contentType)
    ? image
    : null;
}
