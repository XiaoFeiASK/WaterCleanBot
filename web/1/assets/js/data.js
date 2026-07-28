// 文件作用：保存已定型前端原型使用的模拟业务数据。

/* ============ 数据层 (data.js) ============
 * 所有模拟数据与状态映射集中在此，供各视图 / 地图模块复用。
 * 设备数据含真实经纬度 lat/lng，供设备详情页高德地图定位使用。
 * =========================================== */

const mockDevices = [
  { id:'AC-001', name:'清澜一号', status:'online', water:'苏州河-黄浦段', battery:85, cabin:62, mileage:1280, lat:31.2304, lng:121.4737, speed:1.2 },
  { id:'AC-002', name:'清澜二号', status:'online', water:'苏州河-静安段', battery:72, cabin:45, mileage:980, lat:31.2284, lng:121.4557, speed:0.8 },
  { id:'AC-003', name:'清澜三号', status:'charging', water:'淀山湖-东区', battery:23, cabin:88, mileage:2100, lat:31.1084, lng:120.9737, speed:0 },
  { id:'AC-004', name:'清澜四号', status:'online', water:'黄浦江-徐汇段', battery:91, cabin:30, mileage:1560, lat:31.1904, lng:121.4437, speed:1.5 },
  { id:'AC-005', name:'清澜五号', status:'offline', water:'淀山湖-西区', battery:0, cabin:95, mileage:3400, lat:31.0984, lng:120.9537, speed:0 },
  { id:'AC-006', name:'清澜六号', status:'online', water:'苏州河-普陀段', battery:65, cabin:70, mileage:890, lat:31.2404, lng:121.4237, speed:1.0 },
  { id:'AC-007', name:'清澜七号', status:'online', water:'黄浦江-杨浦段', battery:78, cabin:55, mileage:1780, lat:31.2704, lng:121.5137, speed:1.3 },
  { id:'AC-008', name:'清澜八号', status:'charging', water:'淀山湖-北区', battery:15, cabin:92, mileage:2600, lat:31.1284, lng:120.9837, speed:0 },
];

// 为每台无人艇分配 MQTT 信号地址（topic 中 USV-0x 的 0x）。
// 若实际设备的硬件地址不同，只需修改下面的 mqttId 值即可。
mockDevices.forEach((d, i) => { d.mqttId = String(i + 1).padStart(2, '0'); });

const mockWaterAreas = [
  { id:'WA-001', name:'苏州河-黄浦段', area:2.5, devices:2, tasks:3, status:'active' },
  { id:'WA-002', name:'苏州河-静安段', area:1.8, devices:1, tasks:2, status:'active' },
  { id:'WA-003', name:'淀山湖-东区', area:5.2, devices:2, tasks:4, status:'active' },
  { id:'WA-004', name:'黄浦江-徐汇段', area:3.1, devices:1, tasks:2, status:'active' },
  { id:'WA-005', name:'淀山湖-西区', area:4.7, devices:1, tasks:1, status:'paused' },
  { id:'WA-006', name:'苏州河-普陀段', area:2.0, devices:1, tasks:2, status:'active' },
];

const mockTasks = [
  { id:'TK-20260710-001', name:'苏州河黄浦段日常清洁', water:'苏州河-黄浦段', device:'清澜一号', status:'running', progress:68, scheduled:'2026-07-10 08:00' },
  { id:'TK-20260710-002', name:'淀山湖东区深度清洁', water:'淀山湖-东区', device:'清澜三号', status:'pending', progress:0, scheduled:'2026-07-10 14:00' },
  { id:'TK-20260709-003', name:'黄浦江徐汇段巡查', water:'黄浦江-徐汇段', device:'清澜四号', status:'completed', progress:100, scheduled:'2026-07-09 06:00' },
  { id:'TK-20260710-004', name:'苏州河静安段日常清洁', water:'苏州河-静安段', device:'清澜二号', status:'running', progress:42, scheduled:'2026-07-10 09:00' },
  { id:'TK-20260710-005', name:'淀山湖西区定期清洁', water:'淀山湖-西区', device:'清澜五号', status:'paused', progress:35, scheduled:'2026-07-10 07:30' },
  { id:'TK-20260710-006', name:'黄浦江杨浦段清洁', water:'黄浦江-杨浦段', device:'清澜七号', status:'running', progress:55, scheduled:'2026-07-10 10:00' },
];

const mockAlerts = [
  { id:'AL-001', level:'danger', device:'清澜五号', type:'设备离线', desc:'设备已离线超过30分钟', time:'2026-07-10 11:20', status:'active' },
  { id:'AL-002', level:'warning', device:'清澜三号', type:'垃圾舱满载', desc:'垃圾舱容量已达88%，建议返航清理', time:'2026-07-10 10:45', status:'active' },
  { id:'AL-003', level:'warning', device:'清澜八号', type:'垃圾舱满载', desc:'垃圾舱容量已达92%，建议返航清理', time:'2026-07-10 10:30', status:'active' },
  { id:'AL-004', level:'info', device:'清澜一号', type:'任务完成', desc:'苏州河黄浦段日常清洁任务已完成68%', time:'2026-07-10 09:30', status:'resolved' },
  { id:'AL-005', level:'danger', device:'清澜三号', type:'电量不足', desc:'设备电量低于25%，即将自动返航', time:'2026-07-10 09:15', status:'resolved' },
  { id:'AL-006', level:'warning', device:'清澜七号', type:'水质异常', desc:'溶解氧量低于5mg/L阈值', time:'2026-07-10 08:50', status:'resolved' },
];

const mockAccounts = [
  { id:1, username:'admin', name:'系统管理员', role:'超级管理员', phone:'138****8888', status:'active', lastLogin:'2026-07-10 11:30' },
  { id:2, username:'operator1', name:'张操作员', role:'操作员', phone:'139****6666', status:'active', lastLogin:'2026-07-10 08:15' },
  { id:3, username:'operator2', name:'李操作员', role:'操作员', phone:'137****7777', status:'active', lastLogin:'2026-07-09 17:20' },
  { id:4, username:'viewer1', name:'王观察员', role:'观察员', phone:'136****5555', status:'disabled', lastLogin:'2026-07-05 14:00' },
  { id:5, username:'manager1', name:'赵经理', role:'管理员', phone:'135****3333', status:'active', lastLogin:'2026-07-10 09:00' },
];

const mockRoles = [
  { id:1, name:'超级管理员', code:'super_admin', users:1, desc:'拥有系统全部权限', permissions:32 },
  { id:2, name:'管理员', code:'admin', users:1, desc:'管理设备、水域、任务、预警', permissions:24 },
  { id:3, name:'操作员', code:'operator', users:2, desc:'操作设备、执行任务', permissions:16 },
  { id:4, name:'观察员', code:'viewer', users:1, desc:'只读查看所有数据', permissions:8 },
];

const statusMap = {
  online: { label:'在线', cls:'badge-success', dot:'#0F6E56' },
  offline: { label:'离线', cls:'badge-danger', dot:'#E24B4A' },
  charging: { label:'充电中', cls:'badge-warning', dot:'#BA7517' },
};
const taskStatusMap = {
  running: { label:'执行中', cls:'badge-info' },
  pending: { label:'待执行', cls:'badge-gray' },
  completed: { label:'已完成', cls:'badge-success' },
  paused: { label:'已暂停', cls:'badge-warning' },
};
const alertLevelMap = {
  danger: { label:'严重', cls:'badge-danger' },
  warning: { label:'警告', cls:'badge-warning' },
  info: { label:'通知', cls:'badge-info' },
};
