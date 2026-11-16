'use strict';
// (@regress 없음 — 러너 밖 · T1320 자 · 제품 무변)
// === scripts/t1320-lockstep.js — 두 존 가상 시계 판의 **발맞춤**: 존마다 가상 시계(T745)를 한 가로대(H)까지만 돌리고, 존 사이 HTTP 를 가로대에서만 건넨다 ===
//
// ★왜 [T1320 · T1311 회부 3] 두 존 실서버 판(`t533-xzone-server.js`)은 같은 씨에서 경계 넘김이 4 ~ 44 로 갈렸다. 존 하나 판은 T745 가상 시계로 바이트 결정론인데,
//   두 존은 ① 서로 다른 프로세스의 시계가 따로 흐르고 ② 존 사이 HTTP(넘김 · 명부 스냅)가 실제 시간에 닿고 ③ 걸음표 일꾼(스레드)의 답이 실제 시간에 온다.
//   ⇒ 이 프리로드(존 프로세스 본 스레드 · `t745-vclock.js` 다음에 싣는다)가 셋을 묶는다:
//     ⓐ 가로대 — 줄의 다음 만기가 H 를 넘으면 멈추고 부모(러너 `t1320-xz-vclock.js`)에 'at' 를 알린다. 모든 존이 H 에 서고 HTTP 셈이 맞으면(아래) 부모가 H += Q 로 'go'.
//     ⓑ HTTP — 이 존이 이웃 존 · central 에 보낸 요청의 답(또는 오류)은 **다 읽어 붙잡았다가** 다음 가로대에서 (상대 · 보낸 차례) 순으로 건넨다.
//        이 존이 받은 요청도 몸까지 다 읽어 붙잡았다가 가로대에서 (보낸 존 · 차례) 순으로 처리한다. 실제 시간 시한(`req.setTimeout` · `timeout`)은 끈다.
//        가로대 셈: 이웃마다 보낸 요청 = 상대가 받은 요청 · 상대가 쓴 답 = 내가 받은 답 · central 에 보낸 요청 = 받은 답 — 맞아야 'go'(날아가는 중인 것 0).
//     ⓒ 걸음표 일꾼(`server/xzone-geo.js` 스레드) — 띄운 순간부터 답이 올 때까지 줄을 멈춘다(V 흐름 0) ⇒ 답이 줄의 같은 자리에서 든다.
//   ⚠기동 중(`zone server up on` 전)은 가로채지 않는다(그 동안 V 는 V0 로 멎어 있다 · central 등록을 기다리는 기동을 막지 않으려고).
//   env: T745_LOCKSTEP=1 · T1320_PORTS = {"<port>": "<존 id | central>"} · (부모와 IPC 채널 필수)
if (process.env.T745_LOCKSTEP !== '1' || typeof process.send !== 'function') return;
try { if (!require('worker_threads').isMainThread) return; } catch (e) {}
const C = global.__t745Ctl;
if (!C) { console.error('[t1320] t745-vclock 이 먼저 실려야 한다(T745_VCLOCK=1 · T577_SEED)'); return; }
const http = require('http');
const { Readable } = require('stream');
const RT = C.rt;
const ME = process.env.ZONE_ID;
const PORTS = JSON.parse(process.env.T1320_PORTS || '{}');
let H = null, gated = false, live = false, outW = 0, seq = 0, extSeq = 0, flushes = 0;
const cnt = { reqSent: {}, reqRecv: {}, resSent: {}, resRecv: {} };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const inbox = [], held = [];
const send = (t) => { try { process.send({ t, zone: ME, H, V: C.V(), cnt, outW, inbox: inbox.length, held: held.length, heldK: held.map((e) => e.k), inboxK: inbox.filter((e) => e.from !== 'ext').map((e) => e.from + ':' + e.url), flushes }); } catch (e) {} };
const onChange = () => { if (gated) send('upd'); };

// ⓐ 가로대
C.setGate((due) => {
  if (outW > 0) return false;                                // ⓒ 일꾼 답 기다림(알리지 않는다 — 가로대가 아니다)
  if (H != null && due <= H) return true;
  if (!gated) { gated = true; send('at'); }
  return false;
});
C.onStart((V) => { live = true; send('start'); });
process.on('message', (m) => {
  if (!m || m.t !== 'go') return;
  if (H != null) C.setV(H);                                  // 가로대 시각에서 건넨다
  gated = false; flushes++;
  const ib = inbox.splice(0).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.seq - b.seq));
  const hd = held.splice(0).sort((a, b) => (a.tgt < b.tgt ? -1 : a.tgt > b.tgt ? 1 : a.seq - b.seq));
  for (const e of ib) { try { e.fn(); } catch (err) { console.error('[t1320] 받은 요청 처리 오류', err && err.message); } }
  for (const e of hd) { try { e.fn(); } catch (err) { console.error('[t1320] 받은 답 건넴 오류', err && err.message); } }
  H = m.H;
  RT.setImmediate(() => C.resume());                          // 건넨 것들의 꼬리(nextTick · 약속)가 다 돈 뒤 줄을 다시
});

