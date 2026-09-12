#!/usr/bin/env node
// @regress
// === scripts/test-hunt-port.js — T146 사냥 이식(개체군·회복·포화 차감·부존 갱신) ======
//
// T144 가 랩에서 답을 냈고 이 하네스는 **서버가 그 답과 같은 말을 하는지**를 잰다.
//
//  ① 값이 랩 그대로   서버 상수 넷이 랩 소스의 그 수와 **글자까지** 같다(새 수 0 · 사본 대조)
//  ② 포화 수확        만땅에서 종전 상수 · 단조 · 반포화에서 최대의 절반(T144 식 그대로)
//  ③ 회복            사냥꾼 0 이면 `G → K`(로지스틱)
//  ④ 차감            사냥꾼이 있으면 그 셀이 준다 · 비면 옮긴다
//  ⑤ 부존 갱신        14일 뒤 `land.game` 이 `ΣG/ΣG₀` 를 따른다 · 하한 0.05 로 잘린다
//  ⑥ 서식지 파괴      벌채 셀은 장부에서 지워진다(K 영구 감소)
//  ⑦ 재정착          절멸 셀이 이웃 덕에 돌아온다
//  ⑧ 되돌림          `T146_GAME=0` ⇒ 개체군을 안 만들고 `land.game` 을 안 건드린다(종전 비트)
//  ⑨ 돌연변이        회복을 0 으로 하면 `land.game` 이 단조 감소만 한다(⑤ 가 ✗ 를 낼 수 있다 · 자식+env)
//  ⑩ 접점            econ 소득 식 무접촉 · kill→곳간 0(다음 판) · wildlife 는 빈 Map 채우기만
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다

const V = require(path.join(ROOT, 'server', 'villages.js'));
const LAB = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');

say('=== 사냥 이식 — 서버의 짐승이 곳간과 부존을 움직인다 (T146) ===\n');

// ═══ ① 값이 랩 그대로 ═══════════════════════════════════════════════════════
say('① 값이 **랩 그대로**다 — 새 수 0');
{
  const labLine = LAB.match(/const L_GAMEMAX=(\d+), L_GAMER=([\d.]+), L_HUNT=(\d+);/);
  ok(!!labLine, '① 전제 — 랩 정본 줄을 읽었다', labLine ? labLine[0] : '못 찾음');
  ok(V.L_GAMEMAX === +labLine[1] && V.L_GAMER === +labLine[2] && V.L_HUNT === +labLine[3],
    '★★① K·증가율·1인 수확이 **랩과 같은 수**다',
    `K ${V.L_GAMEMAX} · r ${V.L_GAMER} · L_HUNT ${V.L_HUNT}`);
  const labHalf = LAB.match(/const L_GAMEHALF=L_GAMEMAX\*([\d.]+);/);
  ok(!!labHalf && V.L_GAMEHALF === V.L_GAMEMAX * +labHalf[1],
    '★★① 반포화도 랩과 같다(그리고 **`L_GAMEMAX` 에서 유도**한다 — 손으로 적은 밀도 아님)',
    `${V.L_GAMEHALF}`);
  //   ★서버 쪽에도 밀도 리터럴이 없어야 한다(수확 함수 본문)
  const i = VSRC.indexOf('function huntTake(G)');
  const body = codeOnly(VSRC.slice(i, VSRC.indexOf('\n}', i)));
  const lits = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '★★① 수확 함수 본문에 **밀도 리터럴 0개**', lits.join(',') || '0개');
}

// ═══ ② 포화 수확 — T144 식 그대로 ══════════════════════════════════════════
say('\n② 포화 수확 — 만땅 연속 · 단조 · 반포화에서 절반');
{
  const K = V.L_GAMEMAX, B = V.L_GAMEHALF, LH = V.L_HUNT;
  ok(Math.abs(V.huntTake(K) - LH) < 1e-12, '★★② 만땅에서 **종전 상수와 정확히 같다**', `${V.huntTake(K)} = ${LH}`);
  ok(V.huntTake(0) === 0, '★② 짐승이 없으면 0');
  let mono = true, prev = -1;
  for (let g = 0; g <= K; g += 2) { const t = V.huntTake(g); if (t < prev - 1e-12) mono = false; prev = t; }
  ok(mono, '★★② 밀도에 대해 **단조 증가**');
  const max = LH * (K + B) / K;
  ok(Math.abs(V.huntTake(B) / max - 0.5) < 1e-12,
    '★★② 반포화에서 **최대의 절반**(Holling II 정의 · 해석적 최대와 대조)', `${V.huntTake(B).toFixed(3)} / ${max.toFixed(3)}`);
  ok(V.huntTake(K / 2) > LH / 2 && V.huntTake(K / 2) < LH,
    '★② 절반 밀도에서 줄되 절반보다 많다(선형이 아니다)', V.huntTake(K / 2).toFixed(3));
}

