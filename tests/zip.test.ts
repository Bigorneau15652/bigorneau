import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fontFilesOfZip } from "../src/zip";

const inflate = async (data: Uint8Array, limit: number): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data, { maxOutputLength: limit }));

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

// Archive d'un seul fichier stocke (methode 0), construite a la main : en-tete local, annuaire central, fin d'annuaire.
function storedZip(name: string, content: Uint8Array, declared = content.length): Uint8Array {
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, nameBytes, Buffer.from(content)]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(body.length, 16);
  return new Uint8Array(Buffer.concat([body, central, nameBytes, end]));
}

test(`les fichiers caches et les fichiers trop gros d'une archive sont refuses`, async () => {
  const refused: string[] = [];
  assert.deepEqual(await fontFilesOfZip(storedZip(`.cachee.ttf`, new Uint8Array(10)), inflate, refused), []);
  assert.deepEqual(refused, []);
  const ok = await fontFilesOfZip(storedZip(`dossier/Police.ttf`, new Uint8Array(10)), inflate, refused);
  assert.deepEqual(ok.map((f) => f.name), [`Police.ttf`]);
  // La taille annoncee depasse la limite : le fichier n'est pas extrait.
  assert.deepEqual(await fontFilesOfZip(storedZip(`Enorme.ttf`, new Uint8Array(10), 60 * 1024 * 1024), inflate, refused), []);
  assert.deepEqual(refused, [`Enorme.ttf`]);
});

test(`une archive dont l'en-tete ment sur la taille est arretee a la limite`, async () => {
  // 60 Mo de zeros comprimes en quelques dizaines de Ko, annonces comme 10 octets.
  const { deflateRawSync } = await import(`node:zlib`);
  const packed = new Uint8Array(deflateRawSync(Buffer.alloc(60 * 1024 * 1024)));
  const zip = storedZip(`Piege.ttf`, packed, 10);
  // Le fichier est « stocke » : on le declare comprime (methode 8) en modifiant l'annuaire central.
  const view = Buffer.from(zip);
  const central = view.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  view.writeUInt16LE(8, central + 10);
  const refused: string[] = [];
  const start = Date.now();
  const files = await fontFilesOfZip(new Uint8Array(view), inflate, refused);
  assert.deepEqual(files, []);
  assert.deepEqual(refused, [`Piege.ttf`]);
  assert.ok(Date.now() - start < 5000);
});
