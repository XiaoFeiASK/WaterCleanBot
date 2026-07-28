/* ============ 视图与渲染模块 (views.js) ============
 * 所有页面模板 views[page]()、初始化 pageInit[page]()，
 * 以及列表渲染 / 筛选 / 弹窗等函数集中在此。
 * 设备详情页已改为数据驱动：通过 getCurrentDevice() 渲染当前选中设备，
 * 支持全部无人艇；设备列表 / 编队的「详情」按钮会携带设备 ID 跳转。
 * 依赖：data.js（数据）、map.js（地图函数）、app.js（navigate / getCurrentDevice 等）。
 * ============================================== */

const views = {};
const pageInit = {};

/* ============ 看板 Dashboard ============ */
views['dashboard'] = () => `
  <div class="page-title">总览看板</div>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--primary-light)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>
      </div>
      <div class="stat-label">运行设备数</div>
      <div class="stat-value">6<span class="stat-unit"> / 8 台</span></div>
      <div class="stat-trend up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg> 较昨日 +1</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--teal-light)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      </div>
      <div class="stat-label">本周已清面积</div>
      <div class="stat-value">18.6<span class="stat-unit"> km²</span></div>
      <div class="stat-trend up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg> 较上周 +12%</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--amber-light)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </div>
      <div class="stat-label">累计回收量</div>
      <div class="stat-value">2,840<span class="stat-unit"> kg</span></div>
      <div class="stat-trend up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg> 较上月 +18%</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--coral-light)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--coral)" stroke-width="2"><rect x="2" y="7" width="18" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="14" y1="11" x2="14" y2="13"/></svg>
      </div>
      <div class="stat-label">平均电能负载</div>
      <div class="stat-value">64<span class="stat-unit"> %</span></div>
      <div class="stat-trend down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg> 较昨日 -3%</div>
    </div>
  </div>

  <div class="grid-2-1" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header">
        <h3>全域实时轨迹分布</h3>
        <div style="display:flex;gap:8px">
          <span class="badge badge-success"><span class="badge-dot" style="background:#0F6E56"></span>在线 6</span>
          <span class="badge badge-warning"><span class="badge-dot" style="background:#BA7517"></span>充电 2</span>
          <span class="badge badge-danger"><span class="badge-dot" style="background:#E24B4A"></span>离线 1</span>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="map-container" id="dashboardMap" style="height:380px;border:none;border-radius:0">
          <div class="map-grid"></div>
          ${renderRiverMap()}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>关键系统通知</h3>
        <span class="btn-text" onclick="navigate('alerts')">查看全部</span>
      </div>
      <div class="notif-list">
        ${mockAlerts.filter(a=>a.status==='active').map(a => `
          <div class="notif-item" onclick="navigate('alerts')">
            <div class="notif-dot" style="background:${a.level==='danger'?'#E24B4A':a.level==='warning'?'#BA7517':'#185FA5'}"></div>
            <div class="notif-content">
              <div class="notif-title">${a.type} - ${a.device}</div>
              <div class="notif-desc">${a.desc}</div>
            </div>
            <div class="notif-time">${a.time.split(' ')[1]}</div>
          </div>
        `).join('')}
        ${mockAlerts.filter(a=>a.status==='resolved').slice(0,2).map(a => `
          <div class="notif-item" style="opacity:0.6">
            <div class="notif-dot" style="background:var(--gray-400)"></div>
            <div class="notif-content">
              <div class="notif-title">${a.type} - ${a.device}</div>
              <div class="notif-desc">${a.desc}</div>
            </div>
            <div class="notif-time">${a.time.split(' ')[1]}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header">
        <h3>环境指数监测</h3>
        <span class="tag">实时</span>
      </div>
      <div class="card-body">
        <div class="grid-3" style="margin-bottom:16px">
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:24px;font-weight:600;color:var(--teal)">7.2</div>
            <div style="font-size:12px;color:var(--gray-600)">pH 酸碱度</div>
            <div style="font-size:11px;color:var(--green)">正常范围</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:24px;font-weight:600;color:var(--primary)">6.8</div>
            <div style="font-size:12px;color:var(--gray-600)">溶解氧 mg/L</div>
            <div style="font-size:11px;color:var(--green)">正常范围</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px">
            <div style="font-size:24px;font-weight:600;color:var(--amber)">15.3</div>
            <div style="font-size:12px;color:var(--gray-600)">感光浊度 NTU</div>
            <div style="font-size:11px;color:var(--amber)">轻度浑浊</div>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="envChart" role="img" aria-label="环境监测趋势图"></canvas>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>水质研报</h3>
        <span class="tag">5年数据</span>
      </div>
      <div class="card-body">
        <div style="margin-bottom:16px">
          <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">总磷趋势 (mg/L)</div>
          <div class="chart-container-sm">
            <canvas id="phosphorusChart" role="img" aria-label="总磷趋势图"></canvas>
          </div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">总氮趋势 (mg/L)</div>
          <div class="chart-container-sm">
            <canvas id="nitrogenChart" role="img" aria-label="总氮趋势图"></canvas>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

