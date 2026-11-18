#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1373-home-cap.js — T1373 인구 상한의 땅 몫 = 집터 수 · 땅으로 지우는 길 0(`T1373_HOME_CAP` · ★켬 기본 · `'0'` 끔) ===
//   재민 11-18: "난 집터 개수 때문에 상한을 뒀던 건데" · "땅이 좁은 건 인구성장만 느려지는 거고, 지워지는 길은 없는 거 맞지? 그냥 상한 역할이잖아".
//   켬 — ⓐ 인구 식의 K 에서 식량 자리(slotK)를 뺀다(K = min(식량 흐름 · 땔감) · 지우는 몫 = 땔감 넘김만) ⓑ 땅 상한 = 주거 문 하나(성장만 막는다):
//        주거 문 = min(econ 주거 · 지은 침상 · 집터 수 × 가구원) — 집터 수 × 가구원 = 마을 칸(econ 땅 × 25) ÷ 집터 원반(배치 정본 `LOT_CELLS`) 내림 × 한 집 6명.
//   ① 손잡이 — 빈 값 = 켬 · `'0'` = 끔
//   ② 집터 수 × 가구원(정본 `t1373HomeCap` · 배치 모듈의 두 수를 읽어 따로 셈) — 땅 100 = 2,500칸 → 20집 → 120명 · 땅 30 → 36명 ·
//      경계: 마을 칸이 원반의 꼭 25배면 25집(150명) · 그 한 칸 모자라면 24집(144명) · 땅 크기 없으면 상한 없음(무한)
//   ③ 주거 문(정본 `t1373Hcap`) — 켬 = min(econ 주거 · 지은 침상 · 집터 수 × 가구원) · 끔 = min(econ 주거 · 지은 침상)(종전)
//   ④ econ 하루(정본 `tickVillage`) —
//      W 겨울(2년 1월 15일) · 땅 30 · 사람 120 · 곳간 400일치 · 땔감 넉넉: 끔 = 로지스틱 음수(식량 자리 17 을 넘김) · 그날 사람이 준다(땅으로 지운다 — 켬 줄의 전제) /
//        켬 = 로지스틱 0 · 그날 로지스틱으로 지운 사람 0
//      G 봄(2년 4월 10일) · 땅 30(집터 36명) · 사람 40 · 식량 흐름 K 1,000 · 주거 넉넉: 켬 = 주거 문에 막혀 그날 늘림 0(집터가 다 찼다 · 지우지는 않는다)
//      B 땅 400 · 사람 60(집터 480명 · 식량 흐름이 묶는다): 켬 = 끔(땅이 넉넉하면 같은 하루)
//   ⑤ 계절 산출 배수 손잡이(`T1373_NO_SEASON_YIELD` · 끔 기본) — 끔 = v2 `SEASON_MULT` 종전 표 · 켬 = 네 철 여섯 칸 다 1
//   ★미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ 지우는 몫에 식량 자리를 되돌린 econ 사본 → ④ "켬 W — 로지스틱 0" 이 빨강
//     ⓑ 주거 문에서 집터 수 × 가구원을 뺀 econ 사본 → ④ "켬 G — 주거 문에 막혀 늘림 0" 이 빨강
//   날짜 · 벽시계 0 — 날은 게임 달력(`dayOf`)으로만 고른다.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const BAIT = {
  slot: ['    const _Knf = Math.max(POP_MIN, T1373_HOME_CAP ? fuelK : Math.min(slotK, fuelK));', '    const _Knf = Math.max(POP_MIN, Math.min(slotK, fuelK));'],
  gate: ['  return T1373_HOME_CAP ? Math.min(h, t1373HomeCap(v)) : h;', '  return h;'],
};

