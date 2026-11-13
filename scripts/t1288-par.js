'use strict';
// (@regress 없음 — 러너 밖 · T1288 나란히 돌리기 증명의 자)
// === scripts/t1288-par.js — 홀로 판 · `-j` 판을 맞대고 겹침 · 남의 서버에 붙음을 센다 ==========
//   쓰는 법: node scripts/t1288-par.js <요약.json> <홀로 판 디렉터리> <나란히 판 디렉터리…>
//   판 디렉터리 = 러너 로그 `run.log` · 하네스 전체 출력 `out/` · `ports.jsonl`(LIB_PORT_LOG) · `net.jsonl`(t1288-net-log)
//   ① 하네스마다 (종료 판정 · 통과 수 · 실패 수)를 홀로 판과 맞댄다(결과 줄 = 러너 덩어리의 `✓/✗ RC` · 하네스 요약 줄의 두 수).
//   ② 장부 범위 겹침 = 같은 때 살아 있던 두 pid 의 범위가 겹친 쌍(살아 있음 = 잡은 때 ~ 내놓은 때).
//   ③ 남의 서버에 붙음 = 하네스 A 의 프로세스가 붙은 순간 그 포트를 묶고 있던 프로세스의 하네스가 B(≠A).
//      묶은 쪽 꼬리표가 비면(자식이 env 를 안 물려받음) 따로 센다.
//   ④ EADDRINUSE = 하네스 전체 출력에서 센 줄 수.
const fs = require('fs');
const path = require('path');
const [OUTJ, SOLO, ...PARS] = process.argv.slice(2);
// 남의 서버를 둘로 가른다 — 존 설정 포트(central 의 5초 `/health` 두드림이 닿는 곳 · 제품 고정 = 회부) · 그 밖(central · 하네스 포트)
const ZCFG = new Set(Object.values(require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES).map((z) => z.port));
if (!OUTJ || !SOLO || !PARS.length) { console.error('쓰는 법: node scripts/t1288-par.js <요약.json> <홀로 판> <나란히 판…>'); process.exit(2); }
const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
function runRes(dir) {
  const log = fs.readFileSync(path.join(dir, 'run.log'), 'utf8');
  const R = {};
  for (const blk of log.split(/^##### /m).slice(1)) {
    const name = blk.slice(0, blk.indexOf(' #####'));
    const ok = /^  ✓ RC=0$/m.test(blk), rc = (/✗ RC=(\d+)/.exec(blk) || [])[1];
    const sec = +((/\[소요\] (\d+)초/.exec(blk) || [])[1] || 0);
    const full = path.join(dir, 'out', name + '.out');
    const txt = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : blk;
    // 하네스 요약 줄의 두 수(통과 · 실패) — 말투가 여럿이라 마지막 요약 꼴 줄에서 수 둘을 읽는다
    const lines = txt.split('\n').filter((l) => /(PASS|통과)[^\n]*(FAIL|실패)|(FAIL|실패)[^\n]*(PASS|통과)|결과/.test(l));
    const last = lines.length ? lines[lines.length - 1] : '';
    const nums = (re) => { const m = re.exec(last); return m ? +m[1] : null; };
    const p = nums(/PASS\s*(\d+)|(\d+)\s*PASS/) ?? nums(/통과\s*(\d+)/), f = nums(/FAIL\s*(\d+)|(\d+)\s*FAIL/) ?? nums(/실패\s*(\d+)/);
    const pp = (() => { const m = /PASS\s*(\d+)|(\d+)\s*PASS|통과\s*(\d+)|(\d+)\s*통과/.exec(last); return m ? +(m[1] || m[2] || m[3] || m[4]) : null; })();
    const ff = (() => { const m = /FAIL\s*(\d+)|(\d+)\s*FAIL|실패\s*(\d+)|(\d+)\s*실패/.exec(last); return m ? +(m[1] || m[2] || m[3] || m[4]) : null; })();
    R[name] = { ok, rc: ok ? 0 : (rc == null ? '?' : +rc), pass: pp ?? p, fail: ff ?? f, sec, inuse: (txt.match(/EADDRINUSE/g) || []).length };
  }
  const tot = (/러너 전체 (\d+)초/.exec(log) || [])[1];
  return { R, wall: tot ? +tot : null };
}
function overlaps(dir) {
  const L = jl(path.join(dir, 'ports.jsonl'));
  const rel = new Map(); for (const r of L) if (r.release) rel.set(r.pid, r.t);
  const end = Math.max(...L.map((r) => r.t), 0);
  const A = L.filter((r) => !r.release && r.lo != null).map((r) => ({ ...r, kind: r.display ? 'd' : 'p', t1: rel.get(r.pid) || end }));
  let clash = 0; const ex = [];
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (a.kind !== b.kind || a.pid === b.pid) continue;
    if (!(a.lo < b.lo + b.n && b.lo < a.lo + a.n)) continue;
    if (!(a.t < b.t1 && b.t < a.t1)) continue;   // 같은 때 살아 있지 않았으면 차례로 쓴 것이다(겹침 아님)
    clash++; if (ex.length < 5) ex.push([a.argv, a.lo, a.n, b.argv, b.lo, b.n]);
  }
  return { n: A.length, holds: A.filter((r) => r.hold).length, displays: A.filter((r) => r.display).length, maxWait: Math.max(0, ...A.filter((r) => r.hold).map((r) => r.waited || 0)), clash, ex };
}
function foreign(dir) {
  const N = jl(path.join(dir, 'net.jsonl'));
  // ★하네스 끝 = 그 하네스 꼬리표의 마지막 기록(net) · 그 하네스 pid 의 장부 내놓음(ports) 중 늦은 것.
  //   SIGKILL 로 내려간 존은 '닫음' 줄을 못 남긴다 — 묶음 구간을 하네스 끝에서 자르지 않으면 다음 하네스가
  //   자기 존이 서기 전에 두드린 것을 "죽은 남의 존에 붙음"으로 잘못 센다(T1288 판 A 첫 집계가 그랬다).
  const hEnd = new Map();
  for (const e of N) if (e.h) hEnd.set(e.h, Math.max(hEnd.get(e.h) || 0, e.t));
  const P = jl(path.join(dir, 'ports.jsonl')), argvOf = new Map();
  for (const r of P) if (r.argv) argvOf.set(r.pid, r.argv);
  for (const r of P) if (r.release && argvOf.has(r.pid)) { const h = argvOf.get(r.pid); hEnd.set(h, Math.max(hEnd.get(h) || 0, r.t)); }
  const iv = new Map();   // port → [{h, pid, t0, t1}]
  const open = new Map();
  for (const e of N) {
    if (e.k === 'listen') { const o = { h: e.h, pid: e.pid, t0: e.t, t1: e.h && hEnd.has(e.h) ? hEnd.get(e.h) : Infinity }; open.set(e.pid + ':' + e.port, o); if (!iv.has(e.port)) iv.set(e.port, []); iv.get(e.port).push(o); }
    else if (e.k === 'close') { const o = open.get(e.pid + ':' + e.port); if (o) o.t1 = Math.min(o.t1, e.t); }
  }
  let conn = 0, matched = 0, foreignN = 0, untagged = 0, toZone = 0, toOther = 0; const byPair = new Map(), tagged = new Set();
  for (const e of N) {
    if (e.k !== 'connect') continue;
    conn++; if (e.h) tagged.add(e.h);
    const L = (iv.get(e.port) || []).filter((o) => o.t0 <= e.t && e.t <= o.t1);
    if (!L.length) continue;
    matched++;
    const o = L[L.length - 1];
    if (!o.h || !e.h) { untagged++; continue; }
    if (o.h !== e.h) { foreignN++; if (ZCFG.has(e.port)) toZone++; else toOther++; const k = e.h + ' → :' + e.port + ' (' + o.h + ')'; byPair.set(k, (byPair.get(k) || 0) + 1); }
  }
  const listens = N.filter((e) => e.k === 'listen');
  return { connects: conn, matched, foreign: foreignN, toZone, toCentral: toOther, untagged, ex: [...byPair].map(([k, n]) => n + ' ' + k), harnessesSeen: tagged.size, listenHarnesses: new Set(listens.map((e) => e.h).filter(Boolean)).size, listens: listens.length };
}
const solo = runRes(SOLO);
const out = { solo: { wall: solo.wall, n: Object.keys(solo.R).length, pass: Object.values(solo.R).filter((r) => r.ok).length, inuse: Object.values(solo.R).reduce((s, r) => s + r.inuse, 0), ports: overlaps(SOLO), net: foreign(SOLO) }, pars: [] };
for (const d of PARS) {
  const P = runRes(d);
  const same = [], diff = [];
  for (const [h, r] of Object.entries(solo.R)) {
    const q = P.R[h];
    if (!q) { diff.push({ h, why: '없음' }); continue; }
    if (q.rc === r.rc && q.pass === r.pass && q.fail === r.fail) same.push(h);
    else diff.push({ h, solo: [r.rc, r.pass, r.fail], par: [q.rc, q.pass, q.fail] });
  }
  out.pars.push({ dir: d, wall: P.wall, n: Object.keys(P.R).length, pass: Object.values(P.R).filter((r) => r.ok).length, same: same.length, diff, inuse: Object.values(P.R).reduce((s, r) => s + r.inuse, 0), inuseBy: Object.entries(P.R).filter(([, r]) => r.inuse).map(([h, r]) => h + '(' + r.inuse + ')'), ports: overlaps(d), net: foreign(d) });
}
out.soloFail = Object.entries(solo.R).filter(([, r]) => !r.ok).map(([h, r]) => h + '(rc=' + r.rc + ')');
fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1));
console.log(`홀로: ${out.solo.n}개 · 초록 ${out.solo.pass} · 벽 ${out.solo.wall}초 · EADDRINUSE ${out.solo.inuse} · 겹침 ${out.solo.ports.clash} · 남의 서버 ${out.solo.net.foreign}`);
for (const p of out.pars) console.log(`나란히 ${path.basename(p.dir)}: ${p.n}개 · 초록 ${p.pass} · 벽 ${p.wall}초 · 홀로와 같음 ${p.same}/${out.solo.n} · 범위 겹침 ${p.ports.clash}(범위 ${p.ports.n} · hold ${p.ports.holds} · 최대 기다림 ${p.ports.maxWait}ms) · EADDRINUSE ${p.inuse} · 남의 central·하네스 서버 ${p.net.toCentral} · 남의 존 설정 포트 ${p.net.toZone}(붙음 ${p.net.connects} · 묶은 쪽 찾음 ${p.net.matched} · 꼬리표 없음 ${p.net.untagged})${p.diff.length ? ' · 다른 것 ' + p.diff.map((x) => x.h + JSON.stringify(x.solo || x.why) + '→' + JSON.stringify(x.par || '')).join(' ; ') : ''}`);
