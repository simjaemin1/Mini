'use strict';
// (@regress 없음 — 하네스가 쓰는 정본 · 자기 하네스는 `test-lib-port.js`)
// === scripts/lib-port.js — 하네스 포트 할당기 정본 [T1281 · T1267 회부 3] ==========
//
// ★왜: 하네스 107곳이 포트를 `기준 + process.pid % M` 으로 골랐다. 한 판씩 도는 야간에선 괜찮지만
//   나란히 돌리면(착지 게이트 · 세션들의 병렬 판) 두 하네스가 같은 포트를 잡아 **남의 서버를 읽는다**
//   (T1267 첫 묶음이 실제로 그렇게 갈렸다 · 러너의 고정 포트 EADDRINUSE 사고와 같은 꼴).
//
// ★어떻게: 같은 기계의 하네스끼리 **한 장부**를 쓴다.
//   · 장부 = 디렉터리 하나(`LIB_PORT_DIR` · 기본 `/tmp/mini-lib-port` — `TMPDIR` 을 따르지 않는다:
//     하네스마다 TMPDIR 이 달라도 같은 장부여야 겹침을 막는다).
//   · 범위 하나 = 파일 하나 `r-<시작>-<개수>-<pid>-<순번>`. 고르기 · 적기는 **잠금 하나**(`mkdir` 원자) 안에서.
//   · 고른 범위는 **OS 에 실제로 묶어 본다**(자식 하나가 `listen` 해 보고 닫는다) — 장부 밖 프로세스(남은 서버 ·
//     손으로 띄운 판)가 쥔 포트도 피한다.
//   · 주인이 죽은 범위(pid 없음)는 다음 고르기에서 치운다 · 주인이 살아 있으면 **나갈 때**(`exit`) 지운다.
//   · 범위 띠 = 20000 ~ 32767(리눅스 임시 포트 띠 32768~ 아래 — OS 가 나가는 연결에 주는 포트와 안 부딪는다).
//
// ★쓰는 법(옛 식의 **자리만** 바꾼다 — 하네스 단언은 그대로):
//     옛  process.env.PORT = String(37200 + (process.pid % 190));
//     새  process.env.PORT = String(require('./lib-port').port(37200));
//     옛  const base = 39000 + (process.pid % 400);          // base, base + 2, base + 20 + k*2 …
//     새  const base = require('./lib-port').ports(40, 39000);   // 이어진 40 자리의 첫 포트
//   `key`(옛 기준 수를 그대로 쓴다)는 **한 프로세스 안 같은 자리**를 묶는다 — 옛 식은 프로세스마다 상수였으므로
//   같은 key 를 다시 부르면 같은 포트가 온다(다시 띄우기 · 같은 포트로 다시 붙는 판이 그대로다).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LO = 20000, HI = 32767;
const DIR = process.env.LIB_PORT_DIR || path.join(fs.existsSync('/tmp') ? '/tmp' : require('os').tmpdir(), 'mini-lib-port');
const MUTEX = path.join(DIR, '.mutex');
const MEMO = new Map();
const MINE = [];
let SEQ = 0;

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function alive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lock() {
  fs.mkdirSync(DIR, { recursive: true });
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(MUTEX); fs.writeFileSync(path.join(MUTEX, 'pid'), String(process.pid)); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    // 잠금 주인이 죽었거나(pid 없음) 너무 오래 쥐었으면(15초 — 고르기 한 번은 1초 안) 치운다
    let owner = 0, age = 0;
    try { owner = parseInt(fs.readFileSync(path.join(MUTEX, 'pid'), 'utf8'), 10) || 0; } catch (e) { /* 아직 안 적었다 */ }
    try { age = Date.now() - fs.statSync(MUTEX).mtimeMs; } catch (e) { continue; }
    if ((owner && !alive(owner)) || (!owner && age > 2000) || age > 15000) { try { fs.rmSync(MUTEX, { recursive: true, force: true }); } catch (e) { /* 남이 먼저 */ } continue; }
    if (Date.now() - t0 > 60000) throw new Error('lib-port: 장부 잠금을 60초 동안 못 잡았다 — ' + MUTEX);
    sleepMs(5 + (process.pid & 7));
  }
}
function unlock() { try { fs.rmSync(MUTEX, { recursive: true, force: true }); } catch (e) { /* 이미 없음 */ } }