// ═══ ③~⑦ 하루 틱 — **정본 함수**를 그대로 돌린다(사본 0) ═══════════════════
say('\n③~⑦ 하루 틱 — 회복 · 차감 · 부존 갱신 · 벌채 · 재정착');
{
  //   ★마을 픽스처는 정본이 읽는 모양 그대로 만든다(손으로 세계를 짓지 않고, 장부만 세운다).
  const mkVil = (cells, base) => {
    const m = new Map();
    for (let i = 0; i < cells; i++) m.set((100 + i * 2) + ',100', V.L_GAMEMAX);
    return { name: 'T146', ccx: 100, ccy: 100, npcPids: [], _gameRich: m,
      _gameTot0: m.size * V.L_GAMEMAX, _baseGame: base,
      econ: { land: { game: base } } };
  };
  const sum = (v) => { let s2 = 0; for (const g of v._gameRich.values()) s2 += g; return s2; };

  // ③ 사냥꾼 0 → K 로 (회복만) — **얼마나 걸리는지까지 잰다**(이 수가 카드의 답이다)
  {
    const v = mkVil(20, 1.0);
    for (const [k] of v._gameRich) v._gameRich.set(k, V.L_GAMEMAX * 0.3);
    const before = sum(v);
    let d95 = 0, mono = true, prev = before, over = 0;
    for (let d = 1; d <= 4000; d++) {
      V._lifeGameDay(v, d);
      const s2 = sum(v);
      if (s2 < prev - 1e-9) mono = false; prev = s2;
      if (s2 > v._gameTot0 + 1e-6) over++;
      if (!d95 && s2 >= v._gameTot0 * 0.95) d95 = d;
    }
    ok(sum(v) > before, '★★③ 사냥꾼이 0 이면 개체가 **돌아온다**', `${before.toFixed(0)} → ${sum(v).toFixed(0)}`);
    ok(mono, '★★③ 회복은 **되돌아가지 않는다**(단조)');
    ok(over === 0, '★★③ 그리고 **K 를 넘지 않는다**(로지스틱 상한)', `초과 ${over}일`);
    ok(d95 > 0, '★★③ 오래 두면 K 로 간다 — 0.3K→0.95K 에 걸리는 날', d95 ? `${d95}일(≈${(d95 / 365).toFixed(1)}게임년)` : '4000일 안에 못 감');
  }
  // ④ 차감 — 그 셀이 준다
  {
    const v = mkVil(20, 1.0);
    const took = V.huntTakeAt(v, 100, 100, 1);
    ok(Math.abs(took - V.huntTake(V.L_GAMEMAX)) < 1e-9,
      '★★④ 사냥꾼 하루치가 **포화 수확 그대로** 빠진다', `${took.toFixed(3)}`);
    ok(Math.abs(v._gameRich.get('100,100') - (V.L_GAMEMAX - took)) < 1e-9, '★④ 그리고 그 셀만 준다');
    ok(V.huntTakeAt(v, 99999, 99999, 1) === 0, '★④ 장부에 없는 셀에선 아무 일도 안 난다');
  }
  // ④' 사냥꾼이 **있으면** 그 셀이 준다 — 하루 틱이 부르는 정본(`huntHunters`)을 그대로 돌린다
  {
    const SZ = 32;   // 서버 셀 크기(작업 좌표 → 셀 환산 · zone 과 같은 수)
    const v = mkVil(20, 1.0);
    //   ★작업 좌표는 **몹 실좌표**다(`_lifeJobSites().hunter`) — 셀 중앙이 아니다. 서버가 실제로 주는 모양 그대로 쓴다.
    const hunter = { simJob: 'hunter', _workSite: { x: 100 * SZ + 7, y: 100 * SZ + 19, day: 0 } };
    const gatherer = { simJob: 'gatherer', _workSite: { x: 102 * SZ + 3, y: 100 * SZ + 5, day: 0 } };
    v.npcPids = ['h1', 'g1'];
    const pl = new Map([['h1', hunter], ['g1', gatherer]]);
    const g0 = v._gameRich.get('100,100'), n0 = v._gameRich.get('102,100');
    const took = V.huntHunters(v, pl, 1);
    ok(took > 0 && Math.abs(v._gameRich.get('100,100') - (g0 - took)) < 1e-9,
      '★★④ 사냥꾼이 있으면 **그 셀이 준다**', `${g0} → ${v._gameRich.get('100,100').toFixed(3)}`);
    ok(v._gameRich.get('102,100') === n0, '★★④ 그리고 **사냥꾼 아닌 사람은 안 뺀다**(직업을 본다)');
    ok(V.huntHunters(v, null, 1) === 0, '★④ 부팅 전(사람 장부 없음)엔 0 — 터지지 않는다');
    //   ★자리를 옮기는 문턱은 **비었을 때가 아니라 12%**다(랩 10823) — 셀을 그 아래로 내려놓고 하루를 돌린다
    v._gameRich.set('100,100', V.L_GAMEMAX * 0.11);
    hunter._huntWk = { cx: 100, cy: 100 };
    const moved = V.huntHunters(v, pl, 2);
    ok(hunter._huntWk.cx !== 100,
      '★★④ 개체가 **12% 아래로 내려가면 옮긴다**(비기를 기다리지 않는다 — 랩 10823)', `→ ${hunter._huntWk.cx},${hunter._huntWk.cy}`);
    ok(moved > 0 && moved < V.huntTake(V.L_GAMEMAX),
      '★★④ 옮긴 날엔 **옮긴 자리에서 또 안 잡는다**(오늘치는 떠나기 전 자리에서 이미 끝났다)', `${moved.toFixed(3)}마리`);
    //   ★12% 위면 안 옮긴다(문턱이 실제로 문턱이다)
    const vS = mkVil(20, 1.0);
    const hs = { simJob: 'hunter', _huntWk: { cx: 100, cy: 100 } };
    vS.npcPids = ['s1']; vS._gameRich.set('100,100', V.L_GAMEMAX * 0.5);
    V.huntHunters(vS, new Map([['s1', hs]]), 3);
    ok(hs._huntWk.cx === 100 && hs._huntWk.cy === 100, '★★④ 그런데 **문턱 위면 그 자리를 지킨다**(매일 떠돌지 않는다)');
    //   ★분산 사냥 — 남이 쥔 자리 ±5 는 피한다(랩 10824~10830)
    const vD = mkVil(20, 1.0);
    for (const [k2] of vD._gameRich) vD._gameRich.set(k2, 20);
    vD._gameRich.set('138,100', V.L_GAMEMAX);          // 가장 풍부한 자리 하나
    const mover = { simJob: 'hunter', _huntWk: { cx: 100, cy: 100 } };
    const sitter = { simJob: 'hunter', _huntWk: { cx: 138, cy: 100 } };   // 그 자리를 이미 쥔 사람
    vD._gameRich.set('100,100', 0);
    vD.npcPids = ['m1', 's1'];
    V.huntHunters(vD, new Map([['m1', mover], ['s1', sitter]]), 4);
    ok(Math.abs(mover._huntWk.cx - 138) > 5,
      '★★④ 남이 쥔 자리 **±5 는 피해** 다른 데로 간다(우르르 떼사냥 없음)', `→ ${mover._huntWk.cx},${mover._huntWk.cy}`);
    //   ★표본 격자 — 밴드는 2칸 간격이라 사냥꾼의 실제 셀이 격자에서 벗어난다(랩은 `huntCells` 에서 골라 줘 안 겪는 일)
    {
      const v4 = mkVil(20, 1.0);
      ok(V._gameKey(v4, 100, 100) === '100,100', '★★④ 격자 위 셀은 **그대로**다(랩 입력에 항등 — 값이 안 변한다)');
      ok(V._gameKey(v4, 101, 100) !== null, '★★④ 격자 **사이**에 선 사람도 자기 표본 셀을 찾는다', `101,100 → ${V._gameKey(v4, 101, 100)}`);
      ok(V._gameKey(v4, 400, 400) === null, '★④ 밴드 밖은 **없다**(공짜 사냥터 아님)');
      const g5 = v4._gameRich.get('100,100');
      const t5 = V.huntTakeAt(v4, 101, 100, 1);
      ok(t5 > 0 && v4._gameRich.get('100,100') < g5,
        '★★④ 그래서 **격자 사이에서도 실제로 빠진다**(맞추기 전엔 넷 중 셋이 헛손질이었다)', `${t5.toFixed(3)}마리`);
    }
    //   ★사냥꾼 여럿 → 마을 전체가 준다(하루 틱 경유 · state.deps 없이도 회복·부존은 돈다)
    const v2 = mkVil(20, 1.0);
    const before2 = sum(v2);
    V._lifeGameDay(v2, 1);
    ok(sum(v2) === before2, '★④ 사람 장부가 없으면 **차감 0**(회복·갱신만 돈다)', `${before2}`);
  }
  // ⑤ 부존 갱신 — land.game 이 ΣG/ΣG₀ 를 따른다 · 하한 0.05
  {
    const v = mkVil(20, 1.0);
    for (const [k] of v._gameRich) v._gameRich.set(k, V.L_GAMEMAX * 0.5);
    V._lifeGameDay(v, 14);
    ok(Math.abs(v.econ.land.game - 0.5) < 0.02,
      '★★⑤ 14일 뒤 `land.game` 이 **개체 비율을 따른다**(base 1.0 · 절반이면 0.5)', `${v.econ.land.game}`);
    const v2 = mkVil(20, 1.0);
    for (const [k] of v2._gameRich) v2._gameRich.set(k, 0);
    V._lifeGameDay(v2, 14);
    ok(v2.econ.land.game === 0.05, '★★⑤ 다 비어도 **하한 0.05 로 잘린다**(0 이 아니다)', `${v2.econ.land.game}`);
    const v3 = mkVil(20, 0.6);
    V._lifeGameDay(v3, 13);
    ok(v3.econ.land.game === 0.6, '★⑤ 14일이 아닌 날엔 **안 건드린다**', `${v3.econ.land.game}`);
  }
  // ⑥ 벌채 — 서식지가 없어지면 장부에서도 지워진다
  {
    const v = mkVil(20, 1.0);
    const n0 = v._gameRich.size;
    ok(V.huntDeforest(v, 100, 100) === true && v._gameRich.size === n0 - 1,
      '★★⑥ 벌채 셀은 **장부에서 지워진다**(K 영구 감소)', `${n0} → ${v._gameRich.size}`);
    ok(V.huntDeforest(v, 100, 100) === false, '★⑥ 두 번 지워도 한 번만 준다(멱등)');
  }
  // ⑦ 재정착 — 절멸 셀이 이웃 덕에 돌아온다
  {
    const v = mkVil(20, 1.0);
    v._gameRich.set('100,100', 0);
    V._lifeGameDay(v, 14);
    ok(v._gameRich.get('100,100') > 0, '★★⑦ 절멸 셀이 **이웃 덕에 돌아온다**', `${v._gameRich.get('100,100')}`);
    const v2 = mkVil(20, 1.0);
    for (const [k] of v2._gameRich) v2._gameRich.set(k, 0);
    V._lifeGameDay(v2, 14);
    ok(v2._gameRich.get('100,100') === 0, '★★⑦ 그런데 **이웃도 비었으면 안 돌아온다**(공짜 부활 아님)');
  }
}

