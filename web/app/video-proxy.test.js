import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { rewriteVideoLocation, configureVideoProxy } from './video-proxy.js';

test('rewrites HLS redirects without losing cookie or session query parameters', () => {
  for (const location of ['/front/index.m3u8?cookieCheck=1', 'http://localhost:8888/front/index.m3u8?cookieCheck=1', 'http://127.0.0.1:8888/front/index.m3u8?cookieCheck=1']) {
    assert.equal(rewriteVideoLocation(location), '/video/front/index.m3u8?cookieCheck=1');
  }
  assert.equal(rewriteVideoLocation('/rear/index.m3u8?session=abc'), '/video/rear/index.m3u8?session=abc');
});

test('keeps prefixed, relative, external and absent locations unchanged', () => {
  for (const value of ['/video/front/index.m3u8', 'video1_stream.m3u8?session=abc', 'https://example.com/front/', '//example.com/front/', undefined]) {
    assert.equal(rewriteVideoLocation(value), value);
  }
});

test('proxy response hook updates Location and preserves other headers', () => {
  const proxy = new EventEmitter();
  configureVideoProxy(proxy);
  const response = { headers: { location: '/front/index.m3u8?cookieCheck=1', 'set-cookie': ['cookieCheck=1'] } };
  proxy.emit('proxyRes', response);
  assert.equal(response.headers.location, '/video/front/index.m3u8?cookieCheck=1');
  assert.deepEqual(response.headers['set-cookie'], ['cookieCheck=1']);
  assert.doesNotThrow(() => proxy.emit('proxyRes', { headers: {} }));
});

// Exercise the real Vite configuration against a fake MediaMTX listener.
test('Vite follows same-origin HLS redirects and serves a media segment', async () => {
  const { createServer: createHTTPServer } = await import('node:http');
  const { createServer: createViteServer } = await import('vite');
  const { default: config } = await import('./vite.config.js');
  const requests = [];
  const upstream = createHTTPServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/front/index.m3u8') {
      res.writeHead(302, { Location: '/front/index.m3u8?cookieCheck=1' });
      res.end();
    } else if (req.url === '/front/index.m3u8?cookieCheck=1') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXTINF:1,\nsegment.mp4?session=test\n');
    } else if (req.url === '/front/segment.mp4?session=test') {
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      res.end('test-segment');
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  let vite;
  try {
    vite = await createViteServer({
      ...config,
      configFile: false,
      logLevel: 'silent',
      server: {
        ...config.server,
        host: '127.0.0.1', port: 0,
        proxy: {
          '^/video/.*': {
            ...config.server.proxy['^/video/.*'],
            target: `http://127.0.0.1:${upstream.address().port}`,
          },
        },
      },
    });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const first = await fetch(base + '/video/front/index.m3u8', { redirect: 'manual' });
    assert.equal(first.status, 302);
    assert.equal(first.headers.get('location'), '/video/front/index.m3u8?cookieCheck=1');
    const playlist = await fetch(base + first.headers.get('location'));
    assert.equal(playlist.status, 200);
    assert.match(await playlist.text(), /^#EXTM3U/);
    const segment = await fetch(base + '/video/front/segment.mp4?session=test');
    assert.equal(await segment.text(), 'test-segment');
    assert.deepEqual(requests, ['/front/index.m3u8', '/front/index.m3u8?cookieCheck=1', '/front/segment.mp4?session=test']);
  } finally {
    if (vite) await vite.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
