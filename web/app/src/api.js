// Vite 开发环境通过 /api 代理到 HTTP 后端；生产默认使用 HTTP，部署 HTTPS 时由反向代理负责。
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://localhost:8080')
).replace(/\/$/, '');
const LOCATION_REQUEST_TIMEOUT_MS = 8000;
const COMMAND_REQUEST_TIMEOUT_MS = 5000;

export const LOCATION_ERROR_MESSAGES = Object.freeze({
  INVALID_ROBOT_CODE: '设备名称无效',
  NOT_FOUND: '未找到该机器人位置',
  REQUEST_FAILED: '位置查询失败，请检查服务是否正常',
  SERVER_ERROR: '服务器异常，请稍后重试',
});

export const REMOTE_COMMAND_ERROR_MESSAGES = Object.freeze({
  INVALID_ROBOT_CODE: '设备名称无效',
  INVALID_COMMAND: '遥控指令参数无效',
  NOT_FOUND: '未找到该机器人位置，暂不能下发',
  PUBLISH_FAILED: '遥控指令下发失败，请检查 MQTT 服务',
  REQUEST_FAILED: '遥控指令请求失败，请检查服务是否正常',
  SERVER_ERROR: '服务器异常，请稍后重试',
});

function createLocationError(code) {
  const error = new Error(LOCATION_ERROR_MESSAGES[code] || LOCATION_ERROR_MESSAGES.REQUEST_FAILED);
  error.code = code;
  return error;
}

function createRemoteCommandError(code) {
  const error = new Error(REMOTE_COMMAND_ERROR_MESSAGES[code] || REMOTE_COMMAND_ERROR_MESSAGES.REQUEST_FAILED);
  error.code = code;
  return error;
}

export function getRobotNameForDevice(deviceName) {
  return typeof deviceName === 'string' ? deviceName.trim() : '';
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
    (expectedRobotName && payload.robotName !== expectedRobotName) ||
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

export async function fetchAllRobotLocations(signal) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LOCATION_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/locations`,
      { signal: requestSignal, cache: 'no-store' },
    );

    if (response.status >= 500) throw createLocationError('SERVER_ERROR');
    if (!response.ok) throw createLocationError('REQUEST_FAILED');

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw createLocationError('REQUEST_FAILED');
    }

    if (!Array.isArray(payload)) throw createLocationError('REQUEST_FAILED');
    return payload.map((position) => validateLocationPayload(position));
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createLocationError('REQUEST_FAILED');
    throw createLocationError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function validateCommandResponse(payload, expectedRobotName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createRemoteCommandError('REQUEST_FAILED');
  }
  if (
    payload.status !== 'published' ||
    typeof payload.commandId !== 'string' || !payload.commandId ||
    typeof payload.seq !== 'number' || !Number.isFinite(payload.seq) ||
    payload.target !== expectedRobotName
  ) {
    throw createRemoteCommandError('REQUEST_FAILED');
  }
  return payload;
}

export async function sendRobotCommand(deviceName, commandPayload, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName) throw createRemoteCommandError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), COMMAND_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/commands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commandPayload),
        signal: requestSignal,
        cache: 'no-store',
      },
    );

    if (response.status === 400) throw createRemoteCommandError('INVALID_COMMAND');
    if (response.status === 404) throw createRemoteCommandError('NOT_FOUND');
    if (response.status === 503) throw createRemoteCommandError('PUBLISH_FAILED');
    if (response.status >= 500) throw createRemoteCommandError('SERVER_ERROR');
    if (!response.ok) throw createRemoteCommandError('REQUEST_FAILED');

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw createRemoteCommandError('REQUEST_FAILED');
    }

    return validateCommandResponse(payload, robotName);
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createRemoteCommandError('REQUEST_FAILED');
    throw createRemoteCommandError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getLocationErrorMessage(error) {
  return LOCATION_ERROR_MESSAGES[error?.code] || LOCATION_ERROR_MESSAGES.REQUEST_FAILED;
}

export function getRemoteCommandErrorMessage(error) {
  return REMOTE_COMMAND_ERROR_MESSAGES[error?.code] || REMOTE_COMMAND_ERROR_MESSAGES.REQUEST_FAILED;
}
