// 文件作用：保存已定型前端原型的核心交互入口逻辑。

/* ============ 核心逻辑与导航 (app.js) ============
 * 页面名称映射、路由 navigate、当前选中设备状态、登录/登出、
 * 弹窗等通用工具函数，以及全局事件绑定。
 * 依赖：data.js（mockDevices 等）、map.js、views.js。
 * ================================================== */

// ============= 页面名称映射 =============
const pageNames = {
  'dashboard':'总览看板',
  'fleet':'设备编队',
  'devices':'设备列表',
  'device-detail':'设备详情',
  'water-areas':'水域管理',
  'tasks':'任务管理',
  'scheduling':'任务调度',
  'alerts':'预警管理',
  'accounts':'账号管理',
  'roles':'角色管理',
  'permissions':'权限管理',
  'profile':'个人中心',
};

// ============= 当前选中设备（设备详情页数据驱动）============
let currentDeviceId = 'AC-001'; // 默认清澜一号
function getCurrentDevice() {
  return mockDevices.find(d => d.id === currentDeviceId) || mockDevices[0];
}

// ============= 登录 =============
function doLogin() {
  document.getElementById('loginPage').style.display='none';
  document.getElementById('mainApp').classList.add('show');
  connectMqtt(); // 登录后建立 MQTT 连接，便于下发指令
  navigate('dashboard');
}

// ============= 设备控制：下发 MQTT 指令 =============
function sendDeviceCommand(action) {
  const d = getCurrentDevice();
  const rec = publishDeviceCommand(d, action);
  if (!rec) return;
  if (rec.status === '已发送') {
    showToast('已向「' + d.name + '」下发指令：' + rec.action, 'success');
  } else if (rec.status === '已排队(未连接)') {
    showToast('MQTT 未连接，指令已排队，连接成功后自动下发', 'error');
  } else {
    showToast('指令发送失败：' + rec.action, 'error');
  }
}

// ============= 路由切换 =============
// page: 目标页面；deviceId: 进入设备详情时携带的设备 ID
function navigate(page, deviceId) {
  if (page === 'device-detail' && deviceId) {
    currentDeviceId = deviceId;
  }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('currentPageName').textContent = pageNames[page] || '';
  document.getElementById('contentArea').innerHTML = views[page] ? views[page]() : '<div class="empty-state">页面建设中...</div>';
  if (pageInit[page]) pageInit[page]();
}

// ============= 登出 =============
function doLogout() {
  document.getElementById('mainApp').classList.remove('show');
  document.getElementById('loginPage').style.display='flex';
}

// ============= 设备详情内：切换设备（无需返回列表）============
function switchDetailDevice(id) {
  if (!id || id === currentDeviceId) return;
  currentDeviceId = id;
  const cur = getCurrentDevice();
  // 更新标题
  const titleEl = document.querySelector('#contentArea .page-title');
  if (titleEl) titleEl.textContent = '设备详情 - ' + cur.name;
  // 重新渲染当前激活的 tab（保留用户所处位置）
  const activeTab = document.querySelector('#deviceDetailTabs .tab.active');
  const tabName = activeTab ? activeTab.getAttribute('data-tab') : 'overview';
  switchDeviceTab(tabName, activeTab);
  const sel = document.getElementById('deviceSwitcher');
  if (sel && sel.value !== id) sel.value = id;
}

// ============= 任务管理「干预」：跳转到关联设备详情 =============
function interveneTask(taskId) {
  const t = mockTasks.find(x => x.id === taskId);
  if (!t) { showToast('未找到对应的任务', 'error'); return; }
  // 任务数据按设备名关联，转成设备 ID 后跳转（兼容直接存 ID 的情况）
  const dev = mockDevices.find(d => d.name === t.device) || mockDevices.find(d => d.id === t.device);
  if (!dev) { showToast('未找到关联设备：' + (t.device || '无'), 'error'); return; }
  navigate('device-detail', dev.id);
  showToast('正在干预任务「' + t.name + '」，已跳转至 ' + dev.name + ' 设备详情', 'success');
}

// ============= 预警处理「处理」：跳转到关联设备详情 =============
function handleAlert(alertId) {
  const a = mockAlerts.find(x => x.id === alertId);
  if (!a) { showToast('未找到对应的预警', 'error'); return; }
  // 预警数据按设备名关联，转成设备 ID 后跳转（兼容直接存 ID 的情况）
  const dev = mockDevices.find(d => d.name === a.device) || mockDevices.find(d => d.id === a.device);
  if (!dev) { showToast('未找到关联设备：' + (a.device || '无'), 'error'); return; }
  navigate('device-detail', dev.id);
  showToast('正在处理预警「' + a.id + '」，已跳转至 ' + dev.name + ' 设备详情', 'success');
}

// ============= 顶部全局搜索：输入即提示 + 回车/点击跳转设备详情 =============
let searchActiveIndex = -1;

// 按 ID / 名称包含匹配设备
function getDeviceMatches(q) {
  const lc = (q || '').trim().toLowerCase();
  if (!lc) return [];
  return mockDevices.filter(d =>
    d.name.toLowerCase().includes(lc) || d.id.toLowerCase().includes(lc)
  );
}

// 隐藏联想下拉
function hideSearchSuggestions() {
  const box = document.getElementById('searchSuggestions');
  if (box) { box.classList.remove('show'); box.innerHTML = ''; }
  searchActiveIndex = -1;
}

