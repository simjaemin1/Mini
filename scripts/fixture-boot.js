'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// 서버 기동 기다리기 — **정본 하나** [T344 2026-09-21]
//
// ★왜 있나. 산·지형 계열 하네스 열셋이 central 을 띄운 뒤 `await sleep(2500)` 로 기다렸다.
//   판정문에 상수가 없어 ⑧a 어떤 자에도 안 걸리는 **예산형**이고, 예산이 모자라면
//   그 다음 줄(`page.goto`)이 대신 죽는다 — 09-20 밤 `e2e-mtfoot`·`e2e-mtocc` 의 모양이다.
//
// ⚠**그런데 `waitHttp(/zones)` 로 바꾸는 것은 고침이 아니라 더 깊은 자명 통과다.** 이 카드가 쟀다:
//     · 앞 판의 central 이 아직 3010 을 쥐고 있으면
//     · 새 central 은 `EADDRINUSE` 로 **즉시 죽고**(종료코드 1) — `boot()` 은 stderr 를 안 본다
//     · `waitHttp` 는 **앞 판의 central** 에게 200 을 받아 "기동 성공"이라 답한다
//     · 앞 판이 끝나 그 central 이 죽으면 `page.goto` → `net::ERR_CONNECTION_REFUSED`
//   즉 포트가 답하는 것은 "**내** 서버가 떴다"의 증인이 아니다. 남의 서버일 수 있다.
//
// ⇒ 증인을 **내가 띄운 아이의 입**으로 바꾼다. central 은 `listen` 콜백 안에서
//   `[central] 🏛️ central server up on :PORT` 를 제 손으로 찍는다 — 그 줄이 나왔다는 것은
//   **그 프로세스가 그 포트를 쥐었다**는 뜻이고, 남의 서버로는 절대 만들 수 없는 증거다.
//   아이가 죽으면(EADDRINUSE 포함) 그 자리에서 **이름을 붙여** 돌려준다(조용한 빨강 0).
//
// 상한은 **표에만** 둔다 — 시간을 재서 판정하지 않는다(족보 ⑩). 걸리면 부르는 쪽이 사유를 말한다.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {import('child_process').ChildProcess} child  `boot()` 이 돌려준 아이
 * @param {RegExp} re   아이가 스스로 찍는 기동 표식(예: /server up on/)
 * @param {{name?:string, capMs?:number}} [opts]
 * @returns {Promise<{ok:boolean, ms:number, why:string, tail:string}>}
 */
function waitUp(child, re, opts) {
  track(child);   // ★[T895] 내가 띄운 아이 — 하네스가 어떻게 끝나든 거둔다(아래 `track`)
  const name = (opts && opts.name) || 'server';
  const capMs = (opts && opts.capMs) || 120000;   // 표의 수 — 판정에 안 든다
  const t0 = Date.now();
  let tail = '';
  return new Promise((resolve) => {
    let done = false;
    const fin = (ok, why) => {
      if (done) return; done = true;
      clearTimeout(timer);
      if (child.stdout) child.stdout.removeListener('data', onData);
      if (child.stderr) child.stderr.removeListener('data', onData);
      child.removeListener('exit', onExit);
      resolve({ ok, ms: Date.now() - t0, why, tail: tail.slice(-500) });
    };
    const onData = (b) => {
      const s = String(b); tail += s;
      if (re.test(s)) fin(true, `${name} 기동 (${Date.now() - t0}ms · 아이가 제 입으로 말했다)`);
    };
    const onExit = (code, sig) => {
      const busy = /EADDRINUSE/.test(tail);
      fin(false, `★${name} 이 뜨지도 못하고 죽었다 — 종료코드 ${code}${sig ? '/' + sig : ''}`
        + (busy ? ' · **포트를 이미 누가 쥐고 있다(EADDRINUSE)** — 앞 판의 서버가 안 내려갔다'
                : ` · 마지막 출력: ${tail.slice(-200).replace(/\n/g, ' ')}`));
    };
    const timer = setTimeout(() => fin(false,
      `★${name} 이 ${(capMs / 1000) | 0}초 동안 기동 표식을 안 찍었다(상한은 표에만 · 아래가 조용히 빨개지지 않게 이름을 붙인다)`), capMs);
    // ★[T349] **입이 막혀 있으면 상한까지 기다리지 않는다.** `spawn` 의 stdio 가 'ignore' 면
    //   아이가 표식을 찍어도 이쪽엔 안 온다 — 그건 "안 떴다"가 아니라 **못 듣는 것**이고,
    //   구분해서 말해야 부르는 쪽이 고칠 자리를 안다(120초를 조용히 버리는 대신).
    if (!child.stdout && !child.stderr) {
      return fin(false, `★${name} 의 입이 막혀 있다 — spawn 의 stdio 를 ['ignore','pipe','pipe'] 로 열어야 이 자가 듣는다`);
    }
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('exit', onExit);
    if (child.exitCode !== null) onExit(child.exitCode, child.signalCode);
  });
}

