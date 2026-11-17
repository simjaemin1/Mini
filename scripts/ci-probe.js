'use strict';
// (@regress 없음 — 러너 밖 · `ci-class.js` 가 `NODE_OPTIONS=--require` 로 얹는 탐침 · 제품 무변)
// === scripts/ci-probe.js — 하네스가 실제로 무엇을 띄웠나 적는 탐침 (T1350 · CI 분류표) ==================================
//
// ★왜: CI 에 올릴 하네스는 "프로세스 · 브라우저를 안 띄우는 것"인데, 그걸 소스 글자로 가르면 남이 부르는 자(lib · 픽스처)가 띄우는 것을 놓친다.
//   ⇒ 하네스를 이 탐침과 함께 돌려 **실제로 일어난 일**을 적는다: 자식 프로세스(`child_process`) · 소켓 듣기(`net.Server.listen` = 서버) ·
//   브라우저(`playwright` 를 불러 `launch`). 자식 프로세스도 `NODE_OPTIONS` 를 물려받아 같은 파일에 적는다(자식이 띄운 서버도 잡힌다).
// ★적는 곳: env `CI_PROBE_OUT`(줄마다 JSON 하나 · 덧붙임). 없으면 아무것도 안 한다(얹혀도 무해).
// ★판정 0 — 적기만 한다. 분류는 `ci-class.js`.
const OUT = process.env.CI_PROBE_OUT;
if (OUT && !global.__ciProbe) {
  global.__ciProbe = true;
  const fs = require('fs');
  const note = (ev, what) => { try { fs.appendFileSync(OUT, JSON.stringify({ pid: process.pid, ev, what: String(what || '').slice(0, 160) }) + '\n'); } catch (e) {} };
  const cp = require('child_process');
  for (const k of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const f = cp[k];
    if (typeof f !== 'function') continue;
    cp[k] = function (...a) { note('child', `${k} ${Array.isArray(a[1]) ? [a[0], ...a[1]].join(' ') : a[0]}`); return f.apply(this, a); };
  }
  const net = require('net');
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...a) { note('listen', typeof a[0] === 'object' ? JSON.stringify(a[0]) : a[0]); return listen.apply(this, a); };
  const Module = require('module');
  const load = Module._load;
  Module._load = function (req, parent, isMain) {
    const m = load.apply(this, arguments);
    if (/^playwright(-core)?$/.test(req) && m && !m.__ciProbed) {
      try {
        Object.defineProperty(m, '__ciProbed', { value: true });
        for (const b of ['chromium', 'webkit', 'firefox']) {
          const bt = m[b];
          if (bt && typeof bt.launch === 'function' && !bt.__ciProbed) {
            const L = bt.launch.bind(bt);
            bt.launch = (...x) => { note('browser', b); return L(...x); };
            Object.defineProperty(bt, '__ciProbed', { value: true });
          }
        }
      } catch (e) {}
    }
    return m;
  };
}