// ═══ ⑦' 밴드 구축은 **며칠에 걸쳐** 짓는다 — 하루 틱을 얼리지 않는다 ═══════════
say("\n⑦' 밴드 구축 — 예산 안에서 끊고 이어 짓는다(실측: 한 마을 최대 2.7초)");
{
  //   ★가짜 지형을 세운다: 넓고 **비싼** 숲(판정 한 번에 일부러 시간을 쓴다) — 예산이 실제로 끊는지 본다
  const mkTa = (costUs) => ({
    forestMult: (cx, cy) => { const t = process.hrtime.bigint(); while (Number(process.hrtime.bigint() - t) / 1000 < costUs); return 2; },
    isRock: () => false, isBlocked: () => false,
  });
  const HP = V.__labProbe && V.__labProbe._huntProbe;
  pre(!!HP, "⑦' 전제 — 지형 주입구가 있다(밴드는 지형을 훑는다)", HP ? 'ok' : '_huntProbe 없음');
  if (HP) {
    const keep = HP.setTa(mkTa(4));                    // 셀 하나에 4µs — 12,016 후보면 48ms(예산 20ms 를 넘는다)
    const v = { name: 'B', ccx: 500, ccy: 500, econ: { land: { game: 1 } } };
    const t0 = Date.now();
    const first = V._huntBandBuild(v);
    const dt1 = Date.now() - t0;
    ok(first === null, "★★⑦' 하루에 다 안 짓는다(예산에서 끊는다)", `${dt1}ms · 커서 dy=${v._gameScan && v._gameScan.dy}`);
    ok(dt1 < V._t146BuildMs() * 4, "★★⑦' 그리고 **하루치 예산 언저리에서 멈춘다**(틱을 안 얼린다)", `${dt1}ms ≤ 예산 ${V._t146BuildMs()}ms×4`);
    let days = 1, done = null;
    while (!done && days < 400) { done = V._huntBandBuild(v); days++; }
    ok(!!done, "★★⑦' 며칠 이어 붙이면 **결국 다 짓는다**", `${days}일 · ${done ? done.size : 0}셀`);
    ok(v._gameScan === null && v._gameTot0 === done.size * V.L_GAMEMAX,
      "★★⑦' 다 지으면 커서를 버리고 **기준 총량을 박는다**(부존 갱신의 분모)", `ΣG₀ ${v._gameTot0}`);
    //   ★같은 밴드를 **한 번에** 지은 것과 셀이 같아야 한다(끊어 짓기가 셀을 흘리면 안 된다)
    const v2 = { name: 'B2', ccx: 500, ccy: 500, econ: { land: { game: 1 } } };
    const keepEnv = process.env.T146_BUILD_MS;
    process.env.T146_BUILD_MS = '600000';   // 예산을 사실상 무한으로 — 한 번에 짓는다
    HP.setTa(mkTa(0));
    const one = V._huntBandBuild(v2);
    if (keepEnv === undefined) delete process.env.T146_BUILD_MS; else process.env.T146_BUILD_MS = keepEnv;
    ok(!!one && one.size === done.size, "★★⑦' 끊어 지은 밴드가 **한 번에 지은 것과 같다**(셀을 안 흘린다)", `${done.size} vs ${one ? one.size : 0}`);
    let same = true; for (const k of one.keys()) if (!done.has(k)) same = false;
    ok(same, "★★⑦' 셀 하나하나까지 같다");
    //   ★풀밭도 숲도 없으면(전부 바위) 두 번 안 훑는다
    HP.setTa({ forestMult: () => 1, isRock: () => true, isBlocked: () => false });
    const v3 = { name: 'B3', ccx: 500, ccy: 500, econ: { land: { game: 1 } } };
    let g = null, d3 = 0; while (!g && d3 < 400) { g = V._huntBandBuild(v3); d3++; }
    ok(v3._gameNone === 1 && V._huntBandBuild(v3) === null,
      "★★⑦' 풀밭도 숲도 없으면 **없다고 못박고 다시 안 훑는다**(두 번 안 훑는다)");
    HP.setTa(keep);
  }
}

