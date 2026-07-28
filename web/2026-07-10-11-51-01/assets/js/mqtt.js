/* ============ MQTT 通信模块 (mqtt.js) ============
 * 与 broker 通信，向各无人艇下发控制指令。
 * broker 地址: 192.168.4.20（需开启 WebSocket 监听）
 * topic 规范:  USV/USV-{mqttId}/web   （mqttId 见 data.js 的 mockDevices）
 * payload:     JSON { cmd, usv, device, ts, seq }
 * 依赖: data.js（mockDevices / getCurrentDevice）与 mqtt CDN 全局对象 mqtt
 * =================================================== */

// ---- 可配置项（如 broker 类型/端口不同，请改这里）----
const MQTT_CONFIG = {
  host: '192.168.4.20',
  username: '',       // 若 broker 需要认证请填写
  password: '',
  clientId: 'AquaCleanWeb_' + Math.random().toString(16).slice(2, 10),
  keepalive: 30,
  qos: 0,             // 指令默认 QoS 0（如需可靠投递可改为 1）
  useSSL: false,
};

// 候选 WebSocket 端点：浏览器只能用 WebSocket，不能用 TCP/1883（那是 MQTTX 用的）
// 按常见 broker 配置依次尝试，连上第一个可用的即止
// 当前 broker 的 WebSocket 已开放在 9001（Mosquitto ws，path '/')，故排首选
const MQTT_WS_CANDIDATES = [
  { port: 9001,      path: '/',     desc: 'Mosquitto ws (broker 当前端口)' },
  { port: 8083,      path: '/mqtt', desc: 'EMQX ws' },
  { port: 8084,      path: '/mqtt', desc: 'EMQX wss', ssl: true },
];

let mqttCandidateIdx = 0;

// 按钮 → 指令动作映射（op 即 payload 中的 cmd 字段）
const DEVICE_COMMANDS = {
  start:  { label: '启动设备',   op: 'start'  },
  stop:   { label: '停止设备',   op: 'stop'   },
  return: { label: '返航充电',   op: 'return' },
  clean:  { label: '清理垃圾舱', op: 'clean'  },
  estop:  { label: '紧急停机',   op: 'estop'  },
};

let mqttClient = null;
let mqttConnected = false;
// 全局连接状态（即使徽标 DOM 当时不存在也保留，供视图渲染时读取）
let mqttStatusState = { state: 'error', text: 'MQTT 未连接' };
const commandLog = [];   // 指令发送记录（用于核对 / 抓包）
let commandSeq = 0;
const pendingCommands = [];  // 未连接时排队的指令，连上后补发

function mqttWsUrl(cand) {
  const proto = (cand.ssl || MQTT_CONFIG.useSSL) ? 'wss' : 'ws';
  return `${proto}://${MQTT_CONFIG.host}:${cand.port}${cand.path}`;
}

// 建立连接（登录后调用；重复调用安全）
// 依次尝试 MQTT_WS_CANDIDATES 中的端点，连上第一个可用的即止；全程打印真实错误便于排查
function connectMqtt() {
  if (typeof mqtt === 'undefined') {
    console.warn('[MQTT] mqtt.js 未加载（检查 index.html 的 CDN 引用）');
    updateMqttStatus('error', 'MQTT 库未加载');
    return;
  }
  if (mqttClient && (mqttConnected || mqttClient.connected)) return;
  mqttCandidateIdx = 0;
  tryConnectCandidate();
}

function tryConnectCandidate() {
  if (mqttCandidateIdx >= MQTT_WS_CANDIDATES.length) {
    updateMqttStatus('error', '所有 WS 端点均失败');
    console.error('[MQTT] 已尝试全部 WebSocket 候选端点，均无法连接。',
      '请确认 broker 已开启 WebSocket 监听，或在 mqtt.js 的 MQTT_WS_CANDIDATES 中补充正确端口/路径。',
      'MQTTX 用的是 TCP/1883，与浏览器 WebSocket 不是同一个监听器。');
    return;
  }
  const cand = MQTT_WS_CANDIDATES[mqttCandidateIdx];
  const url = mqttWsUrl(cand);
  let done = false; // 本次尝试是否已终结（成功或已切换到下一个）
  console.log(`[MQTT] 尝试连接 (${cand.desc}): ${url}`);
  updateMqttStatus('warn', `连接中…(${cand.desc})`);

  const moveNext = () => {
    if (done) return;
    done = true;
    try { client.end(true); } catch (_) {}
    mqttCandidateIdx++;
    tryConnectCandidate();
  };

  let client;
  try {
    client = mqtt.connect(url, {
      clientId: MQTT_CONFIG.clientId,
      keepalive: MQTT_CONFIG.keepalive,
      username: MQTT_CONFIG.username || undefined,
      password: MQTT_CONFIG.password || undefined,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 0,
    });
  } catch (e) {
    console.error(`[MQTT] 初始化失败 ${url}:`, e && e.message ? e.message : e);
    moveNext();
    return;
  }

  client.on('connect', () => {
    if (done) return;
    done = true;
    mqttClient = client;
    mqttConnected = true;
    updateMqttStatus('ok', `MQTT 已连接 (${cand.desc})`);
    console.log(`[MQTT] 连接成功: ${url}`);
    flushPendingCommands();
  });
  client.on('error', (e) => {
    console.error(`[MQTT] 端点 ${url} 错误:`, e && e.message ? e.message : e);
    moveNext();
  });
  client.on('close', () => {
    if (!mqttConnected) { moveNext(); }
    else { mqttConnected = false; updateMqttStatus('error', 'MQTT 已关闭'); }
  });
  client.on('offline', () => {
    if (!mqttConnected) { /* 未连上，等待 error/close 触发切换 */ }
    else { mqttConnected = false; updateMqttStatus('error', 'MQTT 已断开'); }
  });
}

