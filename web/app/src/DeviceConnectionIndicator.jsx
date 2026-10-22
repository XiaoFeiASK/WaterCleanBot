import { useEffect, useState } from 'react';
import { hasCoordinates } from './api';
import './device-connection.css';

const MQTT_POSITION_TIMEOUT_MS = 3000;

// Status feedback also updates receivedAtMs; only the coordinate timestamp
// can keep this indicator on, including when the vessel has not moved.
export default function DeviceConnectionIndicator({ position }) {
  const [now, setNow] = useState(Date.now);
  const updatedAt = position?.positionUpdatedAtMs;
  const hasPositionTime = Number.isFinite(updatedAt) && updatedAt > 0;
  const age = now - updatedAt;
  const online = hasCoordinates(position) && hasPositionTime && age >= 0 && age <= MQTT_POSITION_TIMEOUT_MS;

  useEffect(() => {
    let timer;
    const refresh = () => {
      window.clearTimeout(timer);
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = updatedAt + MQTT_POSITION_TIMEOUT_MS - currentTime;
      if (Number.isFinite(updatedAt) && updatedAt > 0 && remaining >= 0) {
        // Exactly 3 seconds is still on; turn off once the deadline is exceeded.
        timer = window.setTimeout(refresh, Math.min(remaining + 1, 2147483647));
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [position?.robotName, updatedAt]);

  const detail = online ? '设备在线' : '设备离线';

  return (
    <div
      className={`device-connection device-connection--${online ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="设备运行状态"
      title="设备运行状态"
    >
      <span className="device-connection-lamp" aria-hidden="true"><span /></span>
      <span className="device-connection-copy">
        <strong>{online ? '开机' : '关机'}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
