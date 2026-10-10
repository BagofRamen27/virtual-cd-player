import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discSeconds, safeName, validateDisc } from '../src/lib/burnPlan.ts';
import { discZip } from '../src/lib/discZip.ts';

test('CD capacity includes gaps and rejects overflow, unreadable tracks and excess tracks', () => {
  assert.equal(discSeconds([30, 40]), 72);
  assert.equal(validateDisc('Mix', [2399, 2399], 80), null);
  assert.match(validateDisc('Mix', [2400, 2400], 80)!, /exceeds/);
  assert.match(validateDisc('Mix', [0], 80)!, /duration/);
  assert.match(validateDisc('Mix', [NaN], 80)!, /duration/);
  assert.match(validateDisc('Mix', Array(100).fill(1), 80)!, /99/);
  assert.match(validateDisc(' ', [1], 80)!, /name/);
});

test('ZIP keeps audio bytes, UTF-8 names, valid CRC and correct directory offsets', async () => {
  const zip = await discZip([{ name: 'Mix/01 - café.wav', data: new Blob(['123456789']) }, { name: 'Mix/playlist.m3u8', data: new Blob(['01 - café.wav\n']) }]);
  const bytes = new Uint8Array(await zip.arrayBuffer()), view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926); // standard CRC-32 check vector
  assert.equal(view.getUint16(6, true), 0x800);
  const nameLength = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + nameLength)), 'Mix/01 - café.wav');
  assert.equal(new TextDecoder().decode(bytes.slice(30 + nameLength, 39 + nameLength)), '123456789');
  const end = bytes.length - 22, centralOffset = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  assert.equal(view.getUint32(centralOffset + 42, true), 0);
  assert.equal(safeName('../bad/name:'), '.._bad_name_');
});