// ── 아이 — 손잡이 env 는 어버이가 준다 · BAIT 면 econ 원문 한 곳을 바꿔 컴파일 ──
if (process.argv[2] === '--child') {
  const out = { bait: null };
  const B = BAIT[process.env.T1373_TEST_BAIT];
  if (B) {
    const orig = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== F_E) return orig(m, filename);
      let src = fs.readFileSync(filename, 'utf8');
      const n = src.split(B[0]).length - 1;
      out.bait = n;
      if (n === 1) src = src.replace(B[0], B[1]);
      m._compile(src, filename);
    };
  }
  const C = require(path.join(ROOT, 'server', 'calendar'));
  const E = require(F_E);
  out.on = E.T1373_HOME_CAP;
  const mk = (size, pop) => {
    E.setSeed(7);
    const v = E.createVillage({ name: '시험', initialPop: pop, fertility: 0.8, water: 0.3, game: 0.3, wood: 1, ore: 0, stone: 1, size });
    v.storage.food = pop * 400; v.storage.wood = 1e6; v.housing = 1e4; return v;
  };
  const day = (v, d) => { const n0 = v.npcs.length; E.tickVillage(v, d); const p = v._dpDebug || {}; return { n0, n1: v.npcs.length, logi: p.logi, gated: !!p.gated, dP: p.dP, K: p.K, slot: v._kDbg ? v._kDbg.slot : null }; };
  out.W = day(mk(30, 120), C.dayOf(2, 1, 15));
  { const v = mk(30, 40); v._prodKema = 1000; out.G = day(v, C.dayOf(2, 4, 10)); }
  out.B = day(mk(400, 60), C.dayOf(2, 4, 10));
  if (typeof E.t1373Hcap === 'function') out.hcap = E.t1373Hcap({ housing: 500, _mapBeds: 300, land: { size: 30 } });
  { const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js')); const SM = (V2._t1152Probe && V2._t1152Probe.seasonMult) || null; out.sea = SM ? { winter: SM.winter, spring: SM.spring, autumn: SM.autumn } : null; }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const child = (env) => {
  const e = Object.assign({}, process.env);
  for (const k of ['T1373_HOME_CAP', 'T1373_NO_SEASON_YIELD', 'T1373_TEST_BAIT', 'T1334_BUNDLE']) delete e[k];
  Object.assign(e, env);
  const r = spawnSync(process.execPath, [__filename, '--child'], { env: e, encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (err) { return { err: (r.stderr || String(err)).slice(0, 300) }; }   // 끝 줄(v2 를 실으면 머리에 안내 한 줄이 먼저 찍힌다)
};
const ON = child({});
const OFF = child({ T1373_HOME_CAP: '0' });
const NS = child({ T1373_NO_SEASON_YIELD: '1' });
const BS = child({ T1373_TEST_BAIT: 'slot' });
const BG = child({ T1373_TEST_BAIT: 'gate' });

console.log('① 손잡이');
ok(ON.on === true, '켬 = 빈 값(켬 기본)', ON.on);
ok(OFF.on === false, "끔 = '0'", OFF.on);

console.log('② 집터 수 × 가구원(정본 `t1373HomeCap` · 배치 모듈 두 수로 따로 셈)');
delete process.env.T1373_HOME_CAP;
const E = require(F_E);
const L = require(path.join(ROOT, 'server', 'village-layout'));
const LOT = L.LOT_CELLS.length, PER = L.HOUSE_CAP_PER_FLOOR;
const hc = typeof E.t1373HomeCap === 'function' ? E.t1373HomeCap : null;
const HC = (size) => (hc ? hc({ land: size == null ? {} : { size } }) : null);
const want = (cells) => Math.floor(cells / LOT) * PER;
ok(LOT > 0 && PER > 0 && HC(100) === want(2500) && HC(30) === want(750), `땅 100(2,500칸) → ${want(2500)}명 · 땅 30(750칸) → ${want(750)}명(원반 ${LOT}칸 · 한 집 ${PER}명)`, { s100: HC(100), s30: HC(30) });
const sEdge = (LOT * 25) / 25;   // 마을 칸 = 원반 × 25
ok(HC(sEdge) === 25 * PER && HC(sEdge - 0.04) === 24 * PER, '경계 — 마을 칸이 원반의 꼭 25배면 25집 · 1칸 모자라면 24집', { at: HC(sEdge), below: HC(sEdge - 0.04) });
ok(HC(null) === Infinity && HC(0) === Infinity, '땅 크기 없음 · 0 = 상한 없음(무한)', [HC(null), HC(0)]);

console.log('③ 주거 문(정본 `t1373Hcap` — 주거 500 · 지은 침상 300 · 땅 30 = 집터 36명)');
ok(ON.hcap === Math.min(300, want(750)), '켬 = min(주거 · 지은 침상 · 집터 수 × 가구원) = 36', ON.hcap);
ok(OFF.hcap === 300, '끔 = min(주거 · 지은 침상) = 300(종전)', OFF.hcap);

console.log('④ econ 하루(정본 `tickVillage`)');
ok(!!(OFF.W && OFF.W.logi < 0 && OFF.W.n1 < OFF.W.n0), '끔 W — 겨울 · 땅 30 · 사람 120: 로지스틱 음수 · 그날 사람이 준다(땅으로 지운다 · 아래 켬 줄의 전제)', OFF.W);
const W0 = 'winter-zero';
ok(!!(ON.W && ON.W.logi === 0 && ON.W.n1 === ON.W.n0), '켬 W — 로지스틱 0 · 그날 지운 사람 0(땅으로 지우는 길 없음)', { id: W0, got: ON.W });
const G0 = 'gate-full';
ok(!!(ON.G && ON.G.gated === true && ON.G.dP === 0 && ON.G.n1 === ON.G.n0), '켬 G — 집터(36명)가 다 차면 주거 문에 막혀 늘림 0 · 지우지 않는다', { id: G0, got: ON.G });
ok(!!(ON.B && OFF.B && JSON.stringify(ON.B) === JSON.stringify(OFF.B) && ON.B.dP > 0), '켬 B — 땅이 넉넉하면(땅 400 · 집터 480명) 끔과 같은 하루', { on: ON.B, off: OFF.B });

console.log('⑤ 계절 산출 배수 손잡이 `T1373_NO_SEASON_YIELD`(끔 기본 · v2 `SEASON_MULT`)');
{ const W = ON.sea && ON.sea.winter, A = NS.sea, all1 = (o) => !!o && Object.values(o).every((x) => x === 1);
  ok(!!W && W.fertility === 0.8 && W.water === 0.85 && W.game === 0.9 && W.wood === 0.9 && ON.sea.autumn.fertility === 1.15, '끔(빈 값) = 종전 표(겨울 지력 0.80 · 물 0.85 · 사냥감 0.90 · 나무 0.90 · 가을 지력 1.15)', W);
  ok(!!A && all1(A.winter) && all1(A.spring) && all1(A.autumn) && Object.keys(A.winter).length === 6, "켬('1') = 네 철 여섯 칸 다 1(날씨 · 풍흉 배수는 이 표 밖)", A && A.winter); }

console.log('★미끼 ⓐ — 지우는 몫에 식량 자리를 되돌린 econ 사본');
ok(BS.bait === 1 && !!BS.W && BS.W.logi < 0, "★미끼 ⓐ — 바꾼 자리 1곳(지우는 몫 줄) · 사본에선 ④ '켬 W — 로지스틱 0' 이 빨강", { n: BS.bait, W: BS.W });
console.log('★미끼 ⓑ — 주거 문에서 집터 수 × 가구원을 뺀 econ 사본');
ok(BG.bait === 1 && !!BG.G && BG.G.gated === false && BG.G.dP > 0, "★미끼 ⓑ — 바꾼 자리 1곳(`t1373Hcap`) · 사본에선 ④ '켬 G — 주거 문에 막혀 늘림 0' 이 빨강", { n: BG.bait, G: BG.G });

console.log(`\n${fail ? '✗' : '✓'} test-t1373-home-cap ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
