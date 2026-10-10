import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Hls from 'hls.js';
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Compass,
  Crosshair,
  Gauge,
  LayoutDashboard,
  List,
  MapPinned,
  Menu,
  PanelLeftClose,
  Plus,
  Power,
  Trash2,
  X,
  Radio,
  Search,
  Settings2,
  LogOut,
  UserRound,
  ShipWheel,
  Video,
  Wifi,
} from 'lucide-react';
import {
  createRobotRoute,
  createRobot,
  deleteRobot,
  hasCoordinates,
  isRobotOnline,
  deleteRobotRoute,
  fetchRobotCameras,
  fetchRobotLocation,
  getLocationErrorMessage,
  getCameraErrorMessage,
  getRemoteCommandErrorMessage,
  getRobotNameForDevice,
  getRouteErrorMessage,
  fetchRobotRoutes,
  sendRobotRoute,
  sendRobotCommand,
  subscribeRobotLocations,
} from './api';
import { wgs84ToGcj02 } from './coordinates';
import { DEMO_PERCEPTION_ROUTE, DEMO_SHORELINE_SECTIONS } from './demoData';
import { getRoleName } from './roles';
import { DockEjectButton, requestRemoteSwitchConfirmation, TrackingButton } from './CommandControls';
import './fleet.css';

function confirmAction(message) {
  try { return window.confirm(message) !== false; } catch { return true; }
}

const AMAP_KEY = import.meta.env.VITE_MAP_API_KEY;
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE;
const DEFAULT_DEVICE_ID = 'USV-001';
const ACTIVE_PAGE_STORAGE_KEY = 'watercleanbot.activePage';
const CONTROL_MODE_LABELS = Object.freeze({ 0: '界面手动', 1: '界面自主', 2: '遥控器手动' });
const DEVICE_FEEDBACK_CACHE_PREFIX = 'watercleanbot.deviceFeedback.';

function readDeviceFeedbackCache(robotName) {
  try {
    const cached = window.localStorage.getItem(`${DEVICE_FEEDBACK_CACHE_PREFIX}${robotName}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function removeDeviceFeedbackCache(robotName) {
  try { window.localStorage.removeItem(`${DEVICE_FEEDBACK_CACHE_PREFIX}${robotName}`); } catch { /* Storage may be disabled. */ }
}

function cacheDeviceFeedback(position) {
  if (!position?.robotName) return;
  if (!position.sourceTimestampMs) { removeDeviceFeedbackCache(position.robotName); return; }
  const feedback = {
    controlMode: position.controlMode,
    commandResultCode: position.commandResultCode,
    actuators: position.actuators,
    deviceStatusOk: position.deviceStatusOk,
    leftThrottle: position.leftThrottle,
    rightThrottle: position.rightThrottle,
  };
  try {
    window.localStorage.setItem(`${DEVICE_FEEDBACK_CACHE_PREFIX}${position.robotName}`, JSON.stringify(feedback));
  } catch {
    // 本地缓存不可用时，仍以接口响应直接更新页面。
  }
}

function applyDeviceFeedbackCache(position) {
  if (!position?.robotName) return position;
  if (!position.sourceTimestampMs) return position;
  const cached = readDeviceFeedbackCache(position.robotName);
  if (!cached || typeof cached !== 'object') return position;
  return {
    ...position,
    controlMode: position.controlMode ?? cached.controlMode,
    commandResultCode: position.commandResultCode ?? cached.commandResultCode,
    actuators: position.actuators ?? cached.actuators,
    deviceStatusOk: position.deviceStatusOk ?? cached.deviceStatusOk,
    leftThrottle: position.leftThrottle ?? cached.leftThrottle,
    rightThrottle: position.rightThrottle ?? cached.rightThrottle,
  };
}

const REMOTE_THROTTLE_COMMANDS = Object.freeze([
  { cmd: 'THROTTLE_L', label: '左油门', hint: '范围 -100-100' },
  { cmd: 'THROTTLE_R', label: '右油门', hint: '范围 -100-100' },
]);

const REMOTE_SWITCH_COMMANDS = Object.freeze([
  { cmd: 'HATCH_CYLINDER', label: '翻盖电缸', onText: '开启', offText: '关闭' },
  { cmd: 'DISC_CYLINDER', label: '推出电缸', onText: '推出', offText: '收回' },
  { cmd: 'CONVEYOR', label: '传送带', onText: '开启', offText: '关闭' },
  { cmd: 'BRUSH_L', label: '左滚刷', onText: '开启', offText: '关闭' },
  { cmd: 'BRUSH_R', label: '右滚刷', onText: '开启', offText: '关闭' },
  { cmd: 'CLEANING', label: '垃圾清理', onText: '运行', offText: '停止' },
]);

const CRITICAL_SWITCH_COMMANDS = Object.freeze([
  { cmd: 'OPERATING_MODE', label: '运行模式', onText: '自主', offText: '手动', icon: ShipWheel, tone: 'mode' },
  { cmd: 'PADDLE_POWER', label: '明轮电源', onText: '上电', offText: '断电', icon: Power, tone: 'power' },
]);

const CAMERA_CHANNELS = Object.freeze([
  { id: 'front', name: '前视主摄', placement: '船艏广角', status: '待接入', tone: 'teal' },
  { id: 'rear', name: '后视泊靠', placement: '船尾低位', status: '待接入', tone: 'blue' },
]);

const DEVICE_DETAIL_TABS = Object.freeze([
  { id: 'online-map', label: '在线地图' },
  { id: 'dock', label: '智能船坞' },
  { id: 'water-report', label: '水质报告' },
  { id: 'depth-map', label: '水深图' },
  { id: 'shoreline-map', label: '河岸二维地图' },
  { id: 'cameras', label: '监控摄像头' },
  { id: 'cleaning-area', label: '清洁区域' },
  { id: 'patrol', label: '巡查情况' },
]);

const INITIAL_REMOTE_VALUES = Object.freeze({
  THROTTLE_L: 0,
  THROTTLE_R: 0,
  HATCH_CYLINDER: 0,
  DISC_CYLINDER: 0,
  CONVEYOR: 0,
  BRUSH_L: 0,
  BRUSH_R: 0,
  OPERATING_MODE: 0,
  CLEANING: 0,
  PADDLE_POWER: 0,
});

let amapPromise;

function loadAMap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;

  amapPromise = new Promise((resolve, reject) => {
    if (!AMAP_KEY) {
      reject(new Error('Missing AMap API key'));
      return;
    }

    if (AMAP_SECURITY_CODE) {
      window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
    }

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}`;
    script.async = true;
    script.dataset.amapLoader = 'true';
    script.onload = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('AMap loaded without a global API'));
    };
    script.onerror = () => reject(new Error('Failed to load AMap'));
    document.head.appendChild(script);
  });

  return amapPromise;
}

const navGroups = [
  {
    label: '监控中心',
    items: [
      { id: 'dashboard', label: '总览看板', icon: LayoutDashboard },
      { id: 'fleet', label: '设备编队', icon: ShipWheel },
    ],
  },
  {
    label: '设备管理',
    items: [
      { id: 'devices', label: '设备列表', icon: List },
      { id: 'device-detail', label: '设备详情', icon: Settings2 },
    ],
  },
  {
    label: '业务管理',
    items: [
      { id: 'water-areas', label: '水域管理', icon: MapPinned },
      { id: 'tasks', label: '任务管理', icon: List },
      { id: 'scheduling', label: '任务调度', icon: Clock3 },
      { id: 'alerts', label: '预警管理', icon: CircleAlert },
    ],
  },
];

const pageNames = Object.fromEntries(
  navGroups.flatMap((group) => group.items.map((item) => [item.id, item.label])),
);

function getStoredActivePage() {
  const storedPage = window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
  return storedPage && pageNames[storedPage] ? storedPage : 'dashboard';
}

function saveActivePage(page) {
  window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, page);
}

function formatNumber(value, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '暂无数据';
}

function formatBattery(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '暂无数据';
}

function formatRouteLength(lengthMeters) {
  if (typeof lengthMeters !== 'number' || !Number.isFinite(lengthMeters)) return '暂无数据';
  return lengthMeters >= 1000 ? `${(lengthMeters / 1000).toFixed(2)} km` : `${Math.round(lengthMeters)} m`;
}

function formatRouteDurationSeconds(durationSeconds) {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) return '暂无数据';
  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
  return `${minutes}分钟`;
}

function formatDistanceKm(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) return '暂无数据';
  return `${distanceKm.toFixed(2)} km`;
}

export function TotalDistanceDisplay({ value }) {
  return (
    <div className="total-distance-display" aria-label="总航程">
      <span>总航程</span>
      <strong>{formatDistanceKm(value)}</strong>
    </div>
  );
}

function formatHeading(heading) {
  return typeof heading === 'number' && Number.isFinite(heading) ? `${heading.toFixed(1)}°` : '暂无数据';
}

function formatSpeed(speed) {
  return typeof speed === 'number' && Number.isFinite(speed) ? `${speed.toFixed(1)} m/s` : '暂无数据';
}

