#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bundle-blackbox.js — ★T1357 검사 카드(구현을 안 본 세션): 묶음 켬 기본 — 판 **결과만** 묻는다 ===
//
// ★왜(재민 11-17 테스트 강화 · 공통 "테스트 강화 규약" ⑥ ⑦): 묶음은 400날 자로 목표 넷을 다 넘고도 2년째에 무너졌다(T1334).
//   이 하네스는 묶음 구현(`server/t1334-bundle.js` · 갈래 코드)을 **읽지도 부르지도 않는다** — 서버 판 자를 손님 0 으로 띄우고
//   플레이어 · 화면이 보는 결과(마을마다 사람 · 굶어 죽음 · 직업 · 곳간 바닥 · 끊고 이은 판)만 관찰기 `t1357-observe.js` 로 읽는다.
//   긴 물음(2년째 · 3년째 · 다른 시드 · 계절)은 판 자 표(`scripts/t1357-ruler.js`)가 맡는다 — 이 파일은 짧은 판(기본 60날)이 답할 수 있는 것만.
//
// 판 셋(같은 시드 · 서버 기준선 판 조건 `VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0` · 가상 시계 · T1308 이어 도는 판 자):
//   켬 = 제품 기본(손잡이를 안 준다) · 끔 = `T1334_BUNDLE=0` · 끊음 = 제품 기본을 날 D/2 에 끊고 체크포인트에서 이어 D 날
// 물음(켬 기본이면 다 초록이어야 한다 — 빨강은 구현 세션 회부):
//   ① 기본 세계가 묶음 세계다(켬 판 결과 ≠ 끔 판 결과)                       — 옛 코드(묶음 끔 기본)에서 빨강이어야 한다
//   ② 마을별 최악 — 끔 판에서 사람이 10 이상인 마을이 켬 판에서 절반 밑으로 안 준다 · 끔 판에서 산 마을이 켬 판에서 안 빈다
//   ③ 몰림 — 가장 큰 마을의 세계 몫이 끔 판의 1.5배를 안 넘는다
//   ④ 직업 — 끔 판 세계에 있는 직업이 켬 판 세계에서 안 사라진다
//   ⑤ 굶어 죽음 — 켬 판 D 날 누계 ≤ 끔 판 누계 + 5
//   ⑥ 곳간 바닥 — 곳간 < 사람 × 10 인 마을-날 켬 ≤ 끔 × 1.5 + 10
//   ⑦ 작은 마을 — 사람 > 0 마을 중 가장 적은 사람 켬 ≥ 끔 × 0.5
//   ⑧ 끊고 이은 판 = 안 끊은 판 — 켬 판 D 날 마을마다 사람 · 세계 날 줄(사람 · 죽음 · 떠남) 같음(묶음이 저장 안 되는 칸에 기대면 갈린다)
// 미끼(파일 안 · 바꾼 자리 정확히 1곳을 세고 · 어느 물음이 빨강이 되는지 단언):
//   ⓐ 끔 판을 켬 자리에 — ① 빨강   ⓑ 켬 판 한 마을 사람 0 — ② 빨강   ⓒ 세계 사람 40% 를 한 마을로 — ③ 빨강
//   ⓓ 켬 판 세계에서 있는 직업 하나를 지움 — ④ 빨강   ⓔ 켬 판 굶어 죽음 +100 — ⑤ 빨강   ⓕ 켬 판 바닥 마을-날 +1000 — ⑥ 빨강
//   ⓖ 켬 판 가장 작은 마을 사람 1 — ⑦ 빨강   ⓗ 끊음 판 한 마을 사람 +1 — ⑧ 빨강
// 날짜 · 벽시계 0(판 날 수는 인수 `BBX_DAYS` · 기본 60 · 시드 `BBX_SEED` · 기본 1020).
//
// 실행: node --experimental-sqlite scripts/test-bundle-blackbox.js        (판 셋 · 이 상자 약 8분)
//       BBX_REUSE=<폴더> — 그 폴더의 판을 다시 쓴다(물음만 다시 · 판 0)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const DAYS = Math.max(20, parseInt(process.env.BBX_DAYS || '60', 10) || 60);
const HALF = Math.floor(DAYS / 2 / 10) * 10 || 10;
const SEED = parseInt(process.env.BBX_SEED || '1020', 10) || 1020;
const COND = { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0', T745_VCLOCK: '1' };   // 서버 기준선 판 조건(server-baseline-check COND · --vclock)
const OBS = path.join(__dirname, 't1357-observe.js');

let pass = 0, fail = 0;
const lines = [];
const ok = (c, m, d) => { if (c) pass++; else fail++; const s = `  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`; lines.push(s); console.log(s); };

// ── 판 ───────────────────────────────────────────────────────────────────────────────────
function run(dir, every, extra) {
  fs.mkdirSync(dir, { recursive: true });
  const env = Object.assign({}, process.env, COND, extra || {});
  for (const k of Object.keys(env)) if (/^T1334_|^T1357_OUT$/.test(k) && !(extra && k in extra)) delete env[k];   // 부르는 쪽 env 의 묶음 손잡이를 지운다(기본 = 제품 기본)
  env.NODE_OPTIONS = `--require ${OBS}`;
  const r = spawnSync(process.execPath, ['--experimental-sqlite', path.join(ROOT, 'scripts', 't1308-long-run.js'), String(DAYS), String(SEED), '--every', String(every), '--dir', dir, '--tag', 'bbx'],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 3600 * 1000 });
  return r.status;
}
// 관찰기 줄 읽기 — 세계 날 줄은 마디마다 이어 · 마을 줄은 마지막 마디(D 날 줄을 가진 것)
function load(dir) {
  const segs = fs.readdirSync(dir).filter((f) => /^seg-\d+\.t1357\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
  const rows = new Map(); let vD = null, err = null;
  for (const f of segs) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    err = err || j.err;
    for (const r of j.rows) { const o = {}; j.cols.forEach((c, i) => { o[c] = r[i]; }); rows.set(o.day, o); }
    for (const [d, vs] of j.vrows) if (d === DAYS) vD = vs;
  }
  const V = new Map(); for (const x of (vD || [])) V.set(x[0], { pop: x[1], foodPer: x[2], fdTot: x[3], deadTot: x[4], jobs: x[7] });
  return { rows, V, err, segs: segs.length };
}
const clone = (R) => ({ rows: new Map([...R.rows].map(([d, o]) => [d, Object.assign({}, o)])), V: new Map([...R.V].map(([n, o]) => [n, Object.assign({}, o, { jobs: Object.assign({}, o.jobs) })])), err: R.err, segs: R.segs });
const sum = (R, k) => { let t = 0; for (const o of R.rows.values()) if (o.day <= DAYS) t += o[k] || 0; return t; };
const worldJobs = (R) => { const s = {}; for (const o of R.V.values()) for (const [j, n] of Object.entries(o.jobs || {})) s[j] = (s[j] || 0) + n; return s; };
const maxShare = (R) => { let t = 0, m = 0; for (const o of R.V.values()) { t += o.pop; if (o.pop > m) m = o.pop; } return t ? m / t : 0; };

