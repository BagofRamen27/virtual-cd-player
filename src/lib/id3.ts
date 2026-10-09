/** Minimal ID3v2.3/2.4 reader: title, artist, album, track number, year and front cover. */
export interface BasicTags {
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
  year?: string;
  picture?: Blob;
}

function syncsafe(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

function decodeText(bytes: Uint8Array): string {
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let label = 'latin1';
  if (enc === 1) label = 'utf-16';
  else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  try {
    return new TextDecoder(label).decode(body).replace(/\0+$/g, '').split('\0')[0].trim();
  } catch {
    return '';
  }
}

function readPicture(bytes: Uint8Array): Blob | undefined {
  const enc = bytes[0];
  let i = 1;
  let mime = '';
  while (i < bytes.length && bytes[i] !== 0) mime += String.fromCharCode(bytes[i++]);
  i++; // null
  i++; // picture type
  // description, terminated by 1 or 2 null bytes depending on encoding
  if (enc === 1 || enc === 2) {
    while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < bytes.length && bytes[i] !== 0) i++;
    i++;
  }
  if (i >= bytes.length) return undefined;
  if (!mime.includes('/')) mime = `image/${mime.toLowerCase() || 'jpeg'}`;
  return new Blob([bytes.slice(i)], { type: mime });
}

export async function readTags(file: Blob): Promise<BasicTags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const version = head[3];
    if (version < 3) return {};
    const size = syncsafe(head, 6);
    const b = new Uint8Array(await file.slice(10, 10 + Math.min(size, 8 * 1024 * 1024)).arrayBuffer());
    const tags: BasicTags = {};
    let o = 0;
    while (o + 10 <= b.length) {
      const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const len = version === 4 ? syncsafe(b, o + 4) : (b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7];
      if (len <= 0 || o + 10 + len > b.length) break;
      const data = b.subarray(o + 10, o + 10 + len);
      switch (id) {
        case 'TIT2':
          tags.title = decodeText(data);
          break;
        case 'TPE1':
          tags.artist = decodeText(data);
          break;
        case 'TALB':
          tags.album = decodeText(data);
          break;
        case 'TRCK':
          tags.track = parseInt(decodeText(data), 10) || undefined;
          break;
        case 'TYER':
        case 'TDRC':
          tags.year = decodeText(data).slice(0, 4);
          break;
        case 'APIC':
          tags.picture ??= readPicture(data);
          break;
      }
      o += 10 + len;
    }
    return tags;
  } catch {
    return {};
  }
}