function formatCoordinates(position) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return '暂无数据';
  return `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
}

function getDistanceMeters(startPoint, endPoint) {
  const toRadians = (degree) => degree * Math.PI / 180;
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(endPoint.lat - startPoint.lat);
  const deltaLng = toRadians(endPoint.lng - startPoint.lng);
  const startLat = toRadians(startPoint.lat);
  const endLat = toRadians(endPoint.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function getRouteLengthMeters(points) {
  return points.slice(1).reduce((total, point, index) => total + getDistanceMeters(points[index], point), 0);
}

function getRouteDurationSeconds(points, startPoint) {
  if (!points.length) return null;
  let previousPoint = startPoint || null;
  let durationSeconds = 0;
  points.forEach((point) => {
    if (previousPoint) {
      const speedMetersPerSecond = point.speedKnots * 0.514444;
      if (speedMetersPerSecond > 0) {
        durationSeconds += getDistanceMeters(previousPoint, point) / speedMetersPerSecond;
      }
    }
    previousPoint = point;
  });
  return Math.ceil(durationSeconds);
}

function getRouteMapPoints(route) {
  if (!route?.points?.length) return [];
  if (route.coordinateSystem === 'WGS84') {
    return route.points.map((point) => ({ ...point, ...wgs84ToGcj02(point) }));
  }
  return route.points;
}

const SHORELINE_MAP_SECTIONS = DEMO_SHORELINE_SECTIONS.map((section) => ({
  ...section,
  path: section.points.map(([lng, lat]) => {
    const mapPoint = wgs84ToGcj02({ lng, lat });
    return [mapPoint.lng, mapPoint.lat];
  }),
}));
const PERCEPTION_ROUTE_MAP_POINTS = getRouteMapPoints(DEMO_PERCEPTION_ROUTE);

function getMapClickPoint(lngLat) {
  if (!lngLat) return null;
  const lng = typeof lngLat.getLng === 'function' ? lngLat.getLng() : lngLat.lng;
  const lat = typeof lngLat.getLat === 'function' ? lngLat.getLat() : lngLat.lat;
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getFleetBubbleStyle(zoom = 13) {
  const progress = clamp((zoom - 5) / 11, 0, 1);
  const easedProgress = progress ** 0.85;
  return {
    scale: Number((0.32 + 0.68 * easedProgress).toFixed(3)),
    opacity: Number((0.35 + 0.65 * progress).toFixed(3)),
  };
}

function getMapZoom(map) {
  return typeof map?.getZoom === 'function' ? map.getZoom() : 13;
}

function applyFleetBubbleStyle(content, zoom) {
  const bubbleStyle = getFleetBubbleStyle(zoom);
  content.style.setProperty('--fleet-bubble-scale', bubbleStyle.scale);
  content.style.setProperty('--fleet-bubble-opacity', bubbleStyle.opacity);
}

function updateFleetMarkerBubbleScales(markerGroups, zoom) {
  markerGroups.forEach((markerGroup) => {
    applyFleetBubbleStyle(markerGroup.content, zoom);
  });
}

function resetFleetHeadingAngles() {
  fleetHeadingAngles.clear();
}

function safelyDestroyMap(map) {
  if (map && typeof map.destroy === 'function') {
    try {
      map.destroy();
    } catch (error) {
      // Ignore third-party map cleanup failures so the React view stays mounted.
    }
  }
}

function safelyRemoveMarker(marker) {
  if (marker && typeof marker.setMap === 'function') {
    try {
      marker.setMap(null);
    } catch (error) {
      // Ignore third-party marker cleanup failures so empty states can render.
    }
  }
}

function safelyRemoveOverlay(overlay) {
  if (overlay && typeof overlay.setMap === 'function') {
    try {
      overlay.setMap(null);
    } catch (error) {
      // Ignore third-party overlay cleanup failures so map interactions keep working.
    }
  }
}

function createRoutePointContent(index, isDraft, variant = 'standard', isBridge = false) {
  const point = document.createElement('div');
  point.className = `route-planner-point ${isDraft ? 'route-planner-point-draft' : ''} ${variant === 'perception' ? 'route-planner-point-perception' : ''}`;
  if (isBridge) point.classList.add('route-planner-point-bridge');
  point.textContent = String(index + 1);
  return point;
}

const FLEET_MARKER_BOAT_SVG = [
  '<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">',
  // 尖船艏朝上（地图正北），船尾平直，便于一眼分辨朝向。
  '<path class="fleet-boat-hull" d="M22 2.4 L31.6 15.2 C34.4 19.2 35.2 23.6 34.4 30.2 L33.2 38.4 L10.8 38.4 L9.6 30.2 C8.8 23.6 9.6 19.2 12.4 15.2 Z" />',
  '<path class="fleet-boat-deck" d="M22 10.6 L27.6 18.6 C29.2 21.2 29.6 24 29.2 28 L28.4 33.4 L15.6 33.4 L14.8 28 C14.4 24 14.8 21.2 16.4 18.6 Z" />',
  '<path class="fleet-boat-bow" d="M22 5.2 L26.6 14.4 L17.4 14.4 Z" />',
  '</svg>',
].join('');

const fleetHeadingAngles = new Map();

function normalizeFleetHeading(heading) {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

// 把 0/360 边界换算成连续角度，避免 359° 转到 1° 时图标反向转一整圈。
function getFleetDisplayHeading(name, heading) {
  const normalized = normalizeFleetHeading(heading);
  if (normalized === null) return null;

  const key = name || '';
  const previous = fleetHeadingAngles.get(key);
  if (previous === undefined) {
    fleetHeadingAngles.set(key, normalized);
    return normalized;
  }

  const previousNormalized = ((previous % 360) + 360) % 360;
  let delta = normalized - previousNormalized;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const next = previous + delta;
  fleetHeadingAngles.set(key, next);
  return next;
}

function getFleetBoatStructure(name, heading) {
  return [
    `<div class="fleet-map-marker-boat" role="img" style="--fleet-heading:${getFleetDisplayHeading(name, heading)}deg" aria-label="船艏朝向 ${formatHeading(heading)}">`,
    FLEET_MARKER_BOAT_SVG,
    '</div>',
  ].join('');
}

// 更新已有标记的文本和船体旋转，不重建 DOM，让转向动画可以真正播放。
function updateFleetMarkerContent(content, position, zoom) {
  if (!content) return content;
  applyFleetBubbleStyle(content, zoom);

  const nameNode = content.querySelector('.fleet-map-marker-name');
  if (nameNode) nameNode.textContent = position.robotName;

  const batteryNode = content.querySelector('.fleet-map-marker-battery');
  if (batteryNode) batteryNode.textContent = `电量 ${formatBattery(position.battery)}`;

  const details = content.querySelector('.fleet-map-marker-details');
  if (details) {
    const rows = details.querySelectorAll('.fleet-map-marker-detail');
    const values = [
      formatNumber(position.lat, 2),
      formatNumber(position.lng, 2),
      formatHeading(position.heading),
      typeof position.speed === 'number' ? `${position.speed} m/s` : '暂无数据',
    ];
    rows.forEach((row, index) => {
      const rowValue = row.querySelector('strong');
      if (rowValue && values[index] !== undefined) rowValue.textContent = values[index];
    });
  }

  const heading = normalizeFleetHeading(position.heading);
  const icon = content.querySelector('.fleet-map-marker-icon');
  if (!icon) return content;

  if (heading === null) {
    if (!icon.classList.contains('fleet-map-marker-icon-unknown')) {
      icon.classList.add('fleet-map-marker-icon-unknown');
      icon.innerHTML = '<span class="fleet-map-marker-icon-fallback">艇</span>';
    }
    return content;
  }

  icon.classList.remove('fleet-map-marker-icon-unknown');
  const boat = icon.querySelector('.fleet-map-marker-boat');
  if (!boat) {
    icon.innerHTML = getFleetBoatStructure(position.robotName, heading);
    return content;
  }

  boat.style.setProperty('--fleet-heading', `${getFleetDisplayHeading(position.robotName, heading)}deg`);
  boat.setAttribute('aria-label', `船艏朝向 ${formatHeading(heading)}`);
  return content;
}

function createFleetMarkerContent(position, zoom, onClick) {
  const marker = document.createElement('div');
  marker.className = 'fleet-map-marker';
  if (onClick) marker.classList.add('fleet-map-marker-clickable');
  applyFleetBubbleStyle(marker, zoom);
  if (onClick) {
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick(position.robotName);
    });
  }

  const bubble = document.createElement('div');
  bubble.className = 'fleet-map-marker-bubble';

  const name = document.createElement('strong');
  name.className = 'fleet-map-marker-name';
  name.textContent = position.robotName;

  const battery = document.createElement('span');
  battery.className = 'fleet-map-marker-battery';
  battery.textContent = `电量 ${formatBattery(position.battery)}`;

  const hoverDetails = document.createElement('div');
  hoverDetails.className = 'fleet-map-marker-details';
  [
    ['纬度', formatNumber(position.lat, 2)],
    ['经度', formatNumber(position.lng, 2)],
    ['航向', formatHeading(position.heading)],
    ['速度', typeof position.speed === 'number' ? `${position.speed} m/s` : '暂无数据'],
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'fleet-map-marker-detail';
    const rowLabel = document.createElement('span');
    rowLabel.textContent = label;
    const rowValue = document.createElement('strong');
    rowValue.textContent = value;
    row.append(rowLabel, rowValue);
    hoverDetails.append(row);
  });

  const icon = document.createElement('div');
  icon.className = 'fleet-map-marker-icon';

  const pulse = document.createElement('div');
  pulse.className = 'fleet-map-marker-pulse';

  [bubble, icon].forEach((node) => {
    node.addEventListener('mouseenter', () => marker.classList.add('fleet-map-marker-hover'));
    node.addEventListener('mouseleave', () => marker.classList.remove('fleet-map-marker-hover'));
  });

  bubble.append(name, battery, hoverDetails);
  marker.append(bubble, pulse, icon);
  updateFleetMarkerContent(marker, position, zoom);

  // 默认只显示船形图标，鼠标移到船上后再显示名称、电量和实时详情。
  let hoverTimer;
  const showMarkerDetails = () => {
    window.clearTimeout(hoverTimer);
    marker.classList.add('fleet-map-marker-hover');
  };
  const hideMarkerDetails = () => {
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      marker.classList.remove('fleet-map-marker-hover');
    }, 120);
  };
  [bubble, icon].forEach((node) => {
    node.addEventListener('mouseenter', showMarkerDetails);
    node.addEventListener('mouseleave', hideMarkerDetails);
  });

  return marker;
}

function getAverage(values) {
  const validValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function StatusBadge({ position, loading }) {
  if (loading) return <span className="status-badge status-pending">读取中</span>;
  if (!position) return <span className="status-badge status-empty">未查询</span>;
  if (!position.sourceTimestampMs) return <span className="status-badge status-pending">待接入</span>;
  if (position.heartbeatStatus === 'offline') {
    return <span className="status-badge status-warning"><span className="status-dot" />心跳异常</span>;
  }
  if (position.heartbeatStatus === 'online') {
    return <span className="status-badge status-online"><span className="status-dot" />在线</span>;
  }
  return (
    <span className="status-badge status-online">
      <span className="status-dot" />
      位置已获取
    </span>
  );
}

function LocationMap({ position, centerSeq, planningMode = false, draftRoutePoints = [], previewRoutePoints = [], perceptionRoutePoints = PERCEPTION_ROUTE_MAP_POINTS, showShoreline = false, onMapPoint }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const markerContentRef = useRef(null);
  const routePolylineRef = useRef(null);
  const routePointMarkersRef = useRef([]);
  const shorelinePolylineRefs = useRef([]);
  const perceptionPolylineRefs = useRef([]);
  const perceptionPointMarkersRef = useRef([]);
  const mapClickHandlerRef = useRef(null);
  const zoomHandlerRef = useRef(null);
  const centeredSeqRef = useRef(centerSeq);
  const [mapError, setMapError] = useState('');

  useEffect(() => () => {
    safelyRemoveMarker(markerRef.current);
    markerRef.current = null;
    markerContentRef.current = null;
    resetFleetHeadingAngles();
    safelyRemoveOverlay(routePolylineRef.current);
    routePolylineRef.current = null;
    routePointMarkersRef.current.forEach(safelyRemoveOverlay);
    routePointMarkersRef.current = [];
    shorelinePolylineRefs.current.forEach(safelyRemoveOverlay);
    shorelinePolylineRefs.current = [];
    perceptionPolylineRefs.current.forEach(safelyRemoveOverlay);
    perceptionPolylineRefs.current = [];
    perceptionPointMarkersRef.current.forEach(safelyRemoveOverlay);
    perceptionPointMarkersRef.current = [];
    if (mapRef.current && mapClickHandlerRef.current && typeof mapRef.current.off === 'function') {
      mapRef.current.off('click', mapClickHandlerRef.current);
    }
    mapClickHandlerRef.current = null;
    if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
      mapRef.current.off('zoomchange', zoomHandlerRef.current);
      mapRef.current.off('zoomend', zoomHandlerRef.current);
    }
    zoomHandlerRef.current = null;
    safelyDestroyMap(mapRef.current);
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!hasCoordinates(position)) {
      safelyRemoveMarker(markerRef.current);
      markerRef.current = null;
      markerContentRef.current = null;
      resetFleetHeadingAngles();
      safelyRemoveOverlay(routePolylineRef.current);
      routePolylineRef.current = null;
      routePointMarkersRef.current.forEach(safelyRemoveOverlay);
      routePointMarkersRef.current = [];
      shorelinePolylineRefs.current.forEach(safelyRemoveOverlay);
      shorelinePolylineRefs.current = [];
      perceptionPolylineRefs.current.forEach(safelyRemoveOverlay);
      perceptionPolylineRefs.current = [];
      perceptionPointMarkersRef.current.forEach(safelyRemoveOverlay);
      perceptionPointMarkersRef.current = [];
      if (mapRef.current && mapClickHandlerRef.current && typeof mapRef.current.off === 'function') {
        mapRef.current.off('click', mapClickHandlerRef.current);
      }
      mapClickHandlerRef.current = null;
      if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
        mapRef.current.off('zoomchange', zoomHandlerRef.current);
        mapRef.current.off('zoomend', zoomHandlerRef.current);
      }
      zoomHandlerRef.current = null;
      safelyDestroyMap(mapRef.current);
      mapRef.current = null;
      setMapError('');
      return undefined;
    }

    if (!mapNode.current) return undefined;

    const mapPosition = wgs84ToGcj02(position);
    const lat = mapPosition.lat;
    const lng = mapPosition.lng;
    const nextPosition = [lng, lat];
    let resizeTimer;
    let cancelled = false;
    setMapError('');

    loadAMap()
      .then((AMap) => {
        if (cancelled || !mapNode.current) return;

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapNode.current, {
            center: nextPosition,
            zoom: 16,
            zooms: [3, 18],
            viewMode: '2D',
            resizeEnable: true,
            layers: [
              new AMap.TileLayer.Satellite({ zIndex: 1, zooms: [3, 18], detectRetina: true }),
            ],
          });
          centeredSeqRef.current = centerSeq;
          if (typeof mapRef.current.on === 'function') {
            zoomHandlerRef.current = () => {
              if (markerContentRef.current) applyFleetBubbleStyle(markerContentRef.current, getMapZoom(mapRef.current));
            };
            mapRef.current.on('zoomchange', zoomHandlerRef.current);
            mapRef.current.on('zoomend', zoomHandlerRef.current);
          }
          resizeTimer = window.setTimeout(() => mapRef.current?.resize(), 0);
        }

        if (centeredSeqRef.current !== centerSeq && typeof mapRef.current.setCenter === 'function') {
          mapRef.current.setCenter(nextPosition);
          centeredSeqRef.current = centerSeq;
        }

        const currentZoom = getMapZoom(mapRef.current);
        if (!markerRef.current) {
          markerContentRef.current = createFleetMarkerContent(position, currentZoom);
          markerRef.current = new AMap.Marker({
            map: mapRef.current,
            position: nextPosition,
            content: markerContentRef.current,
            offset: new AMap.Pixel(-64, -88),
          });
        } else {
          markerRef.current.setPosition(nextPosition);
          markerContentRef.current = updateFleetMarkerContent(markerContentRef.current, position, currentZoom);
        }

        if (mapClickHandlerRef.current && typeof mapRef.current.off === 'function') {
          mapRef.current.off('click', mapClickHandlerRef.current);
          mapClickHandlerRef.current = null;
        }
        if (planningMode && typeof mapRef.current.on === 'function') {
          mapClickHandlerRef.current = (event) => {
            const nextPoint = getMapClickPoint(event.lnglat);
            if (nextPoint) onMapPoint?.(nextPoint);
          };
          mapRef.current.on('click', mapClickHandlerRef.current);
        }

        // 航线规划第一版只维护前端覆盖物：规划中从船当前位置连到用户航点，保存后只回显航点之间的航线。
        safelyRemoveOverlay(routePolylineRef.current);
        routePolylineRef.current = null;
        routePointMarkersRef.current.forEach(safelyRemoveOverlay);
        routePointMarkersRef.current = [];
        shorelinePolylineRefs.current.forEach(safelyRemoveOverlay);
        shorelinePolylineRefs.current = [];
        perceptionPolylineRefs.current.forEach(safelyRemoveOverlay);
        perceptionPolylineRefs.current = [];
        perceptionPointMarkersRef.current.forEach(safelyRemoveOverlay);
        perceptionPointMarkersRef.current = [];

        if (showShoreline) {
          SHORELINE_MAP_SECTIONS.forEach((section) => {
            const isBridge = section.kind === 3;
            const shorelinePolyline = new AMap.Polyline({
              map: mapRef.current,
              path: section.path,
              strokeColor: isBridge ? '#d06dff' : section.side === 0 ? '#00d4ff' : '#38ef9a',
              strokeOpacity: isBridge ? 1 : 0.95,
              strokeWeight: isBridge ? 6 : 4,
              strokeStyle: isBridge ? 'dashed' : 'solid',
              lineJoin: 'round',
              lineCap: 'round',
              zIndex: isBridge ? 70 : 60,
            });
            shorelinePolylineRefs.current.push(shorelinePolyline);
          });
        }

        const routeLinePoints = planningMode && draftRoutePoints.length
          ? [mapPosition, ...draftRoutePoints]
          : previewRoutePoints.length
            ? [mapPosition, ...previewRoutePoints]
            : [];
        if (routeLinePoints.length >= 2) {
          routePolylineRef.current = new AMap.Polyline({
            map: mapRef.current,
            path: routeLinePoints.map((point) => [point.lng, point.lat]),
            strokeColor: planningMode ? '#18a999' : '#0b7a6f',
            strokeOpacity: 0.95,
            strokeWeight: 5,
            strokeStyle: planningMode ? 'dashed' : 'solid',
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 80,
          });
        }
        const routeMarkerPoints = planningMode ? draftRoutePoints : previewRoutePoints;
        routeMarkerPoints.forEach((point, index) => {
          const pointMarker = new AMap.Marker({
            map: mapRef.current,
            position: [point.lng, point.lat],
            content: createRoutePointContent(index, planningMode),
            offset: new AMap.Pixel(-12, -12),
            zIndex: 120,
          });
          routePointMarkersRef.current.push(pointMarker);
        });

        // 感知航线是本地演示数据，不写入数据库，也不参与下发和删除。
        if (perceptionRoutePoints.length >= 2) {
          const perceptionPath = perceptionRoutePoints.map((point) => [point.lng, point.lat]);
          [
            { strokeColor: '#5b4300', strokeOpacity: 0.8, strokeWeight: 10, zIndex: 90 },
            { strokeColor: '#ffc928', strokeOpacity: 1, strokeWeight: 5, zIndex: 91 },
          ].forEach((lineStyle) => {
            const perceptionPolyline = new AMap.Polyline({
              map: mapRef.current,
              path: perceptionPath,
              strokeStyle: 'solid',
              lineJoin: 'round',
              lineCap: 'round',
              ...lineStyle,
            });
            perceptionPolylineRefs.current.push(perceptionPolyline);
          });

          perceptionRoutePoints.forEach((point, index) => {
            const pointMarker = new AMap.Marker({
              map: mapRef.current,
              position: [point.lng, point.lat],
              content: createRoutePointContent(index, false, 'perception', point.bridgeId > 0),
              offset: new AMap.Pixel(-12, -12),
              zIndex: 130,
            });
            perceptionPointMarkersRef.current.push(pointMarker);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setMapError('高德地图加载失败，请检查 Key 和 Web 端域名白名单。');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
    };
  }, [position, centerSeq, planningMode, draftRoutePoints, previewRoutePoints, perceptionRoutePoints, showShoreline, onMapPoint]);

  if (!hasCoordinates(position)) {
    return (
      <div className="map-empty">
        <MapPinned size={28} strokeWidth={1.5} />
        <strong>暂无位置数据</strong>
        <span>查询成功后显示机器人真实位置</span>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="map-empty map-error" role="alert">
        <MapPinned size={28} strokeWidth={1.5} />
        <strong>{mapError}</strong>
      </div>
    );
  }

  return <div ref={mapNode} className="location-map" aria-label="机器人实时位置地图" />;
}

function FleetMap({ positions, onOpenDeviceDetail }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const zoomHandlerRef = useRef(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => () => {
    markersRef.current.forEach((markerGroup) => safelyRemoveMarker(markerGroup.marker));
    markersRef.current.clear();
    resetFleetHeadingAngles();
    if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
      mapRef.current.off('zoomchange', zoomHandlerRef.current);
      mapRef.current.off('zoomend', zoomHandlerRef.current);
    }
    zoomHandlerRef.current = null;
    safelyDestroyMap(mapRef.current);
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!positions.length) {
      markersRef.current.forEach((markerGroup) => safelyRemoveMarker(markerGroup.marker));
      markersRef.current.clear();
      resetFleetHeadingAngles();
      if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
        mapRef.current.off('zoomchange', zoomHandlerRef.current);
        mapRef.current.off('zoomend', zoomHandlerRef.current);
      }
      zoomHandlerRef.current = null;
      safelyDestroyMap(mapRef.current);
      mapRef.current = null;
      setMapError('');
      return undefined;
    }

    if (!mapNode.current) return undefined;

    let resizeTimer;
    let cancelled = false;
    setMapError('');

    loadAMap()
      .then((AMap) => {
        if (cancelled || !mapNode.current) return;

        const firstMapPosition = wgs84ToGcj02(positions[0]);
        const firstPosition = [firstMapPosition.lng, firstMapPosition.lat];
        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapNode.current, {
            center: firstPosition,
            zoom: 13,
            resizeEnable: true,
            layers: [
              new AMap.TileLayer.Satellite({ zIndex: 1, zooms: [3, 18], detectRetina: true }),
              new AMap.TileLayer.RoadNet({ zIndex: 2, detectRetina: true })
            ],
          });
          if (typeof mapRef.current.on === 'function') {
            zoomHandlerRef.current = () => {
              updateFleetMarkerBubbleScales(markersRef.current, getMapZoom(mapRef.current));
            };
            mapRef.current.on('zoomchange', zoomHandlerRef.current);
            mapRef.current.on('zoomend', zoomHandlerRef.current);
          }
          resizeTimer = window.setTimeout(() => mapRef.current?.resize(), 0);
        }

        const currentZoom = getMapZoom(mapRef.current);
        const activeNames = new Set();
        positions.forEach((position) => {
          const markerKey = position.robotName;
          const mapPosition = wgs84ToGcj02(position);
          const nextPosition = [mapPosition.lng, mapPosition.lat];
          activeNames.add(markerKey);

          const existingMarkerGroup = markersRef.current.get(markerKey);
          if (existingMarkerGroup) {
            existingMarkerGroup.marker.setPosition(nextPosition);
            existingMarkerGroup.content = updateFleetMarkerContent(existingMarkerGroup.content, position, currentZoom);
            return;
          }

          const markerContent = createFleetMarkerContent(position, currentZoom, onOpenDeviceDetail);

          const marker = new AMap.Marker({
            map: mapRef.current,
            position: nextPosition,
            content: markerContent,
            offset: new AMap.Pixel(-64, -88),
          });
          markersRef.current.set(markerKey, { marker, content: markerContent });
        });

        markersRef.current.forEach((markerGroup, markerKey) => {
          if (activeNames.has(markerKey)) return;
          safelyRemoveMarker(markerGroup.marker);
          markersRef.current.delete(markerKey);
          fleetHeadingAngles.delete(markerKey);
        });
      })
      .catch(() => {
        if (!cancelled) setMapError('高德地图加载失败，请检查 Key 和 Web 端域名白名单。');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
    };
  }, [positions]);

  if (!positions.length) {
    return (
      <div className="map-empty">
        <MapPinned size={28} strokeWidth={1.5} />
        <strong>暂无全域位置数据</strong>
        <span>获取到设备位置后显示实时分布</span>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="map-empty map-error" role="alert">
        <MapPinned size={28} strokeWidth={1.5} />
        <strong>{mapError}</strong>
      </div>
    );
  }

  return <div ref={mapNode} className="location-map fleet-map" aria-label="全域实时轨迹分布地图" />;
}

function FleetStatusBadge({ positions, loading }) {
  if (loading && !positions.length) return <span className="status-badge status-pending">同步中</span>;
  if (!positions.length) return <span className="status-badge status-empty">暂无数据</span>;
  return (
    <span className="status-badge status-online">
      <span className="status-dot" />
      已同步 {positions.length} 台
    </span>
  );
}

function FleetOverview({ positions, loading, error, onOpenDeviceDetail }) {
  return (
    <section className="location-section fleet-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">全域监控</p>
          <h2>全域实时轨迹分布</h2>
        </div>
        <FleetStatusBadge positions={positions} loading={loading} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="map-frame fleet-map-frame"><FleetMap positions={positions.filter(hasCoordinates)} onOpenDeviceDetail={onOpenDeviceDetail} /></div>

      <div className="fleet-list" aria-label="全域设备位置列表">
        {positions.map((position) => (
          <button
            className="fleet-device-card"
            type="button"
            key={position.robotName}
            onClick={() => onOpenDeviceDetail(position.robotName)}
            aria-label={`查看${position.robotName}设备详情`}
          >
            <div>
              <strong>{position.robotName}</strong>
              <span>经纬度 {formatNumber(position.lng, 2)}, {formatNumber(position.lat, 2)}</span>
            </div>
            <div className="fleet-device-meta">
              <span>电量 {formatBattery(position.battery)}</span>
              <span>{typeof position.speed === 'number' ? `${position.speed} m/s` : '暂无速度'}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function useCurrentTime() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function FleetManagement({ fleetPositions, loading, error, onOpenDeviceDetail, onToast }) {
  const [searchText, setSearchText] = useState('');
  const [adding, setAdding] = useState(false);
  const [robotName, setRobotName] = useState('');
  const [busy, setBusy] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [formError, setFormError] = useState('');
  const pending = useRef(false);
  const dialog = useRef(null);
  const now = useCurrentTime();
  useEffect(() => {
    if (adding) dialog.current?.showModal();
    else dialog.current?.close();
  }, [adding]);
  const devices = fleetPositions
    .filter((device) => device.robotName.toLowerCase().includes(searchText.trim().toLowerCase()));
  const onlineCount = fleetPositions.filter((device) => isRobotOnline(device, now)).length;
  const averageBattery = getAverage(fleetPositions.map((device) => device.battery));

  async function addDevice(event) {
    event.preventDefault();
    if (pending.current) return;
    const name = robotName.trim();
    if (!name || new TextEncoder().encode(name).length > 128 || /[/+#?\\\u0000-\u001f\u007f]/.test(name)) {
      setFormError('请输入有效的船舶编号');
      return;
    }
    if (fleetPositions.some((device) => device.robotName === name)) {
      setFormError('该设备编号已存在');
      return;
    }
    pending.current = true;
    setBusy('create');
    setFormError('');
    setMutationError('');
    try {
      await createRobot(name);
      setAdding(false);
      setSearchText('');
      onToast?.('设备已添加并保存', 'success');
    } catch (requestError) {
      if (requestError.cacheChanged) {
        setAdding(false);
        setMutationError(requestError.message);
      } else setFormError(requestError.message);
    } finally { pending.current = false; setBusy(''); }
  }

  async function deleteDevice(deviceName) {
    if (pending.current || !window.confirm(`确认删除设备「${deviceName}」？`)) return;
    pending.current = true;
    setBusy(deviceName);
    setMutationError('');
    try {
      await deleteRobot(deviceName);
      onToast?.('设备记录已删除', 'success');
    } catch (requestError) { setMutationError(requestError.message); }
    finally { pending.current = false; setBusy(''); }
  }

  return (
    <section className="fleet-management-section">
      <div className="fleet-management-toolbar">
        <div className="fleet-search input-with-icon">
          <Search size={16} aria-hidden="true" />
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索设备名称" />
        </div>
        <button className="button button-primary" type="button" disabled={Boolean(busy) || loading} onClick={() => { setRobotName(''); setFormError(''); setAdding(true); }}>
          <Plus size={18} aria-hidden="true" />添加船
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}

      <dialog ref={dialog} className="fleet-add-dialog" aria-labelledby="fleet-add-title" onCancel={(event) => { if (busy) event.preventDefault(); else setAdding(false); }}>
        <form onSubmit={addDevice}>
          <div className="fleet-dialog-heading">
            <h2 id="fleet-add-title">添加船</h2>
            <button type="button" className="fleet-icon-button" title="关闭" aria-label="关闭" disabled={Boolean(busy)} onClick={() => setAdding(false)}><X size={20} /></button>
          </div>
          <label htmlFor="fleet-robot-name">船舶编号</label>
          <input id="fleet-robot-name" value={robotName} onChange={(event) => setRobotName(event.target.value)} placeholder="USV-002" maxLength={128} required autoFocus disabled={Boolean(busy)} />
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="fleet-dialog-actions">
            <button type="button" className="button" disabled={Boolean(busy)} onClick={() => setAdding(false)}>取消</button>
            <button type="submit" className="button button-primary" disabled={Boolean(busy) || !robotName.trim()}>{busy === 'create' ? '保存中' : '添加'}</button>
          </div>
        </form>
      </dialog>

      <div className="fleet-management-stats">
        <StatCard icon={ShipWheel} label="编队设备" value={`${fleetPositions.length} 台`} />
        <StatCard icon={Wifi} label="在线设备" value={`${onlineCount} 台`} />
        <StatCard icon={Gauge} label="平均电量" value={averageBattery === null ? '暂无数据' : `${Math.round(averageBattery)}%`} />
        <StatCard icon={Clock3} label="同步状态" value={loading ? '同步中' : '已就绪'} />
      </div>

      <div className="fleet-management-table-card">
        <div className="fleet-management-table-heading">
          <div><h3>编队设备列表</h3></div>
          <span className="status-badge status-empty">{devices.length} 条</span>
        </div>

        <div className="fleet-management-table-wrap">
          <table className="fleet-management-table">
            <thead>
              <tr>
                <th>设备名称</th>
                <th>运行状态</th>
                <th>电量</th>
                <th>速度</th>
                <th>位置</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const online = isRobotOnline(device, now);
                return (
                  <tr key={device.robotName}>
                    <td><strong>{device.robotName}</strong><span>{online ? '已纳入实时编队' : '待同步设备'}</span></td>
                    <td><span className={`fleet-state ${online ? 'fleet-state-online' : ''}`}>{!device.sourceTimestampMs ? '待接入' : online ? '在线' : '离线'}</span></td>
                    <td>{device.battery == null ? '--' : formatBattery(device.battery)}</td>
                    <td>{typeof device.speed === 'number' ? `${device.speed} m/s` : '--'}</td>
                    <td>{hasCoordinates(device) ? `${formatNumber(device.lng, 2)}, ${formatNumber(device.lat, 2)}` : '--'}</td>
                    <td>
                      <button type="button" onClick={() => onOpenDeviceDetail(device.robotName)}>详情</button>
                      <button className="fleet-table-danger fleet-delete-button" type="button" title={`删除 ${device.robotName}`} aria-label={`删除 ${device.robotName}`} disabled={Boolean(busy)} onClick={() => deleteDevice(device.robotName)}><Trash2 size={17} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!devices.length && <div className="fleet-management-empty">{loading ? '加载中' : searchText ? '没有匹配的设备' : '暂无设备'}</div>}
        </div>
      </div>
    </section>
  );
}

function LocationPanel({ deviceId, setDeviceId, position, fleetPositions, loading, error, mapCenterSeq, onSubmit, onSelectDevice, onToast }) {
  const [deviceListOpen, setDeviceListOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('online-map');
  const deviceOptions = [
    ...new Set(fleetPositions.map((fleetPosition) => getRobotNameForDevice(fleetPosition.robotName)).filter(Boolean)),
  ];

  function selectDevice(deviceName) {
    setDeviceListOpen(false);
    setDeviceId(deviceName);
    onSelectDevice(deviceName);
  }

  return (
    <section className="location-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">设备详情</p>
          <h2>{position?.robotName || deviceId || '未选择设备'}</h2>
        </div>
        <StatusBadge position={position} loading={loading} />
      </div>

      <form className="location-query" onSubmit={onSubmit}>
        <label htmlFor="device-code">设备名称</label>
        <div className="query-controls">
          <div className="input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              id="device-code"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              placeholder="输入设备名称，如 USV-001 或 清澜一号"
              autoComplete="off"
            />
            <button
              className={`device-list-toggle ${deviceListOpen ? 'device-list-toggle-open' : ''}`}
              type="button"
              onClick={() => setDeviceListOpen((isOpen) => !isOpen)}
              disabled={!deviceOptions.length}
              title="展开设备列表"
              aria-label="展开设备列表"
              aria-expanded={deviceListOpen}
            >
              <ChevronDown size={20} strokeWidth={2.8} />
            </button>
            {deviceListOpen && (
              <div className="device-dropdown" role="listbox" aria-label="设备列表">
                {deviceOptions.map((deviceName) => (
                  <button
                    className={`device-dropdown-item ${deviceName === position?.robotName ? 'device-dropdown-item-active' : ''}`}
                    type="button"
                    key={deviceName}
                    onClick={() => selectDevice(deviceName)}
                  >
                    <span>{deviceName}</span>
                    <small>{deviceName === position?.robotName ? '当前设备' : '点击切换'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="button button-primary" type="submit" disabled={!deviceId.trim() || loading}>
            <Search size={16} />
            查询位置
          </button>
          <TotalDistanceDisplay value={position?.totalDistanceKm} />
        </div>
        <p className="query-hint">支持手动输入，也可点击搜索框右侧展开已同步设备。</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>

      <DeviceDetailTabs activeTab={activeDetailTab} onChange={setActiveDetailTab} />

      <div className="device-tab-panel">
        <DeviceDetailTabContent
          activeTab={activeDetailTab}
          position={position}
          mapCenterSeq={mapCenterSeq}
          onToast={onToast}
        />
      </div>
    </section>
  );
}

function DeviceDetailTabs({ activeTab, onChange }) {
  return (
    <div className="device-detail-tabs" role="tablist" aria-label="设备详情分类">
      {DEVICE_DETAIL_TABS.map((tab) => (
        <button
          className={`device-detail-tab ${activeTab === tab.id ? 'device-detail-tab-active' : ''}`}
          type="button"
          role="tab"
          key={tab.id}
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DeviceDetailTabContent({ activeTab, position, mapCenterSeq, onToast }) {
  if (activeTab === 'online-map') {
    return <OnlineMapTab position={position} mapCenterSeq={mapCenterSeq} onToast={onToast} />;
  }

  if (activeTab === 'dock') {
    return <DetailFeaturePlaceholder icon={ShipWheel} eyebrow="智能船坞" title="智能船坞暂未接入" description="该分类先清空，等船坞状态、泊靠控制和充电数据接口确认后再恢复内容。" />;
  }

  if (activeTab === 'cameras') {
    return <CameraPanel position={position} onToast={onToast} />;
  }

  if (activeTab === 'cleaning-area') {
    return <DetailFeaturePlaceholder icon={MapPinned} eyebrow="清洁区域" title="清洁区域暂未接入" description="该分类先清空，后续接入区域边界、作业覆盖和任务结果后再展示。" />;
  }

  if (activeTab === 'water-report') {
    return <DetailFeaturePlaceholder icon={Gauge} eyebrow="水质报告" title="水质数据待接入" description="后续可在这里展示 PH、浊度、溶解氧、电导率等采样数据和趋势图。" />;
  }

  if (activeTab === 'depth-map') {
    return <DetailFeaturePlaceholder icon={MapPinned} eyebrow="水深图" title="水深图层待接入" description="适合展示测深点位、等深线和浅滩风险区域，避免与实时地图混在一起。" />;
  }

  if (activeTab === 'shoreline-map') {
    return <DetailFeaturePlaceholder icon={MapPinned} eyebrow="河岸二维地图" title="二维河岸地图待接入" description="后续可展示河岸边界、障碍物、补给点和禁航区域等静态地图资产。" />;
  }

  if (activeTab === 'patrol') {
    return <DetailFeaturePlaceholder icon={Clock3} eyebrow="巡查情况" title="巡查记录待接入" description="后续可按时间线展示巡查任务、异常告警、人工复核和任务闭环记录。" />;
  }

  return <OnlineMapTab position={position} mapCenterSeq={mapCenterSeq} onToast={onToast} />;
}

export function getNextPerceptionPreview(showPerceptionRoute) {
  return !showPerceptionRoute;
}

function OnlineMapTab({ position, mapCenterSeq, onToast }) {
  const deviceName = position?.robotName || '暂无设备';
  const routeDeviceId = getRobotNameForDevice(position?.robotName);
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');
  const [routeAction, setRouteAction] = useState('');
  const [planningMode, setPlanningMode] = useState(false);
  const [draftRoutePoints, setDraftRoutePoints] = useState([]);
  const [pendingRoutePoint, setPendingRoutePoint] = useState(null);
  const [pendingSpeedKnots, setPendingSpeedKnots] = useState('2.0');
  const [previewRouteId, setPreviewRouteId] = useState('');
  const [showPerceptionRoute, setShowPerceptionRoute] = useState(false);
  const [showShoreline, setShowShoreline] = useState(false);
  const previewRoute = routes.find((route) => route.id === previewRouteId);
  const previewRoutePoints = getRouteMapPoints(previewRoute);
  const activePreviewRoute = showPerceptionRoute ? DEMO_PERCEPTION_ROUTE : previewRoute;
  const startMapPoint = position ? wgs84ToGcj02(position) : null;
  const draftRouteLinePoints = startMapPoint && draftRoutePoints.length
    ? [startMapPoint, ...draftRoutePoints]
    : draftRoutePoints;
  const draftRouteLength = getRouteLengthMeters(draftRouteLinePoints);
  const draftRouteDuration = getRouteDurationSeconds(draftRoutePoints, startMapPoint);
  const isRouteBusy = Boolean(routeAction);

  useEffect(() => {
    if (!routeDeviceId) {
      setRoutes([]);
      setRoutesError('');
      setPreviewRouteId('');
      setShowPerceptionRoute(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setRoutesLoading(true);
    setRoutesError('');

    fetchRobotRoutes(routeDeviceId, controller.signal)
      .then((nextRoutes) => {
        if (cancelled) return;
        setRoutes(nextRoutes);
        setPreviewRouteId((currentRouteId) => (
          currentRouteId && nextRoutes.some((route) => route.id === currentRouteId) ? currentRouteId : ''
        ));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = getRouteErrorMessage(error);
        setRoutesError(message);
        onToast?.(message);
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeDeviceId]);

  function startRoutePlanning() {
    if (!position) {
      onToast?.('请先查询设备位置后再规划航线');
      return;
    }
    setPlanningMode((isPlanning) => !isPlanning);
    setPreviewRouteId('');
    setShowPerceptionRoute(false);
    setDraftRoutePoints([]);
    setPendingRoutePoint(null);
  }

  function addDraftRoutePoint(point) {
    if (!planningMode) return;
    setPendingRoutePoint(point);
    setPendingSpeedKnots('2.0');
  }

  function confirmPendingRoutePoint() {
    if (!pendingRoutePoint) return;
    const speedKnots = Number(pendingSpeedKnots);
    if (!Number.isFinite(speedKnots) || speedKnots <= 0 || speedKnots > 100) {
      onToast?.('请输入 0-100 节之间的到点速度');
      return;
    }
    setDraftRoutePoints((currentPoints) => [
      ...currentPoints,
      {
        ...pendingRoutePoint,
        speedKnots,
      },
    ]);
    setPendingRoutePoint(null);
  }

  function cancelPendingRoutePoint() {
    setPendingRoutePoint(null);
  }

  function undoDraftRoutePoint() {
    setDraftRoutePoints((currentPoints) => currentPoints.slice(0, -1));
    setPendingRoutePoint(null);
  }

  function clearDraftRoute() {
    setDraftRoutePoints([]);
    setPendingRoutePoint(null);
  }

  async function saveDraftRoute() {
    if (!routeDeviceId || isRouteBusy) return;
    if (pendingRoutePoint) {
      onToast?.('请先确认当前航点速度');
      return;
    }
    if (draftRoutePoints.length < 2) {
      onToast?.('至少需要 2 个点才能保存航线');
      return;
    }

    setRouteAction('save');
    try {
      const route = await createRobotRoute(routeDeviceId, {
        type: '折线',
        coordinateSystem: 'GCJ02',
        points: draftRoutePoints.map(({ lng, lat, speedKnots }) => ({ lng, lat, speedKnots })),
      });
      setRoutes((currentRoutes) => [...currentRoutes, route]);
      setPreviewRouteId(route.id);
      setShowPerceptionRoute(false);
      setPlanningMode(false);
      setDraftRoutePoints([]);
      onToast?.('航线已保存到数据库', 'success');
    } catch (error) {
      onToast?.(getRouteErrorMessage(error));
    } finally {
      setRouteAction('');
    }
  }

  function toggleRoutePreview(route) {
    if (!route.points?.length) {
      onToast?.('该航线暂无地图点位，请新建航线');
      return;
    }
    const shouldHide = previewRouteId === route.id;
    setPlanningMode(false);
    setDraftRoutePoints([]);
    setPendingRoutePoint(null);
    setShowPerceptionRoute(false);
    setPreviewRouteId(shouldHide ? '' : route.id);
    if (!shouldHide) {
      document.querySelector('.online-map-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function togglePerceptionRoutePreview() {
    const shouldHide = showPerceptionRoute;
    setPlanningMode(false);
    setDraftRoutePoints([]);
    setPendingRoutePoint(null);
    setPreviewRouteId('');
    setShowPerceptionRoute(getNextPerceptionPreview(shouldHide));
    if (!shouldHide) {
      document.querySelector('.online-map-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function deleteRoute(route) {
    if (!routeDeviceId || isRouteBusy) return;
    const confirmed = window.confirm(`确认删除航线「${route.id}」吗？`);
    if (!confirmed) return;

    setRouteAction(`delete:${route.id}`);
    try {
      await deleteRobotRoute(routeDeviceId, route.id);
      setRoutes((currentRoutes) => currentRoutes.filter((currentRoute) => currentRoute.id !== route.id));
      if (previewRouteId === route.id) setPreviewRouteId('');
      onToast?.('航线已从数据库删除', 'success');
    } catch (error) {
      onToast?.(getRouteErrorMessage(error));
    } finally {
      setRouteAction('');
    }
  }

  async function sendRoute(route) {
    if (!routeDeviceId || !route || isRouteBusy) return;
    setRouteAction(`send:${route.id}`);
    try {
      const result = await sendRobotRoute(routeDeviceId, route.id);
      onToast?.(`已发布 ${JSON.stringify(result.protocol)}`, 'success');
    } catch (error) {
      onToast?.(getRouteErrorMessage(error));
    } finally {
      setRouteAction('');
    }
  }

  async function stopTask() {
    if (!routeDeviceId || isRouteBusy) return;
    setRouteAction('stop');
    try {
      const result = await sendRobotCommand(routeDeviceId, { command: 'STOP' });
      onToast?.(`停船指令已发布 ${JSON.stringify(result.protocol || [])}`, 'success');
    } catch (error) {
      onToast?.(getRemoteCommandErrorMessage(error));
    } finally {
      setRouteAction('');
    }
  }

  return (
    <div className="online-map-layout">
      <section className="online-map-card">
        <div className="online-map-toolbar">
          <div>
            <p className="eyebrow">在线地图</p>
            <h3>在线地图 - {deviceName}</h3>
          </div>
          <div className="online-map-actions" aria-label="航线任务操作">
            <button
              className={`button ${showShoreline ? 'button-boundary-active' : 'button-secondary'}`}
              type="button"
              aria-pressed={showShoreline}
              onClick={() => setShowShoreline((isVisible) => !isVisible)}
            >
              河道边界
            </button>
            <button className="button button-secondary" type="button" onClick={() => sendRoute(previewRoute)} disabled={!previewRoute || isRouteBusy}>{routeAction === `send:${previewRoute?.id}` ? '下发中' : '下发当前航线'}</button>
            <button className="button button-danger-soft" type="button" onClick={stopTask} disabled={!routeDeviceId || isRouteBusy}>{routeAction === 'stop' ? '停止中' : '停止任务'}</button>
            <button className="button button-secondary" type="button" onClick={startRoutePlanning}>{planningMode ? '退出规划' : '规划航线'}</button>
          </div>
        </div>

        <div className="map-frame online-map-frame">
          <LocationMap
            position={position}
            centerSeq={mapCenterSeq}
            planningMode={planningMode}
            draftRoutePoints={draftRoutePoints}
            previewRoutePoints={previewRoutePoints}
            perceptionRoutePoints={showPerceptionRoute ? PERCEPTION_ROUTE_MAP_POINTS : []}
            showShoreline={showShoreline}
            onMapPoint={addDraftRoutePoint}
          />
          <TrackingButton deviceId={routeDeviceId} onToast={onToast} />
          <div className="map-layer-legend" aria-label="地图图层图例">
            {showPerceptionRoute && <span><i className="legend-dot legend-dot-perception" />感知航线</span>}
            {showShoreline && <span><i className="legend-dot legend-dot-shoreline-left" />左岸边界</span>}
            {showShoreline && <span><i className="legend-dot legend-dot-shoreline-right" />右岸边界</span>}
            {showShoreline && <span><i className="legend-dot legend-dot-bridge" />桥孔边界</span>}
          </div>
          <div className="device-distance-overlay" aria-label="设备实时状态">
            <div className="telemetry-primary">
              <span>本次航程</span>
              <strong>{formatDistanceKm(position?.distanceKm)}</strong>
            </div>
            <div className="telemetry-primary">
              <span>控制状态</span>
              <strong>{CONTROL_MODE_LABELS[position?.controlMode] || '等待反馈'}</strong>
            </div>
            <div className="telemetry-item telemetry-item-wide">
              <span>经纬度</span>
              <strong>{formatCoordinates(position)}</strong>
            </div>
            <div className="telemetry-item">
              <span>航向</span>
              <strong>{formatHeading(position?.heading)}</strong>
            </div>
            <div className="telemetry-item">
              <span>航速</span>
              <strong>{formatSpeed(position?.speed)}</strong>
            </div>
            <div className="telemetry-item">
              <span>电池电量</span>
              <strong>{formatBattery(position?.battery)}</strong>
            </div>
          </div>
          {planningMode && (
            <div className="route-planning-toolbar" role="region" aria-label="航线规划工具">
              <div>
                <strong>规划模式</strong>
                <span>点击地图后输入到该点速度，当前 {draftRoutePoints.length} 个点，长度 {formatRouteLength(draftRouteLength)}，预计 {formatRouteDurationSeconds(draftRouteDuration)}</span>
              </div>
              <div className="route-planning-actions">
                <button type="button" onClick={undoDraftRoutePoint} disabled={!draftRoutePoints.length}>撤销点</button>
                <button type="button" onClick={clearDraftRoute} disabled={!draftRoutePoints.length}>清空</button>
                <button type="button" onClick={saveDraftRoute} disabled={draftRoutePoints.length < 2 || isRouteBusy}>{routeAction === 'save' ? '保存中' : '保存航线'}</button>
              </div>
            </div>
          )}
          {planningMode && pendingRoutePoint && (
            <div className="route-point-confirm-card" role="dialog" aria-label="确认航点速度">
              <strong>确认航点 {draftRoutePoints.length + 1}</strong>
              <span>经纬度 {pendingRoutePoint.lng.toFixed(8)}, {pendingRoutePoint.lat.toFixed(8)}</span>
              <label>
                到该点速度（节）
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={pendingSpeedKnots}
                  onChange={(event) => setPendingSpeedKnots(event.target.value)}
                />
              </label>
              <div className="route-point-confirm-actions">
                <button type="button" onClick={cancelPendingRoutePoint}>取消</button>
                <button type="button" onClick={confirmPendingRoutePoint}>确认航点</button>
              </div>
            </div>
          )}
          {!planningMode && activePreviewRoute && (
            <div className="route-preview-badge">正在查看 {activePreviewRoute.id} · {formatRouteLength(activePreviewRoute.lengthMeters)} · {activePreviewRoute.points.length} 点</div>
          )}
        </div>
      </section>

      <section className="online-map-ops-grid" aria-label="指令下发">
        <div className="map-command-panel">
          <RemoteControlPanel position={position} onToast={onToast} />
        </div>
      </section>

      <section className="route-table-card">
        <div className="route-table-heading">
          <div>
            <h3>航线规划</h3>
            <span>{routesError || '数据库已保存航线，另含 1 条本地感知航线演示数据'}</span>
          </div>
          <span className="status-badge status-pending">{routesLoading ? '读取中' : `${routes.length + 1} 条`}</span>
        </div>

        <div className="route-table-wrap">
          <table className="route-table">
            <thead>
              <tr>
                <th>航线编号</th>
                <th>类型</th>
                <th>长度</th>
                <th>预计耗时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {routesLoading && (
                <tr><td className="route-table-empty" colSpan="5">正在读取数据库航线...</td></tr>
              )}
              {!routesLoading && routesError && (
                <tr><td className="route-table-empty route-table-error" colSpan="5">{routesError}</td></tr>
              )}
              {!routesLoading && !routesError && !routes.length && (
                <tr><td className="route-table-empty" colSpan="5">数据库暂无已保存航线，下方仍展示本地感知航线演示数据。</td></tr>
              )}
              {!routesLoading && !routesError && (
                <tr className={`route-table-row-perception ${showPerceptionRoute ? 'route-table-row-active' : ''}`}>
                  <td>{DEMO_PERCEPTION_ROUTE.id}</td>
                  <td><span className="route-type-badge route-type-perception">{DEMO_PERCEPTION_ROUTE.type}</span></td>
                  <td>{formatRouteLength(DEMO_PERCEPTION_ROUTE.lengthMeters)}</td>
                  <td>{formatRouteDurationSeconds(DEMO_PERCEPTION_ROUTE.durationSeconds)}</td>
                  <td>
                    <button type="button" onClick={togglePerceptionRoutePreview}>{showPerceptionRoute ? '取消查看' : '查看'}</button>
                    <span className="route-table-local-note">本地演示</span>
                  </td>
                </tr>
              )}
              {!routesLoading && !routesError && routes.map((route) => (
                <tr className={previewRouteId === route.id ? 'route-table-row-active' : ''} key={route.id}>
                  <td>{route.id}</td>
                  <td><span className="route-type-badge route-type-standard">{route.type || '普通航线'}</span></td>
                  <td>{formatRouteLength(route.lengthMeters)}</td>
                  <td>{formatRouteDurationSeconds(route.durationSeconds)}</td>
                  <td>
                    <button type="button" onClick={() => toggleRoutePreview(route)}>{previewRouteId === route.id ? '取消查看' : '查看'}</button>
                    <button type="button" onClick={() => sendRoute(route)} disabled={isRouteBusy}>{routeAction === `send:${route.id}` ? '下发中' : '下发'}</button>
                    <button className="route-table-danger" type="button" onClick={() => deleteRoute(route)} disabled={isRouteBusy}>{routeAction === `delete:${route.id}` ? '删除中' : '删除'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DetailFeaturePlaceholder({ icon: Icon, eyebrow, title, description }) {
  return (
    <section className="detail-feature-placeholder">
      <div className="empty-icon"><Icon size={24} /></div>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </section>
  );
}

function HlsVideoPlayer({ camera, onPlaybackStatusChange }) {
  const videoRef = useRef(null);
  const [playerError, setPlayerError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    setPlayerError('');

    if (!camera?.playUrl) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      onPlaybackStatusChange?.('待接入');
      return undefined;
    }

    let hls;
    let disposed = false;
    let retryTimer;
    let retryDelay = 1000;
    let retryCount = 0;
    const maxRetryDelay = 16000;
    const setStatus = (status) => {
      if (!disposed) onPlaybackStatusChange?.(status);
    };
    const fail = (message) => {
      if (disposed) return;
      setPlayerError(message);
      setStatus('播放失败');
    };

    const tryPlay = () => {
      video.play().catch(() => {
        setStatus('点击播放');
      });
    };

    // HLS 冷启动或网络抖动会让 MediaMTX 临时返回错误，这里按指数退避自动重连，
    // 避免一次失败就永久停在"播放失败"。连续多次失败后保留提示文案，但仍在后台重试。
    const scheduleRetry = (status = '重连中') => {
      if (disposed) return;
      retryCount += 1;
      // 前两次静默重试（冷启动很常见）；之后保留提示，让用户知道仍在尝试。
      setPlayerError(retryCount > 2 ? '视频加载失败，正在自动重试…' : '');
      setStatus(status);
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (disposed) return;
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
        startPlayer();
      }, retryDelay);
    };

    function startPlayer() {
      if (disposed) return;

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS 原生 HLS：直接交给浏览器播放。
        video.src = camera.playUrl;
        video.load();
        tryPlay();
        return;
      }

      if (!Hls.isSupported()) {
        fail('当前浏览器不支持 HLS 播放');
        return;
      }

      if (hls) {
        hls.destroy();
        hls = undefined;
      }

      // 关闭 lowLatencyMode：LL-HLS 在冷启动时会放大首帧延迟，普通延迟模式更快出画。
      hls = new Hls({
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 2,
      });
      hls.loadSource(camera.playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retryDelay = 1000;
        retryCount = 0;
        setPlayerError('');
        setStatus('在线');
        tryPlay();
      });
      hls.on(Hls.Events.LEVEL_LOADED, () => {
        retryDelay = 1000;
        retryCount = 0;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          // 解码类错误优先走 hls.js 内部恢复，不重置整个播放器。
          if (hls && !disposed) {
            hls.recoverMediaError();
            setStatus('缓冲中');
          }
          return;
        }
        scheduleRetry('重连中');
      });
    }

    setStatus('连接中');
    startPlayer();

    const handlePlaying = () => {
      retryDelay = 1000;
      retryCount = 0;
      setPlayerError('');
      setStatus('在线');
    };
    const handleWaiting = () => setStatus('缓冲中');
    const handleStalled = () => scheduleRetry('视频流中断，正在重连');
    const handleError = () => scheduleRetry('视频流中断，正在重连');

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('error', handleError);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('error', handleError);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [camera?.playUrl, onPlaybackStatusChange]);

  return (
    <>
      <video className="camera-video" ref={videoRef} muted playsInline controls autoPlay />
      {(!camera?.playUrl || playerError) && (
        <div className="camera-stream-message">
          <strong>{playerError || '暂无播放地址'}</strong>
          <span>{camera?.playUrl ? '请确认 MediaMTX 正在运行并能访问摄像头 RTSP' : '请先配置该设备的视频通道'}</span>
        </div>
      )}
    </>
  );
}

function CameraPanel({ position, onToast }) {
  const [activeCameraId, setActiveCameraId] = useState(CAMERA_CHANNELS[0].id);
  const [cameras, setCameras] = useState([]);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [playbackStatus, setPlaybackStatus] = useState('待接入');
  const cameraDeviceId = getRobotNameForDevice(position?.robotName);
  const cameraList = cameras.length ? cameras : CAMERA_CHANNELS;
  const activeCamera = cameraList.find((camera) => camera.id === activeCameraId) || cameraList[0] || CAMERA_CHANNELS[0];
  const hasConfiguredCameras = cameras.length > 0;
  const panelStatus = camerasLoading ? '通道加载中' : cameraError ? '接口异常' : hasConfiguredCameras ? playbackStatus : 'HLS 待配置';
  const activeStatus = camerasLoading ? '加载中' : cameraError ? '异常' : activeCamera.playUrl ? playbackStatus : activeCamera.status;

  useEffect(() => {
    if (!cameraDeviceId) {
      setCameras([]);
      setCameraError('');
      setPlaybackStatus('待接入');
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setCamerasLoading(true);
    setCameraError('');

    fetchRobotCameras(cameraDeviceId, controller.signal)
      .then((nextCameras) => {
        if (cancelled) return;
        setCameras(nextCameras);
        setActiveCameraId((currentCameraId) => (
          nextCameras.some((camera) => camera.id === currentCameraId)
            ? currentCameraId
            : nextCameras[0]?.id || CAMERA_CHANNELS[0].id
        ));
        if (!nextCameras.length) setPlaybackStatus('待配置');
      })
      .catch((error) => {
        if (cancelled) return;
        const message = getCameraErrorMessage(error);
        setCameras([]);
        setCameraError(message);
        setPlaybackStatus('接口异常');
        onToast?.(message);
      })
      .finally(() => {
        if (!cancelled) setCamerasLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cameraDeviceId]);

  useEffect(() => {
    setPlaybackStatus(activeCamera.playUrl ? '连接中' : activeCamera.status);
  }, [activeCamera.id, activeCamera.playUrl, activeCamera.status]);

  return (
    <div className="camera-panel">
      <div className="route-panel-header">
        <div className="panel-title-with-icon">
          <Camera size={18} />
          <div><strong>摄像头画面</strong><span>{position ? `${position.robotName} 视频通道` : '等待设备选择'}</span></div>
        </div>
        <span className={`camera-status ${cameraError ? 'camera-status-error' : hasConfiguredCameras ? 'camera-status-live' : ''}`}><Radio size={14} />{panelStatus}</span>
      </div>

      <div className={`camera-live-frame camera-live-${activeCamera.tone}`}>
        <HlsVideoPlayer camera={hasConfiguredCameras ? activeCamera : null} onPlaybackStatusChange={setPlaybackStatus} />
        <div className="camera-live-topbar">
          <span><Video size={15} />{activeCamera.name}</span>
          <strong>{activeStatus}</strong>
        </div>
        <div className="camera-reticle"><Crosshair size={42} strokeWidth={1.3} /></div>
        <div className="camera-noise-line" />
        <div className="camera-hud">
          <span><Compass size={14} />{typeof position?.heading === 'number' ? `${position.heading}°` : '暂无航向'}</span>
          <span>{typeof position?.speed === 'number' ? `${position.speed} m/s` : '暂无速度'}</span>
          <span>{formatBattery(position?.battery)}</span>
        </div>
      </div>

      <div className="camera-channel-grid" aria-label="摄像头通道">
        {CAMERA_CHANNELS.map((camera) => (
          <button
            className={`camera-channel ${camera.id === activeCamera.id ? 'camera-channel-active' : ''}`}
            type="button"
            key={camera.id}
            onClick={() => setActiveCameraId(camera.id)}
            aria-pressed={camera.id === activeCamera.id}
          >
            <span className={`camera-channel-preview camera-preview-${camera.tone}`}><Camera size={16} /></span>
            <span><strong>{camera.name}</strong><small>{camera.placement}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RemoteControlPanel({ position, onToast }) {
  const [values, setValues] = useState(INITIAL_REMOTE_VALUES);
  const remoteDeviceId = getRobotNameForDevice(position?.robotName);
  const hasRemoteTarget = Boolean(remoteDeviceId);

  useEffect(() => {
    if (!position) return;
    setValues((current) => ({
      ...current,
      ...(position.leftThrottle == null ? {} : { THROTTLE_L: position.leftThrottle }),
      ...(position.rightThrottle == null ? {} : { THROTTLE_R: position.rightThrottle }),
      ...(position.actuators ? {
        BRUSH_L: position.actuators.leftBrush ?? current.BRUSH_L,
        BRUSH_R: position.actuators.rightBrush ?? current.BRUSH_R,
        CONVEYOR: position.actuators.conveyor ?? current.CONVEYOR,
        PADDLE_POWER: position.actuators.paddlePower ?? current.PADDLE_POWER,
        DISC_CYLINDER: position.actuators.discCylinder ?? current.DISC_CYLINDER,
        HATCH_CYLINDER: position.actuators.hatchCylinder ?? current.HATCH_CYLINDER,
      } : {}),
    }));
  }, [position?.leftThrottle, position?.rightThrottle, position?.actuators]);

  async function submitRemoteCommand(cmd, value, label, valueText, nextValues) {
    if (!hasRemoteTarget) return false;

    const target = remoteDeviceId;

    try {
      const result = await sendRobotCommand(target, {
        command: cmd,
        value,
        values: nextValues,
        ttlMs: 800,
      });
      onToast?.(`已发布 ${JSON.stringify(result.protocol || [])}`, 'success');
      return true;
    } catch (error) {
      const message = getRemoteCommandErrorMessage(error);
      onToast?.(message);
      return false;
    }
  }

  function updateThrottle(cmd, rawValue) {
    const nextValue = clamp(Math.round(Number(rawValue) || 0), -100, 100);
    setValues((currentValues) => ({ ...currentValues, [cmd]: nextValue }));
  }

  function sendThrottle(command) {
    submitRemoteCommand(command.cmd, values[command.cmd], command.label, `${values[command.cmd]}%`, { ...values });
  }

  async function toggleSwitch(command) {
    const nextValue = values[command.cmd] ? 0 : 1;
    if (command.cmd === 'DISC_CYLINDER' && nextValue === 1 && values.HATCH_CYLINDER !== 1) {
      onToast?.('翻盖开关未开启');
      return;
    }
    if (!requestRemoteSwitchConfirmation(command, nextValue)) return;
    const previousValues = values;
    const nextValues = { ...values, [command.cmd]: nextValue };
    setValues(nextValues);
    const sent = await submitRemoteCommand(command.cmd, nextValue, command.label, nextValue ? command.onText : command.offText, nextValues);
    if (!sent) setValues(previousValues);
  }

  return (
    <section className="remote-panel" aria-label="遥控调试面板">
      <div className="section-heading remote-heading">
        <div>
          <p className="eyebrow">指令下发</p>
          <h2>设备指令下发</h2>
          <p className="remote-subtitle">指令对象与当前在线地图设备保持一致；后端接入后由系统封装并下发指令。</p>
        </div>
        <span className="status-badge status-pending">MQTT 下发</span>
      </div>

      <div className="command-console">
        <div className="command-target-bar">
          <span>控制对象</span>
          <strong>{remoteDeviceId || '请先查询设备'}</strong>
          <small>{hasRemoteTarget ? '下方指令只作用于当前设备' : '查询到设备位置后即可进行遥控操作'}</small>
        </div>

        <div className="command-sections">
          <section className="command-section throttle-card">
            <div className="remote-card-header">
              <Gauge size={18} />
              <div><strong>双油门</strong><span>后退 / 停止 / 前进</span></div>
            </div>
            <div className="throttle-list">
              {REMOTE_THROTTLE_COMMANDS.map((command) => (
                <div className="throttle-control" key={command.cmd}>
                  <div className="throttle-meta">
                    <strong>{command.label}</strong>
                    <span>{command.hint}</span>
                  </div>
                  <div className="throttle-inputs">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={values[command.cmd]}
                    disabled={!hasRemoteTarget}
                    onChange={(event) => updateThrottle(command.cmd, event.target.value)}
                    aria-label={`${command.label}百分比`}
                  />
                  <input
                    className="throttle-value"
                    type="number"
                    min="-100"
                    max="100"
                    value={values[command.cmd]}
                    disabled={!hasRemoteTarget}
                    onChange={(event) => updateThrottle(command.cmd, event.target.value)}
                    aria-label={`${command.label}数值`}
                  />
                    <button className="button button-secondary" type="button" onClick={() => sendThrottle(command)} disabled={!hasRemoteTarget}>下发</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="command-section actuator-card">
            <div className="remote-card-header">
              <Settings2 size={18} />
              <div><strong>执行机构</strong><span>切换设备状态或下发动作</span></div>
            </div>
            <div className="critical-controls" aria-label="关键控制">
              {CRITICAL_SWITCH_COMMANDS.map((command) => {
                const enabled = values[command.cmd] === 1;
                const ControlIcon = command.icon;
                return (
                  <button
                    className={`switch-control critical-control critical-control--${command.tone} ${enabled ? 'switch-control-on' : ''}`}
                    type="button"
                    key={command.cmd}
                    onClick={() => toggleSwitch(command)}
                    disabled={!hasRemoteTarget}
                    aria-pressed={enabled}
                  >
                    <span className="critical-control-copy">
                      <span className="critical-control-icon" aria-hidden="true"><ControlIcon size={22} /></span>
                      <span><strong>{command.label}</strong><small>{command.cmd === 'OPERATING_MODE' ? '当前模式' : '电源状态'}</small></span>
                    </span>
                    <span className="switch-state">{enabled ? command.onText : command.offText}</span>
                  </button>
                );
              })}
              <DockEjectButton deviceId={remoteDeviceId} onToast={onToast} />
            </div>
            <div className="switch-grid">
              {REMOTE_SWITCH_COMMANDS.map((command) => {
                const enabled = values[command.cmd] === 1;
                return (
                  <button
                    className={`switch-control ${enabled ? 'switch-control-on' : ''}`}
                    type="button"
                    key={command.cmd}
                    onClick={() => toggleSwitch(command)}
                    disabled={!hasRemoteTarget}
                    aria-pressed={enabled}
                  >
                    <span><strong>{command.label}</strong><small>点击切换</small></span>
                    <span className="switch-state">{enabled ? command.onText : command.offText}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function EmptyModule({ title }) {
  return (
    <section className="empty-module">
      <div className="empty-icon"><DatabaseIcon /></div>
      <h2>{title}</h2>
      <p>当前后端尚未提供该模块的数据接口。</p>
      <span>接入数据库和 API 后将在这里显示真实数据。</span>
    </section>
  );
}

function DatabaseIcon() {
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7" /></svg>;
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`} role="status">{toast.message}</div>;
}

