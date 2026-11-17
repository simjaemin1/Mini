#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1128-kcal-tidy.js — T1128: 열량 장부 셋 닫기 · 꺼낸 개수 (★재민 11-03 문 9 ㄱㄱㄱ · 문 10 ㄴ · 손잡이 `T1128_KCAL_TIDY`) ===
//
//  ① 9-a 어종마다 가공품 — 낚시 어종(`fishing.FISH_ITEMS`)마다 말린 것 · 절인 것 품목이 선다 · 열량 = 그 종 한 마리(보존은 수분만) ·
//     무게 = 원물 × 이 세계의 말림 · 절임 비 · 보관일 = 그 가공의 곡선 · 고증 이름(북어 · 과메기 · 새우젓 …) · 곳간 칸은 열량으로 접는다
//  ② 레시피 — `dry_fish` · `pickle_fish` 가 넣은 어종의 품목을 낸다(`resolveFrom`) · 잡어(`fish`)를 절이면 생선 절임(남새 절임 150 이 아니다)
//  ③ 9-b 어부 손 값 = 종별 열량 표 — 잉어 한 마리 손 = 표 640kcal(종전 2.5kg × 495 = 1,237.5) · 그 레코드를 꺼내면 잉어 1마리(종전 1.93)
//  ④ 9-c 사냥 고기 조리 = 세계 조리 규칙 하나(1.12) — 구운 사슴 · 삶은 곰고기 열량 = 날것 × `COOKED_FACTOR` · econ `cooked_food` 거울과 같은 수
//  ⑤ 문 10 꺼낸 개수 = 넣은 품목 개수(존 · 실제 문) — 곰고기 4 몫 → 곰고기 4(종전 4.97) · 건 잉어 5 + 곳간 건어물 → 청한 개수 그대로
//  ⑥ 끔(`T1128_KCAL_TIDY=0`) — 새 품목 0 · 레시피 산출 · 손 값 · 꺼낸 개수 모두 종전 글자
//
// 실행: node scripts/test-t1128-kcal-tidy.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
process.env.T1192_FISH_SPECIES='0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 아이 판 — 표(①~④ · ⑥) ═══════════════════════════════════════════════════════════════════════
if (process.env.T1128_SUB === 'table') {
  const out = {};
  const K = require(SV('kcal.js')), W = require(SV('weights.js')), S = require(SV('spoil.js')), F = require(SV('fishing.js'));
  const FP = require(SV('fish-preserve.js')), V = require(SV('villages.js')), GM = require(SV('game-meat.js'));
  out.on = FP.ON; out.vOn = V.T1128_KCAL_TIDY;
  out.species = F.FISH_ITEMS.filter((s) => s !== 'fish');
  out.rows = out.species.map((s) => {
    const d = S.resolveFrom(S.PRESERVE.dry_fish, { [s]: 1 }), p = S.resolveFrom(S.PRESERVE.pickle_fish, { [s]: 1 });
    return { s, kcal: K.kcalOf(s), kg: W.kgOf(s), dOut: d.out, pOut: p.out, dK: K.kcalOf(d.out), pK: K.kcalOf(p.out), dKg: W.kgOf(d.out), pKg: W.kgOf(p.out),
      dKo: (S.PRESERVED_ITEMS[d.out] || {}).ko, pKo: (S.PRESERVED_ITEMS[p.out] || {}).ko, dSh: S.shelfOf(d.out), pSh: S.shelfOf(p.out),
      dMap: V.playerVillageDepositMap()[d.out] || null, pMap: V.playerVillageDepositMap()[p.out] || null, rawKgFresh: (require(SV('freshfish.js')).kgOf(s) || null) };
  });
  const g = S.resolveFrom(S.PRESERVE.pickle_fish, { fish: 1 }), gd = S.resolveFrom(S.PRESERVE.dry_fish, { fish: 1 });
  out.generic = { pOut: g.out, pK: K.kcalOf(g.out), dOut: gd.out, dK: K.kcalOf(gd.out), veg: K.kcalOf('pickled_veg'), vegOut: S.PRESERVE.pickle_veg.out };
  out.ratio = { dry: W.kgOf('dried_fish') / W.kgOf('fish'), pickle: W.kgOf('pickled_veg') / W.kgOf('vegetable') };
  out.shelf = { dried: S.shelfOf('dried_fish'), pickled: S.shelfOf('pickled_veg') };
  out.nItems = Object.keys(S.PRESERVED_ITEMS).length;
  // ③ 9-b 손 값 — 낚는 순간 장부값(존이 부르는 그 함수 · 끔이면 종전 식)
  const hand = (id, kg) => (V.T1128_KCAL_TIDY ? V._t1128HandUnits(K, id, kg) : (+K.econUnitsOf('fish', 1, kg) || 0));
  const carpKg = require(SV('freshfish.js')).kgOf('carp');
  out.hand = { carpKg, u: hand('carp', carpKg), tbl: K.econUnitsOf('carp', 1), back: K.itemsOf('carp', hand('carp', carpKg)), old: K.econUnitsOf('fish', 1, carpKg) };
  // ④ 9-c 사냥 고기 조리 — 레시피를 열량 정본에 건다(존 `installCookRecipes` 그 문 · GameMeat.cookMap 그 줄)
  K.installCookRecipes(Object.assign({}, GM.cookMap()));
  out.cook = { f: K.COOKED_FACTOR, game: K.kcalOf('meat_game'), gameC: K.kcalOf('meat_game_cooked'), bear: K.kcalOf('meat_bear'), bearC: K.kcalOf('meat_bear_cooked'),
    econMirror: /if \(r === 'cooked_food'\) return 1\.12;/.test(fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8')) };
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ══ 아이 존 — 회관 넣기 → 꺼내기(실제 문 · test-granary-item 꼴) ══════════════════════════════════════════
if (process.env.T1128_SUB === 'zone') {
  const TMP = `/tmp/t1128-kcal-tidy-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(42800));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const out = { errs: [] };
  try {
    const Zone = require(SV('zone.js'));
    const H = Zone.__testBind();
    const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
    const Events = require(SV('events.js'));
    const V = H.SimVillages, GL = H.GL;
    out.gl = !!GL; out.on = !!V.T1128_KCAL_TIDY;
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 60; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    V.__labProbe._distProbe.setup(null, null, world, require(path.join(ROOT, 'sim', 'economy-sim')));   // 회관 넣기 뒤 화면 갱신(`playerVillageInventory`)이 econ 정본 함수를 부른다
    const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL);
    VIL.econ.founder = VIL.econ.founder || 'anon_t1128_founder';   // 사람 마을(창설자 표지 — test-granary-item 그 줄)
    const HALL = 'b_t1128_hall';
    H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT.x, y: AT.y, data: { x0: VIL.ccx, y0: VIL.ccy, villageDbId: VID, owner: null } });
    H.__e2eFreezeZoneDay(true);
    if (GL) for (const v of vils) GL.attach(v.econ, null, null);
    out.day = H.Kcal.DAY_KCAL;
    let nP = 0;
    const mkP = () => {
      const p = { pid: `p_t1128_${++nP}`, playerId: `anon_t1128_${nP}`, name: '곳간지기', persistent: false,
        x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0, ws: { readyState: 1, send: () => {} } };
      H.Membership.seatFounder(p, VID);
      return p;
    };
    const today = H.zoneGameDay();
    const give = (p, item, n, f, back) => {
      const Lf = H.Spoil.shelfOf(item);
      p.inventory[item] = (p.inventory[item] || 0) + n;
      H.Lots.moveIn(p, item, [{ d: today - (back || 1), n, e: Lf * (1 - f), t: today }], today, 0, 'carry');
    };
    const R6 = (x) => +(+x).toFixed(6);
    const hall = (p, want) => { H.buildings.get(HALL).data.owner = p.playerId; try { H.tryVillageDeposit(p, HALL, want); } catch (e) { out.errs.push('hall:' + String(e && e.stack || e).slice(0, 600)); } };
    const wd = (p, res, q) => { VIL.econ.founder = p.playerId; const s0 = +VIL.econ.storage[res] || 0; try { H.tryVillageWithdraw(p, VID, res, q); } catch (e) { out.errs.push('wd:' + String(e && e.message || e)); } return R6(s0 - (+VIL.econ.storage[res] || 0)); };
    const led = (res) => (GL ? JSON.parse(JSON.stringify(GL.ledger(VIL.econ, res) || [])) : []);
    // ── A. 곰고기 8(f 0.6 · 사흘 전) 넣기 → 사슴·들짐승고기 칸 2단위 꺼내기(문이 정한 대표 개수 = ⌊2 × 2,450 ÷ 1,200⌋ = 4 · 앞 레코드 = 곰고기 8 — 판정대기 문 10 그 판) ──
    const RA = 'meat_game';
    VIL.econ.storage[RA] = 0; VIL.econ.storage[RA] = 20;
    const a = mkP(); give(a, 'meat_bear', 8, 0.6, 3); hall(a, { meat_bear: 8 });
    out.Aled = led(RA).map((r) => ({ it: r.it || null, u: R6(r.u), f0: r.f0 == null ? 1 : R6(r.f0) }));
    out.AwdU = wd(a, RA, 2);
    out.A = { bear: R6(H.Lots.sum(a, 'meat_bear')), game: R6(H.Lots.sum(a, 'meat_game')), invBear: +a.inventory.meat_bear || 0, invGame: +a.inventory.meat_game || 0, ledAfter: led(RA).map((r) => ({ it: r.it || null, u: R6(r.u) })) };
    out.kA = { bear: H.Kcal.kcalOf('meat_bear'), game: H.Kcal.kcalOf('meat_game') };
    // ── B. 건 잉어 5(f 0.9 · 하루 전) 넣기 → 건어물 칸 2단위 꺼내기(대표 개수 = ⌊2 × 2,450 ÷ 445.5⌋ = 10) — 앞 5 = 건 잉어 · 뒤 = econ 건어물 ──
    const RB = 'dried_fish';
    out.Bmap = V.playerVillageDepositMap().dried_carp || null;
    VIL.econ.storage[RB] = 0; VIL.econ.storage[RB] = 20;
    const b = mkP(); give(b, 'dried_carp', 5, 0.9, 1); hall(b, { dried_carp: 5 });
    out.Bled = led(RB).map((r) => ({ it: r.it || null, u: R6(r.u), f0: r.f0 == null ? 1 : R6(r.f0) }));
    out.BwdU = wd(b, RB, 2);
    out.B = { carp: R6(H.Lots.sum(b, 'dried_carp')), fish: R6(H.Lots.sum(b, 'dried_fish')), invCarp: +b.inventory.dried_carp || 0, invFish: +b.inventory.dried_fish || 0 };
    out.kB = { carp: H.Kcal.kcalOf('dried_carp'), fish: H.Kcal.kcalOf('dried_fish') };
  } catch (e) { out.errs.push(String(e && e.stack || e).slice(0, 500)); }
  console.log = _log;
  console.log(JSON.stringify(out));
  for (const f of [`/tmp/t1128-kcal-tidy-${process.pid}.db`, `/tmp/t1128-kcal-tidy-${process.pid}.db-wal`, `/tmp/t1128-kcal-tidy-${process.pid}.db-shm`]) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ══ 어미 ════════════════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? `  ${x}` : '')); };
const run = (sub, env) => { const o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1128_SUB: sub }, env), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 }); return JSON.parse(o.trim().split('\n').pop()); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
console.log('\n=== T1128 열량 장부 셋 · 꺼낸 개수 ===\n');
const on = run('table', { T1128_KCAL_TIDY: '' }), off = run('table', { T1128_KCAL_TIDY: '0' });

console.log('① 9-a 어종마다 가공품');
ok(on.on === true && on.vOn === true && off.on === false && off.vOn === false, '손잡이 — 켬 기본 · `=0` 끔(fish-preserve · villages 같은 값)');
ok(on.species.length >= 20, '전제 — 낚시 어종이 스물 넘게 있다(아래가 자명 통과가 아니다)', on.species.length);
const bad = on.rows.filter((r) => !(r.kcal > 0 && r.dK === r.kcal && r.pK === r.kcal));
ok(!bad.length, '★열량 = 그 종 한 마리 그대로(말린 것 · 절인 것 · 보존은 수분만) — 어종 열량 0 인 종 없음', bad.length ? JSON.stringify(bad.slice(0, 3)) : `${on.rows.length}종`);
const uniq = new Set(on.rows.map((r) => r.dK));
ok(uniq.size > 10, '★"건어물 1개 = 445.5 고정"이 없어졌다 — 말린 것 열량이 종마다 다르다', `서로 다른 값 ${uniq.size}`);
ok(on.rows.every((r) => r.pK !== on.generic.veg || r.kcal === on.generic.veg), '★"생선 절임 = 남새 절임 150"이 없어졌다', on.generic.veg);
const kgBad = on.rows.filter((r) => !(near(r.dKg, (r.kg || r.rawKgFresh) * on.ratio.dry) && near(r.pKg, (r.kg || r.rawKgFresh) * on.ratio.pickle)));
ok(!kgBad.length, '무게 = 원물 × 이 세계의 말림 비(건어물 0.35 ÷ 생선 0.90) · 절임 비(절임 0.66 ÷ 남새 0.60)', kgBad.length ? JSON.stringify(kgBad.slice(0, 2)) : `${on.ratio.dry.toFixed(4)} · ${on.ratio.pickle.toFixed(4)}`);
ok(on.rows.every((r) => r.dSh === on.shelf.dried && r.pSh === on.shelf.pickled), '보관일 = 그 가공의 곡선(건어물 · 절임)', `${on.shelf.dried} · ${on.shelf.pickled}`);
const nm = Object.fromEntries(on.rows.map((r) => [r.s, [r.dKo, r.pKo]]));
ok(nm.pollock[0] === '북어' && nm.herring[0] === '과메기' && nm.shrimp[1] === '새우젓' && nm.anchovy[1] === '멸치젓' && nm.squid[1] === '오징어젓' && nm.carp[0] === '건 잉어' && nm.carp[1] === '잉어 절임',
  '이름 — 고증 이름(북어 · 과메기 · 새우젓 · 멸치젓 · 오징어젓) · 없으면 "건 ○○" · "○○ 절임"', JSON.stringify({ pollock: nm.pollock, carp: nm.carp, shrimp: nm.shrimp }));
ok(on.rows.every((r) => r.dMap === 'dried_fish' && r.pMap === 'pickled_veg'), '곳간 · 거래소 칸 — 말린 것 = 건어물 · 절인 것 = 절임(열량으로 접는다 · econ 새 재화 0)');
console.log('② 레시피 산출');
ok(on.rows.every((r) => r.dOut === 'dried_' + r.s && r.pOut === 'pickled_' + r.s), '★`dry_fish` · `pickle_fish` 가 넣은 어종의 품목을 낸다(`resolveFrom`)');
ok(on.generic.dOut === 'dried_fish' && on.generic.pOut === 'pickled_fish' && near(on.generic.pK, on.generic.dK) && on.generic.vegOut === 'pickled_veg',
  '잡어(`fish`) — 말리면 건어물 그대로 · 절이면 생선 절임(잡어 한 마리 열량) · 남새 절임 줄은 그대로', JSON.stringify(on.generic));
console.log('③ 9-b 어부 손 값 = 종별 열량 표');
ok(near(on.hand.u, on.hand.tbl) && on.hand.back.items === 1 && near(on.hand.back.leftUnits, 0, 1e-4), '★잉어 한 마리 손 = 표 한 마리(꺼내면 잉어 1마리)', `${(on.hand.u * on.day || 0).toFixed ? (on.hand.u * 2450).toFixed(1) : ''}kcal`);
ok(near(off.hand.u, off.hand.old) && off.hand.back.items === 1 && near((off.hand.u * 2450) / 640, 1.93359375, 1e-4), '대조 — 끔 = 종전(2.5kg × 495 = 1,237.5kcal → 꺼내면 1.93마리 몫)', `${(off.hand.u * 2450 / 640).toFixed(4)}`);
console.log('④ 9-c 사냥 고기 조리 = 세계 조리 규칙 하나');
ok(on.cook.f === 1.12 && on.cook.econMirror, 'kcal `COOKED_FACTOR` 1.12 = econ `cooked_food` 거울(같은 수)');
ok(on.cook.game > 0 && near(on.cook.gameC, on.cook.game * on.cook.f) && on.cook.bear > 0 && near(on.cook.bearC, on.cook.bear * on.cook.f), '★구운 사슴 · 삶은 곰고기 열량 = 날것 × 1.12', `${on.cook.gameC.toFixed(1)} · ${on.cook.bearC.toFixed(1)}`);
console.log('⑥ 끔 = 종전');
ok(off.nItems === 6 && off.rows.every((r) => r.dOut === 'dried_fish' && r.pOut === 'pickled_veg') && off.generic.pOut === 'pickled_veg', '끔 — 새 품목 0 · 산출 둘(건어물 · 절임) 그대로', off.nItems);

console.log('⑤ 문 10 꺼낸 개수 = 넣은 품목 개수(존 · 실제 문)');
const zon = run('zone', { T1128_KCAL_TIDY: '' }), zoff = run('zone', { T1128_KCAL_TIDY: '0' });
ok(!zon.errs.length && !zoff.errs.length && zon.gl && zoff.gl, '전제 — 존 · 곳간 로트 장부가 섰다', JSON.stringify(zon.errs.concat(zoff.errs)).slice(0, 300));
ok(zon.Aled[0] && zon.Aled[0].it === 'meat_bear' && zon.Aled[0].f0 < 1, '전제 — 곳간 앞 레코드 = 넣은 곰고기(신선도 접힘 f0 < 1)', JSON.stringify(zon.Aled));
const uBear = (n, f0) => n * zon.kA.bear * f0 / zon.day;
ok(near(zon.A.bear, 4, 1e-6) && zon.A.invBear === 4 && zon.A.game < 1e-6 && near(zon.AwdU, zon.Aled[0].u / 2, 1e-5) && near(zon.AwdU, uBear(4, zon.Aled[0].f0), 1e-5) && zon.A.ledAfter[0] && zon.A.ledAfter[0].it === 'meat_bear' && near(zon.A.ledAfter[0].u, zon.Aled[0].u / 2, 1e-5),
  '★사슴 4개 몫 → 곰고기 4(종전 4.97) · 곳간은 곰고기 4개의 단위만큼 준다 · 곰고기 4개가 곳간에 남는다', `곰 ${zon.A.bear} · 사슴 ${zon.A.game} · 뺀 단위 ${zon.AwdU}`);
ok(near(zoff.A.bear, 4 * zoff.kA.game / (zoff.kA.bear * zoff.Aled[0].f0), 1e-3) && zoff.A.invBear === 4, '대조 — 끔 = 종전(열량 환산 4 × 1,200 ÷ (1,610 × 0.6) = 4.97 · 인벤 4 · 끝수는 로트)', `곰 ${zoff.A.bear}`);
ok(zon.Bmap === 'dried_fish' && zon.Bled[0] && zon.Bled[0].it === 'dried_carp', '전제 — 건 잉어가 건어물 칸에 넣은 품목째(앞 레코드)', JSON.stringify(zon.Bled).slice(0, 200));
ok(near(zon.B.carp, 5, 1e-6) && zon.B.invCarp === 5 && near(zon.B.fish, 5, 1e-3) && zon.B.invFish === 5,
  '★건어물 칸 10개 몫 → 건 잉어 5(넣은 그대로) + 곳간 건어물 5 — 합 = 청한 개수', `잉어 ${zon.B.carp} · 건어물 ${zon.B.fish}`);
ok(near(zon.BwdU, zon.Bled[0].u + 5 * zon.kB.fish / zon.day, 1e-5), '곳간이 뺀 단위 = 그 레코드들의 단위(건 잉어 레코드 전부 + 건어물 5개 열량 · 열량 장부는 그대로)', `${zon.BwdU}`);
ok(zoff.Bmap === null, '대조 — 끔이면 건 잉어 품목이 없다(곳간 칸도 없다)');

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