// ★★[T773 2026-10-16] **남의 판을 죽이지 않는다 — 내가 띄운 것만.** (T765 회부 7 · T764 §0)
//   예전 하네스 아홉이 시작 때 이름으로 일괄 죽이기(`server/zone.js` 를 이름으로 찾아 죽이는 명령)로 **머신의 모든 존**을 죽였다 — 옆에서 돌던
//   서버 기준선 · 실제 하루 판이 같이 죽었다. 고정 포트(3010/3020)에 앞 판이 붙어 있으면 "딴 세계를 잰다"는 걱정은
//   맞지만 답은 죽이기가 아니라 **알리기**다: 포트가 이미 쥐여 있으면 아무것도 안 죽이고 이름을 붙여 실패한다.
//   (포트를 바꾸지 않는 이유 — central 이 zone-config 포트로 존 헬스를 폴링한다 · 제품 0 이라 그 길을 안 연다.)
//   · `mustBeFree(ports, name)` — 동기. 하나라도 쥐여 있으면 종료코드 2(러너가 빨강으로 센다) · 아무도 안 건드린다.
//   · `reapOnExit(procs)` — 내가 띄운 아이(`procs`)만 끝낸다: 정상 종료 · 예외 종료 · SIGINT/SIGTERM/SIGHUP(러너 시간 초과).
// ★★[T895 2026-10-23] **내가 띄운 서버는 내가 끝날 때 같이 내려간다 — 어떻게 끝나든.** (T773 `reapOnExit` 를 손으로 단 하네스는 11곳뿐이었다)
//   탐침(`scripts/t895-port-probe.js`): 하네스 76곳이 같은 포트(3010 · 3020)를 쓰는데, 아이를 내리는 꼴은 대개 `process.on('exit')` 의 SIGKILL 하나다.
//     · 하네스가 **신호로** 죽으면(러너 밖 시간 초과 · 손으로 끊기 · 부모가 pid 로 죽임) 'exit' 가 안 돈다 → central · 존이 **살아남아 포트를 쥔다**(탐침 orphan: 2초 뒤 둘 다 산 채 3910 · 3920 쥠).
//     · 끝에서 `p.kill()`(SIGTERM)만 하고 곧장 나가면 존은 T728 종료 저장 · 200ms 타이머 뒤에 내려간다(탐침 term: 포트 풀림 263ms) — 바로 다음 판 central 이 `EADDRINUSE`(T824 §곁).
//     · 이 판이 끝날 때 아직 안 죽은 아이(SIGKILL 을 보냈어도 몸이 내려가기 전)도 같은 줄이다(탐침 kill: 30ms).
//   ⇒ `waitUp` 이 받은 아이(= 이 하네스가 띄워 기다린 서버 · 83/85 하네스가 서버마다 부른다)를 적어 두고, 하네스가 끝날 때
//     ① 정상 · 예외 종료('exit') ② SIGINT · SIGTERM · SIGHUP(다른 손이 없으면 — 있으면 그 손이 `process.exit` 하고 ① 이 거둔다) 둘 다에서
//     **SIGKILL 하고 몸이 내려갈 때까지 기다린다**(`/proc/<pid>/stat` 이 좀비 · 없음 = 소켓 · 포트가 풀렸다 · 상한은 `heldPorts` 와 같은 `REAP_CAP_MS`).
//   ⚠남의 판은 안 건드린다(T773 그대로) — 이 프로세스가 띄워 `waitUp`(또는 `track`)에 넘긴 아이만. 판 가운데 아이를 내렸다 다시 띄우는 하네스는 무접촉
//     (거두기는 이 하네스가 끝나는 순간에만 돈다 · 이미 내려간 아이는 건너뛴다). 테스트 서버의 종료 저장은 하네스가 끝난 뒤엔 아무도 안 읽는다.
const REAP_CAP_MS = 15000;   // 표의 수 — 판정에 안 든다(종전 `heldPorts` 의 듣기 상한을 이름으로 올렸다)
const _kids = new Set();
let _reapOn = false;
const _sab = new Int32Array(new SharedArrayBuffer(4));
function _pidLive(pid) {   // 리눅스 — 좀비(Z) · 없음 = 몸이 내려가 자원(소켓)을 놓았다 · /proc 이 없으면 기다리지 않는다
  try { const s = require('fs').readFileSync(`/proc/${pid}/stat`, 'utf8'); const st = s.charAt(s.lastIndexOf(')') + 2); return st !== 'Z' && st !== 'X'; } catch (e) { return false; }
}
function reapTracked() {
  const live = [..._kids].filter((p) => p.exitCode === null && p.signalCode === null);
  for (const p of live) { try { p.kill('SIGKILL'); } catch (e) {} }
  const t0 = Date.now();
  for (const p of live) while (Date.now() - t0 < REAP_CAP_MS && _pidLive(p.pid)) Atomics.wait(_sab, 0, 0, 10);
  return live.length;
}
function track(child) {
  if (!child || !child.pid || _kids.has(child)) return child;
  _kids.add(child);
  child.once('exit', () => _kids.delete(child));
  if (!_reapOn) {
    _reapOn = true;
    process.on('exit', reapTracked);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(sig, function onSig() {
        if (process.listenerCount(sig) > 1) return;   // 하네스 · `reapOnExit` 의 손이 있다 — 그 손이 끝내고 'exit' 가 거둔다
        reapTracked();
        process.exit(128 + ((require('os').constants.signals || {})[sig] || 0));
      });
    }
  }
  return child;
}
function heldPorts(ports) {
  const { spawnSync } = require('child_process');
  // 듣기를 **실제로 해 본다**(`EADDRINUSE` 가 곧 증인) — 서버와 같은 꼴(호스트 없이 listen)이라 v4·v6 어느 쪽이든 잡힌다.
  const src = "const net=require('net');const ps=" + JSON.stringify(ports) + ";(async()=>{const h=[];for(const p of ps){await new Promise((r)=>{const s=net.createServer();s.once('error',(e)=>{if(e.code==='EADDRINUSE')h.push(p);r();});s.listen(p,()=>s.close(()=>r()));});}process.stdout.write(JSON.stringify(h));})();";
  const r = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8', timeout: REAP_CAP_MS });
  try { return JSON.parse(r.stdout || '[]'); } catch (e) { return []; }
}
function mustBeFree(ports, name) {
  const h = heldPorts(ports);
  if (!h.length) return;
  console.error(`  ✗ [${name}] 포트 ${h.join('·')} 를 이미 누가 쥐고 있다 — 남의 판은 죽이지 않는다(T773).`
    + ' 그 판이 끝나면 다시 돌리거나, 내 판의 잔재라면 손으로 내려라(`ss -ltnp` 로 주인을 본다).');
  process.exit(2);
}
function reapOnExit(procs) {
  const reap = () => { for (const p of procs) { try { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); } catch (e) {} } };
  process.on('exit', reap);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => { reap(); process.exit(128 + ((require('os').constants.signals || {})[sig] || 0)); });
  }
  return reap;
}

