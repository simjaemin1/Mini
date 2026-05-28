// 디스패처 (레거시) — 분산 배포에선 central.js가 모든 역할을 흡수.
// 로컬 dev 편의용: 포트 3000 → central(3010)로 프록시.
//
// 신규 분산 모드: 클라이언트가 직접 http://central-host:3010/ 로 접속 권장.

const express = require('express');
const path = require('path');
const http = require('http');
const { ZONES, CENTRAL } = require('./zone-config');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

// 모든 요청을 central으로 프록시
const centralProxy = (req, res) => {
  const opts = {
    hostname: CENTRAL.host,
    port: CENTRAL.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${CENTRAL.host}:${CENTRAL.port}` },
  };
  const upstream = http.request(opts, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  upstream.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) req.pipe(upstream); else upstream.end();
};

// 헬스 체크는 dispatcher가 직접 — 어느 zone이 살아있는지 빠르게 확인용
app.get('/health/zones', async (req, res) => {
  const results = {};
  await Promise.all(Object.entries(ZONES).map(([id, z]) => new Promise((resolve) => {
    const r = http.get(`http://${z.host}:${z.port}/health`, (resp) => {
      let data = '';
      resp.on('data', (c) => data += c);
      resp.on('end', () => {
        try { results[id] = { up: true, ...JSON.parse(data) }; }
        catch (e) { results[id] = { up: false }; }
        resolve();
      });
    });
    r.on('error', () => { results[id] = { up: false }; resolve(); });
    r.setTimeout(500, () => { r.destroy(); results[id] = { up: false }; resolve(); });
  })));
  res.json(results);
});

// 그 외 모든 요청은 central으로
app.use(centralProxy);

app.listen(PORT, () => {
  console.log(`[dispatch] :${PORT} → central(${CENTRAL.host}:${CENTRAL.port}) 프록시`);
  console.log(`[dispatch] 브라우저: http://localhost:${PORT}  또는 직접 http://${CENTRAL.host}:${CENTRAL.port}`);
});
