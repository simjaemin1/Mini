#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1241-des.js — 사건 기반 시뮬 시제품(T1241): 낱장 셋 · 손잡이 끔 글자 · 사건 판 ↔ 틱 판 짧은 대조 ===
//
// ★무엇을 보나
//   ① 사건 대기열 — (시각 · 넣은 차례) 차례가 정렬 오라클과 같다 · 같은 시각은 먼저 넣은 것이 먼저(틱 순서 대신 결정론)
//   ② facility — 자리 수 · 대기 줄 차례(요청 시각 · 넣은 차례) · 놓으면 줄 머리가 받는다 · 같은 몸 두 번 줄 안 섬
//   ③ 걸음 토막 — 도착 시각 = Σ 조각 길이 ÷ 그 자리 빠르기 · posAt 은 길 위 · 시각이 오르면 길도 오른다 · 다리 번호
//   ④ 해 몫 사건 시각 — `nextPhaseAt` 이 존 정본(`phaseAdd(worldPhase(t), off)`)으로 문턱을 넘는 첫 시각과 1ms 안에서 같다
//   ⑤ 끔 = 종전 글자 — 존의 사건 갈래 부름 자리가 모두 손잡이 뒤(`T1241_DES` · `T1241_PROBE`)
//   ⑥ 판 — 마을 하나 · 몸 전부 · 3날(가상 시계) 틱 판 ↔ 사건 판: econ 지문(곳간 · 작물 장부 · 인구) 같음 · 사건 갈래가 실제로 몸을 쥐었다(자명 통과 금지)
// 실행: node scripts/test-t1241-des.js   (⑥ 이 판 둘 — 2 ~ 4분) · `--quick` = ① ~ ⑤ 만
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DES = require(path.join(ROOT, 'server', 'des.js'));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

console.log('\n=== ① 사건 대기열 ===');
{
  const Q = new DES.EventQueue(); const ref = [];
  for (let i = 0; i < 5000; i++) { const t = Math.floor(rnd() * 300); Q.push(t, i); ref.push([t, i]); }
  ref.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let same = 0; for (let i = 0; i < ref.length; i++) { const e = Q.pop(); if (e.time === ref[i][0] && e.item === ref[i][1]) same++; }
  ok(same === ref.length && Q.size === 0, '꺼낸 차례 = (시각 · 넣은 차례) 정렬', `${same}/${ref.length}`);
  const ties = ref.filter((r, i) => i && ref[i - 1][0] === r[0]).length;
  ok(ties > 1000, '자명 통과 금지 — 같은 시각 사건이 실제로 많다', `같은 시각 ${ties}`);
  const Q2 = new DES.EventQueue(); const got = []; for (let i = 0; i < 50; i++) Q2.push(i % 7, i);
  const n = Q2.runUntil(3, (t, it) => got.push([t, it]));
  ok(n === got.length && got.every((g, i) => !i || got[i - 1][0] < g[0] || (got[i - 1][0] === g[0] && got[i - 1][1] < g[1])) && got.every((g) => g[0] <= 3) && Q2.peekTime() === 4, 'runUntil — 시각 ≤ 끝 만 · 차례대로', `${n}건`);
}

console.log('\n=== ② facility(서버 수 + 대기 줄) ===');
{
  const F = new DES.Facility('곳간 문', 2);
  const a = F.request('a', 10), b = F.request('b', 11), c = F.request('c', 12), d = F.request('d', 12), c2 = F.request('c', 13);
  ok(a && b && !c && !d && !c2 && F.q.length === 2, '자리 둘 — 셋째부터 줄 · 같은 몸 두 번 줄 안 섬', `줄 ${F.q.map((e) => e.who).join(',')}`);
  const n1 = F.release('a'), n2 = F.release('b');
  ok(n1 === 'c' && n2 === 'd' && F.busy.has('c') && F.busy.has('d') && !F.q.length, '놓으면 줄 머리가 받는다(요청 시각 · 넣은 차례)', `${n1} → ${n2}`);
  const G = new DES.Facility('밭 칸', 1); G.request('x', 5); G.request('z', 9); G.request('y', 7);
  ok(G.release('x') === 'y' && G.queuePos('z') === 1, '줄은 요청 시각 차례(넣은 차례가 아니다)', '');
}

console.log('\n=== ③ 걸음 토막 ===');
{
  const pts = [0, 0, 100, 0, 100, 50, 30, 50];
  const r = new DES.Route(pts, () => 50, 1000, 16);
  ok(Math.abs(r.t1 - (1000 + (100 + 50 + 70) / 50 * 1000)) < 1e-6 && Math.abs(r.len - 220) < 1e-9, '고른 빠르기 — 도착 = 출발 + 길이 ÷ 빠르기', `${r.t1.toFixed(3)}`);
  let mono = true, onPath = true, prevS = -1; const o = {};
  for (let t = 1000; t <= r.t1 + 100; t += 37) {
    r.posAt(t, o);
    const s = o.y === 0 ? o.x : (o.x === 100 ? 100 + o.y : 150 + (100 - o.x));
    if (!(o.y === 0 || o.x === 100 || o.y === 50)) onPath = false;
    if (s < prevS - 1e-9) mono = false; prevS = s;
  }
  ok(mono && onPath, 'posAt — 길 위 · 시각이 오르면 길도 오른다', '');
  r.posAt(1000 + 2500, o); const k2 = r.L[o.k + 1];
  ok(k2 === 2 && Math.abs(o.x - 100) < 1e-9 && Math.abs(o.y - 25) < 1e-9, '다리 번호 — 2.5초 = 둘째 다리 가운데', `다리 ${k2} · (${o.x}, ${o.y})`);
  r.posAt(1100, o); const back = o.x;
  ok(Math.abs(back - 5) < 1e-9, '시각이 되돌아가도 커널은 처음부터 다시 찾는다', `x ${back}`);
  const slow = new DES.Route([0, 0, 64, 0, 128, 0], (x) => (x < 64 ? 64 : 32), 0, 16);
  ok(Math.abs(slow.t1 - (1000 + 2000)) < 1e-6, '칸마다 빠르기 — 앞 64px 64px/s · 뒤 64px 32px/s = 3초', `${slow.t1}`);
}

