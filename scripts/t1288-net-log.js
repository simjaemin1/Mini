'use strict';
// (@regress 없음 — T1288 증명용 미리 싣기 · `node -r scripts/t1288-net-log.js` · 판정 0 · 적기만)
// === scripts/t1288-net-log.js — 묶음(listen) · 닫음 · 붙음(connect)을 하네스 이름과 함께 한 줄씩 적는다 ==========
//   러너 `-j` 가 하네스마다 env `RUN_REGRESS_HARNESS` 를 준다 — 자식(존 · central)은 env 로 물려받는다.
//   `T1288_NET_LOG` 가 없으면 아무것도 안 한다. 붙음은 이 기계(localhost · 127.0.0.1 · ::1) 포트만 적는다.
//   읽는 쪽 = `scripts/t1288-par.js check` — "남의 central 에 붙음" = 하네스 A 가 붙은 순간 그 포트를 묶고 있던 프로세스가 하네스 B.
const OUT = process.env.T1288_NET_LOG;
if (OUT) {
  const fs = require('fs');
  const net = require('net');
  const H = process.env.RUN_REGRESS_HARNESS || '';
  const put = (o) => { try { fs.appendFileSync(OUT, JSON.stringify(Object.assign({ t: Date.now(), pid: process.pid, h: H }, o)) + '\n'); } catch (e) { /* 적기 실패는 판에 안 든다 */ } };
  const L0 = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...a) {
    this.once('listening', () => {
      const ad = this.address();
      if (ad && typeof ad === 'object' && ad.port) { const port = ad.port; put({ k: 'listen', port }); this.once('close', () => put({ k: 'close', port })); }
    });
    return L0.apply(this, a);
  };
  const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '', undefined]);
  const C0 = net.Socket.prototype.connect;
  const seen = new Map();   // 같은 (포트) 붙음은 1초에 한 번만 적는다(두드림 고리가 파일을 불리지 않게)
  net.Socket.prototype.connect = function (...a) {
    try {
      let o = a[0];
      if (Array.isArray(o)) o = o[0];
      let port, host;
      if (o && typeof o === 'object') { port = +o.port; host = o.host; } else if (typeof o === 'number' || /^\d+$/.test(String(o))) { port = +o; host = typeof a[1] === 'string' ? a[1] : undefined; }
      if (port && LOCAL.has(host)) { const last = seen.get(port) || 0, now = Date.now(); if (now - last > 1000) { seen.set(port, now); put({ k: 'connect', port }); } }
    } catch (e) { /* 적기만 */ }
    return C0.apply(this, a);
  };
}
