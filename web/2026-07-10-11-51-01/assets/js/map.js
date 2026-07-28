/* ============ 地图模块 (map.js) ============
 * 集成高德地图 JS API v2.0：
 *  1) 看板「全域实时轨迹分布」—— 实时标注 + 轨迹模拟
 *  2) 设备详情「在线地图」—— 按当前设备 GPS 定位，支持全部无人艇
 * 使用前在 AMAP_KEY 处填入你的高德 Web端(JS API) Key：
 *  申请：https://lbs.amap.com → 控制台 → 应用管理 → 创建"Web端(JS API)"应用
 * 未填 Key 时自动降级为原 SVG 模拟地图，不影响其它功能。
 * 说明：在线设备每 2 秒更新位置与轨迹（演示用随机位移）；
 *   生产环境应替换为后端 WebSocket / MQTT 推送的真实 GPS 坐标。
 * =========================================== */

const AMAP_KEY = '14b4583ba0f98c8c697b570f1f983990'; // ← 替换为你的高德 Key
const MAP_CENTER = [110.755, 19.545]; // 演示中心点：海南清澜港

let dashboardAmap = null;       // 看板地图实例
let trackTimer = null;          // 看板轨迹模拟定时器
const deviceTracks = {};        // 看板设备轨迹 { 设备名: [[lng,lat],...] }

// 看板演示用设备真实经纬度（实际应来自设备 GPS 上报 / 后端推送）
const devicePositions = [
  {name:'清澜一号', lnglat:[110.7520,19.5480], status:'online',   battery:85},
  {name:'清澜二号', lnglat:[110.7582,19.5462], status:'online',   battery:72},
  {name:'清澜三号', lnglat:[110.7610,19.5418], status:'charging', battery:23},
  {name:'清澜四号', lnglat:[110.7485,19.5440], status:'online',   battery:91},
  {name:'清澜五号', lnglat:[110.7648,19.5505], status:'offline',  battery:0},
  {name:'清澜六号', lnglat:[110.7552,19.5520], status:'online',   battery:65},
];

// 设备详情地图相关状态
let deviceDetailAmap = null;    // 设备详情地图实例
let deviceDetailTimer = null;   // 设备详情轨迹模拟定时器
let deviceDetailTrack = [];     // 当前设备轨迹 [[lng,lat],...]

/* ---------- 高德 JS API 按需加载（全局仅加载一次）---------- */
function isAmapKeyReady() {
  return !!(AMAP_KEY && AMAP_KEY !== '__YOUR_AMAP_KEY__');
}

