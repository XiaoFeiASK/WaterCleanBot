import { useEffect, useRef, useState } from 'react';
import { Anchor, ArrowUpRight, Play, Route, Square } from 'lucide-react';
import { getRemoteCommandErrorMessage, sendRobotCommand } from './api';

function confirmAction(message) {
  try { return window.confirm(message) !== false; } catch { return true; }
}

export function requestRemoteSwitchConfirmation(command, nextValue) {
  if (command.cmd === 'OPERATING_MODE') {
    return confirmAction(`确认切换控制状态为“${nextValue === 1 ? command.onText : command.offText}”吗？`);
  }
  return true;
}

// State describes published commands, not device ACKs. Keep each target independent.
export function TrackingButton({ deviceId, route, onTrackingStatsChange, onToast }) {
  const [enabledByDevice, setEnabledByDevice] = useState({});
  const [busyByDevice, setBusyByDevice] = useState({});
  const pendingTargets = useRef(new Set());
  const enabled = enabledByDevice[deviceId] === true;
  const busy = busyByDevice[deviceId] === true;

  async function sendTracking(value) {
    if (!deviceId) {
      onToast?.('请先查询需要控制的设备');
      return;
    }
    if (value && !route) {
      onToast?.('请先下发一条航线，再开始循迹');
      return;
    }
    if (pendingTargets.current.has(deviceId)) return;
    const target = deviceId;
    if (!value && !route) {
      onToast?.('当前没有已绑定的循迹航线');
      return;
    }
    if (!confirmAction(`确认${value ? '开始' : '结束'}循迹吗？`)) return;
    let statsUpdated = false;
    pendingTargets.current.add(target);
    setBusyByDevice((current) => ({ ...current, [target]: true }));
    try {
      await onTrackingStatsChange?.(value ? 'start' : 'end', route);
      statsUpdated = true;
      const result = await sendRobotCommand(target, {
        command: 'TRACKING',
        value,
        values: { TRACKING: value },
        ttlMs: 800,
      });
      setEnabledByDevice((current) => ({ ...current, [target]: value === 1 }));
      onToast?.(`${value ? '开始' : '结束'}循迹指令已发布 ${JSON.stringify(result.protocol)}`, 'success');
    } catch (error) {
      if (statsUpdated) {
        try {
          await onTrackingStatsChange?.('cancel', route);
        } catch {
          // 保留最初的指令下发错误，便于用户判断是否需要重试。
        }
      }
      onToast?.(getRemoteCommandErrorMessage(error));
    } finally {
      pendingTargets.current.delete(target);
      setBusyByDevice((current) => ({ ...current, [target]: false }));
    }
  }

  return (
    <div className="tracking-map-button" role="group" aria-label="循迹控制">
      <span className="critical-control-icon" aria-hidden="true"><Route size={22} /></span>
      <span className="tracking-map-label">
        <strong>循迹控制</strong>
        <small>{busy ? '指令下发中…' : '点击循环一次'}</small>
      </span>
      <div className="tracking-map-actions">
        <button
          className="tracking-map-action"
          type="button"
          aria-label="开始循迹"
          title="按航线开始循迹 [24,1]；已发布状态不代表设备反馈"
          aria-pressed={enabled}
          disabled={!deviceId || busy}
          onClick={() => sendTracking(1)}
        >
          <Play size={16} aria-hidden="true" />
          开始
        </button>
        <button
          className="tracking-map-action is-stop"
          type="button"
          aria-label="结束循迹"
          title="结束循迹 [24,0]；已发布状态不代表设备反馈"
          disabled={!deviceId || busy}
          onClick={() => sendTracking(0)}
        >
          <Square size={16} aria-hidden="true" />
          结束
        </button>
      </div>
    </div>
  );
}

export function DockEjectButton({ deviceId, onToast }) {
  const [busy, setBusy] = useState(false);
  const [indicatorActive, setIndicatorActive] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!indicatorActive) return undefined;
    const timer = window.setTimeout(() => setIndicatorActive(false), 10000);
    return () => window.clearTimeout(timer);
  }, [indicatorActive]);

  async function ejectDock() {
    if (!deviceId || pending.current) return;
    if (!confirmAction('确认执行船坞释放吗？')) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await sendRobotCommand(deviceId, { command: 'DOCK_EJECT' });
      setIndicatorActive(true);
      onToast?.(`船坞释放指令已发布 ${result.protocolHex || '[EA 01 EB]'}`, 'success');
    } catch (error) {
      onToast?.(getRemoteCommandErrorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      className="switch-control critical-control critical-control--dock dock-eject-control"
      type="button"
      onClick={ejectDock}
      disabled={!deviceId || busy}
      aria-busy={busy}
      title="下发船坞释放指令 EA 01 EB（原始十六进制字节）"
    >
      <span className="critical-control-copy">
        <span className="critical-control-icon" aria-hidden="true"><Anchor size={22} /></span>
        <span><strong>船坞释放</strong><small>当前状态</small></span>
      </span>
      <span className={`dock-eject-indicator ${indicatorActive ? 'is-active' : ''}`} title={indicatorActive ? '指示灯已点亮，剩余 10 秒' : '待机'} aria-label={indicatorActive ? '船坞释放指示灯已点亮' : '船坞释放指示灯待机'} />
      <span className="switch-state dock-eject-action">{busy ? '下发中' : '释放'}<ArrowUpRight size={16} aria-hidden="true" /></span>
    </button>
  );
}