// ── 물음(순수 함수 — 판 결과만) ──────────────────────────────────────────────────────────
const Q = {
  q1(on, off) { const d = []; for (const [day, o] of on.rows) { const f = off.rows.get(day); if (f && (f.pop !== o.pop || f.dead !== o.dead || f.emig !== o.emig)) d.push(day); } for (const [n, o] of on.V) { const f = off.V.get(n); if (f && f.pop !== o.pop) d.push(n); } return { ok: d.length > 0, d: `갈린 날 · 마을 ${d.length}` }; },
  q2(on, off) { const bad = []; for (const [n, f] of off.V) { const o = on.V.get(n); if (!o) continue; if (f.pop >= 10 && o.pop < 0.5 * f.pop) bad.push(`${n} ${o.pop}/${f.pop}`); else if (f.pop > 0 && o.pop === 0) bad.push(`${n} 빔`); } return { ok: bad.length === 0, d: bad.slice(0, 4).join(' · ') || '없음' }; },
  q3(on, off) { const a = maxShare(on), b = maxShare(off); return { ok: a <= 1.5 * b, d: `켬 ${(a * 100).toFixed(1)}% · 끔 ${(b * 100).toFixed(1)}%` }; },
  q4(on, off) { const a = worldJobs(on), b = worldJobs(off); const gone = Object.keys(b).filter((j) => b[j] > 0 && !(a[j] > 0)); return { ok: gone.length === 0, d: gone.join(',') || '없음' }; },
  q5(on, off) { const a = sum(on, 'fd'), b = sum(off, 'fd'); return { ok: a <= b + 5, d: `켬 ${a} · 끔 ${b}` }; },
  q6(on, off) { const a = sum(on, 'low10'), b = sum(off, 'low10'); return { ok: a <= 1.5 * b + 10, d: `켬 ${a} · 끔 ${b}` }; },
  q7(on, off) { const a = (on.rows.get(DAYS) || {}).minPop || 0, b = (off.rows.get(DAYS) || {}).minPop || 0; return { ok: a >= 0.5 * b, d: `켬 ${a} · 끔 ${b}` }; },
  q8(rs, on) { const d = []; for (const [n, o] of on.V) { const r = rs.V.get(n); if (!r || r.pop !== o.pop) d.push(n); } for (const [day, o] of on.rows) { const r = rs.rows.get(day); if (!r || r.pop !== o.pop || r.dead !== o.dead || r.emig !== o.emig) d.push('날 ' + day); } return { ok: d.length === 0 && on.V.size > 0, d: d.slice(0, 4).join(' · ') || '없음' }; },
};
const NAMES = { q1: '① 기본 세계가 묶음 세계(켬 판 결과 ≠ 끔 판)', q2: '② 마을별 최악 — 끔에서 10 이상 마을이 절반 밑 · 빈 마을 0', q3: '③ 몰림 — 가장 큰 마을 몫 ≤ 끔 × 1.5', q4: '④ 직업 — 끔 세계의 직업이 안 사라진다', q5: '⑤ 굶어 죽음 ≤ 끔 + 5', q6: '⑥ 곳간 바닥 마을-날 ≤ 끔 × 1.5 + 10', q7: '⑦ 작은 마을 ≥ 끔 × 0.5', q8: '⑧ 끊고 이은 판 = 안 끊은 판' };

