const PI = Math.PI;
const SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;

function transformLatitude(x, y) {
  let value = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  value += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return value;
}

function transformLongitude(x, y) {
  let value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  value += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return value;
}

function isOutsideChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

// AMap uses GCJ-02 for mainland China. MQTT telemetry remains WGS-84.
export function wgs84ToGcj02({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || isOutsideChina(lat, lng)) {
    return { lat, lng };
  }

  const latitudeOffset = transformLatitude(lng - 105.0, lat - 35.0);
  const longitudeOffset = transformLongitude(lng - 105.0, lat - 35.0);
  const latitudeRadians = lat / 180.0 * PI;
  let magic = Math.sin(latitudeRadians);
  magic = 1 - ECCENTRICITY_SQUARED * magic * magic;
  const squareRootMagic = Math.sqrt(magic);
  const deltaLatitude = latitudeOffset * 180.0 / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * squareRootMagic) * PI);
  const deltaLongitude = longitudeOffset * 180.0 / (SEMI_MAJOR_AXIS / squareRootMagic * Math.cos(latitudeRadians) * PI);

  return {
    lat: lat + deltaLatitude,
    lng: lng + deltaLongitude,
  };
}