pageInit['dashboard'] = () => {
  setTimeout(() => {
    // Environment chart
    new Chart(document.getElementById('envChart'), {
      type:'line',
      data:{ labels:['00:00','04:00','08:00','12:00','16:00','20:00'], datasets:[
        { label:'pH', data:[7.1,7.0,7.2,7.3,7.2,7.1], borderColor:'#0F6E56', tension:0.4, fill:false },
        { label:'溶解氧', data:[7.0,6.9,6.8,6.7,6.8,7.0], borderColor:'#185FA5', tension:0.4, fill:false },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,position:'bottom',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:false}} }
    });
    // Phosphorus
    new Chart(document.getElementById('phosphorusChart'), {
      type:'line',
      data:{ labels:['2022','2023','2024','2025','2026'], datasets:[
        { label:'总磷', data:[0.18,0.15,0.12,0.10,0.08], borderColor:'#BA7517', backgroundColor:'rgba(186,117,23,0.1)', tension:0.4, fill:true },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
    // Nitrogen
    new Chart(document.getElementById('nitrogenChart'), {
      type:'line',
      data:{ labels:['2022','2023','2024','2025','2026'], datasets:[
        { label:'总氮', data:[2.1,1.8,1.5,1.3,1.1], borderColor:'#185FA5', backgroundColor:'rgba(24,95,165,0.1)', tension:0.4, fill:true },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
    // 初始化高德实时轨迹地图
    initDashboardMap();
  }, 100);
};

/* ============ 设备编队 Fleet ============ */
views['fleet'] = () => `
  <div class="page-title">设备编队</div>
  <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
    <div style="display:flex;gap:8px">
      <button class="btn btn-outline btn-sm" onclick="filterFleet('all')">全部 (${mockDevices.length})</button>
      <button class="btn btn-outline btn-sm" onclick="filterFleet('online')">在线 (${mockDevices.filter(d=>d.status==='online').length})</button>
      <button class="btn btn-outline btn-sm" onclick="filterFleet('charging')">充电中 (${mockDevices.filter(d=>d.status==='charging').length})</button>
      <button class="btn btn-outline btn-sm" onclick="filterFleet('offline')">离线 (${mockDevices.filter(d=>d.status==='offline').length})</button>
    </div>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showFleetAssignModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      编入新设备
    </button>
  </div>
  <div class="fleet-grid" id="fleetGrid">
    ${mockDevices.map(d => fleetCardHTML(d)).join('')}
  </div>
`;

let currentFleetFilter = 'all';
function filterFleet(filter) {
  currentFleetFilter = filter;
  const grid = document.getElementById('fleetGrid');
  if (!grid) return;
  const filtered = filter==='all' ? mockDevices : mockDevices.filter(d=>d.status===filter);
  grid.innerHTML = filtered.map(d => fleetCardHTML(d)).join('');
}

function fleetCardHTML(d) {
  const s = statusMap[d.status];
  const battColor = d.battery>50?'#0F6E56':d.battery>20?'#BA7517':'#E24B4A';
  return `
  <div class="fleet-card" onclick="navigate('device-detail','${d.id}')">
    <div class="fleet-header">
      <span class="fleet-name">${d.name}</span>
      <span class="badge ${s.cls}"><span class="badge-dot" style="background:${s.dot}"></span>${s.label}</span>
    </div>
    <div style="font-size:12px;color:var(--gray-500);margin-bottom:10px">${d.id} · ${d.water}</div>
    <div class="fleet-body">
      <div class="fleet-item">
        <div class="label">电量</div>
        <div class="value">${d.battery}%</div>
        <div class="battery-bar"><div class="battery-fill" style="width:${d.battery}%;background:${battColor}"></div></div>
      </div>
      <div class="fleet-item">
        <div class="label">垃圾舱容</div>
        <div class="value">${d.cabin}%</div>
        <div class="battery-bar"><div class="battery-fill" style="width:${d.cabin}%;background:${d.cabin>80?'#E24B4A':d.cabin>50?'#BA7517':'#0F6E56'}"></div></div>
      </div>
      <div class="fleet-item">
        <div class="label">工作里程</div>
        <div class="value">${d.mileage} km</div>
      </div>
      <div class="fleet-item">
        <div class="label">当前速度</div>
        <div class="value">${d.speed} m/s</div>
      </div>
    </div>
  </div>`;
}

function showFleetAssignModal() {
  showModal('编入新设备', `
    <div class="form-row">
      <div class="form-group">
        <label>选择设备</label>
        <select><option>清澜一号 (AC-001)</option><option>清澜二号 (AC-002)</option><option>清澜三号 (AC-003)</option></select>
      </div>
      <div class="form-group">
        <label>绑定水域</label>
        <select><option>苏州河-黄浦段</option><option>淀山湖-东区</option><option>黄浦江-徐汇段</option></select>
      </div>
    </div>
    <div class="form-group">
      <label>清洁区域划分</label>
      <div style="height:200px;background:var(--gray-50);border:1px dashed var(--gray-400);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray-500);font-size:13px">
        在地图上拖拽绘制清洁区域范围
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>区域名称</label>
        <input type="text" placeholder="如：A区-北段">
      </div>
      <div class="form-group">
        <label>优先级</label>
        <select><option>高</option><option>中</option><option>低</option></select>
      </div>
    </div>
  `, () => { closeModal(); });
}

/* ============ 设备列表 Devices ============ */
views['devices'] = () => `
  <div class="page-title">设备列表</div>
  <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
    <input type="text" placeholder="搜索设备名称或ID..." style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;width:240px" id="deviceSearchInput" oninput="filterDevices()">
    <select style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px" onchange="filterDevices(this.value)">
      <option value="">全部状态</option>
      <option value="online">在线</option>
      <option value="charging">充电中</option>
      <option value="offline">离线</option>
    </select>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showDeviceAddModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      添加设备
    </button>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>设备ID</th>
            <th>设备名称</th>
            <th>状态</th>
            <th>所在水域</th>
            <th>电量</th>
            <th>垃圾舱容</th>
            <th>工作里程</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="deviceTableBody">
          ${renderDeviceRows(mockDevices)}
        </tbody>
      </table>
    </div>
    <div class="table-pagination">
      <span>共 ${mockDevices.length} 条记录</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-outline btn-sm">上一页</button>
        <button class="btn btn-primary btn-sm">1</button>
        <button class="btn btn-outline btn-sm">下一页</button>
      </div>
    </div>
  </div>
`;

function renderDeviceRows(devices) {
  return devices.map(d => {
    const s = statusMap[d.status];
    const battColor = d.battery>50?'#0F6E56':d.battery>20?'#BA7517':'#E24B4A';
    return `<tr>
      <td>${d.id}</td>
      <td><span style="font-weight:500">${d.name}</span></td>
      <td><span class="badge ${s.cls}"><span class="badge-dot" style="background:${s.dot}"></span>${s.label}</span></td>
      <td>${d.water}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:40px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden"><div style="height:100%;width:${d.battery}%;background:${battColor};border-radius:3px"></div></div>
          <span style="font-size:12px">${d.battery}%</span>
        </div>
      </td>
      <td>${d.cabin}%</td>
      <td>${d.mileage} km</td>
      <td>
        <button class="btn-text" onclick="navigate('device-detail','${d.id}')">详情</button>
        <button class="btn-text" onclick="showDeviceEditModal('${d.id}')">编辑</button>
        <button class="btn-text danger" onclick="confirmDelete('${d.name}')">删除</button>
      </td>
    </tr>`;
  }).join('');
}

function filterDevices() {
  const q = document.getElementById('deviceSearchInput')?.value || '';
  const filtered = mockDevices.filter(d => d.name.includes(q) || d.id.includes(q));
  document.getElementById('deviceTableBody').innerHTML = renderDeviceRows(filtered);
}

function showDeviceAddModal() {
  showModal('添加设备', `
    <div class="form-row">
      <div class="form-group">
        <label>设备ID</label>
        <input type="text" placeholder="如：AC-009">
      </div>
      <div class="form-group">
        <label>设备名称</label>
        <input type="text" placeholder="如：清澜九号">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>设备型号</label>
        <select><option>AquaClean-2000</option><option>AquaClean-3000</option><option>AquaClean-5000</option></select>
      </div>
      <div class="form-group">
        <label>所属水域</label>
        <select>${mockWaterAreas.map(w=>`<option>${w.name}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>SIM/通信卡号</label>
        <input type="text" placeholder="设备通信卡号">
      </div>
      <div class="form-group">
        <label>初始坐标</label>
        <input type="text" placeholder="纬度,经度">
      </div>
    </div>
  `, () => { closeModal(); });
}

function showDeviceEditModal(id) {
  const d = mockDevices.find(x=>x.id===id);
  showModal('编辑设备 - '+d.name, `
    <div class="form-row">
      <div class="form-group">
        <label>设备名称</label>
        <input type="text" value="${d.name}">
      </div>
      <div class="form-group">
        <label>所属水域</label>
        <select>${mockWaterAreas.map(w=>`<option ${w.name===d.water?'selected':''}>${w.name}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>设备状态</label>
        <select><option ${d.status==='online'?'selected':''}>在线</option><option ${d.status==='offline'?'selected':''}>离线</option><option ${d.status==='charging'?'selected':''}>充电中</option></select>
      </div>
    </div>
  `, () => { closeModal(); });
}

/* ============ 设备详情 Device Detail ============ */
views['device-detail'] = () => `
  <div class="page-title-row">
    <div class="page-title">设备详情 - ${getCurrentDevice().name}</div>
    <div class="device-switcher">
      <span class="device-switcher-label">切换设备</span>
      <select id="deviceSwitcher" class="device-select" onchange="switchDetailDevice(this.value)">
        ${mockDevices.map(d => {
          const st = statusMap[d.status] || {label:''};
          return `<option value="${d.id}" ${d.id===currentDeviceId?'selected':''}>${d.name}（${st.label}）</option>`;
        }).join('')}
      </select>
    </div>
  </div>
  <div class="tabs" id="deviceDetailTabs">
    <div class="tab active" data-tab="overview" onclick="switchDeviceTab('overview',this)">设备总览</div>
    <div class="tab" data-tab="map" onclick="switchDeviceTab('map',this)">在线地图</div>
    <div class="tab" data-tab="dock" onclick="switchDeviceTab('dock',this)">智能船坞</div>
    <div class="tab" data-tab="quality" onclick="switchDeviceTab('quality',this)">水质报告</div>
    <div class="tab" data-tab="depth" onclick="switchDeviceTab('depth',this)">水深图</div>
    <div class="tab" data-tab="pointcloud" onclick="switchDeviceTab('pointcloud',this)">河岸三维地图</div>
    <div class="tab" data-tab="camera" onclick="switchDeviceTab('camera',this)">监控摄像头</div>
    <div class="tab" data-tab="area" onclick="switchDeviceTab('area',this)">清洁区域</div>
    <div class="tab" data-tab="inspection" onclick="switchDeviceTab('inspection',this)">巡查情况</div>
  </div>
  <div id="deviceTabContent"></div>
`;

pageInit['device-detail'] = () => {
  switchDeviceTab('overview', document.querySelector('#deviceDetailTabs .tab'));
};

function switchDeviceTab(tab, el) {
  document.querySelectorAll('#deviceDetailTabs .tab').forEach(t=>t.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('deviceTabContent');
  if (!content) return;

  const d = getCurrentDevice();
  const s = statusMap[d.status];

  if (tab==='overview') {
    content.innerHTML = `
      <div class="grid-2-1" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header"><h3>设备信息总览</h3><span class="badge ${s.cls}"><span class="badge-dot" style="background:${s.dot}"></span>${s.label}</span></div>
          <div class="card-body">
            <div class="grid-3">
              <div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:8px">
                <div style="font-size:28px;font-weight:600;color:var(--teal)">${d.battery}%</div>
                <div style="font-size:12px;color:var(--gray-600)">电池电量</div>
              </div>
              <div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:8px">
                <div style="font-size:28px;font-weight:600;color:var(--amber)">${d.cabin}%</div>
                <div style="font-size:12px;color:var(--gray-600)">垃圾清理量</div>
              </div>
              <div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:8px">
                <div style="font-size:28px;font-weight:600;color:var(--primary)">${d.mileage}</div>
                <div style="font-size:12px;color:var(--gray-600)">工作里程(km)</div>
              </div>
            </div>
            <div style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                <span style="color:var(--gray-600);font-size:13px">设备ID</span>
                <span style="font-weight:500">${d.id}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                <span style="color:var(--gray-600);font-size:13px">设备型号</span>
                <span style="font-weight:500">AquaClean-3000</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                <span style="color:var(--gray-600);font-size:13px">所在水域</span>
                <span style="font-weight:500">${d.water}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                <span style="color:var(--gray-600);font-size:13px">船舱进水状态</span>
                <span class="badge badge-success">正常</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                <span style="color:var(--gray-600);font-size:13px">最后心跳</span>
                <span style="font-weight:500">2026-07-10 11:48:30</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0">
                <span style="color:var(--gray-600);font-size:13px">GPS定位</span>
                <span style="font-weight:500">${d.lat}N, ${d.lng}E</span>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>交互控制面板</h3>
            <span id="mqttStatus" class="mqtt-status"><span class="mqtt-dot" style="background:${({ok:'#0F6E56',warn:'#BA7517',error:'#E24B4A'}[mqttStatusState.state]||'#999')}"></span>${mqttStatusState.text}</span>
          </div>
          <div class="card-body">
            <div class="control-grid">
              <button class="btn btn-primary" onclick="sendDeviceCommand('start')">启动设备</button>
              <button class="btn btn-outline" onclick="sendDeviceCommand('stop')">停止设备</button>
              <button class="btn btn-outline" onclick="sendDeviceCommand('return')">返航充电</button>
              <button class="btn btn-outline" onclick="sendDeviceCommand('clean')">清理垃圾舱</button>
              <button class="btn btn-danger" onclick="sendDeviceCommand('estop')">紧急停机</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>指令发送记录</h3><span class="tag">最近 ${Math.min(commandLog.length, 50)} 条 · 用于抓包核对</span></div>
        <div class="card-body">
          <div class="table-wrapper">
            <table class="command-log">
              <thead>
                <tr><th>序号</th><th>时间</th><th>设备</th><th>指令</th><th>Topic</th><th>状态</th></tr>
              </thead>
              <tbody id="commandLogBody"></tbody>
            </table>
          </div>
        </div>
      </div>
<div class="card">
        <div class="card-header"><h3>实时遥测数据</h3><span class="tag">每5秒更新</span></div>
        <div class="card-body">
          <div class="chart-container">
            <canvas id="telemetryChart" role="img" aria-label="实时遥测数据图"></canvas>
          </div>
        </div>
      </div>
    `;
    renderCommandLog();
    if (typeof renderMqttStatus === 'function') renderMqttStatus();
    setTimeout(() => {
      new Chart(document.getElementById('telemetryChart'), {
        type:'line',
        data:{ labels:['10:30','10:40','10:50','11:00','11:10','11:20','11:30','11:40'], datasets:[
          { label:'速度(m/s)', data:[1.0,1.2,0.8,1.1,1.3,1.0,1.2,1.1], borderColor:'#185FA5', tension:0.4, fill:false },
          { label:'电量(%)', data:[90,88,87,86,86,85,85,85], borderColor:'#0F6E56', tension:0.4, fill:false, yAxisID:'y1' },
        ]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,position:'bottom',labels:{font:{size:11}}}}, scales:{ y:{position:'left',title:{display:true,text:'速度'}}, y1:{position:'right',title:{display:true,text:'电量%'},grid:{drawOnChartArea:false}} } }
      });
    }, 100);
  }
  else if (tab==='map') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>在线地图 - ${d.name}</h3>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="alert('沿岸任务已启动')">启动沿岸任务</button>
            <button class="btn btn-outline btn-sm" onclick="alert('任务已停止')">停止任务</button>
            <button class="btn btn-outline btn-sm" onclick="alert('请点击地图绘制航线')">规划航线</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="map-container" id="deviceMapBox" style="height:500px;border:none;border-radius:0;position:relative">
            <div id="deviceAmapContainer" style="position:absolute;inset:0;z-index:2"></div>
            <div id="deviceAmapFallback" style="position:absolute;inset:0;z-index:1">
              <div class="map-grid"></div>
              ${renderDeviceMapDetailFallback(d)}
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>航线规划</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:16px">
            <div style="flex:1">
              <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">已规划航线</div>
              <div class="table-wrapper">
                <table>
                  <thead><tr><th>航线编号</th><th>类型</th><th>长度</th><th>预计耗时</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr><td>R-001</td><td>折线</td><td>1.2 km</td><td>15分钟</td><td><button class="btn-text">查看</button> <button class="btn-text danger">删除</button></td></tr>
                    <tr><td>R-002</td><td>区域</td><td>0.8 km²</td><td>25分钟</td><td><button class="btn-text">查看</button> <button class="btn-text danger">删除</button></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    initDeviceDetailMap();
  }
  else if (tab==='dock') {
    content.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>三维轮廓地图</h3><span class="tag">激光雷达数据</span></div>
          <div class="card-body">
            <div class="three-d-container" style="height:300px">
              ${render3DDockView()}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>对接位置摄像头</h3><span class="badge badge-danger"><span class="badge-dot" style="background:#E24B4A"></span>LIVE</span></div>
          <div class="card-body">
            <div class="video-container">
              <div class="recording"><div class="rec-dot"></div><span style="color:#fff;font-size:12px">REC</span></div>
              <svg width="200" height="120" viewBox="0 0 200 120">
                <rect x="0" y="0" width="200" height="120" fill="#0a0a1a"/>
                <rect x="20" y="20" width="160" height="80" fill="none" stroke="#333" stroke-width="2" rx="4"/>
                <rect x="30" y="30" width="140" height="60" fill="#111" rx="2"/>
                <circle cx="100" cy="60" r="20" fill="none" stroke="#185FA5" stroke-width="2" opacity="0.5"/>
                <circle cx="100" cy="60" r="10" fill="#185FA5" opacity="0.3"/>
                <text x="100" y="64" text-anchor="middle" fill="#666" font-size="10">DOCK CAM</text>
                <text x="10" y="115" fill="#666" font-size="8">2026-07-10 11:48:30</text>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>船坞信息</h3></div>
        <div class="card-body">
          <div class="grid-3">
            <div style="padding:16px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">基站停泊状态</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="badge badge-success"><span class="badge-dot" style="background:#0F6E56"></span>已停泊</span>
              </div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:8px">停靠时间：2026-07-09 18:30</div>
            </div>
            <div style="padding:16px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">太阳能供电矩阵</div>
              <div style="font-size:24px;font-weight:600;color:var(--amber)">48<span style="font-size:14px;color:var(--gray-600)"> V</span></div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:4px">充电功率: 120W</div>
              <div class="progress" style="margin-top:8px"><div class="progress-fill" style="width:75%;background:var(--amber)"></div></div>
            </div>
            <div style="padding:16px;background:var(--gray-50);border-radius:8px">
              <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">站内垃圾回收池满载率</div>
              <div style="font-size:24px;font-weight:600;color:var(--coral)">72<span style="font-size:14px;color:var(--gray-600)"> %</span></div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:4px">容量: 360/500 kg</div>
              <div class="progress" style="margin-top:8px"><div class="progress-fill" style="width:72%;background:var(--coral)"></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  else if (tab==='quality') {
    content.innerHTML = `
      <div class="grid-3" style="margin-bottom:16px">
        <div class="card"><div class="card-body" style="text-align:center">
          <div style="font-size:32px;font-weight:600;color:var(--teal)">7.2</div>
          <div style="font-size:12px;color:var(--gray-600)">pH 酸碱度</div>
          <div style="font-size:11px;color:var(--green);margin-top:4px">正常 (6.5-8.5)</div>
        </div></div>
        <div class="card"><div class="card-body" style="text-align:center">
          <div style="font-size:32px;font-weight:600;color:var(--primary)">6.8</div>
          <div style="font-size:12px;color:var(--gray-600)">溶解氧 (mg/L)</div>
          <div style="font-size:11px;color:var(--green);margin-top:4px">正常 (>5.0)</div>
        </div></div>
        <div class="card"><div class="card-body" style="text-align:center">
          <div style="font-size:32px;font-weight:600;color:var(--amber)">15.3</div>
          <div style="font-size:12px;color:var(--gray-600)">感光浊度 (NTU)</div>
          <div style="font-size:11px;color:var(--amber);margin-top:4px">轻度浑浊 (<10正常)</div>
        </div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>河流水质检测趋势</h3>
          <div style="display:flex;gap:4px">
            <button class="btn btn-outline btn-sm" onclick="switchQualityRange(this,'day')">单日</button>
            <button class="btn btn-primary btn-sm" onclick="switchQualityRange(this,'month')">单月</button>
            <button class="btn btn-outline btn-sm" onclick="switchQualityRange(this,'year')">年度</button>
          </div>
        </div>
        <div class="card-body">
          <div class="chart-container">
            <canvas id="qualityChart" role="img" aria-label="水质检测趋势图"></canvas>
          </div>
          <div style="margin-top:16px;padding:12px;background:var(--primary-light);border-radius:8px;font-size:12px;color:var(--primary-dark)">
            数据保存策略：最多保存5年的历史检测数据。可通过时间选择器切换查看不同时间段的趋势。
          </div>
        </div>
      </div>
    `;
    setTimeout(() => {
      new Chart(document.getElementById('qualityChart'), {
        type:'line',
        data:{ labels:['1日','5日','10日','15日','20日','25日','30日'], datasets:[
          { label:'pH值', data:[7.0,7.1,7.2,7.3,7.1,7.2,7.2], borderColor:'#0F6E56', tension:0.4, fill:false },
          { label:'溶解氧(mg/L)', data:[7.2,7.0,6.8,6.7,6.9,6.8,6.8], borderColor:'#185FA5', tension:0.4, fill:false },
          { label:'浊度(NTU)', data:[12,14,15,16,14,15,15], borderColor:'#BA7517', tension:0.4, fill:false, yAxisID:'y1' },
        ]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,position:'bottom',labels:{font:{size:11}}}}, scales:{ y:{position:'left'}, y1:{position:'right',grid:{drawOnChartArea:false}} } }
      });
    }, 100);
  }
  else if (tab==='depth') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>水深热力图</h3><span class="tag">${d.water}</span></div>
        <div class="card-body" style="padding:0">
          <div class="heatmap-container" style="height:450px;border-radius:0">
            ${renderDepthHeatmap()}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>水深数据统计</h3></div>
        <div class="card-body">
          <div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600;color:var(--primary)">3.2</div><div style="font-size:12px;color:var(--gray-600)">最浅(m)</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600;color:var(--primary)">8.5</div><div style="font-size:12px;color:var(--gray-600)">最深(m)</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600;color:var(--primary)">5.8</div><div style="font-size:12px;color:var(--gray-600)">平均(m)</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600;color:var(--amber)">2</div><div style="font-size:12px;color:var(--gray-600)">浅点预警</div></div>
          </div>
        </div>
      </div>
    `;
  }
  else if (tab==='pointcloud') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>河岸三维地图</h3><span class="tag">点云数据</span></div>
        <div class="card-body" style="padding:0">
          <div class="three-d-container" style="height:500px;border-radius:0">
            ${render3DPointCloud()}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>扫描数据信息</h3></div>
        <div class="card-body">
          <div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600">2.4M</div><div style="font-size:12px;color:var(--gray-600)">点云数量</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600">1.2 km</div><div style="font-size:12px;color:var(--gray-600)">扫描长度</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600">2026-07-09</div><div style="font-size:12px;color:var(--gray-600)">最后扫描</div></div>
            <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:20px;font-weight:600;color:var(--green)">正常</div><div style="font-size:12px;color:var(--gray-600)">河岸状态</div></div>
          </div>
        </div>
      </div>
    `;
  }
  else if (tab==='camera') {
    content.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>前置摄像头</h3><span class="badge badge-danger"><span class="badge-dot" style="background:#E24B4A"></span>LIVE</span></div>
          <div class="card-body">
            <div class="video-container">${renderCameraView('前置摄像头','FRONT CAM')}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>后置摄像头</h3><span class="badge badge-danger"><span class="badge-dot" style="background:#E24B4A"></span>LIVE</span></div>
          <div class="card-body">
            <div class="video-container">${renderCameraView('后置摄像头','REAR CAM')}</div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>摄像头参数</h3></div>
        <div class="card-body">
          <div class="grid-3">
            <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">分辨率</div><div style="font-weight:500;margin-top:4px">1920 x 1080</div></div>
            <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">帧率</div><div style="font-weight:500;margin-top:4px">30 fps</div></div>
            <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">编码格式</div><div style="font-weight:500;margin-top:4px">H.265</div></div>
          </div>
        </div>
      </div>
    `;
  }
  else if (tab==='area') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>清洁区域划分</h3><button class="btn btn-primary btn-sm" onclick="alert('请在地图上绘制新区域')">新增区域</button></div>
        <div class="card-body" style="padding:0">
          <div class="map-container" style="height:400px;border:none;border-radius:0">
            <div class="map-grid"></div>
            ${renderCleaningAreaMap()}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>区域列表</h3></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>区域名称</th><th>面积</th><th>覆盖状态</th><th>作业状态</th><th>分配状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr><td>A区-北段</td><td>0.8 km²</td><td><span class="badge badge-success">已覆盖</span></td><td><span class="badge badge-info">作业中</span></td><td>${d.name}</td><td><button class="btn-text">编辑</button></td></tr>
              <tr><td>B区-南段</td><td>0.6 km²</td><td><span class="badge badge-warning">部分覆盖</span></td><td><span class="badge badge-gray">待作业</span></td><td>${d.name}</td><td><button class="btn-text">编辑</button></td></tr>
              <tr><td>C区-东段</td><td>1.1 km²</td><td><span class="badge badge-gray">未覆盖</span></td><td><span class="badge badge-gray">待作业</span></td><td>未分配</td><td><button class="btn-text">编辑</button></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  else if (tab==='inspection') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>异常录像列表</h3><span class="tag">最近30天</span></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>录像编号</th><th>时间</th><th>异常类型</th><th>描述</th><th>时长</th><th>操作</th></tr></thead>
            <tbody>
              <tr><td>REC-001</td><td>2026-07-10 09:15</td><td><span class="badge badge-danger">障碍物</span></td><td>检测到水面漂浮大型障碍物</td><td>02:30</td><td><button class="btn-text" onclick="alert('播放录像REC-001')">查看录像</button></td></tr>
              <tr><td>REC-002</td><td>2026-07-09 14:20</td><td><span class="badge badge-warning">水质异常</span></td><td>水域颜色异常，浊度突增</td><td>05:12</td><td><button class="btn-text" onclick="alert('播放录像REC-002')">查看录像</button></td></tr>
              <tr><td>REC-003</td><td>2026-07-08 10:30</td><td><span class="badge badge-danger">垃圾堆积</span></td><td>河岸拐角处发现大量垃圾堆积</td><td>03:45</td><td><button class="btn-text" onclick="alert('播放录像REC-003')">查看录像</button></td></tr>
              <tr><td>REC-004</td><td>2026-07-07 16:00</td><td><span class="badge badge-warning">设备偏航</span></td><td>设备偏离预定航线超过5米</td><td>01:20</td><td><button class="btn-text" onclick="alert('播放录像REC-004')">查看录像</button></td></tr>
              <tr><td>REC-005</td><td>2026-07-05 11:45</td><td><span class="badge badge-info">水面波动</span></td><td>检测到异常水面波动</td><td>02:00</td><td><button class="btn-text" onclick="alert('播放录像REC-005')">查看录像</button></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

function render3DDockView() {
  let html = '<svg width="100%" height="100%" viewBox="0 0 400 300">';
  for(let i=0;i<=10;i++){ html += `<line x1="${i*40}" y1="0" x2="${i*40}" y2="300" stroke="rgba(127,119,221,0.1)" stroke-width="0.5"/>`; }
  for(let i=0;i<=8;i++){ html += `<line x1="0" y1="${i*37.5}" x2="400" y2="${i*37.5}" stroke="rgba(127,119,221,0.1)" stroke-width="0.5"/>`; }
  html += '<polygon points="80,200 320,200 360,120 120,120" fill="rgba(127,119,221,0.2)" stroke="#7F77DD" stroke-width="1.5"/>';
  html += '<polygon points="120,120 360,120 340,80 100,80" fill="rgba(127,119,221,0.15)" stroke="#7F77DD" stroke-width="1"/>';
  html += '<polygon points="80,200 320,200 300,240 60,240" fill="rgba(127,119,221,0.1)" stroke="#7F77DD" stroke-width="1"/>';
  html += '<rect x="180" y="160" width="40" height="30" fill="#185FA5" opacity="0.8" rx="4"/>';
  html += '<rect x="185" y="155" width="30" height="10" fill="#0F6E56" opacity="0.8" rx="2"/>';
  for(let i=0;i<3;i++){ html += `<circle cx="200" cy="175" r="${30+i*20}" fill="none" stroke="#0F6E56" stroke-width="1" opacity="${0.3-i*0.1}"/>`; }
  html += '<text x="200" y="280" text-anchor="middle" fill="#888" font-size="10">LiDAR 3D Point Cloud - Dock View</text>';
  html += '</svg>';
  return html;
}

function render3DPointCloud() {
  let html = '<svg width="100%" height="100%" viewBox="0 0 800 500">';
  for(let i=0;i<20;i++){
    const opacity = 0.02 + i*0.003;
    html += `<rect x="0" y="${i*25}" width="800" height="25" fill="rgba(127,119,221,${opacity})"/>`;
  }
  html += '<path d="M0 250 Q200 220 400 260 Q600 300 800 240" fill="none" stroke="#378ADD" stroke-width="40" stroke-linecap="round" opacity="0.3"/>';
  for(let i=0;i<200;i++){
    const x = Math.random()*800;
    const y = 100 + Math.random()*300;
    const isRiver = y > 220 && y < 280;
    const color = isRiver ? '#378ADD' : (y < 220 ? '#0F6E56' : '#7F77DD');
    const size = 1 + Math.random()*2;
    html += `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="${0.3+Math.random()*0.5}"/>`;
  }
  html += '<path d="M0 220 Q200 195 400 230 Q600 265 800 210" fill="none" stroke="#0F6E56" stroke-width="1.5" opacity="0.6"/>';
  html += '<path d="M0 280 Q200 255 400 290 Q600 325 800 270" fill="none" stroke="#7F77DD" stroke-width="1.5" opacity="0.6"/>';
  html += '<text x="400" y="30" text-anchor="middle" fill="#ccc" font-size="12">河岸三维点云地图 - 苏州河黄浦段</text>';
  html += '<text x="100" y="180" fill="#0F6E56" font-size="10" opacity="0.8">北岸</text>';
  html += '<text x="100" y="320" fill="#7F77DD" font-size="10" opacity="0.8">南岸</text>';
  html += '<text x="400" y="260" text-anchor="middle" fill="#378ADD" font-size="10" opacity="0.8">河道</text>';
  html += '</svg>';
  return html;
}

function renderCameraView(name, label) {
  return `
    <div class="recording"><div class="rec-dot"></div><span style="color:#fff;font-size:12px">REC</span></div>
    <svg width="280" height="180" viewBox="0 0 280 180">
      <rect width="280" height="180" fill="#0a0a1a"/>
      <rect x="10" y="10" width="260" height="160" fill="#0d0d20" rx="4"/>
      <rect x="20" y="60" width="240" height="100" fill="#0a1a2a" rx="2"/>
      <path d="M20 80 Q60 75 100 80 T180 80 T260 80" fill="none" stroke="#1a3a5a" stroke-width="1"/>
      <path d="M20 100 Q60 95 100 100 T180 100 T260 100" fill="none" stroke="#1a3a5a" stroke-width="1"/>
      <path d="M20 120 Q60 115 100 120 T180 120 T260 120" fill="none" stroke="#1a3a5a" stroke-width="1"/>
      <path d="M20 140 Q60 135 100 140 T180 140 T260 140" fill="none" stroke="#1a3a5a" stroke-width="1"/>
      <rect x="100" y="50" width="80" height="20" fill="#185FA5" opacity="0.6" rx="4"/>
      <circle cx="60" cy="90" r="4" fill="#5a4a2a" opacity="0.7"/>
      <circle cx="180" cy="110" r="3" fill="#5a4a2a" opacity="0.7"/>
      <circle cx="220" cy="130" r="5" fill="#5a4a2a" opacity="0.7"/>
      <text x="20" y="25" fill="#666" font-size="9">${label}</text>
      <text x="260" y="25" text-anchor="end" fill="#666" font-size="9">2026-07-10 11:48:30</text>
      <text x="20" y="170" fill="#666" font-size="8">LAT:${getCurrentDevice().lat} LNG:${getCurrentDevice().lng}</text>
      <text x="260" y="170" text-anchor="end" fill="#0F6E56" font-size="8">SIGNAL: ${getCurrentDevice().battery}%</text>
    </svg>
  `;
}

function renderDepthHeatmap() {
  let html = '<svg width="100%" height="100%" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">';
  html += '<rect width="800" height="450" fill="#E8F0FE"/>';
  html += '<path d="M0 225 Q200 200 400 235 Q600 270 800 215 L800 235 Q600 290 400 255 Q200 220 0 245 Z" fill="#B5D4F4"/>';
  const zones = [
    {x:50,y:225,color:'#F0997B',opacity:0.6,r:40},
    {x:150,y:230,color:'#FAC775',opacity:0.5,r:50},
    {x:280,y:220,color:'#5DCAA5',opacity:0.6,r:45},
    {x:400,y:245,color:'#378ADD',opacity:0.7,r:55},
    {x:520,y:225,color:'#5DCAA5',opacity:0.5,r:40},
    {x:650,y:240,color:'#FAC775',opacity:0.6,r:50},
    {x:750,y:220,color:'#F0997B',opacity:0.5,r:35},
  ];
  zones.forEach(z => {
    html += `<ellipse cx="${z.x}" cy="${z.y}" rx="${z.r}" ry="${z.r*0.6}" fill="${z.color}" opacity="${z.opacity}"/>`;
  });
  html += '<text x="50" y="225" text-anchor="middle" fill="#fff" font-size="11" font-weight="500">3.2m</text>';
  html += '<text x="150" y="230" text-anchor="middle" fill="#333" font-size="11" font-weight="500">4.5m</text>';
  html += '<text x="280" y="220" text-anchor="middle" fill="#333" font-size="11" font-weight="500">6.0m</text>';
  html += '<text x="400" y="245" text-anchor="middle" fill="#fff" font-size="11" font-weight="500">8.5m</text>';
  html += '<text x="520" y="225" text-anchor="middle" fill="#333" font-size="11" font-weight="500">5.5m</text>';
  html += '<text x="650" y="240" text-anchor="middle" fill="#333" font-size="11" font-weight="500">4.2m</text>';
  html += '<text x="750" y="220" text-anchor="middle" fill="#fff" font-size="11" font-weight="500">3.5m</text>';
  html += '<rect x="20" y="410" width="200" height="20" fill="#fff" opacity="0.8" rx="4"/>';
  html += '<rect x="25" y="415" width="30" height="10" fill="#F0997B" rx="2"/>';
  html += '<text x="60" y="424" fill="#333" font-size="10">浅</text>';
  html += '<rect x="75" y="415" width="30" height="10" fill="#FAC775" rx="2"/>';
  html += '<rect x="110" y="415" width="30" height="10" fill="#5DCAA5" rx="2"/>';
  html += '<rect x="145" y="415" width="30" height="10" fill="#378ADD" rx="2"/>';
  html += '<text x="180" y="424" fill="#333" font-size="10">深</text>';
  html += '</svg>';
  return html;
}

function renderCleaningAreaMap() {
  let html = '<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">';
  html += '<path d="M0 200 Q200 180 400 210 Q600 240 800 190" fill="none" stroke="#85B7EB" stroke-width="25" stroke-linecap="round" opacity="0.6"/>';
  html += '<polygon points="100,180 250,175 260,225 110,220" fill="rgba(15,110,86,0.15)" stroke="#0F6E56" stroke-width="2" stroke-dasharray="6,3"/>';
  html += '<text x="180" y="200" text-anchor="middle" fill="#0F6E56" font-size="12" font-weight="500">A区-北段</text>';
  html += '<text x="180" y="215" text-anchor="middle" fill="#0F6E56" font-size="10">已覆盖</text>';
  html += '<polygon points="280,210 420,215 410,260 290,250" fill="rgba(186,117,23,0.15)" stroke="#BA7517" stroke-width="2" stroke-dasharray="6,3"/>';
  html += '<text x="350" y="235" text-anchor="middle" fill="#BA7517" font-size="12" font-weight="500">B区-南段</text>';
  html += '<text x="350" y="250" text-anchor="middle" fill="#BA7517" font-size="10">部分覆盖</text>';
  html += '<polygon points="450,195 620,190 610,235 460,225" fill="rgba(173,181,189,0.1)" stroke="#ADB5BD" stroke-width="2" stroke-dasharray="6,3"/>';
  html += '<text x="535" y="215" text-anchor="middle" fill="#888" font-size="12" font-weight="500">C区-东段</text>';
  html += '<text x="535" y="230" text-anchor="middle" fill="#888" font-size="10">未覆盖</text>';
  html += '</svg>';
  html += '<div style="position:absolute;left:35%;top:52%;transform:translate(-50%,-50%)"><div style="width:24px;height:24px;border-radius:50%;background:#0F6E56;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div></div>';
  return html;
}

/* ============ 水域管理 Water Areas ============ */
views['water-areas'] = () => `
  <div class="page-title">水域管理</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <input type="text" placeholder="搜索水域名称..." style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;width:240px">
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showWaterAreaModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      新增水域
    </button>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead><tr><th>水域ID</th><th>水域名称</th><th>面积(km²)</th><th>关联设备</th><th>关联任务</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${mockWaterAreas.map(w => `
            <tr>
              <td>${w.id}</td>
              <td><span style="font-weight:500">${w.name}</span></td>
              <td>${w.area}</td>
              <td>${w.devices} 台</td>
              <td>${w.tasks} 个</td>
              <td><span class="badge ${w.status==='active'?'badge-success':'badge-gray'}">${w.status==='active'?'运行中':'已暂停'}</span></td>
              <td>
                <button class="btn-text" onclick="showWaterAreaDetail('${w.id}')">查看</button>
                <button class="btn-text" onclick="showWaterAreaModal('${w.id}')">编辑</button>
                <button class="btn-text danger" onclick="confirmDelete('${w.name}')">删除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
`;

function showWaterAreaModal(id) {
  const w = id ? mockWaterAreas.find(x=>x.id===id) : null;
  showModal((w?'编辑':'新增')+'水域', `
    <div class="form-row">
      <div class="form-group">
        <label>水域名称</label>
        <input type="text" value="${w?w.name:''}" placeholder="如：苏州河-虹口段">
      </div>
      <div class="form-group">
        <label>水域面积(km²)</label>
        <input type="number" value="${w?w.area:''}" placeholder="面积">
      </div>
    </div>
    <div class="form-group">
      <label>水域范围绘制</label>
      <div style="height:250px;background:var(--gray-50);border:1px dashed var(--gray-400);border-radius:8px;position:relative;overflow:hidden">
        <div class="map-grid" style="opacity:0.5"></div>
        <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 500 250" preserveAspectRatio="xMidYMid slice">
          <polygon points="80,80 200,60 350,100 380,180 250,200 100,170" fill="rgba(24,95,165,0.1)" stroke="#185FA5" stroke-width="2" stroke-dasharray="6,3"/>
          <circle cx="80" cy="80" r="5" fill="#185FA5"/>
          <circle cx="200" cy="60" r="5" fill="#185FA5"/>
          <circle cx="350" cy="100" r="5" fill="#185FA5"/>
          <circle cx="380" cy="180" r="5" fill="#185FA5"/>
          <circle cx="250" cy="200" r="5" fill="#185FA5"/>
          <circle cx="100" cy="170" r="5" fill="#185FA5"/>
        </svg>
        <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:12px;color:var(--gray-500);background:rgba(255,255,255,0.9);padding:4px 12px;border-radius:4px">在地图上点击绘制水域边界多边形</div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>中心经度</label>
        <input type="text" value="121.4737" placeholder="经度">
      </div>
      <div class="form-group">
        <label>中心纬度</label>
        <input type="text" value="31.2304" placeholder="纬度">
      </div>
    </div>
  `, () => { closeModal(); });
}

function showWaterAreaDetail(id) {
  const w = mockWaterAreas.find(x=>x.id===id);
  showModal('水域详情 - '+w.name, `
    <div class="grid-2" style="margin-bottom:16px">
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">水域ID</div><div style="font-weight:500;margin-top:4px">${w.id}</div></div>
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">面积</div><div style="font-weight:500;margin-top:4px">${w.area} km²</div></div>
    </div>
    <div style="height:250px;background:var(--gray-50);border:1px solid var(--border);border-radius:8px;position:relative;overflow:hidden">
      <div class="map-grid" style="opacity:0.5"></div>
      <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 500 250" preserveAspectRatio="xMidYMid slice">
        <polygon points="80,80 200,60 350,100 380,180 250,200 100,170" fill="rgba(24,95,165,0.1)" stroke="#185FA5" stroke-width="2"/>
      </svg>
    </div>
    <div style="margin-top:16px">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">关联设备 (${w.devices})</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${mockDevices.filter(d=>d.water===w.name).map(d=>`<span class="tag">${d.name}</span>`).join('') || '<span style="color:var(--gray-500);font-size:13px">暂无关联设备</span>'}
      </div>
    </div>
  `);
}

/* ============ 任务管理 Tasks ============ */
views['tasks'] = () => `
  <div class="page-title">任务管理</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <input type="text" placeholder="搜索任务..." style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;width:240px">
    <select style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
      <option>全部状态</option><option>执行中</option><option>待执行</option><option>已完成</option><option>已暂停</option>
    </select>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead><tr><th>任务ID</th><th>任务名称</th><th>目标水域</th><th>分配设备</th><th>状态</th><th>执行进度</th><th>安排时间</th><th>操作</th></tr></thead>
        <tbody>
          ${mockTasks.map(t => {
            const s = taskStatusMap[t.status];
            return `<tr>
              <td>${t.id}</td>
              <td><span style="font-weight:500">${t.name}</span></td>
              <td>${t.water}</td>
              <td>${t.device}</td>
              <td><span class="badge ${s.cls}">${s.label}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="progress" style="width:100px"><div class="progress-fill" style="width:${t.progress}%;background:${t.progress===100?'#0F6E56':'#185FA5'}"></div></div>
                  <span style="font-size:12px">${t.progress}%</span>
                </div>
              </td>
              <td>${t.scheduled}</td>
              <td>
                <button class="btn-text" onclick="showTaskDetail('${t.id}')">详情</button>
                ${t.status==='running'||t.status==='pending' ? `<button class="btn-text" onclick="interveneTask('${t.id}')">干预</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="table-pagination">
      <span>共 ${mockTasks.length} 条记录</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-outline btn-sm">上一页</button>
        <button class="btn btn-primary btn-sm">1</button>
        <button class="btn btn-outline btn-sm">下一页</button>
      </div>
    </div>
  </div>
`;

function showTaskDetail(id) {
  const t = mockTasks.find(x=>x.id===id);
  const s = taskStatusMap[t.status];
  showModal('任务详情 - '+t.name, `
    <div class="grid-2" style="margin-bottom:16px">
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">任务ID</div><div style="font-weight:500;margin-top:4px">${t.id}</div></div>
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">状态</div><div style="margin-top:4px"><span class="badge ${s.cls}">${s.label}</span></div></div>
    </div>
    <div class="grid-2" style="margin-bottom:16px">
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">目标水域</div><div style="font-weight:500;margin-top:4px">${t.water}</div></div>
      <div style="padding:12px;background:var(--gray-50);border-radius:8px"><div style="font-size:12px;color:var(--gray-600)">分配设备</div><div style="font-weight:500;margin-top:4px">${t.device}</div></div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">执行进度</div>
      <div class="progress" style="height:10px"><div class="progress-fill" style="width:${t.progress}%;background:${t.progress===100?'#0F6E56':'#185FA5'}"></div></div>
      <div style="text-align:right;font-size:12px;color:var(--gray-600);margin-top:4px">${t.progress}%</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">任务时间轴</div>
      <div style="display:flex;gap:0;align-items:center">
        <div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#0F6E56;margin:0 auto 4px"></div><div style="font-size:11px">创建</div></div>
        <div style="flex:2;height:2px;background:#0F6E56"></div>
        <div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:${t.progress>0?'#0F6E56':'var(--gray-300)'};margin:0 auto 4px"></div><div style="font-size:11px">开始</div></div>
        <div style="flex:2;height:2px;background:${t.progress>0?'#0F6E56':'var(--gray-300)'}"></div>
        <div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:${t.progress===100?'#0F6E56':'var(--gray-300)'};margin:0 auto 4px"></div><div style="font-size:11px">完成</div></div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">安排时间</div>
      <div style="font-weight:500">${t.scheduled}</div>
    </div>
  `);
}

/* ============ 任务调度 Scheduling ============ */
views['scheduling'] = () => `
  <div class="page-title">任务调度</div>
  <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
    <select style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
      <option>全部状态</option><option>执行中</option><option>待执行</option><option>已完成</option><option>已暂停</option>
    </select>
    <select style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
      <option>全部水域</option>${mockWaterAreas.map(w=>`<option>${w.name}</option>`).join('')}
    </select>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showScheduleTaskModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      新建任务排期
    </button>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead><tr><th>任务识别号</th><th>目标清污水域</th><th>分配设备</th><th>当前状态</th><th>执行进度</th><th>预设安排时间</th><th>操作</th></tr></thead>
        <tbody>
          ${mockTasks.map(t => {
            const s = taskStatusMap[t.status];
            return `<tr>
              <td>${t.id}</td>
              <td>${t.water}</td>
              <td>${t.device}</td>
              <td><span class="badge ${s.cls}">${s.label}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="progress" style="width:80px"><div class="progress-fill" style="width:${t.progress}%;background:${t.progress===100?'#0F6E56':'#185FA5'}"></div></div>
                  <span style="font-size:12px">${t.progress}%</span>
                </div>
              </td>
              <td>${t.scheduled}</td>
              <td>
                ${t.status==='running' ? '<button class="btn-text" onclick="alert(\'任务已暂停\')">暂停</button>' : ''}
                ${t.status==='paused' ? '<button class="btn-text" onclick="alert(\'任务已恢复\')">恢复</button>' : ''}
                ${t.status==='pending' ? '<button class="btn-text" onclick="alert(\'任务已启动\')">启动</button>' : ''}
                <button class="btn-text" onclick="interveneTask('${t.id}')">干预</button>
                <button class="btn-text danger" onclick="confirmDelete(\'${t.name}\')">取消</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
`;

function showScheduleTaskModal() {
  showModal('新建任务排期', `
    <div class="form-row">
      <div class="form-group">
        <label>任务名称</label>
        <input type="text" placeholder="如：苏州河黄浦段日常清洁">
      </div>
      <div class="form-group">
        <label>任务类型</label>
        <select><option>日常清洁</option><option>深度清洁</option><option>巡查任务</option><option>应急任务</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>选择设备</label>
        <select>${mockDevices.filter(d=>d.status!=='offline').map(d=>`<option>${d.name} (${d.id})</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>目标水域</label>
        <select>${mockWaterAreas.map(w=>`<option>${w.name}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>安排日期</label>
        <input type="date" value="2026-07-10">
      </div>
      <div class="form-group">
        <label>开始时间</label>
        <input type="time" value="08:00">
      </div>
    </div>
    <div class="form-group">
      <label>清洁区域 (可选)</label>
      <div style="height:150px;background:var(--gray-50);border:1px dashed var(--gray-400);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray-500);font-size:13px">
        在地图上选择或绘制清洁区域
      </div>
    </div>
    <div class="form-group">
      <label>备注</label>
      <textarea placeholder="任务备注信息..."></textarea>
    </div>
  `, () => { closeModal(); });
}

/* ============ 预警管理 Alerts ============ */
views['alerts'] = () => `
  <div class="page-title">预警管理</div>
  <div class="tabs" id="alertTabs">
    <div class="tab active" onclick="switchAlertTab('list',this)">预警信息</div>
    <div class="tab" onclick="switchAlertTab('rules',this)">预警规则配置</div>
  </div>
  <div id="alertTabContent"></div>
`;

pageInit['alerts'] = () => {
  switchAlertTab('list', document.querySelector('#alertTabs .tab'));
};

function switchAlertTab(tab, el) {
  document.querySelectorAll('#alertTabs .tab').forEach(t=>t.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('alertTabContent');
  if (!content) return;

  if (tab==='list') {
    content.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" style="padding:16px">
          <div class="stat-label">严重预警</div>
          <div class="stat-value" style="color:var(--red)">1</div>
        </div>
        <div class="stat-card" style="padding:16px">
          <div class="stat-label">警告预警</div>
          <div class="stat-value" style="color:var(--amber)">2</div>
        </div>
        <div class="stat-card" style="padding:16px">
          <div class="stat-label">通知信息</div>
          <div class="stat-value" style="color:var(--primary)">0</div>
        </div>
        <div class="stat-card" style="padding:16px">
          <div class="stat-label">已处理</div>
          <div class="stat-value" style="color:var(--green)">3</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>预警列表</h3>
          <div style="display:flex;gap:8px">
            <select style="height:30px;padding:0 8px;border:1px solid var(--gray-300);border-radius:4px;font-size:12px">
              <option>全部级别</option><option>严重</option><option>警告</option><option>通知</option>
            </select>
            <select style="height:30px;padding:0 8px;border:1px solid var(--gray-300);border-radius:4px;font-size:12px">
              <option>全部状态</option><option>未处理</option><option>已处理</option>
            </select>
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>预警ID</th><th>级别</th><th>设备</th><th>类型</th><th>描述</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              ${mockAlerts.map(a => {
                const lv = alertLevelMap[a.level];
                return `<tr>
                  <td>${a.id}</td>
                  <td><span class="badge ${lv.cls}">${lv.label}</span></td>
                  <td>${a.device}</td>
                  <td>${a.type}</td>
                  <td style="max-width:250px">${a.desc}</td>
                  <td>${a.time}</td>
                  <td><span class="badge ${a.status==='active'?'badge-danger':'badge-gray'}">${a.status==='active'?'未处理':'已处理'}</span></td>
                  <td>
                    ${a.status==='active' ? `<button class="btn-text" onclick="handleAlert('${a.id}')">处理</button>` : ''}
                    <button class="btn-text" onclick="alert('查看详情')">详情</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab==='rules') {
    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>预警规则配置</h3>
          <button class="btn btn-primary btn-sm" onclick="showThresholdModal()">新增规则</button>
        </div>
        <div class="card-body">
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">设备电量低阈值</span>
                <span class="threshold-type-tag" style="background:var(--primary-light);color:var(--primary);margin-left:8px">单值阈值</span>
              </div>
              <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">当设备电量 <strong style="color:var(--red)">&lt; 25%</strong> 时触发预警</div>
          </div>
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">垃圾舱满载阈值</span>
                <span class="threshold-type-tag" style="background:var(--amber-light);color:var(--amber);margin-left:8px">单值阈值</span>
              </div>
              <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">当垃圾舱容量 <strong style="color:var(--red)">&gt; 85%</strong> 时触发预警</div>
          </div>
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">溶解氧正常区间</span>
                <span class="threshold-type-tag" style="background:var(--teal-light);color:var(--teal);margin-left:8px">区间阈值</span>
              </div>
              <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">当溶解氧量 <strong style="color:var(--red)">&lt; 5.0 mg/L</strong> 或 <strong style="color:var(--red)">&gt; 15.0 mg/L</strong> 时触发预警</div>
          </div>
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">pH值正常区间</span>
                <span class="threshold-type-tag" style="background:var(--teal-light);color:var(--teal);margin-left:8px">区间阈值</span>
              </div>
              <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">当pH值 <strong style="color:var(--red)">&lt; 6.5</strong> 或 <strong style="color:var(--red)">&gt; 8.5</strong> 时触发预警</div>
          </div>
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">设备离线+低电量组合预警</span>
                <span class="threshold-type-tag" style="background:var(--coral-light);color:var(--coral);margin-left:8px">多指标关联</span>
              </div>
              <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">
              当以下条件<strong>同时满足</strong>时触发预警：
              <ul style="margin-top:4px;margin-left:16px">
                <li>设备状态 = 离线</li>
                <li>最后电量 &lt; 30%</li>
                <li>离线时长 &gt; 15分钟</li>
              </ul>
            </div>
          </div>
          <div class="threshold-item">
            <div class="threshold-header">
              <div>
                <span style="font-weight:500">水质异常+设备偏航组合预警</span>
                <span class="threshold-type-tag" style="background:var(--coral-light);color:var(--coral);margin-left:8px">多指标关联</span>
              </div>
              <label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label>
            </div>
            <div style="font-size:12px;color:var(--gray-600)">
              当以下条件<strong>同时满足</strong>时触发预警：
              <ul style="margin-top:4px;margin-left:16px">
                <li>浊度 &gt; 20 NTU</li>
                <li>设备偏航距离 &gt; 5m</li>
                <li>当前位置在水域边界外</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function showThresholdModal() {
  showModal('新增预警规则', `
    <div class="form-row">
      <div class="form-group">
        <label>规则名称</label>
        <input type="text" placeholder="如：水深过浅预警">
      </div>
      <div class="form-group">
        <label>阈值类型</label>
        <select id="thresholdType" onchange="toggleThresholdFields()">
          <option value="single">单值阈值</option>
          <option value="range">区间阈值</option>
          <option value="multi">多指标关联阈值</option>
        </select>
      </div>
    </div>
    <div id="singleThresholdFields">
      <div class="form-row">
        <div class="form-group">
          <label>监测指标</label>
          <select><option>设备电量(%)</option><option>垃圾舱容量(%)</option><option>水深(m)</option><option>pH值</option><option>溶解氧(mg/L)</option><option>浊度(NTU)</option></select>
        </div>
        <div class="form-group">
          <label>比较方式</label>
          <select><option>大于</option><option>小于</option><option>等于</option></select>
        </div>
        <div class="form-group">
          <label>阈值</label>
          <input type="number" placeholder="如：25">
        </div>
      </div>
    </div>
    <div id="rangeThresholdFields" style="display:none">
      <div class="form-row">
        <div class="form-group">
          <label>监测指标</label>
          <select><option>pH值</option><option>溶解氧(mg/L)</option><option>浊度(NTU)</option><option>水温(°C)</option></select>
        </div>
        <div class="form-group">
          <label>下限</label>
          <input type="number" placeholder="如：6.5">
        </div>
        <div class="form-group">
          <label>上限</label>
          <input type="number" placeholder="如：8.5">
        </div>
      </div>
    </div>
    <div id="multiThresholdFields" style="display:none">
      <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">添加多个指标条件（全部满足时触发）：</div>
      <div class="form-row">
        <div class="form-group"><label>指标1</label><select><option>设备状态</option><option>电量</option><option>浊度</option></select></div>
        <div class="form-group"><label>比较</label><select><option>等于</option><option>大于</option><option>小于</option></select></div>
        <div class="form-group"><label>值</label><input type="text" placeholder="如：离线"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>指标2</label><select><option>电量</option><option>偏航距离</option><option>离线时长</option></select></div>
        <div class="form-group"><label>比较</label><select><option>大于</option><option>小于</option></select></div>
        <div class="form-group"><label>值</label><input type="number" placeholder="如：30"></div>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:8px">+ 添加条件</button>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label>预警级别</label>
      <select><option>严重</option><option>警告</option><option>通知</option></select>
    </div>
    <div class="form-group">
      <label>推送方式</label>
      <div style="display:flex;gap:16px;padding:8px 0">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 看板推送</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 站内消息</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 短信通知</label>
      </div>
    </div>
  `, () => { closeModal(); });
}

function toggleThresholdFields() {
  const type = document.getElementById('thresholdType').value;
  document.getElementById('singleThresholdFields').style.display = type==='single'?'block':'none';
  document.getElementById('rangeThresholdFields').style.display = type==='range'?'block':'none';
  document.getElementById('multiThresholdFields').style.display = type==='multi'?'block':'none';
}

/* ============ 账号管理 Accounts ============ */
views['accounts'] = () => `
  <div class="page-title">账号管理</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <input type="text" placeholder="搜索账号..." style="height:34px;padding:0 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;width:240px">
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showAccountModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      新增账号
    </button>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead><tr><th>ID</th><th>账号</th><th>姓名</th><th>角色</th><th>手机</th><th>状态</th><th>最后登录</th><th>操作</th></tr></thead>
        <tbody>
          ${mockAccounts.map(a => `
            <tr>
              <td>${a.id}</td>
              <td>${a.username}</td>
              <td>${a.name}</td>
              <td><span class="tag">${a.role}</span></td>
              <td>${a.phone}</td>
              <td><span class="badge ${a.status==='active'?'badge-success':'badge-gray'}">${a.status==='active'?'启用':'禁用'}</span></td>
              <td>${a.lastLogin}</td>
              <td>
                <button class="btn-text" onclick="showAccountModal(${a.id})">编辑</button>
                <button class="btn-text" onclick="toggleAccount(${a.id})">${a.status==='active'?'禁用':'启用'}</button>
                <button class="btn-text" onclick="alert('已重置密码')">重置密码</button>
                <button class="btn-text danger" onclick="confirmDelete('${a.name}')">删除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
`;

function toggleAccount(id) {
  const a = mockAccounts.find(x=>x.id===id);
  a.status = a.status==='active'?'disabled':'active';
  navigate('accounts');
}

function showAccountModal(id) {
  const a = id ? mockAccounts.find(x=>x.id===id) : null;
  showModal((a?'编辑':'新增')+'账号', `
    <div class="form-row">
      <div class="form-group">
        <label>账号</label>
        <input type="text" value="${a?a.username:''}" placeholder="登录账号">
      </div>
      <div class="form-group">
        <label>姓名</label>
        <input type="text" value="${a?a.name:''}" placeholder="真实姓名">
      </div>
    </div>
    ${!a ? `<div class="form-row">
      <div class="form-group">
        <label>密码</label>
        <input type="password" placeholder="设置密码">
      </div>
      <div class="form-group">
        <label>确认密码</label>
        <input type="password" placeholder="确认密码">
      </div>
    </div>` : ''}
    <div class="form-row">
      <div class="form-group">
        <label>角色</label>
        <select>${mockRoles.map(r=>`<option ${a&&r.name===a.role?'selected':''}>${r.name}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>手机号</label>
        <input type="text" value="${a?a.phone:''}" placeholder="手机号码">
      </div>
    </div>
    <div class="form-group">
      <label>状态</label>
      <select><option ${!a||a.status==='active'?'selected':''}>启用</option><option ${a&&a.status==='disabled'?'selected':''}>禁用</option></select>
    </div>
  `, () => { closeModal(); });
}

/* ============ 角色管理 Roles ============ */
views['roles'] = () => `
  <div class="page-title">角色管理</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showRoleModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      新增角色
    </button>
  </div>
  <div class="card">
    <div class="table-wrapper">
      <table>
        <thead><tr><th>ID</th><th>角色名称</th><th>角色编码</th><th>用户数</th><th>权限数</th><th>描述</th><th>操作</th></tr></thead>
        <tbody>
          ${mockRoles.map(r => `
            <tr>
              <td>${r.id}</td>
              <td><span style="font-weight:500">${r.name}</span></td>
              <td><code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;font-size:12px">${r.code}</code></td>
              <td>${r.users}</td>
              <td>${r.permissions}</td>
              <td style="max-width:200px;color:var(--gray-600)">${r.desc}</td>
              <td>
                <button class="btn-text" onclick="showRoleModal(${r.id})">编辑</button>
                <button class="btn-text" onclick="navigate('permissions')">权限</button>
                ${r.code!=='super_admin' ? `<button class="btn-text danger" onclick="confirmDelete('${r.name}')">删除</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
`;

function showRoleModal(id) {
  const r = id ? mockRoles.find(x=>x.id===id) : null;
  showModal((r?'编辑':'新增')+'角色', `
    <div class="form-row">
      <div class="form-group">
        <label>角色名称</label>
        <input type="text" value="${r?r.name:''}" placeholder="如：运维工程师">
      </div>
      <div class="form-group">
        <label>角色编码</label>
        <input type="text" value="${r?r.code:''}" placeholder="如：devops">
      </div>
    </div>
    <div class="form-group">
      <label>描述</label>
      <textarea placeholder="角色描述">${r?r.desc:''}</textarea>
    </div>
    <div class="form-group">
      <label>功能权限</label>
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;max-height:200px;overflow-y:auto">
        <div style="font-weight:500;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--gray-100)">监控中心</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 总览看板</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 设备编队</label>
        </div>
        <div style="font-weight:500;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--gray-100)">设备管理</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 设备列表</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 设备详情</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 指令下发</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 设备删除</label>
        </div>
        <div style="font-weight:500;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--gray-100)">业务管理</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 水域管理</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 任务管理</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" checked> 任务调度</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 预警规则配置</label>
        </div>
        <div style="font-weight:500;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--gray-100)">系统管理</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 账号管理</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 角色管理</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox"> 权限管理</label>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>数据权限</label>
      <select><option>全部水域</option><option>指定水域</option><option>仅关联水域</option></select>
    </div>
  `, () => { closeModal(); });
}

/* ============ 权限管理 Permissions ============ */
views['permissions'] = () => `
  <div class="page-title">权限管理</div>
  <div class="card">
    <div class="card-header"><h3>角色权限矩阵</h3></div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>功能模块</th>
            <th>超级管理员</th>
            <th>管理员</th>
            <th>操作员</th>
            <th>观察员</th>
          </tr>
        </thead>
        <tbody>
          ${[
            {mod:'总览看板', perms:['查看','查看','查看','查看']},
            {mod:'设备编队', perms:['全部','全部','查看','查看']},
            {mod:'设备列表', perms:['全部','全部','查看','查看']},
            {mod:'设备详情', perms:['全部','全部','查看+操作','查看']},
            {mod:'指令下发', perms:['全部','全部','允许','禁止']},
            {mod:'水域管理', perms:['全部','全部','查看','查看']},
            {mod:'任务管理', perms:['全部','全部','查看','查看']},
            {mod:'任务调度', perms:['全部','全部','创建+干预','查看']},
            {mod:'预警管理', perms:['全部','全部','查看+处理','查看']},
            {mod:'预警规则', perms:['全部','配置','查看','查看']},
            {mod:'账号管理', perms:['全部','查看','禁止','禁止']},
            {mod:'角色管理', perms:['全部','查看','禁止','禁止']},
            {mod:'权限管理', perms:['全部','查看','禁止','禁止']},
            {mod:'系统设置', perms:['全部','全部','个人设置','个人设置']},
          ].map(row => `
            <tr>
              <td style="font-weight:500">${row.mod}</td>
              ${row.perms.map(p => {
                const cls = p==='全部'?'badge-success':p==='禁止'?'badge-danger':p.includes('查看')&&!p.includes('操作')?'badge-gray':'badge-info';
                return `<td><span class="badge ${cls}">${p}</span></td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-header"><h3>数据权限说明</h3></div>
    <div class="card-body">
      <div class="grid-2">
        <div style="padding:12px;background:var(--gray-50);border-radius:8px">
          <div style="font-weight:500;margin-bottom:4px">数据范围控制</div>
          <div style="font-size:12px;color:var(--gray-600)">不同角色可查看不同范围的数据。管理员可查看全部水域数据，操作员仅可查看关联水域数据。</div>
        </div>
        <div style="padding:12px;background:var(--gray-50);border-radius:8px">
          <div style="font-weight:500;margin-bottom:4px">操作权限控制</div>
          <div style="font-size:12px;color:var(--gray-600)">对设备的操作权限进行分级管控。关键操作（如删除设备、修改预警规则）仅限管理员以上角色。</div>
        </div>
      </div>
    </div>
  </div>
`;

/* ============ 个人中心 Profile ============ */
views['profile'] = () => `
  <div class="page-title">个人中心</div>
  <div class="grid-2">
    <div class="card">
      <div class="card-header"><h3>个人信息</h3></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#185FA5,#0F6E56);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:500">管</div>
          <div>
            <div style="font-size:16px;font-weight:600">系统管理员</div>
            <div style="font-size:13px;color:var(--gray-600)">超级管理员 · admin</div>
          </div>
        </div>
        <div>
          <div class="form-row">
            <div class="form-group"><label>姓名</label><input type="text" value="系统管理员"></div>
            <div class="form-group"><label>手机号</label><input type="text" value="138****8888"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>邮箱</label><input type="text" value="admin@aquaclean.com"></div>
            <div class="form-group"><label>部门</label><input type="text" value="运营管理部"></div>
          </div>
          <button class="btn btn-primary" style="margin-top:8px">保存修改</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>修改密码</h3></div>
      <div class="card-body">
        <div class="form-group" style="margin-bottom:16px">
          <label>当前密码</label>
          <input type="password" placeholder="请输入当前密码">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>新密码</label>
          <input type="password" placeholder="请输入新密码">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>确认新密码</label>
          <input type="password" placeholder="请再次输入新密码">
        </div>
        <button class="btn btn-primary">修改密码</button>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
          <button class="btn btn-danger" onclick="doLogout()">退出登录</button>
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-header"><h3>控制台偏好设置</h3></div>
    <div class="card-body">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:500">深色模式</div>
            <div style="font-size:12px;color:var(--gray-600)">切换控制台深色/浅色主题</div>
          </div>
          <label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:500">预警声音提醒</div>
            <div style="font-size:12px;color:var(--gray-600)">收到新预警时播放提示音</div>
          </div>
          <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:500">自动刷新</div>
            <div style="font-size:12px;color:var(--gray-600)">总览看板数据自动刷新（每30秒）</div>
          </div>
          <label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:500">消息桌面通知</div>
            <div style="font-size:12px;color:var(--gray-600)">系统消息推送到桌面通知</div>
          </div>
          <label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label>
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-header"><h3>消息通知</h3></div>
    <div class="notif-list">
      ${mockAlerts.map(a => `
        <div class="notif-item">
          <div class="notif-dot" style="background:${a.level==='danger'?'#E24B4A':a.level==='warning'?'#BA7517':'#185FA5'}"></div>
          <div class="notif-content">
            <div class="notif-title">${a.type} - ${a.device}</div>
            <div class="notif-desc">${a.desc}</div>
          </div>
          <div class="notif-time">${a.time}</div>
        </div>
      `).join('')}
    </div>
  </div>
`;