function ledger(kind) {
  const out = [];
  const re = kind === 'd' ? /^d-(\d+)-(\d+)-(\d+)-\d+$/ : /^r-(\d+)-(\d+)-(\d+)-\d+$/;   // r = 포트 · d = X 화면 번호(섞이지 않는다)
  for (const f of fs.readdirSync(DIR)) {
    const m = re.exec(f);
    if (!m) continue;
    const r = { f, lo: +m[1], n: +m[2], pid: +m[3] };
    if (r.pid !== process.pid && !alive(r.pid)) { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { /* 남이 먼저 */ } continue; }
    out.push(r);
  }
  return out;
}

// 자식 하나가 포트들을 실제로 묶어 보고 닫는다 → 못 묶은 포트 목록(서버와 같은 기본 주소 `listen(port)`)
const PROBE = "const net=require('net');const ps=JSON.parse(process.argv[1]);const bad=[];(async()=>{for(const p of ps){await new Promise((r)=>{const s=net.createServer();s.once('error',()=>{bad.push(p);r();});s.listen(p,()=>s.close(r));});}process.stdout.write(JSON.stringify(bad));})();";
function busy(ports) {
  const r = spawnSync(process.execPath, ['-e', PROBE, JSON.stringify(ports)], { encoding: 'utf8', env: { PATH: process.env.PATH || '' }, timeout: 30000 });
  if (r.status !== 0) throw new Error('lib-port: 묶어 보기 자식이 실패했다 — ' + (r.stderr || r.error || r.status));
  return JSON.parse(r.stdout || '[]');
}

function grab(n) {
  if (!(n >= 1 && n <= 2000)) throw new Error('lib-port: 자리 수가 1 ~ 2000 이 아니다 — ' + n);
  lock();
  try {
    const held = ledger();
    const span = HI - LO + 2 - n;   // 시작 자리 수(끝 자리 HI 까지 n 칸이 들어가는 첫 수 = HI - n + 1)
    let at = (process.pid * 7919 + SEQ * 104729) % span;   // 시작점만 흩는다(겹침은 장부가 막는다)
    for (let tries = 0; tries < 200; tries++) {
      let lo = LO + at;
      const clash = held.find((r) => lo < r.lo + r.n && r.lo < lo + n);
      if (clash) { at = (clash.lo + clash.n - LO) % span; continue; }
      const want = Array.from({ length: n }, (_, i) => lo + i);
      const bad = busy(want);
      if (bad.length) { at = (Math.max(...bad) + 1 - LO) % span; continue; }
      const f = `r-${lo}-${n}-${process.pid}-${SEQ++}`;
      fs.writeFileSync(path.join(DIR, f), '');
      MINE.push(f);
      if (process.env.LIB_PORT_LOG) fs.appendFileSync(process.env.LIB_PORT_LOG, JSON.stringify({ lo, n, pid: process.pid, t: Date.now(), argv: path.basename(process.argv[1] || '-e') }) + '\n');   // 증명용 장부 사본(켬만)
      return lo;
    }
    throw new Error(`lib-port: 이어진 ${n} 자리를 200 번 만에 못 찾았다(장부 ${held.length} 범위)`);
  } finally { unlock(); }
}

