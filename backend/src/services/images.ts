import sharp from 'sharp';

/**
 * Server-side image normalization — every uploaded image (avatar, logos)
 * is re-encoded through sharp before it touches disk, so a malicious
 * "image" (polyglot, embedded payload, decompression bomb) is rejected or
 * stripped: output is always a clean, single-page, web-safe image.
 *
 * - AVATAR (photo): 512×512, cover-cropped square, PNG.
 * - LOGO:           256×256, contained (aspect preserved, transparent pad), PNG.
 *
 * PNG output for both: lossless for logos, and unlike JPEG the decode
 * cannot hide polyglot payloads in EXIF/app segments (sharp strips all
 * metadata either way).
 */

export const IMAGE_NORMALIZE = {
  avatar: { width: 512, height: 512, fit: 'cover' as const },
  logo: { width: 256, height: 256, fit: 'contain' as const },
} as const;

export type ImageKind = keyof typeof IMAGE_NORMALIZE;

/** Extensions that go through image normalization (everything else is stored raw). */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;

/**
 * Re-encode `buffer` into a normalized PNG of the given kind.
 * Throws if the input is not a decodable image — callers turn that into 415.
 */
export async function normalizeImage(buffer: Buffer, kind: ImageKind): Promise<Buffer> {
  const spec = IMAGE_NORMALIZE[kind];
  return sharp(buffer, { failOn: 'error' })
    .resize(spec.width, spec.height, { fit: spec.fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
