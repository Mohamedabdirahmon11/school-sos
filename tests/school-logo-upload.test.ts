import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectSchoolLogoImage, SCHOOL_LOGO_MAX_BYTES } from '../src/server/school-logo.ts';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test('accepts PNG, JPEG, and WebP using their actual file signatures', () => {
  assert.deepEqual(detectSchoolLogoImage(png, 'image/png'), { extension: 'png', contentType: 'image/png' });
  assert.deepEqual(detectSchoolLogoImage(jpeg, 'image/jpeg'), { extension: 'jpg', contentType: 'image/jpeg' });
  assert.deepEqual(detectSchoolLogoImage(webp, 'image/webp'), { extension: 'webp', contentType: 'image/webp' });
});

test('rejects a MIME type that does not match the uploaded image bytes', () => {
  assert.equal(detectSchoolLogoImage(png, 'image/jpeg'), null);
  assert.equal(detectSchoolLogoImage(jpeg, 'text/plain'), null);
});

test('rejects unknown, truncated, empty, and oversized logo uploads', () => {
  assert.equal(detectSchoolLogoImage(new Uint8Array()), null);
  assert.equal(detectSchoolLogoImage(new Uint8Array([1, 2, 3])), null);
  assert.equal(detectSchoolLogoImage(new Uint8Array(12)), null);
  assert.equal(detectSchoolLogoImage(new Uint8Array(SCHOOL_LOGO_MAX_BYTES + 1)), null);
});
