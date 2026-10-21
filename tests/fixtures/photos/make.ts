import sharp from "sharp";
import { crc32, deflateSync } from "node:zlib";

/** The photo fixtures, every one generated in memory (no binary blob is committed). */
export type PhotoFixture =
  | "portrait"
  | "alphaPng"
  | "tiny"
  | "panorama"
  | "atLimit"
  | "overLimit"
  | "pixelBomb"
  | "headerBomb"
  | "svg"
  | "gif"
  | "tiff"
  | "avif"
  | "htmlAsJpg"
  | "polyglot"
  | "truncated"
  | "empty";

const SOI_LENGTH = 2;
const SOS = 0xda;

/** A JPEG marker segment: FF, marker, a big-endian length that counts itself, then the payload. */
function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** The offset of the JPEG's first SOS marker, found by walking the segments after SOI. */
function sosOffset(jpeg: Buffer): number {
  let o = SOI_LENGTH;
  while (o + 4 <= jpeg.length) {
    if (jpeg[o] !== 0xff) throw new Error("not a JPEG segment");
    if (jpeg[o + 1] === SOS) return o;
    o += 2 + jpeg.readUInt16BE(o + 2);
  }
  throw new Error("no SOS in JPEG");
}

/** A COM (comment) segment carrying `text`, spliced in just before SOS. */
function withJpegComment(jpeg: Buffer, text: string): Buffer {
  const at = sosOffset(jpeg);
  return Buffer.concat([jpeg.subarray(0, at), jpegSegment(0xfe, Buffer.from(text, "latin1")), jpeg.subarray(at)]);
}

/** An APP13 "Photoshop 3.0" segment holding an 8BIM 0x0404 (IPTC) resource with 2:120 (caption), after SOI. */
function withIptcCaption(jpeg: Buffer, caption: string): Buffer {
  const text = Buffer.from(caption, "latin1");
  const dataset = Buffer.concat([Buffer.from([0x1c, 2, 120, text.length >> 8, text.length & 0xff]), text]);
  const padded = dataset.length % 2 ? Buffer.concat([dataset, Buffer.alloc(1)]) : dataset;
  const size = Buffer.alloc(4);
  size.writeUInt32BE(dataset.length);
  // "8BIM", resource id 0x0404, an empty Pascal name padded to even (two zero bytes), size, data.
  const resource = Buffer.concat([Buffer.from("8BIM", "latin1"), Buffer.from([0x04, 0x04, 0, 0]), size, padded]);
  const app13 = jpegSegment(0xed, Buffer.concat([Buffer.from("Photoshop 3.0\0", "latin1"), resource]));
  return Buffer.concat([jpeg.subarray(0, SOI_LENGTH), app13, jpeg.subarray(SOI_LENGTH)]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The end of the IHDR chunk: signature (8) + length (4) + type (4) + data (13) + CRC (4). */
const AFTER_IHDR = 8 + 4 + 4 + 13 + 4;

/** A PNG chunk: big-endian length, type, data, CRC-32 over type and data. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG whose IHDR declares 60000 × 60000 RGB, with one tiny IDAT: a few bytes claiming 3.6 gigapixels. */
function headerBomb(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(60000, 0);
  ihdr.writeUInt32BE(60000, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.alloc(64))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about=""/></rdf:RDF></x:xmpmeta>';

const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } });

/** 400 × 300 stored sideways (orientation 6), left half red and right half blue, with every kind of metadata. */
async function portrait(): Promise<Buffer> {
  const red = await solid(200, 300, "#ff0000").png().toBuffer();
  const blue = await solid(200, 300, "#0000ff").png().toBuffer();
  const jpeg = await solid(400, 300, "#000000")
    .composite([
      { input: red, left: 0, top: 0 },
      { input: blue, left: 200, top: 0 },
    ])
    .withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 41/1 0/1" } })
    .withXmp(XMP)
    .withIccProfile("p3")
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  return withJpegComment(withIptcCaption(jpeg, "caption here"), "shot at home");
}

/** 300 × 200 RGBA, every pixel at alpha 128, with a tEXt comment after IHDR. */
async function alphaPng(): Promise<Buffer> {
  const png = await sharp({
    create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 128 / 255 } },
  })
    .png()
    .toBuffer();
  const text = pngChunk("tEXt", Buffer.from("Comment\0shot at home", "latin1"));
  return Buffer.concat([png.subarray(0, AFTER_IHDR), text, png.subarray(AFTER_IHDR)]);
}

/** The first 60 % of a 400 × 300 gaussian-noise JPEG (noise keeps the scan data long, so the cut lands in it). */
async function truncated(): Promise<Buffer> {
  const noisy = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 30 },
    },
  })
    .jpeg()
    .toBuffer();
  return noisy.subarray(0, Math.floor(noisy.length * 0.6));
}

async function make(): Promise<Record<PhotoFixture, Buffer>> {
  const tiny = await solid(100, 100, "#336699").jpeg().toBuffer();
  return {
    portrait: await portrait(),
    alphaPng: await alphaPng(),
    tiny,
    panorama: await solid(4000, 400, "#336699").jpeg().toBuffer(),
    atLimit: await solid(4000, 3000, "#336699").jpeg().toBuffer(),
    overLimit: await solid(4001, 3000, "#336699").jpeg().toBuffer(),
    pixelBomb: await solid(5000, 5000, "#336699").png().toBuffer(),
    headerBomb: headerBomb(),
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    gif: await solid(10, 10, "#336699").gif().toBuffer(),
    tiff: await solid(10, 10, "#336699").tiff().toBuffer(),
    avif: await solid(10, 10, "#336699").avif().toBuffer(),
    htmlAsJpg: Buffer.from("<!doctype html><script>alert(1)</script>"),
    polyglot: withJpegComment(tiny, "<script>alert(1)</script>"),
    truncated: await truncated(),
    empty: Buffer.alloc(0),
  };
}

let memo: Promise<Record<PhotoFixture, Buffer>> | undefined;

/** Every photo fixture, built once per process (photos plan Task 4); Task 6's route tests reuse them. */
export function photoFixtures(): Promise<Record<PhotoFixture, Buffer>> {
  memo ??= make();
  return memo;
}
