#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4   ← [T1401 · T1406] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1401-walk-map.js — 걸음 지도: 마을 51 이 지형 · 다리로 다 이어지는가 · 멀리 도는 이웃 쌍 지문(T1401) ==========================
//
// ★무엇을 보나(한반도 · `audit-reachability.js hanbando --walk --bridge-pairs 0` 한 판 · 지도 탐색만 — 서버 0)
//   ① 마을 51 · 닻 칸(중심 곁 열린 칸) 못 찾음 0 · **모든 마을 쌍 걸음 거리 못 닿음 0**(물 · 바위 · 해안선 띠 막힘 · 다리 칸 열림 — 서버 `isTerrainBlockedLocal` 동형)
//   ② 걸음 ÷ 곧은 거리가 상한(2)을 넘는 이웃 쌍(마을마다 곧은 거리 가까운 20곳) 목록 · 비(0.01) = 표 파일 `계측/T1401_걸음지도_hanbando.json`
//      (수를 박지 않는다 — 지도 · 다리가 바뀌면 이 줄이 빨갛고, 바뀐 것이 맞으면 `--write-table` 로 표를 다시 쓴다)
//   ③ 미끼 둘(이 파일이 프리로드로 실린다 · `T1401_BAIT`): 지도 설정(`zone-config` 한반도 `bridges`)에서 다리를 지운 사본 — 지운 칸 수를 세고 그 물음만 빨강:
//      `all` = 다리 칸 전부 → ① 빨강 / `one` = 다리 하나(어촌3 이 돌아 건너는 북쪽 다리 · (387,2070) 이 든 묶음) → ② 빨강 · ① 초록
//      (다리 묶음 29 가운데 하나만 지워 마을이 끊기는 다리는 0 이다 — T1401 보고 §1. 그래서 ① 의 미끼는 전부 지우기다)
//   ★[T1406] ④ 다리 놓은 지도(`T1406_BRIDGES=1` · `server/bridges-t1406.json`): 못 닿음 0 · 걸음 ÷ 곧은 거리 3배 넘는 이웃 쌍 **0**(과녁)
//      미끼 `t1406` = 그 다리 칸을 지운 사본 → ④ 빨강(3배 넘는 쌍이 돌아온다)
//   ★[T1406] ⑤ NPC 마을은 길을 안 막는다(`T1406_KEEP_PATHS=1`): 운영 영토 넓히기(`_terrGrowCore` — `__labProbe._t569Probe.grow`)를 다리 곁 시험 마을로 60날 —
//      켬 = 다리 칸 · 다리 머리(물 칸에서 체비쇼프 2) · 교역로 칸을 한 칸도 안 먹는다 · 끔 = 먹는다(자명 통과 금지 전제)
//      미끼 `claim` = 길 칸 술어가 그 다리를 모르는 사본(존 설정에서 그 다리를 지움 · 지형은 그대로 열림 = 다리 칸에 땅을 놓는다) → ⑤ 빨강
// 실행: node scripts/test-t1401-walk-map.js   (판 셋 · 동시 둘 · 약 3 ~ 5분) · 표 다시 쓰기: node scripts/test-t1401-walk-map.js --write-table
'use strict';
const path = require('path');
const fs = require('fs');

