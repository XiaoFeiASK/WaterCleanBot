// Keep MediaMTX redirects inside the same-origin /video/ proxy.
export function rewriteVideoLocation(location) {
  if (typeof location !== 'string') return location;
  if (location.startsWith('/video/')) return location;
  if (/^\/(?!\/)/.test(location)) return '/video' + location;
  for (const origin of ['http://localhost:8888', 'http://127.0.0.1:8888']) {
    if (location.startsWith(origin + '/')) return '/video' + location.slice(origin.length);
  }
  return location;
}

export function configureVideoProxy(proxy) {
  proxy.on('proxyRes', (response) => {
    if (response.headers.location) {
      response.headers.location = rewriteVideoLocation(response.headers.location);
    }
  });
}
