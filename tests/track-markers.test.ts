import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackMarkers, segmentFrames, cueTime, buildCueSheet } from '../src/lib/trackMarkers.ts';

test('album timestamps produce adjacent songs and retain the final song to the end', () => {
  assert.deepEqual(parseTrackMarkers('0:00 Opening\n03:42 Second song\n1:02:03 Finale', 4000), [
    { title: 'Opening', start: 0, duration: 222 },
    { title: 'Second song', start: 222, duration: 3501 },
    { title: 'Finale', start: 3723, duration: 277 },
  ]);
  assert.equal(parseTrackMarkers('\r\n0:00 First\r\n\r\n0:05 Second\r\n', 10).length, 2);
});

test('album backups retain one source file and correct song starts in CUE', () => {
  const tracks = [{ file: '01 - Album.mp3', title: 'First', artist: 'Artist', start: 0 }, { file: '01 - Album.mp3', title: 'Second', artist: 'Artist', start: 222 }];
  const cue = buildCueSheet(tracks)!;
  assert.equal((cue.match(/FILE /g) || []).length, 1);
  assert.match(cue, /TRACK 02 AUDIO[\s\S]*INDEX 01 03:42:00/);
  assert.equal(buildCueSheet([...tracks].reverse()), null);
  assert.equal(buildCueSheet([{ ...tracks[0], file: 'album.flac' }]), null);
});

test('bad or ambiguous timestamps are rejected before modifying a disc', () => {
  for (const text of ['0:00 One', '0:01 One\n0:02 Two', '0:00 One\n0:00 Two', '0:00 One\n0:05 Two\n0:04 Three', '0:00 One\n0:60 Two', '0:00 One\n0:10 Two', '0:00 One\n0:02', 'First song\nSecond song']) {
    assert.throws(() => parseTrackMarkers(text, 10));
  }
  assert.throws(() => parseTrackMarkers('0:00 One\n0:05 Two', NaN));
  assert.throws(() => parseTrackMarkers(Array.from({ length: 100 }, (_, i) => `${i}:00 Song`).join('\n'), 7000));
});

test('sample boundaries neither overlap nor drop samples and clamp rounded metadata to decoded length', () => {
  const first = segmentFrames(0, 2.123, 44100, 441000);
  const second = segmentFrames(2.123, 7.8771, 44100, 441000);
  assert.equal(first.to, second.from);
  assert.equal(second.to, 441000);
  assert.throws(() => segmentFrames(10, 1, 44100, 441000));
  assert.throws(() => segmentFrames(-1, 1, 44100, 441000));
  assert.throws(() => segmentFrames(0, NaN, 44100, 441000));
  assert.equal(cueTime(222), '03:42:00');
  assert.equal(cueTime(3723), '62:03:00');
});