// ── 미끼 프리로드(감사 자 프로세스에서만 — `T1401_BAIT` 가 있고 이 파일이 `-r` 로 실렸을 때) ──────────────────────────────
if (require.main !== module) {
  const B = process.env.T1401_BAIT;
  if (B && /audit-reachability\.js$/.test(process.argv[1] || '')) {
    const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
    const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
    const Z = ZONES.hanbando, b = Z.bridges || [];
    const cells = []; for (let i = 0; i + 1 < b.length; i += 2) cells.push([b[i], b[i + 1]]);
    let drop = new Set();
    if (B === 'all') drop = new Set(cells.map((c) => c[0] + ',' + c[1]));
    if (B === 't1406') {   // [T1406] 다리 놓은 지도에서 T1406 다리 칸만 지운다
      let add = {}; try { add = require(path.join(ROOT, 'server', 'bridges-t1406.json')); } catch (e) {}
      const f = add.hanbando || []; for (let i = 0; i + 1 < f.length; i += 2) drop.add(f[i] + ',' + f[i + 1]);
    }
    if (B === 'one') {   // (387,2070) 이 든 4방 이웃 묶음 하나
      const has = new Set(cells.map((c) => c[0] + ',' + c[1])), st = ['387,2070'];
      if (has.has(st[0])) { drop.add(st[0]); while (st.length) { const [x, y] = st.pop().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (has.has(k) && !drop.has(k)) { drop.add(k); st.push(k); } } } }
    }
    const keep = []; for (const c of cells) if (!drop.has(c[0] + ',' + c[1])) keep.push(c[0], c[1]);
    Z.bridges = keep;
    if (process.env.T1401_BAIT_OUT) fs.writeFileSync(process.env.T1401_BAIT_OUT, JSON.stringify({ bait: B, n: drop.size }));
  }
  return;
}

//   ── [T1406 ⑤] 영토 넓히기 아이(`--grow-child` · 끔/켬은 부르는 쪽 env · 미끼는 `T1406_GROW_BAIT=1`) ──
if (process.argv.includes('--grow-child')) {
  const ROOT = path.join(__dirname, '..'), SZ = 32;
  const T = require(path.join(ROOT, 'server', 'terrain')); const { ZONES } = require(path.join(ROOT, 'server', 'zone-config')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const Z = ZONES.hanbando, b = Z.bridges || []; const BR = new Set(); for (let i = 0; i + 1 < b.length; i += 2) BR.add(b[i] + ',' + b[i + 1]);
  const W = (x, y) => T.isWaterCellLocal('hanbando', x * SZ + 16, y * SZ + 16), Rk = (x, y) => T.isRockCellLocal('hanbando', x * SZ + 16, y * SZ + 16);
  const ta = { isWater: W, isBlocked: (x, y) => Rk(x, y) || (W(x, y) && !BR.has(x + ',' + y)), isRock: Rk, fert: () => 0.5, forestMult: () => 1, isStream: () => false };
  //   다리 묶음 하나 — (387,2070) 이 든 4방 덩이(어촌3 북쪽 다리 · T1401 미끼와 같은 다리)
  const g = new Set(['387,2070']), st = ['387,2070']; while (st.length) { const [x, y] = st.pop().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (BR.has(k) && !g.has(k)) { g.add(k); st.push(k); } } }
  if (process.env.T1406_GROW_BAIT === '1') { const keep = []; for (let i = 0; i + 1 < b.length; i += 2) if (!g.has(b[i] + ',' + b[i + 1])) keep.push(b[i], b[i + 1]); Z.bridges = keep; console.error(`[미끼] 바꾼 자리 ${g.size}칸 — 존 설정에서 다리 하나를 지운 사본(지형은 열린 그대로)`); }
  const V = require(path.join(ROOT, 'server', 'villages.js')), E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const land = [...g].map((k) => k.split(',').map(Number)).filter(([x, y]) => !W(x, y)), [lx, ly] = land[0];
  const own = new Set(); for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = lx + dx, y = ly + dy; if (!ta.isBlocked(x, y) && !g.has(x + ',' + y) && Math.max(Math.abs(dx), Math.abs(dy)) >= 4) own.add(x + ',' + y); }
  const ec = E.createVillage({ name: 'T', initialPop: 40, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 }); ec.land.size = 400; ec.housing = 600; ec.npcs = new Array(400).fill(0).map((_, i) => ec.npcs[i % ec.npcs.length]);
  const vil = { name: '시험', dbId: 1, ccx: lx, ccy: ly - 5, _terrSet: own, _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(), _houseCells: [], _granList: [], _ditch: [], npcPids: [], econ: ec };
  //   교역로 하나 — 시험 마을(1) 곁을 동서로 지나는 **남의 길**(마을 901 ↔ 902 · 칸 중심 점 둘)
  const rY = ly - 12, route = [{ x: (lx - 40) * SZ + 16, y: rY * SZ + 16 }, { x: (lx + 40) * SZ + 16, y: rY * SZ + 16 }];
  V.__p3Bind({ zoneId: 'hanbando', routeCache: new Map([['901_902', route]]), world: { day: 1 } }); V.__labProbe._t569Probe.setup({ ta, villages: [vil], db: null });
  const n0 = own.size; let err = null; for (let i = 0; i < 60; i++) { try { V.__labProbe._t569Probe.grow(vil); } catch (e) { err = e.message; break; } }
  const head = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.has((x + dx) + ',' + (y + dy)) && W(x + dx, y + dy)) return true; return false; };
  let onBr = 0, onHead = 0, onRoute = 0; for (const k of own) { const [x, y] = k.split(',').map(Number); if (g.has(k)) onBr++; else if (head(x, y)) onHead++; if (y === rY && x >= lx - 40 && x <= lx + 40) onRoute++; }
  process.stdout.write(JSON.stringify({ on: !!V.T1406_KEEP_PATHS, n0, n: own.size, onBr, onHead, onRoute, err }) + '\n');
  process.exit(0);
}

