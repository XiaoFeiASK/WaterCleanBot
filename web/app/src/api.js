// Vite 开发环境通过 /api 代理到 HTTP 后端；生产默认使用 HTTP，部署 HTTPS 时由反向代理负责。
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://localhost:8080')
).replace(/\/$/, '');
const LOCATION_REQUEST_TIMEOUT_MS = 8000;

// 当前前端设备与后端机器人的唯一已确认映射。
export const DEVICE_ROBOT_MAPPING = Object.freeze({
  '清澜一号': '清澜一号',
});

export const LOCATION_ERROR_MESSAGES = Object.freeze({
  INVALID_ROBOT_CODE: '设备名称无效',
  NOT_FOUND: '未找到该机器人位置',
  REQUEST_FAILED: '位置查询失败，请检查服务是否正常',
  SERVER_ERROR: '服务器异常，请稍后重试',
});

function createLocationError(code) {
  const error = new Error(LOCATION_ERROR_MESSAGES[code] || LOCATION_ERROR_MESSAGES.REQUEST_FAILED);
  error.code = code;
  return error;
}

export function getRobotNameForDevice(deviceName) {
  return DEVICE_ROBOT_MAPPING[deviceName] || '';
}

function validateLocationPayload(payload, expectedRobotName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createLocationError('REQUEST_FAILED');
  }

  const requiredFields = ['lat', 'lng', 'heading', 'speed', 'battery', 'status', 'robotName'];
  if (requiredFields.some((field) => !(field in payload))) {
    throw createLocationError('REQUEST_FAILED');
  }

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  if (
    payload.robotName !== expectedRobotName ||
    !isNumber(payload.lat) || payload.lat < -90 || payload.lat > 90 ||
    !isNumber(payload.lng) || payload.lng < -180 || payload.lng > 180 ||
    !isNumber(payload.speed) || payload.speed < 0 ||
    !isNumber(payload.battery) || payload.battery < 0 || payload.battery > 100 ||
    !Number.isInteger(payload.status) ||
    !isNumber(payload.heading) || payload.heading < 0 || payload.heading > 360
  ) {
    throw createLocationError('REQUEST_FAILED');
  }

  return payload;
}

export async function fetchRobotLocation(deviceName, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName) throw createLocationError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LOCATION_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/location`,
      { signal: requestSignal, cache: 'no-store' },
    );

    if (response.status === 404) throw createLocationError('NOT_FOUND');
    if (response.status >= 500) throw createLocationError('SERVER_ERROR');
    if (!response.ok) throw createLocationError('REQUEST_FAILED');

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw createLocationError('REQUEST_FAILED');
    }

    return validateLocationPayload(payload, robotName);
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createLocationError('REQUEST_FAILED');
    throw createLocationError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getLocationErrorMessage(error) {
  return LOCATION_ERROR_MESSAGES[error?.code] || LOCATION_ERROR_MESSAGES.REQUEST_FAILED;
}
