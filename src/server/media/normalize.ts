export interface NormalizedPhoto {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
}

function rejectAnimatedPng(input: Buffer) {
  if (
    !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return;
  // libvips can report only the first APNG frame, so check the container too.
  for (let offset = 8; offset + 12 <= input.length;) {
    const length = input.readUInt32BE(offset);
    if (offset + length + 12 > input.length)
      throw new PhotoError(
        415,
        "UNSUPPORTED_IMAGE",
        "The image could not be decoded.",
      );
    if (input.toString("ascii", offset + 4, offset + 8) === "acTL")
      throw new PhotoError(
        415,
        "UNSUPPORTED_IMAGE",
        "Use a single JPEG, PNG or WebP image.",
      );
    offset += length + 12;
  }
}

function rejectMultiPictureJpeg(input: Buffer) {
  if (input[0] !== 0xff || input[1] !== 0xd8) return;
  for (let offset = 2; offset + 4 <= input.length;) {
    if (input[offset] !== 0xff) return;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > input.length) return;
    if (
      marker === 0x01 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) return;
    if (
      marker === 0xe2 &&
      length >= 6 &&
      input.toString("ascii", offset + 2, offset + 6) === "MPF\0"
    )
      throw new PhotoError(
        415,
        "UNSUPPORTED_IMAGE",
        "Use a single JPEG, PNG or WebP image.",
      );
    offset += length;
  }
}

export async function normalizeProductPhoto(
  input: Buffer,
): Promise<NormalizedPhoto> {
  if (input.length > MAX_INPUT_BYTES)
    throw new PhotoError(413, "IMAGE_TOO_LARGE", "The image is too large.");
  try {
    rejectAnimatedPng(input);
    rejectMultiPictureJpeg(input);
    const metadata = await sharp(input, {
      limitInputPixels: false,
      failOn: "warning",
    }).metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) !== 1
    )
      throw new PhotoError(
        415,
        "UNSUPPORTED_IMAGE",
        "Use a single JPEG, PNG or WebP image.",
      );
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 25000 ||
      metadata.height > 25000 ||
      metadata.width * metadata.height > 25_000_000
    )
      throw new PhotoError(
        413,
        "IMAGE_TOO_LARGE",
        "The image dimensions are too large.",
      );
    const { data, info } = await sharp(input, {
      limitInputPixels: 25_000_000,
      failOn: "warning",
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 3 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_OUTPUT_BYTES)
      throw new PhotoError(
        413,
        "IMAGE_TOO_LARGE",
        "The normalized image is too large.",
      );
    return { data, width: info.width, height: info.height, bytes: data.length };
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(
      415,
      "UNSUPPORTED_IMAGE",
      "The image could not be decoded.",
    );
  }
}
import sharp from "sharp";
import { PhotoError } from "./errors.ts";

export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
