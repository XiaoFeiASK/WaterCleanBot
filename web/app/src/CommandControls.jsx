import { useRef, useState } from 'react';
import { ArrowUpRight, Route } from 'lucide-react';
import { getRemoteCommandErrorMessage, sendRobotCommand } from './api';

// State describes published commands, not device ACKs. Keep each target independent.
export function TrackingSwitch({ deviceId, onToast }) {
  const [enabledByDevice, setEnabledByDevice] = useState({});
  const [busyByDevice, setBusyByDevice] = useState({});
  const pendingTargets = useRef(new Set());
  const enabled = enabledByDevice[deviceId] === true;
  const busy = busyByDevice[deviceId] === true;

  async function toggleTracking() {
    if (!deviceId) {
      onToast?.('请先查询需要控制的设备');
      return;
    }
    if (pendingTargets.current.has(deviceId)) return;
    const target = deviceId;
    const value = enabled ? 0 : 1;
    pendingTargets.current.add(target);
    setBusyByDevice((current) => ({ ...current, [target]: true }));
    try {
      const result = await sendRobotCommand(target, {
        command: 'TRACKING',
        value,
        values: { TRACKING: value },
        ttlMs: 800,
      });
      setEnabledByDevice((current) => ({ ...current, [target]: value === 1 }));
      onToast?.(`${value ? '开始' : '停止'}循迹指令已发布 ${JSON.stringify(result.protocol)}`, 'success');
    } catch (error) {
      onToast?.(getRemoteCommandErrorMessage(error));
    } finally {
      pendingTargets.current.delete(target);
      setBusyByDevice((current) => ({ ...current, [target]: false }));
    }
  }

  return (
    <button
      className="tracking-map-switch"
      type="button"
      role="switch"
      aria-label="循迹开关"
      aria-checked={enabled}
      aria-busy={busy}
      aria-disabled={busy}
      onClick={toggleTracking}
      title={`${enabled ? '停止循迹 [24,0]' : '按航线开始循迹 [24,1]'}；开关显示本页已发布状态，不代表设备反馈`}
    >
      <Route className="tracking-map-icon" size={18} aria-hidden="true" />
      <span className="tracking-map-label">
        <strong>循迹开关</strong>
        <small>{busy ? '指令下发中…' : enabled ? '已发开启 · 点击停止' : '按航线出发'}</small>
      </span>
      <span className="tracking-map-toggle" aria-hidden="true"><span /></span>
    </button>
  );
}

export function DockEjectButton({ deviceId, onToast }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function ejectDock() {
    if (!deviceId || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await sendRobotCommand(deviceId, { command: 'DOCK_EJECT' });
      onToast?.(`船坞弹出指令已发布 ${result.protocolHex || '[EA 01 EB]'}`, 'success');
    } catch (error) {
      onToast?.(getRemoteCommandErrorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      className="switch-control dock-eject-control"
      type="button"
      onClick={ejectDock}
      disabled={!deviceId || busy}
      aria-busy={busy}
      title="下发船坞弹出指令 EA 01 EB（原始十六进制字节）"
    >
      <span><strong>船坞弹出</strong><small>{busy ? '指令下发中…' : '点击执行一次'}</small></span>
      <span className="switch-state dock-eject-action">{busy ? '下发中' : '弹出'}<ArrowUpRight size={14} aria-hidden="true" /></span>
    </button>
  );
}
