import { SHORELINE_MAX_BYTES } from './shorelines';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(method, body, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  try {
    const serialized = body ? JSON.stringify(body) : undefined;
    if (serialized && new TextEncoder().encode(serialized).byteLength > SHORELINE_MAX_BYTES) {
      throw new Error('上传数据不能超过 20 MiB');
    }
    const response = await fetch(`${API_BASE_URL}/api/shoreline`, {
      method, credentials: 'include', cache: 'no-store', signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: serialized,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || (response.status === 413
        ? '文件超过服务器上传大小限制，请管理员调整 Nginx 的 client_max_body_size 后重试'
        : '岸线请求失败，请稍后重试'));
      error.code = payload?.error?.code;
      error.status = response.status;
      throw error;
    }
    if (!payload || !('dataset' in payload)) throw new Error('岸线服务返回的数据无效');
    return payload.dataset;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('无法连接岸线服务，请检查后端是否启动');
    if (error.name === 'AbortError' && !signal?.aborted) throw new Error('岸线请求超时，请重新加载确认当前数据');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const fetchShoreline = (signal) => request('GET', undefined, signal);
export const replaceShoreline = (files, expectedRevision) => request('PUT', { files, expectedRevision });
export const deleteShoreline = (expectedRevision) => request('DELETE', { expectedRevision });
export const updateShoreline = (files, expectedRevision) => request('PATCH', { files, expectedRevision });