// ── 돌리기 ───────────────────────────────────────────────────────────────────────────────
const REUSE = process.env.BBX_REUSE;
const BASE = REUSE || fs.mkdtempSync(path.join(os.tmpdir(), 'bbx-'));
console.log(`\n=== T1357 묶음 켬 기본 — 결과 하네스(구현 안 봄) · 시드 ${SEED} · ${DAYS}날 · 끊음 ${HALF}날 · ${BASE} ===`);
const D_ON = path.join(BASE, 'on'), D_OFF = path.join(BASE, 'off'), D_RS = path.join(BASE, 'rs');
if (!REUSE) {
  const c1 = run(D_ON, DAYS, null), c2 = run(D_OFF, DAYS, { T1334_BUNDLE: '0' }), c3 = run(D_RS, HALF, null);
  ok(c1 === 0 && c2 === 0 && c3 === 0, '전제 — 판 셋이 끝까지 돌았다(켬 · 끔 · 끊음)', `${c1} · ${c2} · ${c3}`);
}
const ON = load(D_ON), OFF = load(D_OFF), RS = load(D_RS);
ok(!ON.err && !OFF.err && !RS.err && ON.V.size >= 40 && OFF.V.size >= 40 && RS.segs >= 2 && ON.rows.has(DAYS) && OFF.rows.has(DAYS), '전제 — 관찰기 줄(마을 줄 D 날 · 끊음 판 마디 둘 이상 · 오류 0)', `마을 ${ON.V.size} · ${OFF.V.size} · 끊음 마디 ${RS.segs}`);

