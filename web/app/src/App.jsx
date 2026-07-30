import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  LayoutDashboard,
  List,
  MapPinned,
  Menu,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings2,
  ShipWheel,
  Wifi,
} from 'lucide-react';
import { fetchAllRobotLocations, fetchRobotLocation, getLocationErrorMessage, getRobotNameForDevice } from './api';

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_LOCATION_POLL_INTERVAL_MS || 5000);
const AMAP_KEY = import.meta.env.VITE_MAP_API_KEY;
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE;
const DEFAULT_DEVICE_ID = '清澜一号';
const ACTIVE_PAGE_STORAGE_KEY = 'watercleanbot.activePage';

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
  name.textContent = position.robotName;

  const battery = document.createElement('span');
  battery.textContent = `电量 ${formatBattery(position.battery)}`;

  const icon = document.createElement('div');
  icon.className = 'fleet-map-marker-icon';
  icon.title = `${position.robotName} 定位点`;

  const iconText = document.createElement('span');
  iconText.textContent = '艇';

  const pulse = document.createElement('div');
  pulse.className = 'fleet-map-marker-pulse';

  bubble.append(name, battery);
  icon.append(iconText);
  marker.append(bubble, pulse, icon);
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
  return (
    <span className="status-badge status-online">
      <span className="status-dot" />
      位置已获取
    </span>
  );
}

