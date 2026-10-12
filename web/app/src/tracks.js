// 文件作用：提供历史轨迹展示、配色和实时采样合并的纯函数。

export const TRACK_SINGLE_COLOR = '#e5484d';

export const TRACK_PALETTE = Object.freeze([
  '#e5484d',
  '#2f80ed',
  '#f2994a',
  '#27ae60',
  '#9b51e0',
  '#00a6a6',
  '#eb5757',
  '#6fcf97',
  '#bb6bd9',
  '#2d9cdb',
]);

const EARTH_RADIUS_METERS = 6371000;
const TRACK_MIN_DISTANCE_METERS = 1;
const TRACK_MIN_INTERVAL_MS = 2000;

export function getTrackColor(track, selectedTrackIds) {
  const selectedIds = Array.from(selectedTrackIds || []);
  if (selectedIds.length <= 1) return TRACK_SINGLE_COLOR;
  const stableKey = Number.isInteger(track?.trackNo) && track.trackNo > 0 ? track.trackNo : track?.id;
  const index = Number.isInteger(stableKey) && stableKey > 0 ? stableKey - 1 : 0;
  return TRACK_PALETTE[index % TRACK_PALETTE.length];
}

export function mergeTrackPoints(historicalPoints, livePoints) {
  const pointsByKey = new Map();

  [...(historicalPoints || []), ...(livePoints || [])].forEach((point) => {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || typeof point.receivedAt !== 'string') {
      return;
    }
    const key = `${point.receivedAt}|${point.lng}|${point.lat}`;
    const existing = pointsByKey.get(key);
    if (!existing) {
      pointsByKey.set(key, point);
      return;
    }
    const existingSeq = Number.isInteger(existing.seq) && existing.seq > 0 ? existing.seq : 0;
    const nextSeq = Number.isInteger(point.seq) && point.seq > 0 ? point.seq : 0;
    if (existingSeq === 0 && nextSeq > 0) pointsByKey.set(key, point);
  });

  return Array.from(pointsByKey.values()).sort((left, right) => {
    const leftTime = Date.parse(left.receivedAt);
    const rightTime = Date.parse(right.receivedAt);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    return leftTime - rightTime;
  });
}

export function distanceMeters(start, end) {
  const toRadians = (degree) => degree * Math.PI / 180;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function shouldAppendLivePoint(previous, next) {
  if (!previous || !next) return Boolean(next);
  if (![previous.lat, previous.lng, next.lat, next.lng].every(Number.isFinite)) return false;
  const previousTime = Date.parse(previous.receivedAt || '');
  const nextTime = Date.parse(next.receivedAt || '');
  if (Number.isFinite(previousTime) && Number.isFinite(nextTime) && nextTime < previousTime) return false;
  const elapsed = Number.isFinite(previousTime) && Number.isFinite(nextTime) ? nextTime - previousTime : 0;
  return distanceMeters(previous, next) >= TRACK_MIN_DISTANCE_METERS || elapsed >= TRACK_MIN_INTERVAL_MS;
}

export function selectAllTrackIds(tracks) {
  return (tracks || []).map((track) => track.id);
}

export function toTrackMapPoints(points, convertCoordinate = (point) => point) {
  return (points || [])
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
    .map((point) => {
      const converted = convertCoordinate({ lat: point.lat, lng: point.lng });
      return [converted.lng, converted.lat];
    });
}
