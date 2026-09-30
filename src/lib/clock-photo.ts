export const MAX_PHOTO_BYTES = 600_000;
// Accept only bounded camera JPEGs. Never trust the filename/MIME supplied by a caller.
export function decodeClockPhoto(value: string): Uint8Array {
  const prefix = "data:image/jpeg;base64,";
  if (!value.startsWith(prefix) || value.length > 800_023)
    throw new Error("Foto inválida ou muito grande. Tire outra foto.");
  const encoded = value.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error("Foto inválida. Tire outra foto.");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (
    bytes.length > MAX_PHOTO_BYTES ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Error("Foto inválida. Tire outra foto.");
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    const length = bytes[offset + 2]! * 256 + bytes[offset + 3]!;
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if (marker === 0xc0 || marker === 0xc2) {
      const height = bytes[offset + 5]! * 256 + bytes[offset + 6]!;
      const width = bytes[offset + 7]! * 256 + bytes[offset + 8]!;
      if (width >= 160 && height >= 120 && width <= 960 && height <= 960) return bytes;
      break;
    }
    offset += length + 2;
  }
  throw new Error("Resolução da foto inválida. Abra a câmera e tire outra foto.");
}
