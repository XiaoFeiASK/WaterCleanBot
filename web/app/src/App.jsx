import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
  X,
} from 'lucide-react';
import { fetchRobotLocation } from './api';

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_LOCATION_POLL_INTERVAL_MS || 5000);

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

function formatTime(value) {
  if (!value) return '暂无数据';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间格式不可用' : date.toLocaleString('zh-CN', { hour12: false });
}

function formatNumber(value, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '暂无数据';
}

function locationIsFresh(position) {
  if (!position?.updated_at) return false;
  const updatedAt = new Date(position.updated_at).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= POLL_INTERVAL_MS * 2;
}

function StatusBadge({ position, loading }) {
  if (loading) return <span className="status-badge status-pending">读取中</span>;
  if (!position) return <span className="status-badge status-empty">未查询</span>;
  const fresh = locationIsFresh(position);
  return (
    <span className={`status-badge ${fresh ? 'status-online' : 'status-stale'}`}>
      <span className="status-dot" />
      {fresh ? '位置正常' : '数据可能过期'}
    </span>
  );
}

function LocationMap({ position }) {
  const mapNode = useRef(null);

  useEffect(() => {
    if (!position || !mapNode.current) return undefined;

    const lat = Number(position.latitude);
    const lng = Number(position.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

    const map = L.map(mapNode.current, { zoomControl: true }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.circleMarker([lat, lng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#0f6e56',
      fillOpacity: 1,
    }).addTo(map);

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
    };
  }, [position]);

  if (!position) {
    return (
      <div className="map-empty">
        <MapPinned size={28} strokeWidth={1.5} />
        <strong>暂无位置数据</strong>
        <span>输入机器人编号并查询后显示地图位置</span>
      </div>
    );
  }

  return <div ref={mapNode} className="location-map" aria-label="机器人实时位置地图" />;
}

function LocationPanel({ robotCode, setRobotCode, position, loading, error, onSubmit, onRefresh }) {
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
        <label htmlFor="robot-code">机器人编号</label>
        <div className="query-controls">
          <div className="input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              id="robot-code"
              value={robotCode}
              onChange={(event) => setRobotCode(event.target.value)}
              placeholder="输入机器人编号"
              autoComplete="off"
            />
          </div>
          <button className="button button-primary" type="submit" disabled={!robotCode.trim() || loading}>
            <Search size={16} />
            查询位置
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            disabled={!robotCode.trim() || loading}
            title="刷新位置"
            aria-label="刷新位置"
          >
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>

      <div className="location-grid">
        <div className="map-frame">
          <LocationMap position={position} />
        </div>
        <div className="position-details">
          <div className="detail-header">
            <div>
              <span className="detail-label">当前设备</span>
              <h3>{position?.robot_code || '暂无设备'}</h3>
            </div>
            <Wifi size={20} className={position ? 'icon-green' : 'icon-muted'} />
          </div>
          <div className="detail-list">
            <DetailRow icon={MapPinned} label="纬度" value={formatNumber(position?.latitude)} />
            <DetailRow icon={MapPinned} label="经度" value={formatNumber(position?.longitude)} />
            <DetailRow icon={Gauge} label="速度" value={typeof position?.speed_mps === 'number' ? `${position.speed_mps} m/s` : '暂无数据'} />
            <DetailRow icon={NavigationIcon} label="航向" value={typeof position?.heading === 'number' ? `${position.heading}°` : '暂无数据'} />
            <DetailRow icon={Clock3} label="设备上报时间" value={formatTime(position?.updated_at)} />
          </div>
          <p className="data-note">位置数据来自后端接口，页面不会生成或补充设备数据。</p>
        </div>
      </div>
    </section>
  );
}

function NavigationIcon(props) {
  return <MapPinned {...props} />;
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

function Dashboard({ locationProps }) {
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">监控中心</p>
          <h1>总览看板</h1>
          <p className="page-description">查看机器人实时位置与服务状态。</p>
        </div>
        <div className="api-state"><span className="status-dot status-dot-muted" />实时数据接口</div>
      </div>

      <div className="stat-grid">
        <StatCard icon={ShipWheel} label="运行设备数" />
        <StatCard icon={MapPinned} label="实时位置" />
        <StatCard icon={CircleAlert} label="未处理预警" />
        <StatCard icon={Gauge} label="平均速度" />
      </div>

      <LocationPanel {...locationProps} />

      <div className="lower-grid">
        <EmptyModule title="关键系统通知" />
        <EmptyModule title="环境指数监测" />
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label }) {
  return (
    <div className="stat-card stat-card-empty">
      <div className="stat-icon"><Icon size={20} /></div>
      <span className="stat-label">{label}</span>
      <strong>暂无数据</strong>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [robotCode, setRobotCode] = useState('');
  const [activeRobotCode, setActiveRobotCode] = useState('');
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadLocation(code = robotCode) {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setError('请输入机器人编号');
      return;
    }

    setLoading(true);
    setError('');
    setActiveRobotCode(normalizedCode);
    const controller = new AbortController();
    try {
      const nextPosition = await fetchRobotLocation(normalizedCode, controller.signal);
      setPosition(nextPosition);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setPosition(null);
        setError(requestError.message || '无法读取机器人位置');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeRobotCode) return undefined;
    const timer = window.setInterval(() => loadLocation(activeRobotCode), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeRobotCode]);

  function navigate(page) {
    setActivePage(page);
    setSidebarOpen(false);
  }

  const locationProps = {
    robotCode,
    setRobotCode,
    position,
    loading,
    error,
    onSubmit: (event) => {
      event.preventDefault();
      loadLocation();
    },
    onRefresh: () => loadLocation(),
  };

  const pageContent = activePage === 'dashboard' ? (
    <Dashboard locationProps={locationProps} />
  ) : activePage === 'device-detail' ? (
    <>
      <div className="page-intro"><div><p className="eyebrow">设备管理</p><h1>设备详情</h1><p className="page-description">查询指定机器人的实时位置。</p></div></div>
      <LocationPanel {...locationProps} />
    </>
  ) : (
    <EmptyModule title={pageNames[activePage] || '页面'} />
  );

  return (
    <div className="app-shell">
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
            <button className="icon-button" title="通知" aria-label="通知"><Bell size={18} /></button>
            <div className="user-chip"><span className="avatar"><Settings2 size={15} /></span><span className="user-label">账号未接入</span></div>
          </div>
        </header>
        <div className="content-area">{pageContent}</div>
      </main>
    </div>
  );
}

export default App;