// ★★[T1033 2026-11-01] **빈 포트 받기 · 내 아이가 내려갈 때까지 기다리기** — 고정 포트와 벽시계 잠 대신 조건(카드 T1033 ③).
//   · `freePort()` — 커널이 고른 빈 포트(`listen(0)` → 그 번호 → 닫고 돌려준다). 번호를 지어내지 않는다(새 수 0 · `e2e-browser` 의 그 꼴).
//     닫은 뒤 아이가 잡기 전 틈에 남이 집으면 아이가 `EADDRINUSE` 로 죽고 `waitUp` 이 이름을 붙인다(조용한 빨강 0).
//   · `stopKids(procs, sig)` — 내가 띄운 아이를 신호로 내리고 **아이의 'exit' 를 받을 때까지** 기다린다 — 몸이 내려가면 듣던 포트도 풀린다.
//     종전 `killAll(); await sleep(4000)`(포트 반납 4초 · 벽시계)의 자리다. 상한은 그물(`REAP_CAP_MS` · 판정에 안 든다) — 걸리면 아직 산 아이 수를 돌려준다.
//   · `waitFree(ports)` — 남이 쥔 포트(앞 판의 몸이 아직 내려가는 중)가 풀릴 때까지 기다린다(상한 `REAP_CAP_MS`). 못 풀리면 쥔 포트를 돌려준다
//     — 부르는 쪽이 `mustBeFree` 그대로 이름을 붙여 끝낸다(남의 판은 안 죽인다 · T773).
function freePort() {
  return new Promise((resolve, reject) => {
    const s = require('net').createServer();
    s.once('error', reject);
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function stopKids(procs, sig) {
  const live = procs.filter((p) => p && p.exitCode === null && p.signalCode === null);
  return Promise.all(live.map((p) => new Promise((res) => {
    const to = setTimeout(() => res(false), REAP_CAP_MS);
    p.once('exit', () => { clearTimeout(to); res(true); });
    try { p.kill(sig || 'SIGKILL'); } catch (e) { clearTimeout(to); res(p.exitCode !== null || p.signalCode !== null); }
  }))).then((r) => r.filter((x) => !x).length);
}
async function waitFree(ports) {
  const t0 = Date.now();
  let h = heldPorts(ports);
  while (h.length && Date.now() - t0 < REAP_CAP_MS) { await new Promise((r) => setTimeout(r, 100)); h = heldPorts(ports); }
  return { held: h, ms: Date.now() - t0 };
}

module.exports = { waitUp, heldPorts, mustBeFree, reapOnExit, track, reapTracked, freePort, stopKids, waitFree };   // ★[T895] track · reapTracked · ★[T1033] freePort · stopKids · waitFree
