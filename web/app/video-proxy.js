// Keep MediaMTX redirects inside the same-origin /video/ proxy.
export function rewriteVideoLocation(location) {
  if (typeof location !== 'string') return location;
  if (location.startsWith('/video/')) return location;
  if (/^\/(?!\/)/.test(location)) return '/video' + location;
  return location;
}

// 生产环境由站点 nginx 在 /video/ 上注入 Authorization: Bearer <hlsCDNSecret>。
// 本地 Vite 开发服务器需要做同样的事，否则 MediaMTX 在纯 HTTP 下会退回
// Secure cookie / ?session= 查询参数，dev 与生产行为不一致。
export function videoAuthorizationHeader(secret = process.env.CAMERA_HLS_CDN_SECRET) {
  const value = typeof secret === 'string' ? secret.trim() : '';
  return value ? { authorization: `Bearer ${value}` } : {};
}

export function configureVideoProxy(proxy, secret) {
  const authHeader = videoAuthorizationHeader(secret);
  proxy.on('proxyReq', (proxyReq) => {
    if (authHeader.authorization) {
      proxyReq.setHeader('Authorization', authHeader.authorization);
    }
  });
  proxy.on('proxyRes', (response) => {
    if (response.headers.location) {
      response.headers.location = rewriteVideoLocation(response.headers.location);
    }
  });
}