console.log('\n물음');
const res = {};
for (const k of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']) { res[k] = Q[k](ON, OFF); ok(res[k].ok, NAMES[k], res[k].d); }
res.q8 = Q.q8(RS, ON); ok(res.q8.ok, NAMES.q8, res.q8.d);

// ── 미끼(파일 안) ────────────────────────────────────────────────────────────────────────
console.log('\n미끼(바꾼 자리 1곳 · 그 물음 빨강)');
const diffCount = (A, B) => { let n = 0; for (const [d, o] of A.rows) { const b = B.rows.get(d); for (const k of Object.keys(o)) if (o[k] !== b[k]) n++; } for (const [nm, o] of A.V) { const b = B.V.get(nm); if (o.pop !== b.pop || o.fdTot !== b.fdTot) n++; const ja = JSON.stringify(o.jobs), jb = JSON.stringify(b.jobs); if (ja !== jb) n++; } return n; };
function decoy(tag, mut, q, a, b) {
  const one = mut.n === 1;
  const r = Q[q](a, b);
  ok(one && !r.ok, `미끼 ${tag} — 바꾼 자리 ${mut.n} · ${NAMES[q].slice(0, 1)} 빨강`, r.d);
}
{ // ⓐ 끔 판을 켬 자리에 — 바꾼 자리 = 판 하나(켬 → 끔)
  const r = Q.q1(OFF, OFF); ok(!r.ok, '미끼 ⓐ 끔 판을 켬 자리에(판 하나 바꿈) · ① 빨강', r.d);
}
{ const M = clone(ON); const big = [...M.V.entries()].sort((x, y) => y[1].pop - x[1].pop).find(([n]) => (OFF.V.get(n) || {}).pop >= 10); if (big) big[1].pop = 0; decoy('ⓑ 한 마을 사람 0', { n: diffCount(M, ON) }, 'q2', M, OFF); }
{ const M = clone(ON); let t = 0; for (const o of M.V.values()) t += o.pop; const top = [...M.V.values()].sort((x, y) => y.pop - x.pop)[0]; top.pop += Math.round(0.4 * t); decoy('ⓒ 세계 사람 40% 를 한 마을로', { n: diffCount(M, ON) }, 'q3', M, OFF); }
{ const M = clone(ON); const wj = worldJobs(OFF), wo = worldJobs(ON); const j = Object.keys(wj).sort((x, y) => wj[x] - wj[y]).find((x) => wj[x] > 0 && wo[x] > 0); let n = 0; for (const o of M.V.values()) if (o.jobs[j]) { delete o.jobs[j]; n++; } decoy(`ⓓ 직업 "${j}" 하나를 세계에서 지움`, { n: n > 0 ? 1 : 0 }, 'q4', M, OFF); }   // 바꾼 자리 = 직업 하나(그 직업을 가진 마을 줄 전부)
{ const M = clone(ON); M.rows.get(DAYS).fd += 100; decoy('ⓔ 굶어 죽음 +100', { n: diffCount(M, ON) }, 'q5', M, OFF); }
{ const M = clone(ON); M.rows.get(DAYS).low10 += 1000; decoy('ⓕ 바닥 마을-날 +1000', { n: diffCount(M, ON) }, 'q6', M, OFF); }
{ const M = clone(ON); M.rows.get(DAYS).minPop = 1; const b = (OFF.rows.get(DAYS) || {}).minPop || 0; decoy('ⓖ 가장 작은 마을 사람 1', { n: b >= 4 ? diffCount(M, ON) : 0 }, 'q7', M, OFF); }
{ const M = clone(RS); const v = [...M.V.values()][0]; v.pop += 1; decoy('ⓗ 끊음 판 한 마을 사람 +1', { n: diffCount(M, RS) }, 'q8', M, ON); }

console.log(`\n${fail ? '✗' : '✓'} test-bundle-blackbox ${pass}/${fail}`);
if (!REUSE && !fail) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) {} } else console.log(`  판 폴더 ${BASE}(BBX_REUSE 로 다시 묻기)`);
process.exit(fail ? 1 : 0);
