import assert from 'node:assert/strict';
import test from 'node:test';

import { wgs84ToGcj02 } from './coordinates.js';

test('converts mainland China WGS-84 coordinates to GCJ-02', () => {
  const result = wgs84ToGcj02({ lat: 39.916527, lng: 116.397128 });

  assert.ok(Math.abs(result.lat - 39.91793074924595) < 1e-10);
  assert.ok(Math.abs(result.lng - 116.40337249402477) < 1e-10);
});

test('keeps coordinates outside mainland China unchanged', () => {
  const input = { lat: 40.7128, lng: -74.006 };

  assert.deepEqual(wgs84ToGcj02(input), input);
});

test('keeps invalid coordinates unchanged', () => {
  const input = { lat: Number.NaN, lng: 116.397128 };

  assert.deepEqual(wgs84ToGcj02(input), input);
});
