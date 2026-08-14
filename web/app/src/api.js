// Vite 开发环境通过 /api 代理到 HTTP 后端；生产默认使用 HTTP，部署 HTTPS 时由反向代理负责。
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://localhost:8080')
).replace(/\/$/, '');
const LOCATION_REQUEST_TIMEOUT_MS = 8000;
const COMMAND_REQUEST_TIMEOUT_MS = 5000;
const ROUTE_REQUEST_TIMEOUT_MS = 8000;
const CAMERA_REQUEST_TIMEOUT_MS = 6000;

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

export const ROUTE_ERROR_MESSAGES = Object.freeze({
  INVALID_ROBOT_CODE: '设备名称无效',
  INVALID_ROUTE: '航线数据无效，请检查点位和速度',
  NOT_FOUND: '未找到该航线或设备位置',
  PUBLISH_FAILED: '航线下发失败，请检查 MQTT 服务',
  REQUEST_FAILED: '航线请求失败，请检查服务是否正常',
  SERVER_ERROR: '服务器异常，请稍后重试',
});

export const CAMERA_ERROR_MESSAGES = Object.freeze({
  INVALID_ROBOT_CODE: '设备名称无效',
  REQUEST_FAILED: '摄像头通道查询失败，请检查服务是否正常',
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

function createRouteError(code) {
  const error = new Error(ROUTE_ERROR_MESSAGES[code] || ROUTE_ERROR_MESSAGES.REQUEST_FAILED);
  error.code = code;
  return error;
}

function createCameraError(code) {
  const error = new Error(CAMERA_ERROR_MESSAGES[code] || CAMERA_ERROR_MESSAGES.REQUEST_FAILED);
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

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateRoutePointPayload(point, index) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw createRouteError('REQUEST_FAILED');
  }
  if (
    !Number.isInteger(point.seq) || point.seq !== index + 1 ||
    !isNumber(point.lng) || point.lng < -180 || point.lng > 180 ||
    !isNumber(point.lat) || point.lat < -90 || point.lat > 90 ||
    !isNumber(point.speedKnots) || point.speedKnots <= 0
  ) {
    throw createRouteError('REQUEST_FAILED');
  }
  return point;
}

function validateRoutePayload(payload, expectedRobotName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createRouteError('REQUEST_FAILED');
  }
  if (
    typeof payload.id !== 'string' || !payload.id ||
    (expectedRobotName && payload.robotName !== expectedRobotName) ||
    typeof payload.type !== 'string' || !payload.type ||
    typeof payload.coordinateSystem !== 'string' || !payload.coordinateSystem ||
    !isNumber(payload.lengthMeters) || payload.lengthMeters < 0 ||
    !Number.isInteger(payload.durationSeconds) || payload.durationSeconds < 0 ||
    !Array.isArray(payload.points)
  ) {
    throw createRouteError('REQUEST_FAILED');
  }

  return {
    ...payload,
    points: payload.points.map((point, index) => validateRoutePointPayload(point, index)),
  };
}

function validateRouteSendResponse(payload, expectedRobotName, expectedRouteId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createRouteError('REQUEST_FAILED');
  }
  if (
    payload.status !== 'published' ||
    payload.target !== expectedRobotName ||
    payload.routeId !== expectedRouteId ||
    typeof payload.protocol !== 'string' || !payload.protocol ||
    !Number.isInteger(payload.pointCount) || payload.pointCount < 2
  ) {
    throw createRouteError('REQUEST_FAILED');
  }
  return payload;
}

function validateCameraPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createCameraError('REQUEST_FAILED');
  }

  const stringFields = ['id', 'name', 'placement', 'status', 'tone', 'type', 'playUrl'];
  if (stringFields.some((field) => typeof payload[field] !== 'string' || !payload[field])) {
    throw createCameraError('REQUEST_FAILED');
  }
  if (payload.type !== 'hls') throw createCameraError('REQUEST_FAILED');

  return payload;
}

