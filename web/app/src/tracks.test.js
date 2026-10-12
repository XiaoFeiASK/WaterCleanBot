import assert from 'node:assert/strict';
import test from 'node:test';

import { getTrackColor, mergeTrackPoints, selectAllTrackIds, shouldAppendLivePoint, toTrackMapPoints } from './tracks.js';

test('uses red for one selected track and stable distinct colors for multiple tracks', () => {
  const ids = [1, 2];
  assert.equal(getTrackColor({ id: 1, trackNo: 1 }, ids), '#e5484d');
  assert.equal(getTrackColor({ id: 2, trackNo: 2 }, ids), '#2f80ed');
  assert.notEqual(getTrackColor({ id: 1, trackNo: 1 }, ids), getTrackColor({ id: 2, trackNo: 2 }, ids));
  assert.equal(getTrackColor({ id: 1, trackNo: 1 }, [2, 1]), getTrackColor({ id: 1, trackNo: 1 }, [1, 2]));
  assert.equal(getTrackColor({ id: 2, trackNo: 2 }, [2, 1]), getTrackColor({ id: 2, trackNo: 2 }, [1, 2]));
});

test('merges live and historical points without losing either side and removes duplicates', () => {
  const historical = [
    { seq: 1, lat: 31.2, lng: 121.4, receivedAt: '2026-10-12T00:00:00.000Z' },
    { seq: 2, lat: 31.20001, lng: 121.4, receivedAt: '2026-10-12T00:00:02.000Z' },
  ];
  const live = [
    { seq: 0, lat: 31.2, lng: 121.4, receivedAt: '2026-10-12T00:00:00.000Z' },
    { seq: 3, lat: 31.20002, lng: 121.4, receivedAt: '2026-10-12T00:00:04.000Z' },
  ];

  assert.deepEqual(mergeTrackPoints(historical, live), [
    historical[0],
    historical[1],
    live[1],
  ]);
});

test('selects every current track id', () => {
  assert.deepEqual(selectAllTrackIds([{ id: 3 }, { id: 8 }]), [3, 8]);
});

test('keeps a live point after two seconds even when the boat has not moved', () => {
  const previous = { lat: 31.2, lng: 121.4, receivedAt: '2026-10-12T00:00:00.000Z' };
  assert.equal(shouldAppendLivePoint(previous, { ...previous, receivedAt: '2026-10-12T00:00:01.999Z' }), false);
  assert.equal(shouldAppendLivePoint(previous, { ...previous, receivedAt: '2026-10-12T00:00:02.000Z' }), true);
});

test('maps valid raw points to the requested display coordinate system', () => {
  const result = toTrackMapPoints(
    [{ lat: 31.2, lng: 121.4 }, { lat: Number.NaN, lng: 121.4 }],
    ({ lat, lng }) => ({ lat: lat + 1, lng: lng + 2 }),
  );
  assert.deepEqual(result, [[123.4, 32.2]]);
});