// 设备 → topic
function getDeviceTopic(device) {
  return `USV/USV-${device.mqttId}/web`;
}

// 下发指令：构建 topic + payload，发布并记录。返回发送记录对象。
function publishDeviceCommand(device, action) {
  const cmd = DEVICE_COMMANDS[action];
  if (!cmd) { console.warn('[MQTT] 未知指令', action); return null; }
  const topic = getDeviceTopic(device);
  const payload = JSON.stringify({
    cmd: cmd.op,
    usv: 'USV-' + device.mqttId,
    device: device.id,
    ts: Date.now(),
    seq: ++commandSeq,
  });
  const record = {
    seq: commandSeq,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    device: device.name,
    mqttId: device.mqttId,
    action: cmd.label,
    op: cmd.op,
    topic,
    payload,
    qos: MQTT_CONFIG.qos,
    status: mqttConnected ? '已发送' : '已排队(未连接)',
  };
  commandLog.unshift(record);
  if (commandLog.length > 50) commandLog.pop();

  try {
    if (mqttClient && (mqttClient.connected || mqttConnected)) {
      mqttClient.publish(topic, payload, { qos: MQTT_CONFIG.qos, retain: false });
      record.status = '已发送';
    } else {
      // 未连接：先尝试建立连接，并把本条指令放入待发队列，连上后自动补发
      connectMqtt();
      pendingCommands.push({ topic, payload, record });
      record.status = '已排队(未连接)';
    }
  } catch (e) {
    record.status = '发送失败';
    console.error('[MQTT] publish error', e);
  }
  // 若指令记录面板当前可见，立即刷新
  if (document.getElementById('commandLogBody')) renderCommandLog();
  return record;
}

// 连接建立后补发所有等待中的指令
function flushPendingCommands() {
  if (!mqttClient || !mqttClient.connected) return;
  while (pendingCommands.length) {
    const item = pendingCommands.shift();
    try {
      mqttClient.publish(item.topic, item.payload, { qos: MQTT_CONFIG.qos, retain: false });
      item.record.status = '已发送';
    } catch (e) {
      item.record.status = '发送失败';
      console.error('[MQTT] 补发失败', e);
    }
  }
  if (document.getElementById('commandLogBody')) renderCommandLog();
}

// 渲染指令发送记录表格（在设备详情总览 tab 中）
function renderCommandLog() {
  const body = document.getElementById('commandLogBody');
  if (!body) return;
  if (commandLog.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:18px">暂无指令发送记录</td></tr>';
    return;
  }
  body.innerHTML = commandLog.map(r => `
    <tr>
      <td>${r.seq}</td>
      <td>${r.time}</td>
      <td>${r.device} <span style="color:var(--gray-400)">(USV-${r.mqttId})</span></td>
      <td><span class="badge badge-info">${r.action}</span></td>
      <td style="font-family:monospace;font-size:12px;word-break:break-all">${r.topic}</td>
      <td><span class="badge ${r.status === '已发送' ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
    </tr>
  `).join('');
}

// 更新 MQTT 连接状态徽标（先存全局，再写 DOM；DOM 不存在也不丢状态）
function updateMqttStatus(state, text) {
  mqttStatusState = { state, text };
  renderMqttStatus();
}
// 把当前全局状态应用到页面上已有的徽标元素（若不在本页则无操作）
function renderMqttStatus() {
  const el = document.getElementById('mqttStatus');
  if (!el) return;
  const colorMap = { ok: '#0F6E56', warn: '#BA7517', error: '#E24B4A' };
  el.innerHTML = `<span class="mqtt-dot" style="background:${colorMap[mqttStatusState.state] || '#999'}"></span>${mqttStatusState.text}`;
}