console.log('\n=== ④ 해 몫 사건 시각 = 존 정본 문턱 ===');
{
  const L = ZC.WORLD.dayLengthMs, E = ZC.WORLD.worldEpoch;
  const fv = (t, off) => ZC.phaseAdd(ZC.worldPhase(t), off);
  let good = 0, N = 2000, worst = 0;
  for (let i = 0; i < N; i++) {
    const now = 1767225600000 + Math.floor(rnd() * L * 50), off = rnd() * 1.5 - 0.75, target = [0.7, 0.03 * rnd(), 0.7 * 0.501, 0.7 * 0.137][i % 4];
    const t = DES.nextPhaseAt(now, E, L, off, target);
    // 정본으로 문턱 넘는 첫 ms 를 찾는다(t 앞뒤 3ms)
    let first = null; for (let u = Math.floor(t) - 3; u <= Math.floor(t) + 3; u++) { const a = fv(u - 1, off), b = fv(u, off); const crossed = (a < target && b >= target) || (a > b && b >= target && target < a); if (crossed) { first = u; break; } }
    if (first != null && Math.abs(first - t) <= 1 && t > now) good++;
    if (first != null) worst = Math.max(worst, Math.abs(first - t));
  }
  ok(good === N, 'nextPhaseAt — 정본 fv 가 문턱을 넘는 첫 ms 와 1ms 안(+1ms 를 더해 넘은 첫 틱을 연다)', `${good}/${N} · 가장 먼 ${worst.toFixed(3)} ms`);
}

console.log('\n=== ⑤ 끔 = 종전 글자 ===');
{
  const z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8').split('\n');
  //   부르는 자리(함수 몸 밖)는 손잡이 문 뒤에만 있어야 한다 — 함수 몸 안의 부름은 그 함수가 손잡이 뒤에서만 불린다.
  const sites = z.filter((l) => /^\s{4}if \(T1241_DES && npc\._des && _desHold|^\s{4}if \(T1241_DES\) _desTry|^\s{4}if \(T1241_PROBE && _desClk\) \{ _desTimed|^\s{2}if \(T1241_DES && p\._des\) return;|^\s{6}if \(T1241_DES && p\._des\) continue;|^\s{2}if \(_T1241\) \{ _desStat\.ticks\+\+/.test(l));
  ok(sites.length === 6, '부르는 자리 여섯이 모두 손잡이 뒤(결정 문 셋 · 걸음 문 둘 · 틱 끝 하나)', `${sites.length}`);
  ok(/const T1241_DES = process\.env\.T1241_DES === '1';/.test(z.join('\n')) && /const _DES = T1241_DES \? require\('\.\/des'\) : null;/.test(z.join('\n')), '손잡이 끔 기본(`=== \'1\'`) · 모듈은 켬에서만 싣는다', '');
}

if (!process.argv.includes('--quick')) {
  console.log('\n=== ⑥ 판 — 마을 하나 · 몸 전부 · 3날 · 틱 ↔ 사건 ===');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1241-'));
  const run = (mode) => {
    const env = Object.assign({}, process.env, {
      NODE_OPTIONS: `--require ${path.join(ROOT, 'scripts', 't1241-hook.js')} --require ${path.join(ROOT, 'scripts', 't745-vclock.js')}`,
      T745_VCLOCK: '1', T1241_PROBE: '1', T1241_OUT: path.join(tmp, mode), T1241_DES: mode === 'des' ? '1' : '0',
      VILLAGE_MAX: '1', VILLAGE_DAY_MS: '1440000', VILLAGE_NPC_CAP: 'Infinity', T577_DIR: path.join(tmp, 'runs-' + mode), T577_PAR: '1' });
    spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), '3', '1020'], { env, cwd: ROOT, stdio: 'ignore', timeout: 900000 });
    try { return fs.readFileSync(path.join(tmp, `${mode}.1020.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((o) => o.d != null && o.d >= 0); } catch (e) { return []; }
  };
  const A = run('tick'), B = run('des');
  ok(A.length >= 2 && B.length === A.length, '두 판 다 날마다 줄을 남겼다', `틱 ${A.length} · 사건 ${B.length}`);
  const same = A.filter((a, i) => B[i] && a.d === B[i].d && a.sto === B[i].sto && a.crop === B[i].crop && a.pop === B[i].pop && a.farm === B[i].farm).length;
  ok(A.length && same === A.length, 'econ 지문 날마다 같음(곳간 정확 지문 · 작물 장부 · 인구 · 밭 칸)', `${same}/${A.length}`);
  const lb = B[B.length - 1] || { st: {} }, la = A[A.length - 1] || { st: {} };
  ok((lb.st.held || 0) > 0 && (lb.st.begin && lb.st.begin.sleep > 0) && (lb.st.steps || 0) < (la.st.steps || 0), '자명 통과 금지 — 사건 갈래가 몸을 실제로 쥐었다(잠 토막 · 걸린 npcStep 이 줄었다)', `쥔 몸-틱 ${lb.st.held || 0} · npcStep ${la.st.steps || 0} → ${lb.st.steps || 0}`);
  ok((la.st.held || 0) === 0, '틱 판(끔)은 사건 갈래가 몸을 안 쥔다', `${la.st.held || 0}`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
