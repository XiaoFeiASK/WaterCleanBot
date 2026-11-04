import { wgs84ToGcj02 } from './coordinates';

export const SHORELINE_MAX_BYTES = 20 * 1024 * 1024;
const IMPORTED_ROUTE_SPEED_METERS_PER_SECOND = 1;
const METERS_PER_SECOND_PER_KNOT = 0.514444;
const IMPORTED_ROUTE_SPEED_KNOTS = IMPORTED_ROUTE_SPEED_METERS_PER_SECOND / METERS_PER_SECOND_PER_KNOT;
export const SHORELINE_FILE_TYPES = Object.freeze([
  { key: 'shoreline', filename: 'shoreline_lonlat.json', label: '岸线与桥孔' },
  { key: 'left', filename: 'left_waypoints_lonlat.json', label: '左岸航线' },
  { key: 'center', filename: 'center_waypoints_lonlat.json', label: '中心感知航线' },
  { key: 'right', filename: 'right_waypoints_lonlat.json', label: '右岸航线' },
]);

export const ROUTE_TYPE_LABELS = Object.freeze({
  shoreline: '智能岸线',
  centerline: '智能中线',
  custom: '自定航线',
  legacy: '自定航线',
});

export function getRouteTypeLabel(value) {
  if (value === ROUTE_TYPE_LABELS.shoreline || value === '规划航线') return ROUTE_TYPE_LABELS.shoreline;
  if (value === ROUTE_TYPE_LABELS.centerline || value === '感知航线') return ROUTE_TYPE_LABELS.centerline;
  return ROUTE_TYPE_LABELS.custom;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function validCoordinate(point) {
  return Number.isFinite(point?.longitude_deg) && Math.abs(point.longitude_deg) <= 180
    && Number.isFinite(point?.latitude_deg) && Math.abs(point.latitude_deg) <= 90;
}

// Validate only the display contract; preserve original navigation and accuracy fields.
export function validateShorelineFiles(files) {
  const normalized = {};
  let session;
  for (const { key, label } of SHORELINE_FILE_TYPES) {
    const data = files?.[key];
    const check = (condition, message) => requireValue(condition, `${label}：${message}`);
    if (data == null) continue;
    check(typeof data === 'object' && !Array.isArray(data), 'JSON 根节点必须是对象');
    if (key !== 'shoreline' && Array.isArray(data.points) && data.points.length === 0 && data.contours == null) continue;
    check(data.schema_version === 3 && data.datum === 'WGS84'
      && typeof data.session_id === 'string' && data.session_id.trim(), '需要 schema_version=3、WGS84 和 session_id');
    check(data.valid === true && ['completed', 'partial'].includes(data.state), '仅接受有效的 completed 或 partial 数据');
    check(session === undefined || session === data.session_id, 'session_id 不一致，不能混用不同组数据');
    session = data.session_id;
    let count = 0;
    if (key === 'shoreline') {
      check(Array.isArray(data.contours) && data.contours.length > 0 && data.points == null
        && data.contour_count === data.contours.length, 'contours 或 contour_count 错误');
      const contours = new Set();
      const lines = new Set();
      for (const contour of data.contours) {
        check(Number.isInteger(contour?.contour_id) && contour.contour_id > 0 && !contours.has(contour.contour_id)
          && [0, 1].includes(contour.side) && Array.isArray(contour.sections) && contour.sections.length > 0, '轮廓编号、侧别或分段错误');
        contours.add(contour.contour_id);
        const orders = new Set();
        for (const section of contour.sections) {
          check(Number.isInteger(section?.line_id) && section.line_id > 0 && !lines.has(section.line_id)
            && section.contour_id === contour.contour_id && Number.isInteger(section.section_order) && section.section_order > 0
            && !orders.has(section.section_order) && section.side === contour.side && [1, 3].includes(section.kind)
            && Array.isArray(section.points) && section.points.length > 0, '岸桥分段编号、顺序、侧别或类型错误');
          lines.add(section.line_id);
          orders.add(section.section_order);
          check(section.points.every(validCoordinate), '岸桥点经纬度缺失或超出范围');
          count += section.points.length;
        }
      }
    } else {
      check(Array.isArray(data.points) && data.points.length > 0 && data.contours == null && data.route_name === key, '参考线类型或 points 错误');
      if (key === 'center') {
        check(data.planning_mode === 'center_reference' && data.side == null && !data.bank_name, '中心参考线类型错误');
      } else {
        check(data.planning_mode === 'near_bank_reference' && data.bank_name === key && data.side === (key === 'left' ? 1 : 0), '近岸参考线侧别错误');
      }
      let previousID = 0;
      for (const point of data.points) {
        check(validCoordinate(point) && Number.isInteger(point.point_id) && point.point_id > previousID
          && Number.isInteger(point.reference_segment_id) && point.reference_segment_id > 0
          && typeof point.reference_can_connect_previous === 'boolean', '参考点经纬度、编号或参考连接字段错误');
        if (key !== 'center') check(Number.isInteger(point.map_section) && point.map_section > 0 && point.side === data.side, '近岸参考点章节或侧别错误');
        previousID = point.point_id;
      }
      count = data.points.length;
    }
    check(data.point_count === count, 'point_count 与实际点数不一致');
    normalized[key] = data;
  }
  requireValue(Object.keys(normalized).length > 0, '请至少上传一个有效的岸线或航线文件');
  return normalized;
}

export function mergeShorelineFiles(current, uploaded) {
  return validateShorelineFiles({ ...current, ...validateShorelineFiles(uploaded) });
}

export function getShorelineSession(files) {
  return SHORELINE_FILE_TYPES.map(({ key }) => files?.[key]?.session_id).find(Boolean) || '';
}

export async function readShorelineFiles(selectedFiles) {
  const selected = Array.from(selectedFiles);
  requireValue(selected.reduce((sum, file) => sum + file.size, 0) <= SHORELINE_MAX_BYTES, '上传数据不能超过 20 MiB');
  const data = {};
  for (const file of selected) {
    const type = SHORELINE_FILE_TYPES.find(({ filename }) => filename === file.name);
    requireValue(type, `不支持的文件：${file.name}`);
    requireValue(!(type.key in data), `重复文件类型：${type.label}`);
    let text;
    if (typeof file.text === 'function') text = await file.text();
    else text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`无法读取：${file.name}`));
      reader.readAsText(file);
    });
    try { data[type.key] = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error(`${file.name}：JSON 格式错误`); }
  }
  return validateShorelineFiles(data);
}