// 渲染联想下拉（输入即提示）
function renderSearchSuggestions(q) {
  const box = document.getElementById('searchSuggestions');
  if (!box) return;
  const matches = getDeviceMatches(q);
  if (!q.trim()) { hideSearchSuggestions(); return; }
  if (matches.length === 0) {
    box.innerHTML = '<div class="search-suggestion-empty">未找到匹配的设备</div>';
    box.classList.add('show');
    searchActiveIndex = -1;
    return;
  }
  box.innerHTML = matches.map((d, i) => {
    const st = statusMap[d.status] || { label:'', cls:'' };
    return `<div class="search-suggestion${i === searchActiveIndex ? ' active' : ''}" data-index="${i}" data-id="${d.id}" onmousedown="event.preventDefault(); selectSearchSuggestion('${d.id}')">`
      + `<span class="badge ${st.cls}">${st.label}</span>`
      + `<span class="ss-name">${d.name}</span>`
      + `<span class="ss-id">${d.id}</span>`
      + `</div>`;
  }).join('');
  box.classList.add('show');
}

// 键盘上下移动高亮
function highlightSearchSuggestion() {
  const box = document.getElementById('searchSuggestions');
  if (!box) return;
  box.querySelectorAll('.search-suggestion').forEach(el => {
    el.classList.toggle('active', Number(el.getAttribute('data-index')) === searchActiveIndex);
  });
}

// 选择某条联想项 → 跳转设备详情
function selectSearchSuggestion(id) {
  hideSearchSuggestions();
  const input = document.getElementById('globalSearch');
  if (input) input.value = '';
  navigate('device-detail', id);
  const d = mockDevices.find(x => x.id === id);
  showToast('已跳转到「' + (d ? d.name : id) + '」设备详情', 'success');
}

// 回车搜索：跳转到匹配设备（优先 ID/名称精确，再包含）
function searchGlobal(query) {
  hideSearchSuggestions();
  const q = (query || '').trim();
  if (!q) { showToast('请输入要搜索的无人艇名称', 'error'); return; }
  const lc = q.toLowerCase();
  let hit = mockDevices.find(d => d.id.toLowerCase() === lc)
         || mockDevices.find(d => d.name.toLowerCase() === lc)
         || mockDevices.find(d => d.name.toLowerCase().includes(lc) || d.id.toLowerCase().includes(lc));
  if (hit) {
    navigate('device-detail', hit.id);
    showToast('已跳转到「' + hit.name + '」设备详情', 'success');
  } else {
    showToast('未找到匹配的设备：「' + q + '」', 'error');
  }
}

// ============= 轻量 Toast 提示 =============
let toastTimer = null;
function showToast(msg, type) {
  let el = document.getElementById('globalToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  // 强制重排以触发过渡动画
  void el.offsetWidth;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}

// ============= 通知 =============
function showNotifications() {
  navigate('alerts');
}

// ============= 弹窗等通用工具 =============
function showModal(title, body, onConfirm) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <span class="modal-close" onclick="closeModal()">&times;</span>
    </div>
    <div class="modal-body">${body}</div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" id="modalConfirmBtn">确定</button>
    </div>
  `;
  overlay.classList.add('show');
  if (onConfirm) {
    document.getElementById('modalConfirmBtn').onclick = onConfirm;
  } else {
    document.getElementById('modalConfirmBtn').onclick = closeModal;
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function confirmDelete(name) {
  showModal('确认删除', `<p style="font-size:14px;color:var(--gray-700)">确定要删除 <strong>${name}</strong> 吗？此操作不可恢复。</p>`, () => { closeModal(); });
}

function switchQualityRange(el, range) {
  document.querySelectorAll('#qualityChart').forEach(c => {
    const btns = c.parentElement.parentElement.parentElement.querySelectorAll('.btn-sm');
    btns.forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-outline');
    });
  });
  el.classList.remove('btn-outline');
  el.classList.add('btn-primary');
}

// ============= 全局事件绑定 =============
// 点击遮罩关闭弹窗
document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// 登录页回车登录
document.getElementById('loginPass').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') doLogin();
});

// 顶部全局搜索：输入即提示 + 键盘导航 + 回车/点击跳转
const searchInput = document.getElementById('globalSearch');
searchInput.addEventListener('input', function() {
  searchActiveIndex = -1;
  renderSearchSuggestions(this.value);
});
searchInput.addEventListener('keydown', function(e) {
  const matches = getDeviceMatches(this.value);
  if (e.key === 'ArrowDown' && matches.length) {
    e.preventDefault();
    searchActiveIndex = (searchActiveIndex + 1) % matches.length;
    highlightSearchSuggestion();
  } else if (e.key === 'ArrowUp' && matches.length) {
    e.preventDefault();
    searchActiveIndex = (searchActiveIndex - 1 + matches.length) % matches.length;
    highlightSearchSuggestion();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchActiveIndex >= 0 && matches[searchActiveIndex]) selectSearchSuggestion(matches[searchActiveIndex].id);
    else searchGlobal(this.value);
  } else if (e.key === 'Escape') {
    hideSearchSuggestions();
  }
});
searchInput.addEventListener('blur', function() { setTimeout(hideSearchSuggestions, 120); });
// 点击搜索图标也可触发搜索
document.querySelector('.topbar .search-box .search-icon').addEventListener('click', function() {
  const input = document.getElementById('globalSearch');
  searchGlobal(input.value);
});
