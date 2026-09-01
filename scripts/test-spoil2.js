#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-spoil2.js — 부패 2차: 온도 결합 + 저장 감속 (서버 직접) =========
//
// ★[재민 확정 2026-09-01] 부패 배치(2529c995)가 파 둔 자리 둘을 채운다:
//   ① 더운 날은 빨리 상한다(온도 결합 — "나이" → **노출 E**)
//   ② 저장 시설 안은 느리게 상한다(밀폐 × 온도 완충)
//
// ★★**이 하네스는 Q10 을 안 건드린다.** 기준온도 환경의 회귀(= 채택값 보존)는
//   `test-preserve`(`SPOIL_Q10=1`, 68/0)가 맡는다. 여기서 재는 건 **온도가 실제로 붙었을 때**다.
//
// ★★**픽스처 족보 — 시계도 온도도 우회로 만지지 않는다.**
//   · 게임일은 **길게**(VILLAGE_DAY_MS) 잡아 검사 중 날이 안 바뀌게 하고, 나이는 취득일로 만든다.
//   · 온도는 `server/weather.js` 정본에게만 묻는다. 여기에 ℃ 를 손으로 박으면
//     "내가 정한 값이 내가 정한 값과 같다"가 되어 아무것도 검사하지 않는다(족보 ㊻).
//   · 자리 이동은 **실서버 함수**(`tryChestPut`/`tryChestTake`/`tryDropItem`/`tryPickupItem`)로 한다 —
//     로트를 손으로 옮기면 그건 제품이 아니라 하네스를 검사하는 것이다.
//
// 실행: node scripts/test-spoil2.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37300 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-spoil2-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★검사 중 날이 바뀌면 결정론 검사가 자기 시계 때문에 흔들린다.
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || String(3600 * 1000);

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const Lots = require(path.join(ROOT, 'server', 'lots.js'));
const Weather = require(path.join(ROOT, 'server', 'weather.js'));
const Body = require(path.join(ROOT, 'server', 'body.js'));

function mkPlayer(name, inv, x, y) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'ts2_' + name, name, persistent: false, ws,
    x: x != null ? x : 5000, y: y != null ? y : 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
    hunger: 50, thirst: 100, inventory: Object.assign({}, inv),
    equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
  p._msgs = msgs; Body.ensure(p); return p;
}
function chest(id, ownerPid, x, y, type) {
  const b = { id, dbId: null, type: type || 'chest', ownerId: ownerPid, ownerName: ownerPid, x, y, data: {}, floor: 0 };
  H.buildings.set(id, b); return b;
}
// 계절 기준일 — **날씨 정본에게 물어서** 고른다(달력 상수를 여기 안 적는다).
const A = Weather.anchors();
const SUMMER = Math.round(A.summerMid), WINTER = Math.round(A.winterMid);

