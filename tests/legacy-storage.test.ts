import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearLegacyStreamingCredentials } from '../src/db/legacy.ts';

test('retiring streaming credentials leaves unrelated storage intact', () => {
  const data = new Map([['discdeck.spotify.token', 'secret'], ['discdeck.spotify.verifier', 'secret'], ['discdeck.spotify.state', 'secret'], ['discdeck.hifi', 'settings'], ['another.app', 'data']]);
  clearLegacyStreamingCredentials({ removeItem: key => { data.delete(key); } });
  assert.deepEqual([...data.keys()], ['discdeck.hifi', 'another.app']);
});
test('blocked storage cannot prevent local playback initialization', () => {
  assert.doesNotThrow(() => clearLegacyStreamingCredentials({ removeItem: () => { throw new Error('Storage blocked'); } }));
});