// ═══ ⑪ [2판] 사냥터가 없는 마을은 없다 — 바닥을 실체로 깐다 ═══════════════════
say('\n⑪ [2판] 밴드 최소 보장 — 바닥(`FLOOR.game`)이 실체를 얻는다');
{
  const LV = require(path.join(ROOT, 'server', 'livelihood.js'));
  const HP = V.__labProbe && V.__labProbe._huntProbe;
  //   ★셀 수는 **`landOf` 의 역함수**여야 한다 — 손으로 적은 수면 안 된다
  {
    const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const i = vsrc.indexOf('function _bandMinCells');
    const body = codeOnly(vsrc.slice(i, vsrc.indexOf('\n}', i)));
    ok(/livelihood/.test(body) && /GAIN\.game/.test(body),
      '★★⑪ 최소 셀 수가 **`livelihood` 의 상수에서 나온다**(역함수 · 사본 0)');
    const lits = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0' && x !== '10');
    ok(lits.length === 0, '★★⑪ 그리고 본문에 **새 수가 0개**', lits.join(',') || '0개');
    const v = { econ: { land: { game: LV.FLOOR.game } } };
    ok(V._bandMinCells(v, 12028) === Math.round(12028 * (LV.FLOOR.game / LV.GAIN.game)),
      '★★⑪ 바닥뿐인 마을도 **셀을 요구한다**(초지 사냥 — `livelihood.js:27`)',
      `${V._bandMinCells(v, 12028)}셀 = 12028 × ${LV.FLOOR.game}/${LV.GAIN.game}`);
    ok(V._bandMinCells({ econ: { land: { game: 0.9 } } }, 12028) > V._bandMinCells(v, 12028),
      '★★⑪ `land.game` 이 클수록 더 요구한다(단조 — 뒤집히지 않는다)');
  }
  if (HP) {
    const mkTa = (forest) => ({ forestMult: () => (forest ? 2 : 1), isRock: () => false, isBlocked: () => false });
    const build = (v) => { let g = null, d = 0; while (!g && d < 500) { g = V._huntBandBuild(v); d++; } return g; };
    const keep = HP.setTa(mkTa(false));   // 숲 0 · 전부 풀밭 — 19곳과 같은 상황
    const v = { name: 'F', ccx: 700, ccy: 700, econ: { land: { game: LV.FLOOR.game } } };
    const m = build(v);
    ok(!!m && m.size > 0, '★★⑪ **숲이 하나도 없는 마을에도 사냥터가 선다**', `${m ? m.size : 0}셀`);
    ok(m && m.size === V._bandMinCells(v, 12028),
      '★★⑪ 그 수가 **역함수가 요구한 그 수**다', `${m ? m.size : 0}`);
    //   ★자리의 함수다 — 두 번 지으면 같은 셀
    const v2 = { name: 'F2', ccx: 700, ccy: 700, econ: { land: { game: LV.FLOOR.game } } };
    const m2 = build(v2);
    let same = m && m2 && m.size === m2.size;
    if (same) for (const k of m.keys()) if (!m2.has(k)) { same = false; break; }
    ok(same, '★★⑪ 두 번 지어도 **같은 셀**이다(자리의 함수 · 주사위 0)');
    //   ★★고른 셀은 **밴드 전체에 흩어져** 있어야 한다 — 앞줄부터 긁어 오면 자리의 함수가 아니라 순서의 함수다
    {
      const dys = [];
      for (const k of m.keys()) { const ci = k.indexOf(','); dys.push(+k.slice(ci + 1) - 700); }
      dys.sort((a, b) => a - b);
      const span = dys[dys.length - 1] - dys[0];
      //   후보 풀 자체의 폭(=260)에 견준다. 앞에서부터 want 개를 긁으면 폭이 그 일부에 그친다.
      ok(span > 240, '★★⑪ 고른 셀이 **밴드 전체에 흩어진다**(앞줄부터 긁어 오지 않는다 — 자리의 함수)', `세로 폭 ${span} / 260`);
      const mid = dys[dys.length >> 1];
      ok(Math.abs(mid) < 20, '★★⑪ 그리고 **한쪽으로 쏠리지 않는다**(중앙값이 밴드 한가운데)', `중앙 dy ${mid}`);
    }
    //   ★밴드가 겹치는 이웃 마을은 **겹치는 자리에서 같은 판단**을 한다(마을이 아니라 자리가 정한다)
    {
      const vn = { name: 'F4', ccx: 700, ccy: 704, econ: { land: { game: LV.FLOOR.game } } };
      const mn = build(vn);
      let both = 0, onlyOne = 0;
      if (mn) for (const k of mn.keys()) {
        const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
        const d2 = (x - 700) * (x - 700) + (y - 700) * (y - 700);
        if (d2 < 40 * 40 || d2 > 130 * 130) continue;    // 이쪽 마을 밴드 밖 — 비교 대상 아님
        if (m.has(k)) both++; else onlyOne++;
      }
      pre(both + onlyOne > 200, "⑪ [상황] 두 밴드가 실제로 겹친다", `겹치는 후보 ${both + onlyOne}셀`);
      ok(both > onlyOne * 3,
        '★★⑪ 겹치는 자리에선 **두 마을이 같은 셀을 고른다**(마을이 아니라 자리가 정한다)',
        `같음 ${both} · 다름 ${onlyOne}`);
    }
    //   ★밴드 셀은 전부 반경 안이다
    let outside = 0;
    for (const k of m.keys()) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      const d2 = (x - 700) * (x - 700) + (y - 700) * (y - 700);
      if (d2 < 40 * 40 || d2 > 130 * 130) outside++; }
    ok(outside === 0, '★★⑪ 채운 셀이 **전부 사냥터 밴드 안**이다(마을 안에 짐승 안 놓는다)', `밖 ${outside}셀`);
    //   ★★이미 밴드가 있는 마을은 **안 건드린다**(카드 §1 절대 규칙 "32곳 비트 동일")
    //     ⚠상황을 제대로 세운다: 숲이 **조금** 있고(최소 요구보다 적다) 풀밭도 많은 마을 —
    //       게이트가 없으면 여기에 풀밭이 보태진다. 전부 숲인 판으로 재면 자명 통과다.
    const sparseTa = { forestMult: (cx, cy) => ((cx + cy) % 40 === 0 ? 2 : 1), isRock: () => false, isBlocked: () => false };
    HP.setTa(sparseTa);
    const vf = { name: 'W', ccx: 700, ccy: 700, econ: { land: { game: LV.FLOOR.game } } };
    const mf = build(vf);
    const needF = V._bandMinCells(vf, 12028);
    pre(mf && mf.size > 0 && mf.size < needF,
      "⑪ [상황] 숲이 **있긴 한데 최소 요구보다 적다**(게이트가 실제로 판단할 상황)", `숲 ${mf ? mf.size : 0}셀 < 요구 ${needF}셀`);
    ok(mf && vf._gameFloorN === undefined && mf.size < needF,
      '★★⑪ 그래도 **한 셀도 안 보탠다**(기본 · 32곳 비트 동일)', `${mf ? mf.size : 0}셀 · 보탠 것 ${vf._gameFloorN || 0}`);
    //   ★그리고 카드 ① 문자 그대로인 `max` 꼴은 손잡이로 켠다 — 켜면 실제로 채운다
    {
      const keepAll = process.env.T146_BAND_ALL;
      process.env.T146_BAND_ALL = '1';
      const va = { name: 'WA', ccx: 700, ccy: 700, econ: { land: { game: LV.FLOOR.game } } };
      const ma = build(va);
      if (keepAll === undefined) delete process.env.T146_BAND_ALL; else process.env.T146_BAND_ALL = keepAll;
      ok(ma && ma.size === needF && va._gameFloorN > 0,
        '★★⑪ `T146_BAND_ALL=1` 이면 **숲이 있어도 최소까지 채운다**(카드 ① 문자 그대로 · 보고 ⓒ)',
        `${ma ? ma.size : 0}셀 · 보탠 것 ${va._gameFloorN || 0}`);
      ok(V._t146BandAll() === false, '★⑪ 그 손잡이도 **부를 때** 읽힌다(기본은 꺼져 있다)');
    }
    //   ★손잡이 — 끄면 종전(19곳 밴드 0)
    const keepEnv = process.env.T146_BAND;
    process.env.T146_BAND = '0';
    HP.setTa(mkTa(false));
    const vo = { name: 'OFF', ccx: 700, ccy: 700, econ: { land: { game: LV.FLOOR.game } } };
    let g2 = null, d2 = 0; while (!g2 && d2 < 500) { g2 = V._huntBandBuild(vo); d2++; }
    if (keepEnv === undefined) delete process.env.T146_BAND; else process.env.T146_BAND = keepEnv;
    ok(g2 === null && vo._gameNone === 1,
      '★★⑪ `T146_BAND=0` 이면 **종전 비트**(숲 없는 마을은 밴드 0)');
    ok(V._t146Band() === 1, '★⑪ 그리고 손잡이는 **부를 때** 읽힌다(껐다 켠 것이 그 자리에서 먹었다)');
    HP.setTa(keep);
  } else pre(false, "⑪ 전제 — 지형 주입구", '_huntProbe 없음');
}