(async function main() {
  console.log('=== 부패 2차 — 온도 결합 + 저장 감속 ===\n');

  // ══ ⓪ 세계가 실제로 계절을 갖고 있나(선행) ═══════════════════════════════
  console.log('⓪ 선행 — 이 세계에 온도차가 실제로 있다');
  pre(Weather.available(), '날씨 정본에 닿는다(못 닿으면 노출이 1.0 고정이라 아래가 전부 자명 통과)');
  const tS = Weather.tempAt(SUMMER, false, 0), tW = Weather.tempAt(WINTER, false, 0);
  pre(tS - tW > 10, '한여름과 한겨울 낮 기온이 10℃ 넘게 벌어진다', `${tS.toFixed(1)}℃ vs ${tW.toFixed(1)}℃`);
  ok(Spoil.EXP.Q10 > 1, '★Q10 이 1보다 크다 — 온도가 실제로 속도를 바꾼다', `Q10=${Spoil.EXP.Q10}`);
  const REF = Spoil.refC();
  ok(REF > 0 && REF < 40, '★기준온도가 유도됐다(연평균 노출 = 1 이 되는 온도)', `${REF.toFixed(3)}℃`);
  {
    // 그 유도가 진짜인지 — 1년 노출 합이 365 근처인가(잡음 때문에 정확히 365는 아니다)
    const y = Spoil.cumExposure(SUMMER + 365, 0, 0) - Spoil.cumExposure(SUMMER, 0, 0);
    ok(Math.abs(y - 365) / 365 < 0.05, '★★1년 노출 합 ≈ 365 — **연평균으로는 종전 보관일 그대로**',
       `${y.toFixed(1)} / 365 (오차 ${(100 * Math.abs(y - 365) / 365).toFixed(1)}%)`);
  }

  // ══ ① 결정론 — 같은 이력이면 비트 동일 ═══════════════════════════════════
  console.log('\n① 결정론 — 주사위 0');
  {
    const lot = { d: 1000, n: 3, e: 1.25, t: 1000, m: 0.7, w: 0.4 };
    const first = Spoil.exposureOf(lot, 1040, 0);
    let same = true;
    for (let i = 0; i < 200; i++) if (Spoil.exposureOf(lot, 1040, 0) !== first) { same = false; break; }
    ok(same, '★같은 로트·같은 날 = 같은 노출(200회 비트 동일)', String(first));
    // 표를 지우고 다시 물어도 같아야 한다(캐시가 값을 만들면 안 된다 — 캐시는 속도지 진실이 아니다)
    Spoil._cumReset();
    ok(Spoil.exposureOf(lot, 1040, 0) === first, '★★표를 버리고 다시 채워도 같은 값 — 캐시가 진실을 만들지 않는다');
    ok(Spoil.dayExposure(SUMMER, 0, 0) === Spoil.dayExposure(SUMMER, 0, 0), '하루 노출도 결정론');
  }

  // ══ ② 마이그레이션 연속성 — 켜지는 날 아무것도 안 상한다 ══════════════════
  console.log('\n② 마이그레이션 — 절벽이 없다');
  {
    const today = H.zoneGameDay();
    const p = mkPlayer('mig', { fish: 4 });
    const AGE = 1;
    p.lots.fish = [{ d: today - AGE, n: 4 }];              // ★옛 형식 그대로(e·t·m·w 없음)
    pre(p.lots.fish[0].e === undefined, '★옛 로트다 — 노출 필드가 없다(있으면 마이그레이션을 안 밟는다)');
    const fBefore = Spoil.bestOf('fish', p.lots.fish, today);
    const fLegacy = Spoil.freshnessOf('fish', AGE);
    ok(Math.abs(fBefore - fLegacy) < 1e-9, '★옛 로트는 **종전 뜻 그대로** 읽힌다(나이 = 경과일)',
       `${fBefore.toFixed(6)} = ${fLegacy.toFixed(6)}`);
    Lots.settle(p, 'fish', today);
    const fAfter = Spoil.bestOf('fish', p.lots.fish, today);
    ok(Math.abs(fAfter - fBefore) < 1e-9, '★★정산 직후 신선도가 **정확히 같다** — 절벽 없음',
       `${fBefore.toFixed(6)} → ${fAfter.toFixed(6)}`);
    ok(p.lots.fish[0].e != null && p.lots.fish[0].t === today, '그리고 이제 노출 형식이다',
       JSON.stringify(p.lots.fish[0]));
    // 두 번 정산해도 안 변한다(멱등)
    Lots.settle(p, 'fish', today);
    ok(Math.abs(Spoil.bestOf('fish', p.lots.fish, today) - fAfter) < 1e-9, '★정산은 멱등이다(두 번 해도 같다)');
  }

  // ══ ④ 계절 — 한여름이 한겨울보다 훨씬 빨리 상한다 ════════════════════════
  console.log('\n④ 계절 — 여름 생선과 겨울 생선');
  {
    const SH = Spoil.shelfOf('fish');
    const daysTo = (startDay, damp, seal) => {          // 상할 때까지 며칠?
      let e = 0;
      for (let k = 0; k < 400; k++) { e += Spoil.dayExposure(startDay + k, 0, damp) * seal; if (e >= SH) return k + 1; }
      return 999;
    };
    const su = daysTo(SUMMER, 0, 1), wi = daysTo(WINTER, 0, 1);
    ok(su < wi, '★여름 생선이 겨울 생선보다 먼저 상한다', `여름 ${su}일 · 겨울 ${wi}일`);
    ok(su <= wi / 2, '★★여름 상함 시간이 겨울의 **절반 이하**다', `${su} ≤ ${(wi / 2).toFixed(1)}`);
    const rs = Spoil.dayExposure(SUMMER, 0, 0), rw = Spoil.dayExposure(WINTER, 0, 0);
    ok(rs > 1 && rw < 1, '★여름 하루 > 1일치 · 겨울 하루 < 1일치(기준온도가 그 사이다)',
       `${rs.toFixed(3)} / ${rw.toFixed(3)}`);
    console.log(`  · [지표] 생선 보관 ${SH}일 → 여름 ${su}일 · 겨울 ${wi}일 (${(wi / su).toFixed(1)}배)`);
  }

  // ══ ⑤ 자리 — 상자·곳간이 느리다 ═════════════════════════════════════════
  console.log('\n⑤ 자리 — 밀폐(econ 유도) × 완충');
  {
    const P = Spoil.PLACES;
    ok(P.chest.seal < 1, '상자는 밀폐 배율이 1보다 작다', String(P.chest.seal));
    // ★밀폐는 **econ 정본에서 유도**됐다 — 그 사실을 구조로 못 박는다
    const econ = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
    const src = require('fs').readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
    const m = src.match(/POTTERY_DECAY_SAVE\s*=\s*([0-9.]+)/);
    pre(!!m, '★econ 에 `POTTERY_DECAY_SAVE` 가 실재한다(유도의 출처)');
    ok(!!m && Math.abs(P.chest.seal - (1 - parseFloat(m[1]))) < 1e-9,
       '★★상자 밀폐 = **1 − econ POTTERY_DECAY_SAVE**(지어낸 수가 아니다)',
       `${P.chest.seal} = 1 − ${m && m[1]}`);
    void econ;
    // 여름 하루 노출 비교
    const sumOf = (k) => Spoil.dayExposure(SUMMER, 0, P[k].damp) * P[k].seal;
    const winOf = (k) => Spoil.dayExposure(WINTER, 0, P[k].damp) * P[k].seal;
    const g = sumOf('ground'), ch = sumOf('chest'), gr = sumOf('granary');
    ok(g / ch >= 1.4, '★★여름에 상자가 바닥보다 **1.4배 이상** 느리다', `${(g / ch).toFixed(2)}배`);
    ok(g / gr >= 2, '★★여름에 곳간이 바닥보다 **2배 이상** 느리다', `${(g / gr).toFixed(2)}배`);
    ok(gr < ch, '★여름엔 곳간이 상자보다도 낫다(완충이 더 크다)', `${gr.toFixed(3)} < ${ch.toFixed(3)}`);
    // ★★겨울엔 완충이 **불리하게** 뒤집힌다 — 그게 물리고, 그래서 판단이 생긴다
    ok(winOf('granary') > winOf('chest'),
       '★★겨울엔 곳간이 상자보다 **못하다** — 완충은 추위도 막는다(여름엔 곳간, 겨울엔 상자)',
       `곳간 ${winOf('granary').toFixed(3)} > 상자 ${winOf('chest').toFixed(3)}`);
    console.log('  · [지표] 자리별 하루 노출');
    for (const k of Spoil.placeKeys()) {
      console.log(`      ${P[k].ko.padEnd(8)} seal ${P[k].seal.toFixed(2)} damp ${P[k].damp.toFixed(2)}`
        + ` → 여름 ${sumOf(k).toFixed(3)} · 겨울 ${winOf(k).toFixed(3)}`);
    }
  }

  // ══ ⑥ 체크포인트 — 위치 이력 없이 정확하다 ═══════════════════════════════
  console.log('\n⑥ 체크포인트 — 바닥 3일 → 상자 3일');
  {
    const D0 = SUMMER, N = 3;
    // 손으로 세운 직접 적분값(정본 함수만 부른다 — 곡선을 다시 짜지 않는다)
    let want = 0;
    for (let k = 0; k < N; k++) want += Spoil.dayExposure(D0 + k, 0, Spoil.PLACES.carry.damp) * Spoil.PLACES.carry.seal;
    for (let k = 0; k < N; k++) want += Spoil.dayExposure(D0 + N + k, 0, Spoil.PLACES.chest.damp) * Spoil.PLACES.chest.seal;
    // 제품 경로: 로트 하나를 만들고 3일 뒤 자리를 바꾸고 3일 더
    const p = mkPlayer('cp', { fish: 2 });
    Lots.note(p, 'fish', 2, D0, 'carry');
    Lots.settle(p, 'fish', D0 + N);                    // 3일 흘렀다 — 정산
    Lots.setPlace(p, 'fish', 'chest', D0 + N);         // 자리를 옮긴다(정산 뒤 배율 교체)
    const got = Spoil.exposureOf(p.lots.fish[0], D0 + 2 * N, 0);
    pre(want > 0, '직접 적분값이 0 이 아니다', want.toFixed(6));
    ok(Math.abs(got - want) < 1e-4, '★★자리 이동 뒤 노출이 **직접 적분과 같다**(이력 저장 0)',
       `${got.toFixed(6)} = ${want.toFixed(6)}`);
    // 순서를 뒤집으면 값이 달라야 한다(안 달라지면 배율이 안 걸린 것 — 자명 통과 방지)
    const q = mkPlayer('cp2', { fish: 2 });
    Lots.note(q, 'fish', 2, D0, 'chest');
    Lots.settle(q, 'fish', D0 + N);
    Lots.setPlace(q, 'fish', 'carry', D0 + N);
    const got2 = Spoil.exposureOf(q.lots.fish[0], D0 + 2 * N, 0);
    ok(Math.abs(got2 - got) > 1e-6, '★★순서를 뒤집으면 값이 다르다 — 배율이 **구간별로** 걸린다',
       `${got.toFixed(4)} vs ${got2.toFixed(4)}`);
  }

  // ══ ⑦ 분할·합병 ═════════════════════════════════════════════════════════
  console.log('\n⑦ 분할·합병');
  {
    const today = H.zoneGameDay();
    const p = mkPlayer('split', { fish: 6 });
    Lots.note(p, 'fish', 6, today - 2, 'carry');
    Lots.settle(p, 'fish', today);
    const e0 = p.lots.fish[0].e;
    const out = Lots.moveOut(p, 'fish', 2, p.inventory, today, 0);
    ok(out.length === 1 && Math.abs(out[0].e - e0) < 1e-9,
       '★분할 — 떼어 낸 몫이 부모의 노출을 그대로 물려받는다', `${out[0].e} = ${e0}`);
    ok(Math.abs(Lots.sum(p, 'fish') - 4) < 1e-6, '남은 몫도 맞다', String(Lots.sum(p, 'fish')));
    // 합병(오버플로 _cap) — 안전한 쪽(큰 노출)을 취한다
    const q = mkPlayer('merge', {});
    const CAP = Lots.CFG.MAX_LOTS;
    for (let i = 0; i <= CAP; i++) Lots.note(q, 'fish', 1, today - (CAP - i) - 1, 'carry');
    pre(q.lots.fish.length <= CAP, `로트가 상한(${CAP})에서 뭉쳐졌다`, String(q.lots.fish.length));
    Lots.settle(q, 'fish', today);
    const merged = q.lots.fish.find((l) => l.coalesced);
    ok(!!merged, '뭉친 로트가 있다', merged ? JSON.stringify(merged) : '없음');
    const others = q.lots.fish.filter((l) => !l.coalesced);
    ok(!!merged && others.every((l) => merged.e >= l.e - 1e-9),
       '★★뭉친 쪽의 노출이 **가장 크다** — 음식이 실제보다 싱싱해 보이는 일은 없다(기존 min(d) 캐논과 같은 방향)',
       merged ? `${merged.e.toFixed(3)} ≥ max(${others.map((l) => (+l.e).toFixed(3)).join(',')})` : '');
  }

  // ══ ⑧ O(1) — 나이 100일을 물어도 표를 다시 안 채운다 ═════════════════════
  console.log('\n⑧ O(1) — 조회 비용');
  {
    const today = H.zoneGameDay();
    Spoil.exposureOf({ d: today - 100, n: 1, e: 0, t: today - 100, m: 1, w: 0 }, today, 0);   // 표 예열
    const before = Spoil._cumStats().days;
    const lot = { d: today - 100, n: 1, e: 0, t: today - 100, m: 1, w: 0 };
    const t0 = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < 20000; i++) acc += Spoil.exposureOf(lot, today, 0);
    const t1 = process.hrtime.bigint();
    const after = Spoil._cumStats().days;
    ok(after === before, '★★100일짜리를 2만 번 물어도 표가 **한 칸도 안 는다**(전부 적중)',
       `${before} → ${after}`);
    const us = Number(t1 - t0) / 20000 / 1000;
    ok(us < 5, '★조회당 5μs 미만 — 틱 0 이 유지된다', `${us.toFixed(3)}μs`);
    pre(acc > 0, '★자명 통과 금지 — 실제로 0 이 아닌 값을 셌다', acc.toFixed(0));
  }

  // ══ ⑨ ★★상자·바닥이 더 이상 부패 시계를 지우지 않는다 ═══════════════════
  //   §0 실측이 잡은 결함이다: 넣었다 빼면 신선도가 **1.00 으로 되돌아왔다**(네 품목 전수).
  console.log('\n⑨ 그릇 — 시계를 지우지 않는다 (§0 이 잡은 결함의 수리)');
  {
    const today = H.zoneGameDay();
    for (const [ko, item, cx] of [['상자', 'fish', 12000], ['곳간', 'berry', 14000]]) {
      const p = mkPlayer('jar_' + item, { [item]: 5 }, cx, 9000);
      H.players.set(p.pid, p);
      Lots.note(p, item, 5, today - 1, 'carry');
      const b = chest('b_' + item, p.playerId, cx + 20, 9000, ko === '곳간' ? 'guild_granary' : 'chest');
      if (ko === '곳간') { b.data.tribe_id = 'T1'; p.tribeId = 'T1'; }
      const f0 = Spoil.bestOf(item, Lots.of(p, item), today);
      pre(f0 < 1, `★${ko} — 넣기 전에 이미 안 신선하다(1.00 이면 리셋을 못 잰다)`, f0.toFixed(4));
      H.tryChestPut(p, b.id, item, 5);
      pre((b.data[item] || 0) === 5, `★성사: ${ko}에 5개 들어갔다`, String(b.data[item] || 0));
      ok(Array.isArray(b.data._lots && b.data._lots[item]) && b.data._lots[item].length > 0,
         `★★${ko}가 로트를 **들고 있다**`, JSON.stringify(b.data._lots && b.data._lots[item]));
      H.tryChestTake(p, b.id, item, 5);
      const f1 = Spoil.bestOf(item, Lots.of(p, item), today);
      ok(Math.abs(f1 - f0) < 1e-6, `★★★${ko}를 왕복해도 신선도가 그대로다 — 시계가 안 지워진다`,
         `${f0.toFixed(4)} → ${f1.toFixed(4)}`);
      ok(Math.floor(Lots.sum(p, item)) === 5, '개수도 그대로', String(Lots.sum(p, item)));
    }
    // 바닥 — 버렸다 줍기
    {
      const p = mkPlayer('drop', { fish: 3 }, 16000, 9000);
      H.players.set(p.pid, p);
      Lots.note(p, 'fish', 3, today - 1, 'carry');
      const f0 = Spoil.bestOf('fish', Lots.of(p, 'fish'), today);
      pre(f0 < 1, '★바닥 — 버리기 전에 이미 안 신선하다', f0.toFixed(4));
      const gi0 = H.groundItems.size;
      H.tryDropItem(p, 'fish', 3, {});
      const spawned = [...H.groundItems.values()].filter((g) => g.item === 'fish');
      pre(H.groundItems.size > gi0 && spawned.length > 0, '★성사: 바닥에 떨어졌다', String(spawned.length));
      ok(spawned.some((g) => Array.isArray(g.lots) && g.lots.length), '★★바닥템이 로트를 들고 있다',
         JSON.stringify(spawned[0] && spawned[0].lots));
      for (const g of spawned) H.tryPickupItem(p, g.id);
      const f1 = Spoil.bestOf('fish', Lots.of(p, 'fish'), today);
      ok(Math.abs(f1 - f0) < 1e-6, '★★★버렸다 주워도 신선도가 그대로다', `${f0.toFixed(4)} → ${f1.toFixed(4)}`);
    }
  }

  // ══ ⑩ 저장 형식 ═════════════════════════════════════════════════════════
  console.log('\n⑩ 저장 — 재접속을 넘어 그대로');
  {
    const today = H.zoneGameDay();
    const p = mkPlayer('save2', { fish: 3 });
    Lots.note(p, 'fish', 3, today - 2, 'chest');
    Lots.settle(p, 'fish', today);
    const f0 = Spoil.bestOf('fish', Lots.of(p, 'fish'), today);
    const blob = JSON.parse(JSON.stringify(Lots.toSave(p)));
    const q = mkPlayer('load2', { fish: 3 });
    Lots.fromSave(q, blob);
    const f1 = Spoil.bestOf('fish', Lots.of(q, 'fish'), today);
    ok(Math.abs(f1 - f0) < 1e-9, '★저장·복원을 넘어 신선도가 같다', `${f0.toFixed(6)} → ${f1.toFixed(6)}`);
    ok(Lots.of(q, 'fish')[0].m === Spoil.PLACES.chest.seal, '★자리 배율도 살아남는다',
       String(Lots.of(q, 'fish')[0].m));
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