// ⓑ 보내는 HTTP
const _req = http.request;
const AGENT = new http.Agent({ keepAlive: false });
http.request = function (opts, cb) {
  if (!live || !opts || typeof opts !== 'object' || opts instanceof URL) return _req.apply(this, arguments);
  const tgt = PORTS[String(opts.port)];
  if (!tgt) return _req.apply(this, arguments);
  const my = ++seq;
  const o = Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { 'x-ls-from': ME, 'x-ls-seq': String(my) }) });
  delete o.timeout; o.agent = AGENT;   // 시한 없는 제 대리인(node 기본 대리인은 소켓 5초 무활동에 'timeout' 을 낸다 — 실제 시간)
  const req = _req.call(this, o, cb);
  inc(cnt.reqSent, tgt);
  req.setTimeout = function () { return req; };              // 실제 시간 시한 없음(가상 판 — 답은 가로대에서 꼭 온다)
  const emit = req.emit;
  let done = false;
  req.emit = function (ev, ...args) {
    if (ev === 'response' && !done) {
      done = true; const res = args[0], ch = [];
      res.on('data', (c) => ch.push(c)); res.on('error', () => {});
      res.on('end', () => {
        inc(cnt.resRecv, tgt);
        held.push({ tgt, seq: my, k: 'res:' + tgt + ':' + res.statusCode + ':' + (o.path || ''), fn: () => { const fr = new Readable({ read() {} }); fr.statusCode = res.statusCode; fr.statusMessage = res.statusMessage; fr.headers = res.headers;
          emit.call(req, 'response', fr); fr.push(Buffer.concat(ch)); fr.push(null); } });
        onChange();
      });
      return true;
    }
    if (ev === 'timeout') return true;                        // 실제 시간 시한은 가상 판에 없다
    if (ev === 'error' && !done) { done = true; inc(cnt.resRecv, tgt); held.push({ tgt, seq: my, k: ev + ':' + tgt + ':' + (args[0] && args[0].message) + ':' + (o.path || ''), fn: () => emit.call(req, ev, ...args) }); onChange(); return true; }
    if (ev === 'error' && done) return true;   // 답 뒤 소켓 소음은 버린다
    return emit.call(req, ev, ...args);
  };
  return req;
};

// ⓑ 받는 HTTP
const _emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (ev, req, res) {
  if (ev !== 'request' || !live) return _emit.apply(this, arguments);
  const server = this, from = String(req.headers['x-ls-from'] || 'ext'), sq = +(req.headers['x-ls-seq'] || 0) || (++extSeq), ch = [];
  req.on('data', (c) => ch.push(c));
  req.on('end', () => {
    inc(cnt.reqRecv, from);
    const _end = res.end;
    res.end = function (...a) { inc(cnt.resSent, from); onChange(); return _end.apply(this, a); };
    inbox.push({ from, seq: sq, url: req.url, fn: () => {
      const fr = new Readable({ read() {} });
      Object.assign(fr, { headers: req.headers, rawHeaders: req.rawHeaders, method: req.method, url: req.url, httpVersion: req.httpVersion,
        httpVersionMajor: req.httpVersionMajor, httpVersionMinor: req.httpVersionMinor, socket: req.socket, connection: req.socket, complete: true });
      fr.push(Buffer.concat(ch)); fr.push(null);
      _emit.call(server, 'request', fr, res);
    } });
    onChange();
  });
  return true;
};

// ⓒ 걸음표 일꾼
const WT = require('worker_threads');
const _W = WT.Worker;
WT.Worker = class extends _W {
  constructor(f, o) {
    super(f, o);
    //   ★[T1324 2026-11-15] 늦게 파는 일꾼(`workerData.xzoneLazy` — T1139 · 손잡이 `T1139_XZ_LAZY`)은 셈 밖이다: 본 스레드가 묻고 `Atomics.wait` 로 답을
    //     **동기로** 받는다(가상 시계 줄이 그 자리에서 기다린다 — 결정론 그대로). 이 일꾼은 `postMessage` · 'exit' 이 없어(포트 · 공유 버퍼로만 말한다)
    //     셈(`outW`)이 영영 안 줄어 가로대가 첫 0.5초에서 멎었다(T1324 자 첫 판). 한 벌 일꾼(`xzoneGeo`)은 종전대로 센다.
    if (/xzone-geo\.js$/.test(String(f)) && !(o && o.workerData && o.workerData.xzoneLazy)) {
      outW++; let d = false;
      const fin = () => { if (d) return; d = true; outW--; RT.setImmediate(() => C.resume()); };
      this.on('message', fin); this.on('exit', fin);
    }
  }
};
