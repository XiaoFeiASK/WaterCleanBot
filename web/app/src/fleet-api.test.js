// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRobot, deleteRobot, fetchAllRobotLocations, hasCoordinates, isRobotOnline, subscribeRobotLocations } from './api';

const pending = { robotName: 'USV-002', lat: null, lng: null, heading: null, speed: null, battery: null, status: 0 };
afterEach(() => vi.unstubAllGlobals());

describe('fleet API', () => {
  it('accepts nullable telemetry without treating it as a location or online device', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [pending] }));
    expect(await fetchAllRobotLocations()).toEqual([pending]);
    expect(hasCoordinates(pending)).toBe(false);
    expect(isRobotOnline(pending)).toBe(false);
    expect(isRobotOnline({ ...pending, sourceTimestampMs: 1, receivedAtMs: 1000 }, 32000)).toBe(false);
    expect(isRobotOnline({ ...pending, sourceTimestampMs: 1, receivedAtMs: 1000 }, 1001)).toBe(true);
  });
  it('does not accept malformed telemetry in place of null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ ...pending, lat: 'unknown' }] }));
    await expect(fetchAllRobotLocations()).rejects.toThrow();
  });
  it('reports duplicate and persistence failures honestly', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ cacheChanged: true }) })
      .mockResolvedValueOnce({ ok: true, status: 204 }));
    await expect(createRobot('USV-002')).rejects.toThrow('该设备编号已存在');
    await expect(deleteRobot('USV-002')).rejects.toMatchObject({ cacheChanged: true });
    await deleteRobot('USV-002');
    expect(fetch.mock.calls[2][0]).toMatch(/\/api\/robots\/USV-002$/);
  });
  it('delivers ordered creation, deletion and reappearance events', () => {
    let stream;
    class FakeEventSource {
      handlers = {};
      constructor() { stream = this; }
      addEventListener(name, callback) { this.handlers[name] = callback; }
      close = vi.fn();
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const received = [];
    const stop = subscribeRobotLocations({ onPosition: (p) => received.push(p.robotName), onDeleted: (name) => received.push(`delete:${name}`) });
    stream.handlers.position({ data: JSON.stringify(pending) });
    stream.handlers.deleted({ data: JSON.stringify({ robotName: pending.robotName }) });
    stream.handlers.position({ data: JSON.stringify(pending) });
    expect(received).toEqual(['USV-002', 'delete:USV-002', 'USV-002']);
    stop();
    expect(stream.close).toHaveBeenCalledOnce();
  });
});