function LocationMap({ position }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const markerContentRef = useRef(null);
  const zoomHandlerRef = useRef(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => () => {
    markerRef.current?.setMap(null);
    markerRef.current = null;
    markerContentRef.current = null;
    if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
      mapRef.current.off('zoomchange', zoomHandlerRef.current);
      mapRef.current.off('zoomend', zoomHandlerRef.current);
    }
    zoomHandlerRef.current = null;
    mapRef.current?.destroy();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!position) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      markerContentRef.current = null;
      if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
        mapRef.current.off('zoomchange', zoomHandlerRef.current);
        mapRef.current.off('zoomend', zoomHandlerRef.current);
      }
      zoomHandlerRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      setMapError('');
      return undefined;
    }

    if (!mapNode.current) return undefined;

    const lat = position.lat;
    const lng = position.lng;
    const nextPosition = [lng, lat];
    const markerTitle = `${position.robotName} · 电量 ${formatBattery(position.battery)} · 航向 ${position.heading}°`;
    let resizeTimer;
    let cancelled = false;
    setMapError('');

    loadAMap()
      .then((AMap) => {
        if (cancelled || !mapNode.current) return;

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapNode.current, {
            center: nextPosition,
            zoom: 14,
            resizeEnable: true,
          });
          if (typeof mapRef.current.on === 'function') {
            zoomHandlerRef.current = () => {
              if (markerContentRef.current) applyFleetBubbleStyle(markerContentRef.current, getMapZoom(mapRef.current));
            };
            mapRef.current.on('zoomchange', zoomHandlerRef.current);
            mapRef.current.on('zoomend', zoomHandlerRef.current);
          }
          resizeTimer = window.setTimeout(() => mapRef.current?.resize(), 0);
        }

        const markerContent = createFleetMarkerContent(position, getMapZoom(mapRef.current));
        if (!markerRef.current) {
          markerRef.current = new AMap.Marker({
            map: mapRef.current,
            position: nextPosition,
            title: markerTitle,
            content: markerContent,
            offset: new AMap.Pixel(-64, -88),
          });
          markerContentRef.current = markerContent;
          return;
        }

        markerRef.current.setPosition(nextPosition);
        if (typeof markerRef.current.setTitle === 'function') {
          markerRef.current.setTitle(markerTitle);
        }
        if (typeof markerRef.current.setContent === 'function') {
          markerRef.current.setContent(markerContent);
        }
        markerContentRef.current = markerContent;
      })
      .catch(() => {
        if (!cancelled) setMapError('高德地图加载失败，请检查 Key 和 Web 端域名白名单。');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
    };
  }, [position]);

  if (!position) {
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
    markersRef.current.forEach((markerGroup) => markerGroup.marker.setMap(null));
    markersRef.current.clear();
    if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
      mapRef.current.off('zoomchange', zoomHandlerRef.current);
      mapRef.current.off('zoomend', zoomHandlerRef.current);
    }
    zoomHandlerRef.current = null;
    mapRef.current?.destroy();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!positions.length) {
      markersRef.current.forEach((markerGroup) => markerGroup.marker.setMap(null));
      markersRef.current.clear();
      if (mapRef.current && zoomHandlerRef.current && typeof mapRef.current.off === 'function') {
        mapRef.current.off('zoomchange', zoomHandlerRef.current);
        mapRef.current.off('zoomend', zoomHandlerRef.current);
      }
      zoomHandlerRef.current = null;
      mapRef.current?.destroy();
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

        const firstPosition = [positions[0].lng, positions[0].lat];
        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapNode.current, {
            center: firstPosition,
            zoom: 13,
            resizeEnable: true,
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
          const nextPosition = [position.lng, position.lat];
          const markerTitle = `${position.robotName} · 电量 ${formatBattery(position.battery)}`;
          const markerContent = createFleetMarkerContent(position, currentZoom, onOpenDeviceDetail);
          activeNames.add(markerKey);

          const existingMarkerGroup = markersRef.current.get(markerKey);
          if (existingMarkerGroup) {
            existingMarkerGroup.marker.setPosition(nextPosition);
            if (typeof existingMarkerGroup.marker.setTitle === 'function') existingMarkerGroup.marker.setTitle(markerTitle);
            if (typeof existingMarkerGroup.marker.setContent === 'function') existingMarkerGroup.marker.setContent(markerContent);
            existingMarkerGroup.content = markerContent;
            return;
          }

          const marker = new AMap.Marker({
            map: mapRef.current,
            position: nextPosition,
            title: markerTitle,
            content: markerContent,
            offset: new AMap.Pixel(-64, -88),
          });
          markersRef.current.set(markerKey, { marker, content: markerContent });
        });

        markersRef.current.forEach((markerGroup, markerKey) => {
          if (activeNames.has(markerKey)) return;
          markerGroup.marker.setMap(null);
          markersRef.current.delete(markerKey);
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

      <div className="map-frame fleet-map-frame"><FleetMap positions={positions} onOpenDeviceDetail={onOpenDeviceDetail} /></div>

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

function LocationPanel({ deviceId, setDeviceId, position, loading, error, onSubmit, onRefresh }) {
  return (
    <section className="location-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">实时定位</p>
          <h2>机器人位置</h2>
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
              placeholder="输入设备名称，如 清澜一号"
              autoComplete="off"
            />
          </div>
          <button className="button button-primary" type="submit" disabled={!deviceId.trim() || loading}>
            <Search size={16} />
            查询位置
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            disabled={!deviceId.trim() || loading}
            title="刷新位置"
            aria-label="刷新位置"
          >
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
        <p className="query-hint">当前已配置设备：清澜一号</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>

      <div className="location-grid">
        <div className="map-frame"><LocationMap position={position} /></div>
        <div className="position-details">
          <div className="detail-header">
            <div>
              <span className="detail-label">机器人名称</span>
              <h3>{position?.robotName || '暂无设备'}</h3>
            </div>
            <Wifi size={20} className={position ? 'icon-green' : 'icon-muted'} />
          </div>
          <div className="detail-list">
            <DetailRow icon={MapPinned} label="纬度" value={formatNumber(position?.lat, 2)} />
            <DetailRow icon={MapPinned} label="经度" value={formatNumber(position?.lng, 2)} />
            <DetailRow icon={Gauge} label="速度" value={typeof position?.speed === 'number' ? `${position.speed} m/s` : '暂无数据'} />
            <DetailRow icon={Gauge} label="电量" value={typeof position?.battery === 'number' ? `${position.battery}%` : '暂无数据'} />
            <DetailRow icon={MapPinned} label="航向" value={typeof position?.heading === 'number' ? `${position.heading}°` : '暂无数据'} />
            <DetailRow icon={Clock3} label="状态码" value={typeof position?.status === 'number' ? String(position.status) : '暂无数据'} />
          </div>
          <p className="data-note">位置数据来自已确认的后端接口，查询失败时不会使用模拟位置。</p>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-row-label"><Icon size={15} />{label}</span>
      <strong>{value}</strong>
    </div>
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
        <StatCard icon={ShipWheel} label="在线设备数" value={fleetPositions.length ? `${fleetPositions.length} 台` : '暂无数据'} />
        <StatCard icon={MapPinned} label="实时位置点" value={fleetPositions.length ? `${fleetPositions.length} 个` : '暂无数据'} />
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
    </div>
  );
}

function App() {
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
  const [toast, setToast] = useState(null);
  const loadingRef = useRef(false);
  const fleetLoadingRef = useRef(false);
  const toastTimerRef = useRef(null);

  function showToast(message, type = 'error') {
    setToast({ message, type });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }

  async function loadFleetLocations(options = {}) {
    if (fleetLoadingRef.current) return;

    fleetLoadingRef.current = true;
    setFleetLoading(true);
    try {
      const nextPositions = await fetchAllRobotLocations();
      setFleetPositions(nextPositions);
      setFleetError('');
    } catch (requestError) {
      const message = getLocationErrorMessage(requestError);
      setFleetError(message);
      if (!options.silent) showToast(message);
    } finally {
      fleetLoadingRef.current = false;
      setFleetLoading(false);
    }
  }

  async function loadLocation(code = deviceId, options = {}) {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || !getRobotNameForDevice(normalizedCode)) {
      setError('设备名称无效');
      setPosition(null);
      showToast('设备名称无效');
      return;
    }
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const nextPosition = await fetchRobotLocation(normalizedCode);
      setPosition(nextPosition);
      if (!options.silent) showToast('位置查询成功', 'success');
    } catch (requestError) {
      setPosition(null);
      const message = getLocationErrorMessage(requestError);
      setError(message);
      showToast(message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function requestLocation(code = deviceId) {
    const normalizedCode = code.trim().toUpperCase();
    setDeviceId(normalizedCode);
    if (!getRobotNameForDevice(normalizedCode)) {
      setActiveDeviceId('');
      loadLocation(normalizedCode);
      return;
    }
    setActiveDeviceId(normalizedCode);
    loadLocation(normalizedCode);
  }

  function openDeviceDetail(robotName) {
    const normalizedName = robotName.trim();
    if (!normalizedName) return;
    setDeviceId(normalizedName);
    setActiveDeviceId(normalizedName);
    saveActivePage('device-detail');
    setActivePage('device-detail');
    setSidebarOpen(false);
    loadLocation(normalizedName, { silent: true });
  }

  useEffect(() => {
    if (!activeDeviceId) return undefined;
    loadLocation(activeDeviceId, { silent: true });
    const timer = window.setInterval(() => loadLocation(activeDeviceId, { silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeDeviceId]);

  useEffect(() => {
    loadFleetLocations({ silent: true });
    const timer = window.setInterval(() => loadFleetLocations({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
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
    loading,
    error,
    onSubmit: (event) => {
      event.preventDefault();
      requestLocation();
    },
    onRefresh: () => requestLocation(),
  };

  const pageContent = activePage === 'dashboard' ? (
    <Dashboard
      fleetPositions={fleetPositions}
      fleetLoading={fleetLoading}
      fleetError={fleetError}
      onOpenDeviceDetail={openDeviceDetail}
    />
  ) : activePage === 'device-detail' ? (
    <>
      <div className="page-intro"><div><p className="eyebrow">设备管理</p><h1>设备详情</h1><p className="page-description">查询指定设备的实时位置。</p></div></div>
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
          <div><strong>AquaClean</strong><span>水面清洁管理平台</span></div>
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
            <div className="user-chip"><span className="avatar"><Settings2 size={15} /></span><span className="user-label">账号未接入</span></div>
          </div>
        </header>
        <div className="content-area">{pageContent}</div>
      </main>
    </div>
  );
}

export default App;