function Dashboard({ fleetPositions, fleetLoading, fleetError, onOpenDeviceDetail }) {
  const now = useCurrentTime();
  const averageSpeed = getAverage(fleetPositions.map((position) => position.speed));
  const averageBattery = getAverage(fleetPositions.map((position) => position.battery));
  const abnormalCount = fleetPositions.filter((position) => position.status !== 1).length;

  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">监控中心</p>
          <h1>总览看板</h1>
          <p className="page-description">查看全域实时轨迹分布、设备电量和运行状态。</p>
        </div>
        <div className="api-state"><span className="status-dot status-dot-muted" />实时数据接口</div>
      </div>

      <div className="stat-grid">
        <StatCard icon={ShipWheel} label="在线设备数" value={`${fleetPositions.filter((device) => isRobotOnline(device, now)).length} 台`} />
        <StatCard icon={MapPinned} label="实时位置点" value={`${fleetPositions.filter(hasCoordinates).length} 个`} />
        <StatCard icon={CircleAlert} label="异常设备数" value={fleetPositions.length ? `${abnormalCount} 台` : '暂无数据'} />
        <StatCard icon={Gauge} label="平均电量" value={averageBattery === null ? '暂无数据' : `${Math.round(averageBattery)}%`} />
      </div>

      <FleetOverview
        positions={fleetPositions}
        loading={fleetLoading}
        error={fleetError}
        onOpenDeviceDetail={onOpenDeviceDetail}
      />

      <div className="lower-grid">
        <EmptyModule title="关键系统通知" />
        <section className="empty-module fleet-summary-module">
          <div className="empty-icon"><Gauge size={24} /></div>
          <h2>全域运行摘要</h2>
          <p>平均速度：{averageSpeed === null ? '暂无数据' : `${averageSpeed.toFixed(1)} m/s`}</p>
          <span>地图标记已展示设备名称和电量信息。</span>
        </section>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value = '暂无数据' }) {
  return (
    <div className={`stat-card ${value === '暂无数据' ? 'stat-card-empty' : ''}`}>
      <div className="stat-icon"><Icon size={20} /></div>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-rule" />
    </div>
  );
}