// ── 고정 포트 쥐기 [T1288] — 제품이 박은 포트(존 설정 `zone-config` 의 존 포트 · central 기본 3010)는 하네스가 못 옮긴다.
//   ⇒ 그 수를 **이 기계에서 혼자** 쥔다: 장부에 [p, 1] 을 적고(남이 쥐었으면 비울 때까지 기다린다) OS 에도 비었을 때만 받는다.
//   · 자식 프로세스는 부모가 쥔 포트를 다시 기다리지 않는다 — 부모가 `LIB_PORT_HELD` 에 적어 env 로 물려준다(자기 자신을 기다리는 교착 0).
//   · 기다림 상한 `LIB_PORT_HOLD_MS`(기본 15분) — 넘으면 **크게 실패**(조용히 남의 central 에 붙지 않는다).
const HELD = new Set(String(process.env.LIB_PORT_HELD || '').split(',').filter(Boolean).map(Number));
function hold(...want) {
  const ps = [...new Set(want.flat().map(Number))].filter((p) => !HELD.has(p) && !MEMO.has('h:' + p));
  if (!ps.length) return +want.flat()[0];
  for (const p of ps) if (!(p >= 1 && p <= 65535)) throw new Error('lib-port: 쥘 포트가 아니다 — ' + p);
  const limit = +(process.env.LIB_PORT_HOLD_MS || 900000), t0 = Date.now();
  let said = false;
  for (;;) {
    lock();
    let who = null;
    try {
      const held = ledger();
      const clash = held.find((r) => r.pid !== process.pid && ps.some((p) => p >= r.lo && p < r.lo + r.n));
      const bad = clash ? [] : busy(ps);
      if (!clash && !bad.length) {
        for (const p of ps) {
          const f = `r-${p}-1-${process.pid}-${SEQ++}`;
          fs.writeFileSync(path.join(DIR, f), '');
          MINE.push(f); MEMO.set('h:' + p, p); HELD.add(p);
          if (process.env.LIB_PORT_LOG) fs.appendFileSync(process.env.LIB_PORT_LOG, JSON.stringify({ lo: p, n: 1, hold: true, pid: process.pid, t: Date.now(), waited: Date.now() - t0, argv: path.basename(process.argv[1] || '-e') }) + '\n');
        }
        process.env.LIB_PORT_HELD = [...HELD].join(',');
        return +want.flat()[0];
      }
      who = clash ? `장부 pid ${clash.pid}` : `OS(장부 밖) ${bad.join(',')}`;
    } finally { unlock(); }
    if (!said) { process.stderr.write(`[lib-port] 고정 포트 ${ps.join(',')} 를 기다린다 — 쥔 것: ${who}\n`); said = true; }
    if (Date.now() - t0 > limit) throw new Error(`lib-port: 고정 포트 ${ps.join(',')} 를 ${Math.round(limit / 1000)}초 기다려도 못 쥐었다 — 쥔 것: ${who}`);
    sleepMs(500);
  }
}

// ── X 화면 번호 [T1288] — Xvfb `:<n>` 은 포트가 아니라 `/tmp/.X<n>-lock` · `/tmp/.X11-unix/X<n>` 으로 겹친다.
//   같은 장부에 **다른 머리(d-)** 로 적는다(포트와 섞이지 않는다) · 띠 100 ~ 899 · 이미 잠금 파일이 있는 번호는 건너뛴다.
const DLO = 100, DHI = 899;
const xBusy = (n) => fs.existsSync(`/tmp/.X${n}-lock`) || fs.existsSync(`/tmp/.X11-unix/X${n}`);
function displays(n, key) {
  const k = 'd' + n + ':' + (key === undefined ? '' : String(key));
  if (MEMO.has(k)) return MEMO.get(k);
  if (!(n >= 1 && n <= 64)) throw new Error('lib-port: 화면 수가 1 ~ 64 가 아니다 — ' + n);
  lock();
  try {
    const held = ledger('d'), span = DHI - DLO + 2 - n;
    let at = (process.pid * 31 + SEQ * 97) % span;
    for (let tries = 0; tries < 400; tries++) {
      const lo = DLO + at;
      const clash = held.find((r) => lo < r.lo + r.n && r.lo < lo + n);
      if (clash) { at = (clash.lo + clash.n - DLO) % span; continue; }
      const bad = Array.from({ length: n }, (_, i) => lo + i).filter(xBusy);
      if (bad.length) { at = (Math.max(...bad) + 1 - DLO) % span; continue; }
      const f = `d-${lo}-${n}-${process.pid}-${SEQ++}`;
      fs.writeFileSync(path.join(DIR, f), '');
      MINE.push(f); MEMO.set(k, lo);
      if (process.env.LIB_PORT_LOG) fs.appendFileSync(process.env.LIB_PORT_LOG, JSON.stringify({ lo, n, display: true, pid: process.pid, t: Date.now(), argv: path.basename(process.argv[1] || '-e') }) + '\n');
      return lo;
    }
    throw new Error(`lib-port: 이어진 X 화면 ${n} 개를 못 찾았다(장부 ${held.length})`);
  } finally { unlock(); }
}

function release() {
  for (const f of MINE.splice(0)) { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { /* 이미 없음 */ } }
  MEMO.clear();
}
process.on('exit', release);

// 이어진 n 자리의 첫 포트 · 같은 (n, key) 는 이 프로세스 안에서 같은 값
function ports(n, key) {
  const k = n + ':' + (key === undefined ? '' : String(key));
  if (!MEMO.has(k)) MEMO.set(k, grab(n));
  return MEMO.get(k);
}
const port = (key) => ports(1, key);

module.exports = { port, ports, hold, displays, release, DIR, LO, HI, DLO, DHI, _ledger: (kind) => { fs.mkdirSync(DIR, { recursive: true }); return ledger(kind); }, _busy: busy };
