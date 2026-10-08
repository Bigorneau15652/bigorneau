import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fontFilesOfZip } from "../src/zip";

const inflate = async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data));

test(`les polices d'une archive zip sont extraites, compressees ou non, sans les fichiers caches de macOS`, async () => {
  const zip = new Uint8Array(readFileSync(`tests/fonts/sample-fonts.zip`));
  const files = await fontFilesOfZip(zip, inflate);
  assert.deepEqual(files.map((f) => f.name).sort(), [`Autre.OTF`, `TestSerif-Bold.ttf`, `TestSerif-Regular.ttf`]);
  const regular = files.find((f) => f.name === `TestSerif-Regular.ttf`);
  assert.deepEqual(Buffer.from(regular?.data ?? []), readFileSync(`tests/fonts/TestSerif-Regular.ttf`));
  const bold = files.find((f) => f.name === `TestSerif-Bold.ttf`);
  assert.deepEqual(Buffer.from(bold?.data ?? []), readFileSync(`tests/fonts/TestSerif-Bold.ttf`));
});

test(`une archive illisible ne donne rien`, async () => {
  assert.deepEqual(await fontFilesOfZip(new Uint8Array(100), inflate), []);
  assert.deepEqual(await fontFilesOfZip(new Uint8Array(0), inflate), []);
});
