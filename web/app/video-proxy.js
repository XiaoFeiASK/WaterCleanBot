// Keep MediaMTX redirects inside the same-origin /video/ proxy.
export function rewriteVideoLocation(location) {
  if (typeof location !== 'string') return location;
  if (location.startsWith('/video/')) return location;
  if (/^\/(?!\/)/.test(location)) return '/video' + location;
  return location;
}

export function configureVideoProxy(proxy) {
  proxy.on('proxyRes', (response) => {
    if (response.headers.location) {
      response.headers.location = rewriteVideoLocation(response.headers.location);
    }
  });
}
