import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Eye, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { deleteShoreline, fetchShoreline, replaceShoreline } from './shoreline-api';
import { getShorelineWarnings, readShorelineFiles, SHORELINE_FILE_TYPES } from './shorelines';
import './shoreline.css';

export function usePublicShoreline() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(null);
  const mutation = useRef(false);
  const reload = useCallback(async () => {
    if (mutation.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const seq = ++sequence.current;
    setLoading(true);
    try {
      const next = await fetchShoreline(controller.signal);
      if (seq === sequence.current) { setDataset(next); setError(''); }
      return next;
    } catch (failure) {
      if (seq === sequence.current && !controller.signal.aborted) setError(failure.message);
      throw failure;
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const refresh = () => { void reload().catch(() => {}); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      ++sequence.current;
      pending.current?.abort();
    };
  }, [reload]);

  async function mutate(operation) {
    if (mutation.current) throw new Error('岸线操作正在进行中');
    mutation.current = true;
    ++sequence.current;
    pending.current?.abort();
    setLoading(false);
    setBusy(true);
    try {
      const next = await operation();
      setDataset(next);
      setError('');
      return next;
    } finally { mutation.current = false; setBusy(false); }
  }
  return {
    dataset, loading, error, busy, reload,
    replace: (files, revision) => mutate(() => replaceShoreline(files, revision)),
    remove: (revision) => mutate(() => deleteShoreline(revision)),
  };
}

export function ShorelineWarnings({ files }) {
  const warnings = getShorelineWarnings(files);
  return warnings.length > 0 && <span className="shoreline-warning"><CircleAlert size={15} aria-hidden="true" />{warnings.join(' · ')}</span>;
}

export default function ShorelineManager({ store, onPreview, onCancelPreview, onSaved, onDeleted, onClose }) {
  const { dataset, loading, busy, reload, replace, remove } = store;
  const [staged, setStaged] = useState(null);
  const [expectedRevision, setExpectedRevision] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const selectionSeq = useRef(0);
  const inputRef = useRef(null);
  useEffect(() => () => { ++selectionSeq.current; }, []);

  function clearStage() {
    ++selectionSeq.current;
    setStaged(null);
    setPreviewing(false);
    setReading(false);
    setConflict(false);
    if (inputRef.current) inputRef.current.value = '';
    onCancelPreview();
  }
  async function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    clearStage();
    const seq = ++selectionSeq.current;
    const baseRevision = dataset?.revision ?? null;
    setReading(true);
    setError('');
    try {
      const files = await readShorelineFiles(selected);
      if (seq !== selectionSeq.current) return;
      setStaged(files);
      setExpectedRevision(baseRevision);
    } catch (failure) {
      if (seq === selectionSeq.current) setError(failure.message);
    } finally { if (seq === selectionSeq.current) setReading(false); }
  }
  async function refresh() {
    try {
      const next = await reload();
      setExpectedRevision(next?.revision ?? null);
      setConflict(false);
      setError('');
    } catch (failure) { setError(failure.message); }
  }
  function report(failure) {
    setError(failure.message);
    if (failure.status === 409) setConflict(true);
  }
  async function save() {
    if (!staged || conflict) return;
    if (!window.confirm('确认替换公共岸线及导入航线？所有用户将使用新数据，旧数据及未上传的航线将被清空，无法从应用恢复。')) return;
    try {
      await replace(staged, expectedRevision);
      clearStage();
      setError('');
      onSaved();
    } catch (failure) { report(failure); }
  }
  async function deleteCurrent() {
    if (!dataset || !window.confirm('确认删除公共岸线及全部导入航线？此操作影响所有用户，应用内无法恢复，不会删除电脑上的原始 JSON。')) return;
    try {
      await remove(dataset.revision);
      clearStage();
      setError('');
      onDeleted?.();
    } catch (failure) { report(failure); }
  }
  const disabled = busy || reading || loading;
  return (
    <section className="shoreline-manager" aria-label="公共岸线管理" aria-busy={busy || reading}>
      <header className="shoreline-manager-heading">
        <div><strong>公共岸线</strong><span>{loading ? '正在读取' : dataset ? `来源 ${dataset.files.shoreline.session_id}` : '暂无公共岸线'}</span></div>
        <div className="shoreline-icon-actions">
          <button type="button" title="重新加载当前数据" aria-label="重新加载当前数据" onClick={refresh} disabled={disabled}><RefreshCw size={17} /></button>
          <button type="button" title="关闭岸线管理" aria-label="关闭岸线管理" onClick={() => { clearStage(); onClose(); }} disabled={busy}><X size={18} /></button>
        </div>
      </header>
      {dataset && <div className="shoreline-metadata">
        <span>更新于 {new Date(dataset.updatedAt).toLocaleString('zh-CN')}</span>
        <span>上传人 {dataset.uploadedBy.displayName}</span>
        <span>岸线 {dataset.files.shoreline.point_count} 点</span>
        <ShorelineWarnings files={dataset.files} />
      </div>}
      <div className="shoreline-file-toolbar">
        <label className={`button button-secondary shoreline-upload ${disabled ? 'shoreline-disabled' : ''}`}>
          <Upload size={16} aria-hidden="true" />{reading ? '校验中' : '选择 JSON 文件'}
          <input ref={inputRef} type="file" accept=".json,application/json" multiple aria-label="上传岸线 JSON 文件" onChange={selectFiles} disabled={disabled} />
        </label>
        <span className="shoreline-file-limit">岸线必传 · 航线可选 · 20 MiB</span>
        {dataset && <button type="button" className="button button-danger-soft" onClick={deleteCurrent} disabled={disabled || conflict}><Trash2 size={15} />删除公共岸线</button>}
      </div>
      <div className="shoreline-files" role="list" aria-label="岸线文件列表">
        {SHORELINE_FILE_TYPES.map(({ key, filename, label, required }) => {
          const file = staged ? staged[key] : dataset?.files[key];
          return <div className="shoreline-file-row" role="listitem" key={key}>
            <div><strong>{label}{required && <small>必传</small>}</strong><span>{filename}</span></div>
            <span className={file ? 'shoreline-file-valid' : ''}>{file ? `${staged ? '校验通过 · ' : ''}${file.point_count} 点` : staged ? '未上传，将清空' : '未导入'}</span>
          </div>;
        })}
      </div>
      {staged && <div className="shoreline-staged-status"><span>待导入来源：{staged.shoreline.session_id}</span><ShorelineWarnings files={staged} /></div>}
      {(error || store.error) && <div className="shoreline-error" role="alert">{error || store.error}</div>}
      {staged && <footer className="shoreline-manager-footer">
        <button type="button" className="button button-secondary" onClick={() => { clearStage(); setError(''); }} disabled={busy}>取消导入</button>
        <button type="button" className="button button-secondary" onClick={() => { onPreview(staged); setPreviewing(true); }} disabled={disabled}><Eye size={16} />{previewing ? '重新预览' : '地图预览'}</button>
        <button type="button" className="button button-primary" onClick={save} disabled={disabled || conflict}><Save size={16} />{busy ? '保存中' : '确认替换'}</button>
      </footer>}
    </section>
  );
}