export function getShorelineSections(files) {
  if (!files?.shoreline) return [];
  const sections = files.shoreline.contours.flatMap((contour) => [...contour.sections]
    .sort((a, b) => a.section_order - b.section_order)
    .map((section) => ({
      id: `shore-${contour.contour_id}-${section.line_id}`,
      side: contour.side,
      kind: section.kind,
      points: section.points.map((point) => [point.longitude_deg, point.latitude_deg]),
    })));
  return sections.map((section) => ({
    ...section,
    path: section.points.map(([lng, lat]) => {
      const mapped = wgs84ToGcj02({ lng, lat });
      return [mapped.lng, mapped.lat];
    }),
  }));
}

export function getImportedRoutes(files) {
  return SHORELINE_FILE_TYPES.filter(({ key }) => key !== 'shoreline' && files?.[key]?.points?.length)
    .map(({ key, filename, label }) => {
      const document = files[key];
      const segments = [];
      let previous;
      let durationSeconds = 0;
      const points = document.points.map((point, index) => {
        if (!previous || point.reference_can_connect_previous !== true
          || point.reference_segment_id !== previous.reference_segment_id
          || (key !== 'center' && point.map_section !== previous.map_section)) segments.push([]);
        const speedKnots = Number.isFinite(point.speed_knots) && point.speed_knots > 0
          ? point.speed_knots
          : IMPORTED_ROUTE_SPEED_KNOTS;
        const speedMetersPerSecond = speedKnots * METERS_PER_SECOND_PER_KNOT;
        const position = { lng: point.longitude_deg, lat: point.latitude_deg, speedKnots, speedMetersPerSecond };
        const mapped = { ...wgs84ToGcj02(position), speedKnots, speedMetersPerSecond, seq: index + 1, pointId: point.point_id };
        if (previous && point.reference_can_connect_previous === true
          && point.reference_segment_id === previous.reference_segment_id
          && (key === 'center' || point.map_section === previous.map_section)) {
          durationSeconds += distanceMeters(
            { lng: previous.longitude_deg, lat: previous.latitude_deg },
            position,
          ) / speedMetersPerSecond;
        }
        segments.at(-1).push(mapped);
        previous = point;
        return position;
      });
      // Length follows only connected segments; gaps must not become navigation legs.
      const lengthMeters = segments.reduce((total, segment) => total + segment.slice(1).reduce((sum, point, index) => {
        const a = points[segment[index].seq - 1];
        const b = points[point.seq - 1];
        const rad = Math.PI / 180;
        const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
          + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
        return sum + 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
      }, 0), 0);
      return {
        id: `imported-${key}`, sourceKey: key, filename, name: label,
        type: key === 'center' ? ROUTE_TYPE_LABELS.centerline : ROUTE_TYPE_LABELS.shoreline, coordinateSystem: 'WGS84',
        color: key === 'center' ? '#ffc928' : key === 'left' ? '#ff963b' : '#36c7f4',
        points, segments, lengthMeters,
        speedMetersPerSecond: points.length > 0
          ? points.reduce((sum, point) => sum + point.speedMetersPerSecond, 0) / points.length
          : IMPORTED_ROUTE_SPEED_METERS_PER_SECOND,
        durationSeconds: Math.ceil(durationSeconds),
      };
    });
}

