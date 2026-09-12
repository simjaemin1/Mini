#!/usr/bin/env node
// @regress
// === scripts/test-hunt-vis.js — T158 보이는 사냥은 장부의 연출이다 =================
//
// T146 이 마을에 개체 장부를 올렸고, T154 가 랩에서 소득을 그 장부에 묶었다.
// 그런데 **뷰 안 사냥꾼**(`wildlife.js` `_hunterBrain`)은 여태 제 속도로 잡았다 —
// 관객이 보는 사냥과 세계가 세는 사냥이 **다른 수**였다. 이 카드가 그 둘을 묶는다.
//
//  ① 예산 정본      `villages.js` 가 그날 실제로 뺀 수를 그대로 예산으로 낸다(새 수 0 · 읽기 전용)
//  ② 하루 경계      예산은 하루 틱(`huntHunters`)에서 열리고 어제 쓴 것은 지워진다
//  ③ 예산 게이트    예산 0 이면 새 표적을 안 잡는다(귀환) · 예산 n 이면 kill ≤ n
//  ④ 이중 차감 0    보이는 kill 은 `gameRich` 를 **다시 안 깎는다**(장부가 이미 깎았다)
//  ⑤ 되돌림        `T158_LEDGER_VIS=0` = 지금 연출 그대로(예산 무한)
//  ⑥ 실행층 무접촉  287행 블록(조준·사격·도살)은 **원문 무수정**이다
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
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const WSRC = fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');

say('=== 보이는 사냥은 장부의 연출이다 (T158) ===\n');

