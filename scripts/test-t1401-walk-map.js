#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1401] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1401-walk-map.js — 걸음 지도: 마을 51 이 지형 · 다리로 다 이어지는가 · 멀리 도는 이웃 쌍 지문(T1401) ==========================
//
// ★무엇을 보나(한반도 · `audit-reachability.js hanbando --walk --bridge-pairs 0` 한 판 · 지도 탐색만 — 서버 0)
//   ① 마을 51 · 닻 칸(중심 곁 열린 칸) 못 찾음 0 · **모든 마을 쌍 걸음 거리 못 닿음 0**(물 · 바위 · 해안선 띠 막힘 · 다리 칸 열림 — 서버 `isTerrainBlockedLocal` 동형)
//   ② 걸음 ÷ 곧은 거리가 상한(2)을 넘는 이웃 쌍(마을마다 곧은 거리 가까운 20곳) 목록 · 비(0.01) = 표 파일 `계측/T1401_걸음지도_hanbando.json`
//      (수를 박지 않는다 — 지도 · 다리가 바뀌면 이 줄이 빨갛고, 바뀐 것이 맞으면 `--write-table` 로 표를 다시 쓴다)
//   ③ 미끼 둘(이 파일이 프리로드로 실린다 · `T1401_BAIT`): 지도 설정(`zone-config` 한반도 `bridges`)에서 다리를 지운 사본 — 지운 칸 수를 세고 그 물음만 빨강:
//      `all` = 다리 칸 전부 → ① 빨강 / `one` = 다리 하나(어촌3 이 돌아 건너는 북쪽 다리 · (387,2070) 이 든 묶음) → ② 빨강 · ① 초록
//      (다리 묶음 29 가운데 하나만 지워 마을이 끊기는 다리는 0 이다 — T1401 보고 §1. 그래서 ① 의 미끼는 전부 지우기다)
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
  ok(Ball.code === 0 && Ball.K && Ball.K.n > 0 && !q1(Ball.J), '[미끼] 다리 칸 전부를 지운 사본은 ① 빨강', `지운 칸 ${Ball.K ? Ball.K.n : '?'} · 못 닿는 쌍 ${Ball.J ? Ball.J.a.unreachAll : '?'} · ② ${SA.ok ? '초록' : '빨강'}`);
  const SO = sameOver(Bone.J, T);
  ok(Bone.code === 0 && Bone.K && Bone.K.n > 0 && q1(Bone.J) && !SO.ok, '[미끼] 다리 하나(어촌3 북쪽 · (387,2070) 묶음)를 지운 사본은 ② 만 빨강(① 초록 — 끊기지 않고 더 돈다)', `지운 칸 ${Bone.K ? Bone.K.n : '?'} · ① ${q1(Bone.J) ? '초록' : '빨강'} · ② ${SO.ok ? '초록' : '빨강'} · ${SO.d}`);

  console.log(`\n=== T1401 결과: ${pass} 통과 · ${fail} 실패 ===`);
  if (!fail) fs.rmSync(BASE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