// ═══ ⑫ [2판] `_huntWk` 왕복이 닫힌다 ═══════════════════════════════════════
say('\n⑫ [2판] px ↔ 셀 왕복 — 셀 중앙을 되읽으면 그 셀이 나온다');
{
  const SZ = 32;
  let bad = 0, first = null;
  for (let c = 0; c < 500; c++) { const back = V._cellOfPx(c * SZ + SZ / 2); if (back !== c) { bad++; if (first === null) first = `${c} → ${back}`; } }
  ok(bad === 0, '★★⑫ 셀 중앙 `c*SZ+SZ/2` 를 되읽으면 **그 셀 `c`** 다', bad ? `어긋난 것 ${bad}개(${first})` : '500칸 전부 닫힘');
  //   ★셀 안 아무 데서나 되읽어도 그 셀이다(경계 포함)
  let bad2 = 0;
  for (let c = 0; c < 200; c++) for (const off of [0, 1, SZ / 2, SZ - 1]) if (V._cellOfPx(c * SZ + off) !== c) bad2++;
  ok(bad2 === 0, '★★⑫ 셀 안 어디서 읽어도 **그 셀**이다(경계 포함)', `${bad2}`);
  //   ★그리고 **정본이 하나**다 — 되읽는 자리가 이 함수를 쓴다(사본 0)
  const vsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
  const rounds = (vsrc.match(/Math\.round\((?:ws|p\._workSite)\.[xy]\s*\/\s*SZ\)/g) || []);
  ok(rounds.length === 0, '★★⑫ 작업 좌표를 `Math.round` 로 되읽는 자리가 **0곳**이다', rounds.join(' ') || '0곳');
  const uses = (vsrc.match(/_cellOfPx\(/g) || []).length;
  ok(uses >= 4, '★★⑫ 되읽는 자리들이 **같은 문**을 쓴다(사본 0)', `${uses}곳`);
}

// ═══ ⑧ 되돌림 ══════════════════════════════════════════════════════════════
say('\n⑧ 되돌림 — `T146_GAME=0` 이면 종전 비트');
{
  ok(V._t146() === 1, '⑧ 전제 — 이 판은 켜져 있다');
  const keep = process.env.T146_GAME;
  process.env.T146_GAME = '0';
  const off = V._t146();
  const v = { name: 'off', ccx: 1, ccy: 1, npcPids: [], econ: { land: { game: 0.6 } } };
  V._lifeGameDay(v, 14);
  const stillOff = { built: !!v._gameRich, land: v.econ.land.game };
  if (keep === undefined) delete process.env.T146_GAME; else process.env.T146_GAME = keep;
  ok(off === 0 && V._t146() === 1, '★★⑧ 손잡이가 **부를 때** 읽힌다(껐다 켠 것이 그 자리에서 먹었다)');
  ok(!stillOff.built, '★★⑧ 끈 판은 **개체군을 안 만든다**');
  ok(stillOff.land === 0.6, '★★⑧ 그리고 `land.game` 을 **한 글자도 안 건드린다**(= 종전 비트)', `${stillOff.land}`);
}

// ═══ ⑨ 돌연변이 — 자식 프로세스 + env ══════════════════════════════════════
say('\n⑨ 돌연변이 (자식 프로세스 + env · 공통 §2⑨)');
{
  const { execFileSync } = require('child_process');
  const probe = `/tmp/t146-probe-${process.pid}.js`, out = `/tmp/t146-probe-${process.pid}.json`;
  fs.writeFileSync(probe, [
    "const fs=require('fs'),path=require('path');",
    "const _l=console.log;console.log=()=>{};console.warn=()=>{};console.error=()=>{};",
    "const V=require(" + JSON.stringify(path.join(ROOT, 'server', 'villages.js')) + ");",
    "console.log=_l;",
    "const mk=()=>{const m=new Map();for(let i=0;i<20;i++)m.set((100+i*2)+',100',V.L_GAMEMAX*0.3);",
    "  return {name:'m',ccx:100,ccy:100,npcPids:[],_gameRich:m,_gameTot0:m.size*V.L_GAMEMAX,_baseGame:1,econ:{land:{game:1}}};};",
    "const v=mk();const tr=[];for(let d=1;d<=140;d++){V._lifeGameDay(v,d);if(d%14===0)tr.push(v.econ.land.game);}",
    "fs.writeFileSync(process.argv[2],JSON.stringify({on:V._t146(),r:V.L_GAMER,tr}));",
  ].join('\n'));
  const run = (env) => { try { fs.unlinkSync(out); } catch (e) {}
    execFileSync(process.execPath, [probe, out], { env: Object.assign({}, process.env, env), encoding: 'utf8', stdio: 'ignore', timeout: 180000 });
    return JSON.parse(fs.readFileSync(out, 'utf8')); };
  const b = run({});
  const rising = b.tr.every((x, i) => i === 0 || x >= b.tr[i - 1]);
  ok(rising && b.tr[b.tr.length - 1] > b.tr[0],
    '★★⑨ (전제) 회복이 살아 있으면 `land.game` 이 **올라간다**', `${b.tr[0]} → ${b.tr[b.tr.length - 1]}`);
  //   ★★돌연변이 — 회복률을 0 으로 하면 올라갈 길이 없다 ⇒ ⑤·③ 이 ✗ 를 낼 수 있다
  const m = run({ T146_GAMER: '0' });
  const flatOrDown = m.tr.every((x, i) => i === 0 || x <= m.tr[i - 1]);
  ok(V.L_GAMER > 0, '⑨ 전제 — 채택 회복률은 0 이 아니다', `${V.L_GAMER}`);
  ok(m.r === 0 ? flatOrDown : true,
    '★★⑨ 돌연변이 — 회복률 손잡이가 있으면 0 에서 **안 올라간다**',
    m.r === 0 ? `r=0 · ${m.tr[0]} → ${m.tr[m.tr.length - 1]}` : `손잡이 없음(상수 이식 · r=${m.r}) — 아래 대조로 대신한다`);
  //   손잡이가 없어도(값을 랩 그대로 상수로 옮겼다) **회복을 뺀 판**을 직접 만들어 가른다
  const mkv = () => { const mm = new Map(); for (let i = 0; i < 20; i++) mm.set((100 + i * 2) + ',100', V.L_GAMEMAX * 0.3);
    return { name: 'x', ccx: 100, ccy: 100, npcPids: [], _gameRich: mm, _gameTot0: mm.size * V.L_GAMEMAX, _baseGame: 1, econ: { land: { game: 1 } } }; };
  const v1 = mkv(); for (let d = 1; d <= 140; d++) V._lifeGameDay(v1, d);
  const v0 = mkv(); for (let d = 1; d <= 140; d++) { if (d % 14 === 0) V._lifeGameDay(v0, d); }   // 회복 배치(7일)를 건너뛴 판
  ok(v1.econ.land.game > v0.econ.land.game,
    '★★⑨ 회복 배치를 건너뛰면 `land.game` 이 **안 오른다**(이 절이 ✗ 를 낼 수 있다)',
    `회복 있음 ${v1.econ.land.game} > 없음 ${v0.econ.land.game}`);
  for (const f of [probe, out]) { try { fs.unlinkSync(f); } catch (e) {} }
}

// ═══ ⑩ 접점 ════════════════════════════════════════════════════════════════
say('\n⑩ 접점 — econ 무접촉 · kill→곳간 0 · wildlife 는 빈 Map 채우기만');
{
  const econ = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  ok(/case 'hunter':\s+return \(L\.game \|\| 0\) \* 0\.7/.test(econ),
    '★★⑩ econ 사냥 소득 식이 **그대로**다(`land.game×0.7`) — 이 카드는 부존만 갱신한다');
  //   ⚠★★**코드에게 묻는다 — 주석에게 묻지 않는다.** T154 가 엔진에 사냥 소득 주입 문을 넣으면서
  //     그 자리 주석이 "T146 이 장부를 올렸으니…"라고 **설명**한다. 원문으로 재면 그 설명문에 걸린다
  //     (T144 `@regress` · T154 `_hstat` 에 이어 **같은 함정 세 번째**다 — 계약은 코드에게 물어라).
  const econC = codeOnly(econ);
  ok(!/gameRich|huntTake|T146/.test(econC),
    '★★⑩ econ 엔진 **코드**에 T146 이름이 하나도 없다(개체 장부는 생활층 소유)',
    (econC.match(/gameRich|huntTake|T146/g) || []).join(',') || '0개');
  const vs = codeOnly(VSRC);
  ok(!/storage\.meat/.test(vs.slice(vs.indexOf('function _lifeGameDay'), vs.indexOf('function huntDeforest'))),
    '★★⑩ 하루 틱이 **곳간에 고기를 안 넣는다**(kill→회계는 다음 판 · 랩 규약)');
  const wl = fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8');
  const inits = wl.slice(wl.indexOf('function init(host)'), wl.indexOf('function init(host)') + 2200);
  ok(/S\.gameRich = \{/.test(inits) && /host\.gameRichAt/.test(inits),
    '★★⑩ `wildlife.js` 는 **빈 Map 을 채우기만** 한다(정본에 위임 · 값 사본 0)');
  ok(!/L_GAMER|huntTake\(/.test(wl), '★⑩ 그리고 회복·수확 식을 **안 갖는다**(정본은 마을 생활층 하나)');
  const zs = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/SimVillages\.huntKillAt\(/.test(zs), '★⑩ 플레이어 사냥 브리지가 **한 줄**이다');
  ok(!/L_GAMEMAX|L_GAMER|huntTake/.test(codeOnly(zs)), '★★⑩ `zone.js` 는 사냥 식을 **모른다**(전달만)');
  //   ★랩 무변 — 이식이 랩을 안 건드렸다
  ok(/function huntTake\(G\)\{/.test(LAB.replace(/\s+/g, '')) || /function huntTake\(G\)/.test(LAB),
    '★⑩ 랩 정본은 **그대로 있다**(이식은 옮겨 적는 것이지 옮겨 가는 것이 아니다)');
}

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
