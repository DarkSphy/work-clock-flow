import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeClockPhoto } from "../src/lib/clock-photo.ts";
const dataUrl = (bytes: number[]) =>
  `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
test("photo validator rejects other formats, oversized input and truncated files", () => {
  for (const value of [
    "",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64,%%%",
    dataUrl([255, 216, 1, 2]),
    "x".repeat(800024),
  ])
    assert.throws(() => decodeClockPhoto(value));
});
test("photo validator checks JPEG dimensions and frame bounds", () => {
  const frame = [255, 216, 255, 192, 0, 11, 8, 2, 208, 3, 192, 1, 1, 17, 0, 255, 217];
  assert.equal(decodeClockPhoto(dataUrl(frame)).length, frame.length);
  const huge = [...frame];
  huge[9] = 40;
  assert.throws(() => decodeClockPhoto(dataUrl(huge)), /Resolução/);
  const small = [...frame];
  small[7] = 0;
  small[8] = 20;
  assert.throws(() => decodeClockPhoto(dataUrl(small)), /Resolução/);
  const corrupt = [...frame];
  corrupt[4] = 255;
  assert.throws(() => decodeClockPhoto(dataUrl(corrupt)), /Resolução/);
});