function distanceMeters(start, end) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(end.lat - start.lat);
  const deltaLng = radians(end.lng - start.lng);
  const startLat = radians(start.lat);
  const endLat = radians(end.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function withoutImportedRoute(files, key) {
  if (!['left', 'center', 'right'].includes(key)) throw new Error('只能删除导入的航线文件');
  const { [key]: removed, ...remaining } = files;
  return remaining;
}

// 只更新公共航线点的速度字段，保留编号、连接关系、侧别和测绘元数据。
export function withImportedRouteSpeeds(files, key, speeds) {
  if (!['left', 'center', 'right'].includes(key)) throw new Error('只能编辑导入的航线文件');
  const document = files?.[key];
  if (!document?.points?.length || speeds.length !== document.points.length) throw new Error('公共航线数据已变化，请重新加载');
  return {
    ...files,
    [key]: {
      ...document,
      points: document.points.map((point, index) => ({
        ...point,
        speed_knots: speeds[index],
      })),
    },
  };
}

// 逆转只改变展示和下发顺序，最后一点成为新的第一点。
export function reverseImportedRoute(route) {
  let seq = 1;
  const segments = [...(route.segments || [])].reverse().map((segment) =>
    [...segment].reverse().map((point) => ({ ...point, seq: seq++ })));
  return {
    ...route,
    points: [...(route.points || [])].reverse(),
    segments,
  };
}

export function getShorelineWarnings(files) {
  if (!files) return [];
  const entries = SHORELINE_FILE_TYPES.filter(({ key }) => files[key]);
  const warnings = [];
  if (entries.some(({ key }) => files[key].state === 'partial')) warnings.push('包含部分结果');
  if (entries.some(({ key }) => files[key].geographic_accuracy_verified !== true)) warnings.push('测绘精度未独立验证');
  if (entries.some(({ key }) => key !== 'shoreline' && files[key].navigation_valid !== true)) warnings.push('参考线未全部通过通行核验');
  return warnings;
}