const os = require('os');
const { spawn } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 't1401-'));
const TABLE = path.join(__dirname, '..', '계측', 'T1401_걸음지도_hanbando.json');
const CAP = 2;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const audit = (tag, bait) => new Promise((res) => {
  const out = path.join(BASE, tag + '.json'), bo = path.join(BASE, tag + '.bait.json');
  const env = Object.assign({}, process.env); delete env.T1401_BAIT;
  if (bait) Object.assign(env, { T1401_BAIT: bait, T1401_BAIT_OUT: bo });
  const args = [...(bait ? ['-r', __filename] : []), path.join(__dirname, 'audit-reachability.js'), 'hanbando', '--walk', '--bridge-pairs', '0', '--top', '100000', '--json', out];
  const c = spawn(process.execPath, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; c.stderr.on('data', (d) => { err += d; });
  c.on('exit', (code) => res({ code, J: rd(out), K: rd(bo), err: err.slice(-400) }));
});
const grow = (env) => new Promise((res) => {
  const e2 = Object.assign({}, process.env, { ENABLE_VILLAGES: '0', DB_PATH: path.join(BASE, 'grow-' + Math.random().toString(36).slice(2) + '.db') }, env); delete e2.T1401_BAIT;
  if (!env.T1406_KEEP_PATHS) delete e2.T1406_KEEP_PATHS; if (!env.T1406_GROW_BAIT) delete e2.T1406_GROW_BAIT;
  const c = spawn(process.execPath, [__filename, '--grow-child'], { env: e2, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', er = '';
  c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { er += d; });
  c.on('exit', () => { let J = null; try { J = JSON.parse(o.trim().split('\n').pop()); } catch (x) {} res({ J, bait: /바꾼 자리 (\d+)칸/.exec(er) }); });
});
const auditEnv = (tag, bait, env) => new Promise((res) => {
  const out = path.join(BASE, tag + '.json'), bo = path.join(BASE, tag + '.bait.json');
  const e2 = Object.assign({}, process.env, env || {}); delete e2.T1401_BAIT;
  if (bait) Object.assign(e2, { T1401_BAIT: bait, T1401_BAIT_OUT: bo });
  const args = [...(bait ? ['-r', __filename] : []), path.join(__dirname, 'audit-reachability.js'), 'hanbando', '--walk', '--bridge-pairs', '0', '--top', '100000', '--json', out];
  const c = spawn(process.execPath, args, { env: e2, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; c.stderr.on('data', (d) => { err += d; });
  c.on('exit', (code) => res({ code, J: rd(out), K: rd(bo), err: err.slice(-400) }));
});
//   물음(미끼 판이 다시 부른다 — 같은 식)
const q1 = (J) => !!J && J.a && J.a.villages === 51 && J.a.anchorsMissing.length === 0 && J.a.unreachAll === 0;
const over = (J) => (J && J.a ? J.a.top.filter((p) => p.ratio > CAP).map((p) => [p.a, p.b, +p.ratio.toFixed(2)]) : null);
const sameOver = (J, T) => { const a = over(J); if (!a || !T) return { ok: false, d: '표 없음' }; const k = (r) => r.join('|'); const A = new Set(a.map(k)), B = new Set(T.over.map(k));
  const onlyA = [...A].filter((x) => !B.has(x)), onlyB = [...B].filter((x) => !A.has(x)); return { ok: !onlyA.length && !onlyB.length && a.length > 0, d: `상한 넘는 쌍 ${a.length}(표 ${T.over.length}) · 지금에만 ${onlyA.length} · 표에만 ${onlyB.length}${onlyA.length ? ' 예: ' + onlyA[0] : ''}${onlyB.length ? ' 표 예: ' + onlyB[0] : ''}` }; };

(async () => {
  console.log(`\n=== T1401 걸음 지도 — 마을 51 이어짐 · 멀리 도는 이웃 쌍 지문 (${BASE}) ===`);
  if (process.argv.includes('--write-table')) {
    const R = await audit('base');
    if (!q1(R.J)) { console.log('  ✗ 표를 쓸 판이 ① 을 못 넘는다 — 쓰지 않는다', R.err); process.exit(1); }
    fs.writeFileSync(TABLE, JSON.stringify({ zone: 'hanbando', cap: CAP, nei: R.J.nei, bridges: R.J.bridges, pairs: R.J.a.pairs, ratio: R.J.a.ratio, over: over(R.J) }, null, 1) + '\n');
    console.log(`  표 씀 ${path.relative(path.join(__dirname, '..'), TABLE)} — 상한 넘는 이웃 쌍 ${over(R.J).length}`);
    process.exit(0);
  }
  const T = rd(TABLE);
  ok(!!T && Array.isArray(T.over) && T.over.length > 0, '[전제] 표 파일이 있고 상한 넘는 쌍이 하나 이상 적혀 있다(0 이면 ② 가 자명 통과다)', T ? `상한 ${T.cap} · 넘는 쌍 ${T.over.length}` : '표 없음');
  const [A, Ball] = await Promise.all([audit('base'), audit('all', 'all')]);
  const Bone = await audit('one', 'one');

  console.log('\n① 마을 51 이 지형 · 다리로 다 이어진다');
  ok(A.code === 0 && q1(A.J), '① 마을 51 · 닻 못 찾음 0 · 모든 쌍 못 닿음 0', A.J ? `마을 ${A.J.a.villages} · 닻 못 찾음 ${A.J.a.anchorsMissing.length} · 못 닿는 쌍 ${A.J.a.unreachAll} · 이웃 쌍 ${A.J.a.pairs} · 비 가운데 ${A.J.a.ratio.median} · 가장 큼 ${A.J.a.ratio.max}` : A.err);

  console.log('\n② 멀리 도는 이웃 쌍 = 표');
  const S = sameOver(A.J, T);
  ok(S.ok, `② 걸음 ÷ 곧은 거리 > ${CAP} 인 이웃 쌍 목록 · 비(0.01) = 표`, S.d);

  console.log('\n③ 미끼 — 지도 설정에서 다리를 지운 사본');
  const SA = sameOver(Ball.J, T);
  ok(Ball.code === 0 && Ball.K && Ball.K.n > 0 && !q1(Ball.J), `[미끼] 바꾼 자리 ${Ball.K ? Ball.K.n : '?'}칸 — 다리 칸 전부를 지운 사본은 ① 빨강`, `지운 칸 ${Ball.K ? Ball.K.n : '?'} · 못 닿는 쌍 ${Ball.J ? Ball.J.a.unreachAll : '?'} · ② ${SA.ok ? '초록' : '빨강'}`);
  const SO = sameOver(Bone.J, T);
  ok(Bone.code === 0 && Bone.K && Bone.K.n > 0 && q1(Bone.J) && !SO.ok, `[미끼] 바꾼 자리 ${Bone.K ? Bone.K.n : '?'}칸 — 다리 하나(어촌3 북쪽 · (387,2070) 묶음)를 지운 사본은 ② 만 빨강(① 초록 — 끊기지 않고 더 돈다)`, `지운 칸 ${Bone.K ? Bone.K.n : '?'} · ① ${q1(Bone.J) ? '초록' : '빨강'} · ② ${SO.ok ? '초록' : '빨강'} · ${SO.d}`);

  console.log('\n④ [T1406] 다리 놓은 지도(T1406_BRIDGES=1) — 걸음 ÷ 곧은 거리 3배 넘는 이웃 쌍 0');
  const over3 = (J) => (J && J.a ? J.a.ratio.over3 : null);
  const [N4, N4b] = await Promise.all([auditEnv('t1406', null, { T1406_BRIDGES: '1' }), auditEnv('t1406bait', 't1406', { T1406_BRIDGES: '1' })]);
  ok(N4.code === 0 && q1(N4.J) && over3(N4.J) === 0 && N4.J.bridges > (A.J ? A.J.bridges : 1e9), '④ 다리 놓은 지도: 마을 51 다 이어짐 · 3배 넘는 이웃 쌍 0 · 다리 칸이 늘었다', N4.J ? `다리 칸 ${A.J ? A.J.bridges : '?'} → ${N4.J.bridges} · 3배 넘음 ${over3(N4.J)}(다리 전 ${over3(A.J)}) · 가장 큼 ×${N4.J.a.ratio.max}` : N4.err);
  ok(N4b.code === 0 && N4b.K && N4b.K.n > 0 && over3(N4b.J) > 0, `[미끼] 바꾼 자리 ${N4b.K ? N4b.K.n : '?'}칸 — T1406 다리 칸을 지운 사본은 ④ 빨강(3배 넘는 쌍이 돌아온다)`, `지운 칸 ${N4b.K ? N4b.K.n : '?'} · 3배 넘음 ${over3(N4b.J)}`);

  console.log('\n⑤ [T1406 ㉮] NPC 마을 영토 넓히기는 길 칸(다리 · 다리 머리 · 교역로)을 안 먹는다(T1406_KEEP_PATHS=1)');
  const [G0, G1, Gb] = await Promise.all([grow({}), grow({ T1406_KEEP_PATHS: '1' }), grow({ T1406_KEEP_PATHS: '1', T1406_GROW_BAIT: '1' })]);
  const gs = (G) => G && G.J ? `넓힘 ${G.J.n0}→${G.J.n} · 다리 ${G.J.onBr} · 머리 ${G.J.onHead} · 교역로 ${G.J.onRoute}${G.J.err ? ' · 오류 ' + G.J.err : ''}` : '판 없음';
  ok(!!G0.J && !G0.J.on && G0.J.n > G0.J.n0 && (G0.J.onBr + G0.J.onHead) > 0 && G0.J.onRoute > 0, '⑤ [전제] 끔 = 같은 마을이 다리 · 머리 · 교역로 칸을 먹는다(자명 통과 금지)', gs(G0));
  ok(!!G1.J && G1.J.on && G1.J.n > G1.J.n0 && G1.J.onBr === 0 && G1.J.onHead === 0 && G1.J.onRoute === 0, '⑤ 켬 = 길 칸 0 · 그래도 넓힌다(비켜 넓힌다 — 교역로 한 줄 너머로는 4방 넓히기가 못 건넌다 · 보고 회부)', gs(G1) + (G0.J && G1.J ? ` · 넓힌 칸 끔의 ${((G1.J.n - G1.J.n0) / (G0.J.n - G0.J.n0) * 100).toFixed(0)}%` : ''));
  ok(!!Gb.J && Gb.bait && (Gb.J.onBr + Gb.J.onHead) > 0, `[미끼] 바꾼 자리 ${Gb.bait ? Gb.bait[1] : '?'}칸 — 길 칸 술어가 그 다리를 모르는 사본은 ⑤ 빨강(다리 칸에 땅이 선다)`, gs(Gb));

  console.log(`\n=== T1401 결과: ${pass} 통과 · ${fail} 실패 ===`);
  if (!fail) fs.rmSync(BASE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
