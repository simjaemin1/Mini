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

function ledger() {
  const out = [];
  for (const f of fs.readdirSync(DIR)) {
    const m = /^r-(\d+)-(\d+)-(\d+)-\d+$/.exec(f);
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
    const span = HI - LO + 1 - n;
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

module.exports = { port, ports, release, DIR, LO, HI, _ledger: () => { fs.mkdirSync(DIR, { recursive: true }); return ledger(); }, _busy: busy };