function loadAmapScript(onLoad, onError) {
  if (window.AMap) { onLoad(); return; }
  // 已在加载中 → 轮询等待
  if (document.querySelector('script[data-amap-loader]')) {
    const t = setInterval(function(){
      if (window.AMap) { clearInterval(t); onLoad(); }
    }, 80);
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + AMAP_KEY + '&plugin=AMap.Scale,AMap.ToolBar';
  s.setAttribute('data-amap-loader', '1');
  s.onload = onLoad;
  s.onerror = function(){ if (onError) onError(); };
  document.head.appendChild(s);
}

/* ============ 看板：全域实时轨迹分布 ============ */

// 原模拟地图（作为高德未配置 / 加载失败时的降级显示）
function renderRiverMapMock() {
  let html = '';
  html += `<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 800 380" preserveAspectRatio="xMidYMid slice">
    <path d="M50 190 Q200 160 350 200 T700 180" fill="none" stroke="#85B7EB" stroke-width="20" stroke-linecap="round" opacity="0.6"/>
    <path d="M350 200 Q450 250 550 350" fill="none" stroke="#85B7EB" stroke-width="25" stroke-linecap="round" opacity="0.5"/>
    <path d="M100 50 Q200 120 350 200" fill="none" stroke="#85B7EB" stroke-width="15" stroke-linecap="round" opacity="0.4"/>
  </svg>`;
  const positions = [
    {x:'15%',y:'48%',status:'online',name:'清澜一号',battery:85},
    {x:'35%',y:'50%',status:'online',name:'清澜二号',battery:72},
    {x:'55%',y:'55%',status:'charging',name:'清澜三号',battery:23},
    {x:'70%',y:'45%',status:'online',name:'清澜四号',battery:91},
    {x:'45%',y:'80%',status:'offline',name:'清澜五号',battery:0},
    {x:'25%',y:'55%',status:'online',name:'清澜六号',battery:65},
  ];
  positions.forEach(p => {
    const color = p.status==='online'?'#0F6E56':p.status==='charging'?'#BA7517':'#E24B4A';
    html += `<div style="position:absolute;left:${p.x};top:${p.y};transform:translate(-50%,-50%);cursor:pointer" onclick="navigate('device-detail')">
      <div style="position:relative">
        <div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>
        <div style="position:absolute;top:-4px;left:-4px;width:36px;height:36px;border-radius:50%;border:2px solid ${color};opacity:0.3;animation:pulse 2s infinite"></div>
      </div>
      <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;padding:2px 8px;border-radius:4px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid var(--border)">${p.name}<br><span style="color:${color}">●</span> ${p.battery}%</div>
    </div>`;
  });
  return html;
}

// 渲染地图容器（高德容器 + 降级层），实际地图初始化在 pageInit 中异步执行
function renderRiverMap() {
  return `<div id="amapContainer" style="position:absolute;inset:0;z-index:2"></div>
          <div id="amapFallback" style="position:absolute;inset:0;z-index:1">${renderRiverMapMock()}</div>`;
}

// 看板地图右上角提示条
function showAmapTip(msg) {
  const box = document.getElementById('dashboardMap');
  if (!box) return;
  let tip = document.getElementById('amapTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'amapTip';
    tip.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;max-width:280px;background:rgba(255,255,255,0.96);border:1px solid #BA7517;color:#8a5a10;font-size:12px;padding:8px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.12);line-height:1.5';
    box.appendChild(tip);
  }
  tip.textContent = msg;
}

// 初始化看板高德地图（在 pageInit['dashboard'] 中调用）
function initDashboardMap() {
  const container = document.getElementById('amapContainer');
  if (!container) return;
  // 未配置 Key → 降级模拟地图并提示
  if (!isAmapKeyReady()) {
    showAmapTip('未配置高德地图 Key，当前为模拟地图。请在 map.js 顶部 AMAP_KEY 处填入你的高德 Web端 JS API Key，即可显示真实地图与实时定位。');
    return;
  }
  loadAmapScript(createDashboardAmap, function(){
    showAmapTip('高德地图加载失败，请检查 Key 是否正确及网络是否畅通。当前为模拟地图。');
  });
}

// 创建看板地图实例、标注设备、绘制轨迹
function createDashboardAmap() {
  const container = document.getElementById('amapContainer');
  const fb = document.getElementById('amapFallback');
  if (fb) fb.style.display = 'none';
  // 清理旧实例与定时器
  if (trackTimer) { clearInterval(trackTimer); trackTimer = null; }
  dashboardAmap = safeDestroyAmap(dashboardAmap);

  dashboardAmap = new AMap.Map(container, {
    zoom: 14,
    center: MAP_CENTER,
    mapStyle: 'amap://styles/whitesmoke',
    viewMode: '2D'
  });
  dashboardAmap.addControl(new AMap.Scale());

  devicePositions.forEach(d => {
    deviceTracks[d.name] = [d.lnglat.slice()];
    const color = d.status==='online'?'#0F6E56':d.status==='charging'?'#BA7517':'#E24B4A';
    // 轨迹线
    const polyline = new AMap.Polyline({
      path: deviceTracks[d.name],
      strokeColor: color, strokeWeight: 4, strokeOpacity: 0.85, lineJoin: 'round', lineCap: 'round'
    });
    dashboardAmap.add(polyline);
    // 设备标记
    const marker = new AMap.Marker({
      position: d.lnglat,
      content: '<div style="position:relative;cursor:pointer">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>' +
        '<div style="position:absolute;top:-4px;left:-4px;width:36px;height:36px;border-radius:50%;border:2px solid ' + color + ';opacity:0.3;animation:pulse 2s infinite"></div>' +
        '<div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;padding:2px 8px;border-radius:4px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #E5E7EB">' + d.name + '<br><span style="color:' + color + '">●</span> ' + d.battery + '%</div>' +
        '</div>',
      offset: new AMap.Pixel(-14, -14)
    });
    // 点击标记跳转至对应设备详情
    marker.on('click', function(){
      const dev = mockDevices.find(x => x.name === d.name);
      if (dev) navigate('device-detail', dev.id);
    });
    dashboardAmap.add(marker);
    d._marker = marker;
    d._polyline = polyline;
  });

  showAmapTip('已加载高德实时地图，每 2 秒更新在线设备位置与轨迹。');
  startTrackSimulation();
}

// 实时轨迹模拟：在线设备每 2 秒微小随机位移并追加轨迹
function startTrackSimulation() {
  if (trackTimer) clearInterval(trackTimer);
  trackTimer = setInterval(function(){
    // 容器已不在页面（切换走）则停止
    if (!dashboardAmap || !document.getElementById('amapContainer')) {
      clearInterval(trackTimer); trackTimer = null; return;
    }
    devicePositions.forEach(d => {
      if (d.status !== 'online' || !d._marker) return;
      const path = deviceTracks[d.name];
      const last = path[path.length-1];
      const nlng = last[0] + (Math.random()-0.5)*0.0015;
      const nlat = last[1] + (Math.random()-0.5)*0.0015;
      path.push([nlng, nlat]);
      if (path.length > 30) path.shift(); // 保留最近 30 个轨迹点
      d._marker.setPosition([nlng, nlat]);
      d._polyline.setPath(path);
    });
  }, 2000);
}

/* ============ 设备详情：在线地图 ============ */

// SVG 兜底地图（按设备状态着色），未配置 Key / 加载失败时显示
function renderDeviceMapDetailFallback(d) {
  const color = d.status==='online'?'#0F6E56':d.status==='charging'?'#BA7517':'#E24B4A';
  let html = '<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">';
  // River
  html += '<path d="M50 250 Q200 220 350 260 Q500 300 700 240" fill="none" stroke="#85B7EB" stroke-width="30" stroke-linecap="round" opacity="0.6"/>';
  // Planned route
  html += '<path d="M100 250 L200 245 L300 255 L400 260 L500 250 L600 240" fill="none" stroke="#185FA5" stroke-width="2" stroke-dasharray="8,4"/>';
  // Completed route
  html += '<path d="M100 250 L200 245 L300 255" fill="none" stroke="#0F6E56" stroke-width="3"/>';
  // Area box
  html += '<rect x="350" y="220" width="120" height="60" fill="rgba(15,110,86,0.1)" stroke="#0F6E56" stroke-width="1.5" stroke-dasharray="5,3" rx="4"/>';
  html += '<text x="410" y="255" text-anchor="middle" fill="#0F6E56" font-size="11">清洁区域A</text>';
  html += '</svg>';
  // Device marker
  html += '<div style="position:absolute;left:38%;top:50%;transform:translate(-50%,-50%)"><div style="width:32px;height:32px;border-radius:50%;background:' + color + ';border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div></div>';
  // Waypoints
  html += '<div style="position:absolute;left:12%;top:49%"><div style="width:12px;height:12px;border-radius:50%;background:#0F6E56;border:2px solid #fff"></div></div>';
  html += '<div style="position:absolute;left:25%;top:48%"><div style="width:12px;height:12px;border-radius:50%;background:#0F6E56;border:2px solid #fff"></div></div>';
  html += '<div style="position:absolute;left:38%;top:50%"><div style="width:12px;height:12px;border-radius:50%;background:#185FA5;border:2px solid #fff"></div></div>';
  html += '<div style="position:absolute;left:62%;top:48%"><div style="width:12px;height:12px;border-radius:50%;background:var(--gray-400);border:2px solid #fff"></div></div>';
  html += '<div style="position:absolute;left:75%;top:47%"><div style="width:12px;height:12px;border-radius:50%;background:var(--gray-400);border:2px solid #fff"></div></div>';
  return html;
}

// 安全销毁地图实例（容器可能已被 innerHTML 替换而脱离文档）
function safeDestroyAmap(instance) {
  try { if (instance) instance.destroy(); } catch (e) { /* 容器已移除，忽略 */ }
  return null;
}

// 进入设备详情「在线地图」tab 时调用
function initDeviceDetailMap() {
  const container = document.getElementById('deviceAmapContainer');
  if (!container) return;
  // 清理旧的实例与定时器
  if (deviceDetailTimer) { clearInterval(deviceDetailTimer); deviceDetailTimer = null; }
  deviceDetailAmap = safeDestroyAmap(deviceDetailAmap);
  const d = getCurrentDevice();
  if (!d) return;
  if (!isAmapKeyReady()) {
    showDeviceDetailTip('未配置高德地图 Key，当前为模拟地图。请在 map.js 顶部 AMAP_KEY 处填入你的高德 Web端 JS API Key，即可显示真实地图与实时定位。');
    return;
  }
  loadAmapScript(function(){ createDeviceDetailAmap(d); }, function(){
    showDeviceDetailTip('高德地图加载失败，请检查 Key 是否正确及网络是否畅通。当前为模拟地图。');
  });
}

// 创建设备详情地图实例、标注当前设备、绘制轨迹
function createDeviceDetailAmap(d) {
  const container = document.getElementById('deviceAmapContainer');
  const fb = document.getElementById('deviceAmapFallback');
  if (!container) return;
  if (fb) fb.style.display = 'none';
  deviceDetailAmap = safeDestroyAmap(deviceDetailAmap);

  const center = [d.lng, d.lat];
  deviceDetailAmap = new AMap.Map(container, {
    zoom: 15,
    center: center,
    mapStyle: 'amap://styles/whitesmoke',
    viewMode: '2D'
  });
  deviceDetailAmap.addControl(new AMap.Scale());

  const color = d.status==='online'?'#0F6E56':d.status==='charging'?'#BA7517':'#E24B4A';
  deviceDetailTrack = [[d.lng, d.lat]];
  // 轨迹线
  const polyline = new AMap.Polyline({
    path: deviceDetailTrack,
    strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85, lineJoin: 'round', lineCap: 'round'
  });
  deviceDetailAmap.add(polyline);
  // 设备标记
  const marker = new AMap.Marker({
    position: center,
    content: '<div style="position:relative;cursor:pointer">' +
      '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>' +
      '<div style="position:absolute;top:-4px;left:-4px;width:36px;height:36px;border-radius:50%;border:2px solid ' + color + ';opacity:0.3;animation:pulse 2s infinite"></div>' +
      '<div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;padding:2px 8px;border-radius:4px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #E5E7EB">' + d.name + '<br><span style="color:' + color + '">●</span> ' + d.battery + '%</div>' +
      '</div>',
    offset: new AMap.Pixel(-14, -14)
  });
  // 点击标记跳转至该设备详情（当前已是本设备，这里保持）
  deviceDetailAmap.add(marker);

  showDeviceDetailTip('已加载高德实时地图，在线设备每 2 秒更新位置与轨迹。');
  // 轨迹模拟（演示用，仅在线设备移动）
  if (d.status === 'online') {
    deviceDetailTimer = setInterval(function(){
      if (!deviceDetailAmap || !document.getElementById('deviceAmapContainer')) {
        clearInterval(deviceDetailTimer); deviceDetailTimer = null; return;
      }
      const last = deviceDetailTrack[deviceDetailTrack.length-1];
      const nlng = last[0] + (Math.random()-0.5)*0.0015;
      const nlat = last[1] + (Math.random()-0.5)*0.0015;
      deviceDetailTrack.push([nlng, nlat]);
      if (deviceDetailTrack.length > 30) deviceDetailTrack.shift(); // 保留最近 30 个轨迹点
      marker.setPosition([nlng, nlat]);
      polyline.setPath(deviceDetailTrack);
    }, 2000);
  }
}

// 设备详情地图右上角提示条
function showDeviceDetailTip(msg) {
  const box = document.getElementById('deviceMapBox');
  if (!box) return;
  let tip = document.getElementById('deviceMapTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'deviceMapTip';
    tip.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;max-width:280px;background:rgba(255,255,255,0.96);border:1px solid #BA7517;color:#8a5a10;font-size:12px;padding:8px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.12);line-height:1.5';
    box.appendChild(tip);
  }
  tip.textContent = msg;
}