function App() {
  const { user, signOut } = useAuth();
  const navigateTo = useNavigate();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  async function handleSignOut() {
    await signOut();
    navigateTo('/login', { replace: true });
  }
  const [activePage, setActivePage] = useState(getStoredActivePage);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [activeDeviceId, setActiveDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [position, setPosition] = useState(null);
  const [fleetPositions, setFleetPositions] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetError, setFleetError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapCenterSeq, setMapCenterSeq] = useState(0);
  const [toast, setToast] = useState(null);
  const activeDeviceIdRef = useRef(activeDeviceId);
  const locationRequestSeqRef = useRef(0);
  const toastTimerRef = useRef(null);
  activeDeviceIdRef.current = activeDeviceId;

  function showToast(message, type = 'error') {
    setToast({ message, type });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }

  async function loadLocation(code = deviceId, options = {}) {
    const normalizedCode = getRobotNameForDevice(code);
    const showInlineLoading = !options.silent;
    const requestSeq = showInlineLoading ? locationRequestSeqRef.current + 1 : locationRequestSeqRef.current;
    if (showInlineLoading) locationRequestSeqRef.current = requestSeq;

    if (!normalizedCode || !getRobotNameForDevice(normalizedCode)) {
      if (showInlineLoading) {
        setError('设备名称无效');
        setPosition(null);
        setLoading(false);
        showToast('设备名称无效');
      }
      return;
    }

    if (showInlineLoading) {
      setLoading(true);
      setError('');
    }

    try {
      const nextPosition = await fetchRobotLocation(normalizedCode);
      if (showInlineLoading && requestSeq !== locationRequestSeqRef.current) return;
      if (!showInlineLoading && normalizedCode !== activeDeviceIdRef.current) return;
      const feedbackPosition = applyDeviceFeedbackCache(nextPosition);
      cacheDeviceFeedback(feedbackPosition);
      setPosition(feedbackPosition);
      if (options.centerMap) setMapCenterSeq((currentSeq) => currentSeq + 1);
      if (!options.silent) showToast('位置查询成功', 'success');
    } catch (requestError) {
      if (showInlineLoading && requestSeq !== locationRequestSeqRef.current) return;
      if (showInlineLoading) {
        setPosition(null);
        const message = getLocationErrorMessage(requestError);
        setError(message);
        showToast(message);
      }
    } finally {
      if (showInlineLoading && requestSeq === locationRequestSeqRef.current) setLoading(false);
    }
  }

  function requestLocation(code = deviceId) {
    const normalizedCode = code.trim();
    setDeviceId(normalizedCode);
    if (!getRobotNameForDevice(normalizedCode)) {
      setActiveDeviceId('');
      activeDeviceIdRef.current = '';
      loadLocation(normalizedCode);
      return;
    }
    const deviceChanged = normalizedCode !== activeDeviceIdRef.current;
    setActiveDeviceId(normalizedCode);
    activeDeviceIdRef.current = normalizedCode;
    if (!deviceChanged) loadLocation(normalizedCode, { centerMap: true });
  }

  function openDeviceDetail(robotName) {
    const normalizedName = robotName.trim();
    if (!normalizedName) return;
    setDeviceId(normalizedName);
    const deviceChanged = normalizedName !== activeDeviceIdRef.current;
    setActiveDeviceId(normalizedName);
    activeDeviceIdRef.current = normalizedName;
    saveActivePage('device-detail');
    setActivePage('device-detail');
    setSidebarOpen(false);
    if (!deviceChanged) loadLocation(normalizedName, { silent: true, centerMap: true });
  }

  useEffect(() => {
    if (!activeDeviceId) return;
    loadLocation(activeDeviceId, { silent: true, centerMap: true });
  }, [activeDeviceId]);

  useEffect(() => {
    // SSE 会先发送原子全量快照，再持续推送增量；不并发发起 HTTP 全量查询，避免旧响应覆盖新位置。
    setFleetLoading(true);
    function clearSelectedDevice(robotName) {
      removeDeviceFeedbackCache(robotName);
      if (activeDeviceIdRef.current !== robotName) return;
      locationRequestSeqRef.current += 1;
      activeDeviceIdRef.current = '';
      setActiveDeviceId('');
      setDeviceId('');
      setPosition(null);
      setLoading(false);
      setError('');
    }
    return subscribeRobotLocations({
      onOpen: () => setFleetError(''),
      onSnapshot: (nextPositions) => {
        setFleetPositions(nextPositions);
        setFleetLoading(false);
        setFleetError('');
        const activePosition = nextPositions.find((item) => item.robotName === activeDeviceIdRef.current);
        try {
          const names = new Set(nextPositions.map((item) => item.robotName));
          Object.keys(window.localStorage).filter((key) => key.startsWith(DEVICE_FEEDBACK_CACHE_PREFIX)).forEach((key) => {
            if (!names.has(key.slice(DEVICE_FEEDBACK_CACHE_PREFIX.length))) window.localStorage.removeItem(key);
          });
        } catch { /* Storage may be disabled. */ }
        if (activePosition) {
          const feedbackPosition = applyDeviceFeedbackCache(activePosition);
          cacheDeviceFeedback(feedbackPosition);
          setPosition(feedbackPosition);
        } else clearSelectedDevice(activeDeviceIdRef.current);
      },
      onDeleted: (robotName) => {
        setFleetPositions((current) => current.filter((item) => item.robotName !== robotName));
        clearSelectedDevice(robotName);
      },
      onPosition: (nextPosition) => {
        setFleetPositions((current) => {
          const index = current.findIndex((item) => item.robotName === nextPosition.robotName);
          if (index < 0) return [...current, nextPosition].sort((a, b) => a.robotName.localeCompare(b.robotName));
          const next = [...current];
          next[index] = nextPosition;
          return next;
        });
        setFleetError('');
        if (nextPosition.robotName === activeDeviceIdRef.current) {
          const feedbackPosition = applyDeviceFeedbackCache(nextPosition);
          cacheDeviceFeedback(feedbackPosition);
          setPosition(feedbackPosition);
          setError('');
        }
      },
      onError: () => {
        // EventSource 会自动重连；保留最后位置，避免短暂断线导致页面闪空。
        setFleetError('实时位置连接暂时中断，正在重连');
      },
    });
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  function showNotImplemented() {
    showToast('该功能接口尚未实现，当前不可用');
  }

  function navigate(page) {
    saveActivePage(page);
    setActivePage(page);
    setSidebarOpen(false);
  }

  const locationProps = {
    deviceId,
    setDeviceId,
    position,
    fleetPositions,
    loading,
    error,
    mapCenterSeq,
    onSubmit: (event) => {
      event.preventDefault();
      requestLocation();
    },
    onSelectDevice: (deviceName) => requestLocation(deviceName),
    onToast: showToast,
  };
  const detailTitle = position?.robotName || activeDeviceId || deviceId || '未选择设备';

  const pageContent = activePage === 'dashboard' ? (
    <Dashboard
      fleetPositions={fleetPositions}
      fleetLoading={fleetLoading}
      fleetError={fleetError}
      onOpenDeviceDetail={openDeviceDetail}
    />
  ) : activePage === 'fleet' ? (
    <>
      <div className="page-intro"><div><p className="eyebrow">监控中心</p><h1>设备编队</h1></div></div>
      <FleetManagement
        fleetPositions={fleetPositions}
        loading={fleetLoading}
        error={fleetError}
        onOpenDeviceDetail={openDeviceDetail}
        onToast={showToast}
      />
    </>
  ) : activePage === 'device-detail' ? (
    <>
      <div className="page-intro"><div><p className="eyebrow">设备管理</p><h1>设备详情 - {detailTitle}</h1><p className="page-description">按分类查看设备位置、摄像头、清洁区域、船坞控制和巡查数据。</p></div></div>
      <LocationPanel {...locationProps} />
    </>
  ) : (
    <EmptyModule title={pageNames[activePage] || '页面'} />
  );

  return (
    <div className="app-shell">
      <Toast toast={toast} />
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单" />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><ShipWheel size={21} /></div>
          <div><strong>Aisland</strong><span>水面机器人云管理平台</span></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} title="收起菜单" aria-label="收起菜单"><PanelLeftClose size={17} /></button>
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button className={`nav-item ${activePage === id ? 'nav-item-active' : ''}`} key={id} onClick={() => navigate(id)}>
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot status-dot-muted" />等待数据接口</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} title="打开菜单" aria-label="打开菜单"><Menu size={20} /></button>
          <div className="breadcrumb"><span>首页</span><ChevronRight size={14} />{pageNames[activePage] || '页面'}</div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={showNotImplemented} title="通知" aria-label="通知"><Bell size={18} /></button>
            <div className="account-menu-wrap">
              <button className="user-chip user-chip-button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen} aria-haspopup="menu">
                <span className="avatar">{user?.displayName?.slice(0, 1) || <Settings2 size={15} />}</span>
                <span className="user-label">{user?.displayName}</span><ChevronDown size={14} />
              </button>
              {accountMenuOpen && <div className="account-dropdown" role="menu">
                <div className="account-dropdown-meta"><strong>{user?.displayName}</strong><span>{getRoleName(user?.role)}</span></div>
                <button role="menuitem" onClick={() => navigateTo('/account')}><UserRound size={16} />账号设置</button>
                <button role="menuitem" onClick={handleSignOut}><LogOut size={16} />退出登录</button>
              </div>}
            </div>
          </div>
        </header>
        <div className="content-area">{pageContent}</div>
      </main>
    </div>
  );
}

export default App;
