import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Anchor, ArrowUpRight, CheckCircle2, Play, Route, Square, X } from 'lucide-react';
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

export function formatTrackingDuration(startedAt, endedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
  const totalSeconds = Math.round((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}时${minutes}分${seconds}秒`;
}

function createTrackingCompletion(stat, route) {
  if (!Number.isFinite(stat?.batteryConsumedPercent) || typeof stat?.updatedAt !== 'string') return null;
  const duration = formatTrackingDuration(stat.startedAt, stat.endedAt);
  if (!duration) return null;
  return {
    routeName: stat.routeName || route?.name || '',
    duration,
    batteryConsumedPercent: stat.batteryConsumedPercent,
  };
}

function formatConsumedBattery(value) {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function TrackingCompletionDialog({ completion, onClose }) {
  useEffect(() => {
    if (!completion) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [completion, onClose]);

  useEffect(() => {
    if (!completion) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [completion]);

  if (!completion) return null;
  return createPortal(
    <div className="tracking-result-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="tracking-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-result-title"
        aria-describedby="tracking-result-description"
      >
        <button className="tracking-result-close" type="button" aria-label="关闭循迹结果" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="tracking-result-icon" aria-hidden="true">
          <CheckCircle2 size={30} />
        </div>
        <p className="tracking-result-eyebrow">循迹任务已完成</p>
        <h2 id="tracking-result-title">本次循迹结果</h2>
        <p id="tracking-result-description" className="tracking-result-copy">
          本次循迹耗时 <strong>{completion.duration || '暂不可用'}</strong>，
          {'损耗电量'}<span className="tracking-result-battery-icon" aria-hidden="true">🔋</span>{'为 '}
          <strong> {formatConsumedBattery(completion.batteryConsumedPercent)}</strong>！
        </p>
        {completion.routeName && <small className="tracking-result-route">绑定航线 · {completion.routeName}</small>}
        <button className="tracking-result-confirm" type="button" autoFocus onClick={onClose}>知道了</button>
      </section>
    </div>,
    document.body,
  );
}

// State describes published commands, not device ACKs. Keep each target independent.
export function TrackingButton({ deviceId, route, onTrackingStatsChange, onToast }) {
  const [enabledByDevice, setEnabledByDevice] = useState({});
  const [busyByDevice, setBusyByDevice] = useState({});
  const [completion, setCompletion] = useState(null);
  const pendingTargets = useRef(new Set());
  const startedRoutes = useRef({});
  const enabled = enabledByDevice[deviceId] === true;
  const busy = busyByDevice[deviceId] === true;

  async function sendTracking(value) {
    if (!deviceId) {
      onToast?.('请先查询需要控制的设备');
      return;
    }
    if (pendingTargets.current.has(deviceId)) return;
    const target = deviceId;
    // 循迹指令不依赖已下发航线；只有记录耗电时才需要绑定航线。
    const startedRoute = startedRoutes.current[target];
    const trackingRoute = value
      ? (route || null)
      : (Object.prototype.hasOwnProperty.call(startedRoutes.current, target) ? startedRoute : (route || null));
    if (!confirmAction(`确认${value ? '开始' : '结束'}循迹吗？`)) return;
    let statsUpdated = false;
    pendingTargets.current.add(target);
    setBusyByDevice((current) => ({ ...current, [target]: true }));
    try {
      const stat = trackingRoute
        ? await onTrackingStatsChange?.(value ? 'start' : 'end', trackingRoute)
        : null;
      statsUpdated = Boolean(trackingRoute);
      const result = await sendRobotCommand(target, {
        command: 'TRACKING',
        value,
        values: { TRACKING: value },
        ttlMs: 800,
      });
      if (value) startedRoutes.current[target] = trackingRoute;
      setEnabledByDevice((current) => ({ ...current, [target]: value === 1 }));
      if (value === 0) {
        const nextCompletion = createTrackingCompletion(stat, trackingRoute);
        if (nextCompletion) setCompletion(nextCompletion);
        delete startedRoutes.current[target];
      }
      onToast?.(`${value ? '开始' : '结束'}循迹指令已发布 ${JSON.stringify(result.protocol)}`, 'success');
    } catch (error) {
      if (statsUpdated) {
        try {
          await onTrackingStatsChange?.('cancel', trackingRoute);
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
    <>
      <div className="tracking-map-button" role="group" aria-label="循迹控制">
        <span className="critical-control-icon" aria-hidden="true"><Route size={22} /></span>
        <span className="tracking-map-label">
          <strong>循迹控制</strong>
        </span>
        <div className="tracking-map-actions">
          <button
            className="tracking-map-action"
            type="button"
            aria-label="开始循迹"
            title="开始循迹 [24,1]；已发布状态不代表设备反馈"
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
      <TrackingCompletionDialog completion={completion} onClose={() => setCompletion(null)} />
    </>
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
        <span><strong>船坞释放</strong><small>{busy ? '指令下发中…' : '点击循环一次'}</small></span>
      </span>
      <span className={`dock-eject-indicator ${indicatorActive ? 'is-active' : ''}`} title={indicatorActive ? '指示灯已点亮，剩余 10 秒' : '待机'} aria-label={indicatorActive ? '船坞释放指示灯已点亮' : '船坞释放指示灯待机'} />
      <span className="switch-state dock-eject-action">{busy ? '下发中' : '释放'}<ArrowUpRight size={16} aria-hidden="true" /></span>
    </button>
  );
}