// ═══ ① 예산 정본 — 그날 실제로 뺀 수 ══════════════════════════════════════
say('① 예산 정본 — 장부가 그날 **실제로 뺀 수**가 예산이다(새 수 0)');
{
  const i = VSRC.indexOf('function huntVisLeft');
  const body = codeOnly(VSRC.slice(i, VSRC.indexOf('\n}', i)));
  const lits = (body.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '★★① 예산 함수 본문에 **새 수가 0개**', lits.join(',') || '0개');
  ok(/_huntBud/.test(body) && /_huntKil/.test(body),
    '★★① 예산 = **그날 잡은 수 − 이미 쓴 수**');
  //   ★그 `_huntBud` 는 `huntTakeAt` 의 반환값 그대로여야 한다(따로 다시 계산하지 않는다)
  const hh = codeOnly(VSRC.slice(VSRC.indexOf('function huntHunters'), VSRC.indexOf('function huntVisLeft') > VSRC.indexOf('function huntHunters') ? VSRC.length : VSRC.length));
  const seg = hh.slice(0, hh.indexOf('\n}\n'));
  ok(/const t0h = huntTakeAt\(/.test(seg) && /p\._huntBud = t0h/.test(seg),
    '★★① 예산은 `huntTakeAt` 이 **실제로 뺀 그 수**다(사본 0)');
  //   ★읽기 전용 — 예산 함수가 장부를 안 건드린다
  ok(!/_gameRich|huntTakeAt|\.set\(/.test(body),
    '★★① 예산 함수는 **장부를 안 건드린다**(읽기 전용)');
  ok(V.huntVisLeft({ _huntBud: 3, _huntKil: 1 }) === 2, '★① 남은 예산 셈이 맞다', '3−1=2');
  ok(V.huntVisLeft({}) === 0, '★① 사냥꾼이 아니면 예산 0(빈 사람은 못 잡는다)');
}

// ═══ ② 하루 경계 — 예산이 열리고 어제 것이 지워진다 ═════════════════════════
say('\n② 하루 경계 — `huntHunters` 가 예산을 열고 어제 쓴 것을 지운다');
{
  const SZ = 32;
  const mkVil = (cells) => { const m = new Map();
    for (let i = 0; i < cells; i++) m.set((100 + i * 2) + ',100', V.L_GAMEMAX);
    return { name: 'T158', ccx: 100, ccy: 100, npcPids: [], _gameRich: m,
      _gameTot0: m.size * V.L_GAMEMAX, _baseGame: 1, econ: { land: { game: 1 } } }; };
  const v = mkVil(20);
  const h = { simJob: 'hunter', _huntWk: { cx: 100, cy: 100 } };
  v.npcPids = ['h1'];
  const pl = new Map([['h1', h]]);
  const took = V.huntHunters(v, pl, 1);
  ok(Math.abs(h._huntBud - took) < 1e-9 && h._huntKil === 0,
    '★★② 하루 틱이 예산을 **그날 뺀 수로** 연다', `예산 ${h._huntBud.toFixed(3)} = 뺀 수 ${took.toFixed(3)}`);
  ok(Math.abs(V.huntVisLeft(h) - took) < 1e-9, '★② 그러면 남은 예산도 그 수다');
  h._huntKil = 99;                       // 어제 실컷 잡은 척
  V.huntHunters(v, pl, 2);
  ok(h._huntKil === 0, '★★② 다음 날이 오면 **어제 쓴 것이 지워진다**(누계가 아니다)');
  //   ★사냥꾼이 아닌 사람은 예산을 안 받는다
  const g = { simJob: 'gatherer', _huntWk: { cx: 100, cy: 100 } };
  v.npcPids = ['h1', 'g1'];
  V.huntHunters(v, new Map([['h1', h], ['g1', g]]), 3);
  ok(g._huntBud === undefined, '★★② 사냥꾼 아닌 사람은 **예산이 없다**(그래서 못 잡는다)');
  ok(V.huntVisLeft(g) === 0, '★② 그 사람의 남은 예산은 0');
}

// ═══ ③ 게이트가 두뇌 안에 있다 · 실행층 무접촉 ═════════════════════════════
say('\n③ 게이트 자리 — **두뇌**가 막는다(실행층 287행 블록은 원문 무수정)');
{
  const w = codeOnly(WSRC);
  const bi = w.indexOf('function _hunterBrain');
  const brain = w.slice(bi, w.indexOf('\nfunction ', bi + 10));
  ok(/H\.huntBudgetOf/.test(brain), '★★③ 예산을 **두뇌가** 읽는다');
  ok(/'귀환'/.test(brain), '★★③ 예산이 없으면 **귀환**한다(행동 상태 하나)');
  ok(/a\._bm = null/.test(brain) && /a\._tgt = null/.test(brain),
    '★★③ 그리고 **표적을 놓는다**(추적을 그만둔다)');
  //   ★★실행층(블록)엔 손을 안 댔다 — 예산 이름이 그쪽에 없다
  const blockStart = w.indexOf("if(a.job!=='hunter'||a.state!=='work')continue;");
  const block = w.slice(blockStart, blockStart + 6000);
  pre(blockStart > 0, "③ [상황] 실행층 블록을 찾았다", `${blockStart}`);
  ok(!/huntBudgetOf|_huntBud|_huntKil/.test(block),
    '★★③ 실행층(조준·사격·도살)에 예산 이름이 **하나도 없다**(원문 무수정)');
  //   ★잡은 수는 **사체가 새로 앉는 것**으로 센다(블록을 안 고치고 세는 유일한 자리)
  ok(/_carcSeen/.test(brain) && /_huntKil = \(rp0\._huntKil \|\| 0\) \+ 1/.test(brain),
    '★★③ 잡은 수는 **새 사체가 앉을 때** 한 번 센다(중복 안 센다)');
  //   ★이미 물어 둔 사체는 마저 바른다(그건 이미 센 그 마리다)
  ok(/!\(a\._carc && a\._carc\.st === 'dead'/.test(brain),
    '★★③ 이미 물어 둔 사체는 **마저 바른다**(그 마리는 이미 예산에서 나갔다)');
  //   ★주입은 zone 이 한다(정본은 villages 하나)
  ok(/huntBudgetOf:/.test(codeOnly(ZSRC)) && /SimVillages\.huntVisLeft/.test(codeOnly(ZSRC)),
    '★★③ 주입은 `zone.js` 한 줄 · 정본은 `villages.js`(사본 0)');
  ok(!/L_HUNT|huntTake\(/.test(codeOnly(WSRC)),
    '★★③ `wildlife.js` 는 **수확 식을 여전히 모른다**(전달만)');
}

// ═══ ④ 이중 차감 0 — 보이는 kill 이 장부를 안 깎는다 ═══════════════════════
say('\n④ 이중 차감 0 — 보이는 kill 은 `gameRich` 를 **다시 안 깎는다**');
{
  const w = codeOnly(WSRC);
  //   ★쓰기 자리가 없다: `S.gameRich` 는 T146 이 만든 **얇은 보기**고 그 `set`/`delete` 는 무해하다
  const inits = w.slice(w.indexOf('function init(host)'), w.indexOf('function init(host)') + 2200);
  ok(/set: \(\) => \{\}/.test(inits) && /delete: \(\) => false/.test(inits),
    '★★④ 뷰의 장부 보기는 **쓰기가 막혀 있다**(set 무해 · delete false)');
  //   ★그리고 이 파일 어디에도 gameRich 에 쓰는 줄이 없다
  const writes = (w.match(/gameRich[^\n]*?\.(set|delete)\(/g) || []).filter((x) => !/S\.gameRich = \{/.test(x));
  ok(writes.length === 0, '★★④ `wildlife.js` 코드에 장부에 **쓰는 줄이 0개**', writes.join(' ') || '0개');
  //   ★★실제로 그런지 — 보기를 통해 쓰기를 시도해도 정본이 안 변한다(자명 통과 금지)
  //   ⚠★★**상황을 제대로 세운다.** `init` 전 `S.gameRich` 는 그냥 빈 `Map` 이다(376행) —
  //     거기에 써 보고 "안 변한다"를 물으면 **정반대 결과를 재는 자명 실패**다. T146 의 얇은 보기는
  //     `init(host)` 가 깔므로, 최소 host 로 정본을 실제로 깔고 나서 묻는다.
  process.env.ENABLE_WILDLIFE = process.env.ENABLE_WILDLIFE || '1';
  const W = require(path.join(ROOT, 'server', 'wildlife.js'));
  const LEDGER = new Map([['1,1', 42]]);
  W.init({
    ZONE_ID: 'hanbando', TICK_HZ: 30,
    ZONE: { zoneWidth: 32 * 64, zoneHeight: 32 * 64 },
    WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
    isTerrainBlockedLocal: () => false, isRockTileLocal: () => false,
    terrainMod: { getForestMultiplier: () => 2 },
    chunkManager: { chunkSize: 512, removeMob: () => {} },
    players: new Map(), mobs: new Map(),
    getActiveChunkKeys: () => [], isPositionActive: () => true,
    spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {},
    simVillages: () => [], legacyVillages: [], warThreats: () => [],
    //   ⚠주입 규약은 **키 문자열**이다(`zone.js` 가 그렇게 넘긴다) — 여기서도 그대로 흉내낸다
    gameRichAt: (k) => LEDGER.get(String(k)),
    gameRichSize: () => LEDGER.size,
  });
  const S = W._debug && W._debug.S;
  pre(!!S && S.gameRich && typeof S.gameRich.get === 'function' && S.gameRich.get('1,1') === 42,
    '④ [상황] **정본 보기가 깔렸다**(init 이 T146 의 얇은 보기를 심었다)',
    S && S.gameRich ? `1,1 → ${S.gameRich.get('1,1')}` : '없음');
  if (S && S.gameRich) {
    S.gameRich.set('1,1', 0);
    ok(S.gameRich.get('1,1') === 42 && LEDGER.get('1,1') === 42 && S.gameRich.delete('1,1') === false,
      '★★④ 보기에 써 봐도 **정본이 안 변한다**(이중 차감이 물리적으로 불가)',
      `보기 ${S.gameRich.get('1,1')} · 정본 ${LEDGER.get('1,1')}`);
  }
}

// ═══ ⑤ 되돌림 ═════════════════════════════════════════════════════════════
say('\n⑤ 되돌림 — `T158_LEDGER_VIS=0` 이면 지금 연출 그대로');
{
  ok(V._t158() === 1, '⑤ 전제 — 이 판은 켜져 있다');
  const keep = process.env.T158_LEDGER_VIS;
  process.env.T158_LEDGER_VIS = '0';
  const off = V._t158(), left = V.huntVisLeft({ _huntBud: 0, _huntKil: 999 });
  if (keep === undefined) delete process.env.T158_LEDGER_VIS; else process.env.T158_LEDGER_VIS = keep;
  ok(off === 0 && V._t158() === 1, '★★⑤ 손잡이가 **부를 때** 읽힌다');
  ok(left === Infinity, '★★⑤ 끈 판은 예산이 **무한**이다(= 종전 연출 · 두뇌가 안 막는다)', `${left}`);
  ok(V.huntVisLeft({ _huntBud: 0, _huntKil: 999 }) < 0, '★⑤ 켠 판은 다 쓰면 음수(막힌다)');
}

// ═══ ⑥ 실기 — 뷰를 실제로 돌린다(정본 `tick` · 사본 0) ═══════════════════════
say('\n⑥ 실기 — 뷰 사냥꾼을 진짜로 돌린다(예산 0 / n / 되돌림)');
{
  const W = require(path.join(ROOT, 'server', 'wildlife.js'));
  const TICKS = 43200;                                // 30Hz × 1440 = **게임 하루치**(1유닛=1초=1게임분)
  const CH = 512, CC = CH / 32;                       // 청크 한 변 = 16셀
  const N = 64;                                       // 64×64 셀 존
  //   ★★결정론 — 두뇌·스폰이 `Math.random` 을 쓴다. 시드 PRNG 로 갈아 끼워 **세 판이 같은 난수열**을
  //     보게 한다(`scripts/lab-hunt.js` 와 같은 처방). 안 그러면 A/B 가 짝지은 비교가 아니다.
  const _rnd0 = Math.random;
  const seedRandom = (seed) => { let st = seed | 0;
    Math.random = function () { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const mkRun = (budget, ticks) => {
    seedRandom(1020);
    const LED = new Map();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
    const hunter = { pid: 'h1', isNpc: true, simJob: 'hunter', _huntOn: 1,
      _huntWk: { cx: 32, cy: 32 }, hp: 100, x: 32 * 32, y: 32 * 32, vx: 0, vy: 0,
      _huntBud: budget, _huntKil: 0 };
    const players = new Map([['h1', hunter]]);
    //   ⚠활성 청크는 **Set** 이다(`tick` 이 `keys.size` 를 본다) — 배열로 주면 첫 줄에서 돌아 나간다
    const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
    W.init({
      ZONE_ID: 'hanbando', TICK_HZ: 30,
      ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
      WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
      isTerrainBlockedLocal: () => false, isRockTileLocal: () => false,
      terrainMod: { getForestMultiplier: () => 2 },
      chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
      players, mobs: new Map(),
      getActiveChunkKeys: () => keys, isPositionActive: () => true,
      spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {},
      simVillages: () => [], legacyVillages: [], warThreats: () => [],
      gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size,
      huntBudgetOf: (p) => V.huntVisLeft(p),
    });
    const S = W._debug.S;
    let t = 60000;                                    // 낮(사냥 시간대)에서 시작
    for (let i = 0; i < ticks; i++) { t += 1000 / 30; W.tick(t); }
    return { S, hunter, LED, mobs: S.mobs ? S.mobs.length : 0 };
  };

  //   ★★먼저 **대조**: 되돌림(예산 무한)에서 실제로 잡는가. 여기서 0 이면 픽스처가 잘못된 것이고
  //     아래 "예산 0 이면 도살 0"은 **자명 통과**가 된다(족보 ㊻).
  const keep = process.env.T158_LEDGER_VIS;
  process.env.T158_LEDGER_VIS = '0';
  const off = mkRun(0, TICKS);                          // 예산 0 인데 손잡이가 꺼져 있다 ⇒ 종전 연출
  if (keep === undefined) delete process.env.T158_LEDGER_VIS; else process.env.T158_LEDGER_VIS = keep;
  const offKill = off.hunter._huntKil || 0;
  pre(off.mobs > 0, '⑥ [상황] 뷰에 몹이 실제로 섰다', `${off.mobs}마리`);
  pre(offKill > 0, '⑥ [상황] **되돌림 판에서 실제로 잡는다**(이게 0 이면 아래가 자명 통과다)', `${offKill}마리`);

  //   ★예산 0 — 새로 안 잡는다
  const z = mkRun(0, TICKS);
  ok((z.hunter._huntKil || 0) === 0, '★★⑥ 예산 0 이면 **한 마리도 안 잡는다**', `${z.hunter._huntKil || 0}마리`);
  ok(z.mobs > 0, '★⑥ 그런데 몹은 그대로 있다(스폰 무변 — 안 잡을 뿐이다)', `${z.mobs}마리`);

  //   ★예산 n — n 을 안 넘는다. ⚠**예산을 자연 속도 아래로** 잡아야 게이트가 실제로 문다
  //     (뷰가 하루에 잡는 수보다 예산이 크면 아무것도 안 막힌 판을 재게 된다 — 자명 통과).
  const n = Math.max(1, offKill - 1);
  const b = mkRun(n, TICKS);
  const bk = b.hunter._huntKil || 0;
  pre(offKill > n, '⑥ [상황] 예산이 **자연 속도보다 작다**(게이트가 물 자리가 있다)', `자연 ${offKill} > 예산 ${n}`);
  ok(bk <= n, `★★⑥ 예산 ${n} 이면 kill ≤ ${n}`, `${bk}마리`);
  ok(bk > 0, '★★⑥ 그리고 예산이 있으면 **실제로 잡는다**(막기만 하는 게 아니다)', `${bk}마리`);

  //   ★★그리고 되돌림이 예산보다 **더** 잡는다 — 게이트가 실제로 무언가를 막았다는 증거
  ok(offKill > bk,
    '★★⑥ 되돌림 판이 예산 판보다 **더 잡는다**(게이트가 실제로 막았다)',
    `되돌림 ${offKill} > 예산 ${bk}`);

  //   ★★장부는 한 칸도 안 줄었다(이중 차감 0 — 실기로)
  let moved = 0; for (const [k, v0] of b.LED) if (v0 !== 100) moved++;
  ok(moved === 0, '★★⑥ 그동안 **장부는 한 칸도 안 줄었다**(깎는 것은 하루 틱뿐)', `변한 셀 ${moved}개`);
  Math.random = _rnd0;
  say(`  ── 실측(§0ⓐ): 게임 하루(${TICKS}틱) 뷰 사냥꾼 한 명 — 되돌림 ${offKill}마리 · 예산 ${n} 판 ${bk}마리`);
  say(`     장부 쪽 하루 예산은 최대 L_HUNT=${V.L_HUNT}마리다 ⇒ **뷰가 느린 쪽**이라 예산은 좀처럼 안 문다.`);
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
