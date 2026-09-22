/**
 * Kuvatiedoston tunnistus omista alkutavuista. Selaimen lähettämään Content-Typeen
 * ei koskaan luoteta sellaisenaan — se on käyttäjän hallittavissa ja voi valehdella.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // reilusti yli 1600px:iin pienennetyn JPEG:n koon

const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    type: 'image/webp',
    ext: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    extra: (b) => b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
  },
];

/** @returns {{type: string, ext: string} | null} */
export function detectImageType(bytes) {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => bytes[i] === b) && (!sig.extra || sig.extra(bytes));
    if (match) return { type: sig.type, ext: sig.ext };
  }
  return null;
}