async function parseJSONResponse(response, createError) {
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw createError('REQUEST_FAILED');
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

export async function fetchRobotRoutes(deviceName, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName) throw createRouteError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/routes`,
      { signal: requestSignal, cache: 'no-store' },
    );

    if (response.status >= 500) throw createRouteError('SERVER_ERROR');
    if (!response.ok) throw createRouteError('REQUEST_FAILED');

    const payload = await parseJSONResponse(response, createRouteError);
    if (!Array.isArray(payload)) throw createRouteError('REQUEST_FAILED');
    return payload.map((route) => validateRoutePayload(route, robotName));
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createRouteError('REQUEST_FAILED');
    throw createRouteError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchRobotCameras(deviceName, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName) throw createCameraError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CAMERA_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/cameras`,
      { signal: requestSignal, cache: 'no-store' },
    );

    if (response.status === 400) throw createCameraError('INVALID_ROBOT_CODE');
    if (response.status >= 500) throw createCameraError('SERVER_ERROR');
    if (!response.ok) throw createCameraError('REQUEST_FAILED');

    const payload = await parseJSONResponse(response, createCameraError);
    if (!Array.isArray(payload)) throw createCameraError('REQUEST_FAILED');
    return payload.map((camera) => validateCameraPayload(camera));
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createCameraError('REQUEST_FAILED');
    throw createCameraError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function createRobotRoute(deviceName, routePayload, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName) throw createRouteError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/routes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routePayload),
        signal: requestSignal,
        cache: 'no-store',
      },
    );

    if (response.status === 400) throw createRouteError('INVALID_ROUTE');
    if (response.status >= 500) throw createRouteError('SERVER_ERROR');
    if (!response.ok) throw createRouteError('REQUEST_FAILED');

    const payload = await parseJSONResponse(response, createRouteError);
    return validateRoutePayload(payload, robotName);
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createRouteError('REQUEST_FAILED');
    throw createRouteError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function deleteRobotRoute(deviceName, routeId, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName || !routeId) throw createRouteError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/routes/${encodeURIComponent(routeId)}`,
      { method: 'DELETE', signal: requestSignal, cache: 'no-store' },
    );

    if (response.status === 404) throw createRouteError('NOT_FOUND');
    if (response.status >= 500) throw createRouteError('SERVER_ERROR');
    if (!response.ok && response.status !== 204) throw createRouteError('REQUEST_FAILED');
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createRouteError('REQUEST_FAILED');
    throw createRouteError('REQUEST_FAILED');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function sendRobotRoute(deviceName, routeId, signal) {
  const robotName = getRobotNameForDevice(deviceName);
  if (!robotName || !routeId) throw createRouteError('INVALID_ROBOT_CODE');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS);
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/robots/${encodeURIComponent(robotName)}/routes/${encodeURIComponent(routeId)}/send`,
      { method: 'POST', signal: requestSignal, cache: 'no-store' },
    );

    if (response.status === 400) throw createRouteError('INVALID_ROUTE');
    if (response.status === 404) throw createRouteError('NOT_FOUND');
    if (response.status === 503) throw createRouteError('PUBLISH_FAILED');
    if (response.status >= 500) throw createRouteError('SERVER_ERROR');
    if (!response.ok) throw createRouteError('REQUEST_FAILED');

    const payload = await parseJSONResponse(response, createRouteError);
    return validateRouteSendResponse(payload, robotName, routeId);
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw createRouteError('REQUEST_FAILED');
    throw createRouteError('REQUEST_FAILED');
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

export function getRouteErrorMessage(error) {
  return ROUTE_ERROR_MESSAGES[error?.code] || ROUTE_ERROR_MESSAGES.REQUEST_FAILED;
}

export function getCameraErrorMessage(error) {
  return CAMERA_ERROR_MESSAGES[error?.code] || CAMERA_ERROR_MESSAGES.REQUEST_FAILED;
}
