#!/usr/bin/env node
// @regress
// === scripts/test-hall-units.js — T725: 회관 넣기의 단위 짝(`T725_HALL_UNITS=1`) · 안 썩는 재료(`T725_LOT_KINDS=1`) — 손잡이 둘 · 없음 = 끔 = main 바이트 ===
//
// ★왜 [T716 회부 둘]
//   ① 회관 넣기(`tryVillageDeposit`)는 `playerVillageDeposit` 에 `unitsOf` 를 안 넘겨 **개수 × 환산율**로 넣는다(열량 · 신선도 안 봄 · 상한 것도 받음).
//      꺼내기는 열량 환산(T59 — 1단위 = 하루치 2,450kcal)이라 생선 1개 넣기 = 1단위 → 1단위 꺼내기 = 생선 5개 — 넣고 빼면 불어난다.
//   ② `lots.isLot` 이 특산 축산·작물을 통째로 로트로 쳐 깃털·뼈·가죽·모피·삼에 보관일 5일(특산 기본값)이 붙는다.
//
//  ① 손잡이 — '1' 하나만 켬(없음·빈 값·'0'·'true' = 끔)
//  ② 왕복 — 곳간이 받는 품목 전부(대응 정본 `playerVillageDepositMap`)를 **진짜 회관 문**(`tryVillageDeposit`)으로 넣고 **진짜 꺼내기**(`tryVillageWithdraw`)로 뺀다
//       끔 = 1개 = 1단위 → 열량 품목은 불어난다(배수 = 하루치 ÷ 낱개 열량 — 측정값) · 켬 = 거래소·게시판 환산(`_unitsOfFor`)과 같은 단위 → 배수 1 ·
//       불어남 0(꺼낸 열량 + 곳간에 남은 몫 = 넣은 열량) · 열량 없는 것(나무·돌·소금·도토리…)은 두 판 다 1
//  ③ 상한 것 · 시든 것 — 끔 = 개수 그대로 받는다 · 켬 = 상한 것 거절(게시판과 같은 말 · 인벤 그대로) · 시든 것은 신선도만큼
//  ④ 안 썩는 재료 — 끔 = 깃털 30일 뒤 상함(로트 · 5일) · 켬 = 로트가 아니다 → 30일 뒤 그대로(화면 신선도 칸 없음 · 거래 환산 그대로 · 거절 없음)
//       · 옛 저장에 남은 로트 레코드도 안 읽는다 · 두 판의 로트 여부 차이 = 출처 표 열둘뿐(먹을 것은 그대로 로트)
//  ⑤ 배선 — 전부 손잡이 뒤 · 같은 함수(새 환산 0 · 새 판정 0) · 출처 줄
//
// 실행: node scripts/test-hall-units.js   (T725_OUT=<경로> 이면 두 판 왕복 표를 JSON 으로 적는다 — 보고 표의 원자료)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 — 존 하나(가벼운 판) + 랩 econ 마을 다섯(정본 진입점 · test-granary-age 꼴) ═══════════════════════
if (process.env.T725_SUB === 'zone') {
  const TMP = `/tmp/t725-hall-units-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42700 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  //   ★[T779] 옛 한도 손잡이(`MEMBER_WD_*` — 넣은 만큼 다 꺼내 보려고 풀던 둘)는 걷었다 — 꺼내기는 촌장 · 한도 없음.
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  // ★[T778] 순간 로트 켬 기본 — 순간 열쇠는 "같은 날 = 나이 0"을 깬다(픽스처 `t: 오늘` = 그 날 0시라 지난 시간만큼 더 시든다).
  //   값 단언은 그대로 두고 지난 시간만 뺀다 — 존 날을 얼린다(제품의 테스트 문 · 날 문법(`T732_MOMENT_LOT=0`)엔 같은 날).
  H.__e2eFreezeZoneDay(true);
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const V = H.SimVillages;
  const out = { hall: H.T725_HALL, kinds: H.Lots.T725_KINDS, rows: [], errs: [] };
  try {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL);
    VIL.econ.founder = VIL.econ.founder || 'anon_t725_founder';   // ★회관이 찾는 마을 = 플레이어가 세운 마을(`playerVillageAt` 의 조건 그대로)
    const HALL = 'b_t725_hall';
    H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT.x, y: AT.y, data: { x0: VIL.ccx, y0: VIL.ccy, villageDbId: VID, owner: null } });
    const DAY = H.Kcal.DAY_KCAL, RATE = P.RATE, today = H.zoneGameDay();
    out.day = DAY; out.rate = RATE;
    const notes = [];
    let nP = 0;
    const mkP = () => {
      const p = { pid: `p_t725_${++nP}`, playerId: `anon_t725_${nP}`, name: '곳간지기', persistent: false,
        x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0,
        ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
      H.Membership.seatFounder(p, VID);
      return p;
    };
    // 진짜 회관 문 — 관리자(주인)만 넣는다(`_furnaceCanUse` 그대로). ⚠랩엔 마을 모듈의 econ 정본이 안 꽂혀 맨 끝 화면 갱신(`playerVillageInventory`)이
    //   던질 수 있다 — 넣기·저장·인벤·알림은 그 앞에서 다 끝난다(던진 말은 적어 두고 아래에서 그 하나뿐인지 본다).
    const hall = (p, want) => {
      H.buildings.get(HALL).data.owner = p.playerId;
      const n0 = notes.length;
      try { H.tryVillageDeposit(p, HALL, want); } catch (e) { out.errs.push(String(e && e.message || e)); }
      return notes.slice(n0).join(' | ');
    };
    const give = (p, item, n, e) => {   // 신선도를 **정확히** 세운 로트(노출 = 보관일 × (1 − f)) — 공개 API `Lots.moveIn`(로트 품목만 받는다)
      p.inventory[item] = (p.inventory[item] || 0) + n;
      if (e != null) H.Lots.moveIn(p, item, [{ d: today - 1, n, e, t: today }], today, 0, 'carry');
      else if (H.Lots.isLot(item)) H.Lots.reconcile(p, item, p.inventory, today);   // 초당 쓸개가 하는 일 — 오늘 얻은 것
    };

    // ── ② 왕복 — 곳간이 받는 품목 전부 ─────────────────────────────────────────
    const map = V.playerVillageDepositMap();
    const toEcon = L.deliverable.toEcon;
    for (const item of Object.keys(map)) {
      const res = map[item], rep = toEcon.get(res) || null;
      const kc = +H.Kcal.kcalOf(item) || 0, kcRep = rep ? (+H.Kcal.kcalOf(rep) || 0) : 0;
      const N = kc > 0 ? Math.max(10, Math.ceil(2 * DAY / kc)) : 10;   // 켬 판에서도 한 단위 이상 꺼내지게
      const p = mkP();
      give(p, item, N);
      const uf = +H._unitsOfFor(p)(item, N);   // 거래소·게시판 문이 이 몫에 매기는 단위(보기 — 로트를 안 건드린다)
      VIL.econ.storage[res] = 0;
      const note = hall(p, { [item]: N });
      const du = +(+VIL.econ.storage[res] || 0).toFixed(6);
      const left0 = Math.floor(+p.inventory[item] || 0);
      // 꺼내기 — 넣은 단위의 정수 몫 전부(진짜 문 · 한도 손잡이만 넓힘)
      const q = Math.floor(du / RATE + 1e-9);
      const before = rep ? Math.floor(+p.inventory[rep] || 0) : 0;
      VIL.econ.founder = p.playerId;   // ★[T769 · T779] 꺼내기는 촌장만 — 꺼내는 사람을 촌장(창설자 표지)으로 앉힌다(회관 `owner` 와 같은 꼴)
      if (q >= 1) H.tryVillageWithdraw(p, VID, res, q);
      const got = rep ? Math.floor(+p.inventory[rep] || 0) - before : 0;
      const leftU = +(+VIL.econ.storage[res] || 0).toFixed(6);
      out.rows.push({ item, res, rep, kc: +kc.toFixed(3), kcRep: +kcRep.toFixed(3), N, uf, du, taken: N - left0, q, got, leftU,
        note: note.slice(0, 120) });
    }

    // ── ③ 상한 것 · 시든 것(생선 — 보관일 2.5일) ────────────────────────────────
    {
      const Lf = H.Spoil.shelfOf('fish');
      const a = mkP(); give(a, 'fish', 10, Lf);           // f = 0 — 상함
      VIL.econ.storage.fish = 0;
      const na = hall(a, { fish: 10 });
      out.spoiled = { du: +(+VIL.econ.storage.fish || 0).toFixed(6), inv: a.inventory.fish | 0, note: na };
      const b = mkP(); give(b, 'fish', 10, Lf * 0.5);     // f = 0.5 — 시듦
      VIL.econ.storage.fish = 0;
      hall(b, { fish: 10 });
      out.wilt = { du: +(+VIL.econ.storage.fish || 0).toFixed(6), inv: b.inventory.fish | 0, kc: +H.Kcal.kcalOf('fish') };
    }

    // ── ④ 안 썩는 재료 — 30일 묵힌 것(로트 레코드 · 옛 저장 꼴 둘 다) ─────────────
    const NO_ROT = H.Lots.NO_ROT || {};
    out.noRot = {};
    for (const it of Object.keys(NO_ROT)) {
      const a = mkP();
      a.inventory[it] = 10;
      H.Lots.moveIn(a, it, [{ d: today - 30, n: 10, e: 30, t: today }], today, 0, 'carry');   // 게임이 로트를 다는 공개 API(로트 품목만)
      const b = mkP();
      b.inventory[it] = 10;
      b.lots[it] = [{ d: today - 30, n: 10, e: 30, t: today, m: 1, w: 0 }];                 // 옛 저장에 남은 레코드(켜기 전에 얻은 것)
      const row = (p) => { const v = H.Lots.viewAll(p, p.inventory, today)[it];
        return { isLot: H.Lots.isLot(it), stage: v && v[0] ? v[0].stage : null, guard: H._spoiledGuardItems(p, [it]), units: +H._unitsOfFor(p)(it, 10), inv: p.inventory[it] | 0 }; };
      out.noRot[it] = { api: row(a), save: row(b), shelf: H.Spoil.shelfOf(it) };
    }
    // 로트 여부 전수(두 판 견줌용) — 로트 핵심 · 특산 · 곳간 대응 · 열량 표의 품목 전부
    const uni = new Set([...H.Lots.LOT_CORE, ...Object.keys(H.Specialty.RESOURCES || {}), ...Object.keys(map), ...Object.keys(NO_ROT)]);
    out.isLot = {};
    for (const it of [...uni].sort()) out.isLot[it] = H.Lots.isLot(it);
    out.coreNoRot = [...H.Lots.LOT_CORE].filter((k) => NO_ROT[k]);
  } catch (e) { out.err = String(e && e.stack || e); }
  console.log = _log;
  console.log(JSON.stringify(out));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ══ 부모 — 두 판(끔 · 켬)을 돌려 견준다 ═══════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, name, detail) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${detail != null && detail !== '' ? '  ' + detail : ''}`); };
const near = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;
const KNOBS = ['T725_HALL_UNITS', 'T725_LOT_KINDS'];
const run = (on, extra) => {
  const env = Object.assign({}, process.env, { T725_SUB: 'zone' }, extra || {});
  for (const k of KNOBS) env[k] = '0';
  if (on) for (const k of KNOBS) env[k] = '1';
  const txt = execFileSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 });
  return JSON.parse(txt.trim().split('\n').pop());
};
say('=== T725 — 회관 넣기 단위 짝 · 안 썩는 재료 (손잡이 둘 · 끔 = main 바이트) ===');
const zOff = run(false), zOn = run(true);
const zOnLot0 = run(true, { T732_MOMENT_LOT: '0' });   // ★[T778] 끔 탐침 — 순간 로트 끔(날 로트)에서도 같은 단위
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const LSRC = fs.readFileSync(SV('lots.js'), 'utf8');
if (process.env.T725_OUT) fs.writeFileSync(process.env.T725_OUT, JSON.stringify({ off: zOff, on: zOn }, null, 1));
const pre = (c, name, detail) => { if (!c) ok(false, `전제 — ${name}`, detail); };
pre(!zOff.err && !zOn.err, '하위 판 둘이 끝까지 돌았다', (zOff.err || zOn.err || '').slice(0, 300));
const errOk = (z) => z.errs.every((m) => /totalFoodEquivalent/.test(m));
pre(errOk(zOff) && errOk(zOn), '회관 문이 던진 말은 랩의 화면 갱신(econ 정본 미주입) 하나뿐', JSON.stringify([...new Set([...zOff.errs, ...zOn.errs])]).slice(0, 200));

say('\n① 손잡이');
{
  ok(/const T725_HALL = process\.env\.T725_HALL_UNITS !== '0';/.test(ZSRC) && /const T725_KINDS = process\.env\.T725_LOT_KINDS !== '0';/.test(LSRC),
    "① 손잡이 둘 — '1' 하나만 켬(없음·빈 값·'0'·'true' = 끔)");
  ok(zOff.hall === false && zOff.kinds === false && zOn.hall === true && zOn.kinds === true, '① 하위 판이 손잡이를 그대로 읽었다(끔 · 켬)', `${zOff.hall}/${zOff.kinds} · ${zOn.hall}/${zOn.kinds}`);
}

say('\n② 왕복 — 진짜 회관 문으로 넣고 진짜 꺼내기로 뺀다(곳간이 받는 품목 전부)');
const DAY = zOff.day;
const mult = (r) => (r.kc > 0 ? r.du * DAY / (r.N * r.kc) : r.du / r.N);   // 넣은 열량(열량 없는 것은 개수) 대비 꺼낼 수 있는 몫
const rt = (r) => (r.kc > 0 ? (r.got * r.kcRep) / (r.N * r.kc) : r.got / r.N);   // 실제 왕복 — 꺼낸 것 ÷ 넣은 것
{
  const byOff = new Map(zOff.rows.map((r) => [r.item, r])), byOn = new Map(zOn.rows.map((r) => [r.item, r]));
  pre(zOff.rows.length === zOn.rows.length && zOff.rows.length >= 26, '두 판이 같은 품목 줄을 쟀다', `${zOff.rows.length} · ${zOn.rows.length}`);
  ok(zOff.rows.every((r) => r.taken === r.N && near(r.du, r.N * zOff.rate, 1e-6)), '② 끔 — 회관은 **개수 × 환산율**로 넣는다(1개 = 1단위 · 종전 그대로)',
    zOff.rows.filter((r) => !(r.taken === r.N && near(r.du, r.N * zOff.rate, 1e-6))).map((r) => r.item).join(',') || `${zOff.rows.length}줄`);
  const inflOff = zOff.rows.filter((r) => r.kc > 0 && mult(r) > 1 + 1e-6);
  const fish = byOff.get('fish'), berry = byOff.get('berry'), herb = byOff.get('herb');
  ok(inflOff.length > 0 && fish && near(mult(fish), DAY / fish.kc, 1e-6) && rt(fish) > 5 && rt(berry) > 9,
    '★★② 끔 — 열량 품목은 넣고 빼면 **불어난다**(배수 = 하루치 ÷ 낱개 열량) — 카드의 "생선 1 → 5 · 베리 1 → 9"',
    `${inflOff.length}줄 · 생선 ×${mult(fish).toFixed(3)}(왕복 실측 ×${rt(fish).toFixed(3)}) · 베리 ×${mult(berry).toFixed(3)} · 약초 ×${mult(herb).toFixed(1)}`);
  ok(zOn.rows.every((r) => r.taken === r.N && near(r.du, +r.uf.toFixed(3), 0.0011)), '★② 켬 — 회관 단위 = 거래소·게시판 문(`_unitsOfFor`)이 매기는 단위(같은 함수 · 새 환산 0)',
    zOn.rows.filter((r) => !near(r.du, +r.uf.toFixed(3), 0.0011)).map((r) => `${r.item} ${r.du}≠${r.uf}`).join(',') || `${zOn.rows.length}줄`);
  // 허용 오차 = 곳간 칸의 셋째 자리 반올림 한 번(0.0005단위)이 배수에 주는 몫 — 열량 품목 0.0005 × 하루치 ÷ 넣은 열량 · 열량 없는 것 0.0005 ÷ 개수
  const tolM = (r) => (r.kc > 0 ? 0.0006 * DAY / (r.N * r.kc) : 0.0006 / r.N);
  const badM = zOn.rows.filter((r) => !near(mult(r), 1, tolM(r)));
  ok(badM.length === 0, '★★② 켬 — 배수 1(넣은 열량 = 곳간에 든 열량 · 열량 없는 것은 개수 = 단위)', badM.map((r) => `${r.item} ×${mult(r).toFixed(4)}`).join(',') || `${zOn.rows.length}줄 전부 1`);
  // 보존 — 넣기·꺼내기 두 번의 셋째 자리 반올림(각 0.0005단위 = 1.2kcal) 안에서
  const cons = zOn.rows.filter((r) => r.kc > 0 ? !near(r.got * r.kcRep + r.leftU * DAY, r.N * r.kc, 0.0011 * DAY + 1e-9) : !near(r.got + r.leftU, r.N, 0.0011));
  const over = zOn.rows.filter((r) => rt(r) > 1 + 2 * tolM(r));
  ok(cons.length === 0 && over.length === 0, '★★② 켬 — **불어남 0**: 꺼낸 것 + 곳간에 남은 몫 = 넣은 것(남는 몫은 곳간에 그대로 — 버리지도 만들지도 않는다)',
    [...cons, ...over].map((r) => r.item).join(',') || `왕복 최대 ×${Math.max(...zOn.rows.map(rt)).toFixed(4)}`);
  const flat = zOff.rows.filter((r) => !(r.kc > 0));
  ok(flat.length > 0 && flat.every((r) => near(mult(r), 1, 1e-9) && near(mult(byOn.get(r.item)), 1, 0.0011)), '② 열량 없는 것(나무·돌·광물·생가죽·소금·도토리·밤·머루·오디)은 두 판 다 1개 = 1단위',
    flat.map((r) => r.item).join(' · '));
  const food = byOff.get('food');
  ok(food && near(mult(food), 1, 1e-9) && near(mult(byOn.get('food')), 1, 1e-6), '② 곡식(도정)은 두 판 다 1 — 낱개 2,450kcal = 하루치(그래서 test-membership ⑤ 역연산이 이 구멍을 못 봤다)');
}

say('\n③ 상한 것 · 시든 것(생선)');
{
  ok(zOff.spoiled.du === 10 && zOff.spoiled.inv === 0, '③ 끔 — 상한 생선 10개를 **개수 그대로** 받는다(종전)', `단위 ${zOff.spoiled.du}`);
  ok(zOn.spoiled.du === 0 && zOn.spoiled.inv === 10 && /상했습니다/.test(zOn.spoiled.note) && /받지 않습니다/.test(zOn.spoiled.note),
    '★③ 켬 — 상한 것 거절(게시판·거래소와 같은 판정 · 같은 말) · 인벤 그대로', zOn.spoiled.note.slice(0, 90));
  const want = +(10 * zOn.wilt.kc / DAY * 0.5).toFixed(3);
  ok(zOff.wilt.du === 10 && near(zOn.wilt.du, want, 0.0011), '③ 시든 것(f 0.5) — 끔 = 10단위 · 켬 = 열량 × 신선도', `켬 ${zOn.wilt.du} = 10 × ${zOn.wilt.kc} ÷ ${DAY} × 0.5`);
  ok(!zOnLot0.err && zOnLot0.wilt.du === zOn.wilt.du && zOnLot0.spoiled.du === zOn.spoiled.du, '③ [T778 끔 탐침] 순간 로트 끔(`T732_MOMENT_LOT=0`)에서도 같은 단위(시든 것 · 상한 것)', `${zOnLot0.wilt && zOnLot0.wilt.du} · ${zOnLot0.spoiled && zOnLot0.spoiled.du}`);
}

say('\n④ 안 썩는 재료 — 30일 묵힌 것');
{
  const ids = Object.keys(zOn.noRot);
  pre(ids.length > 0, '출처 표가 비어 있지 않다', ids.length);
  const offBad = ids.filter((it) => { const r = zOff.noRot[it].api; return !(r.isLot && r.stage === 'spoiled' && r.guard && r.units === 0); });
  ok(offBad.length === 0, '④ 끔 — 열둘 다 로트 · 30일 뒤 **상함**(특산 기본 보관일 5일) · 거절 · 거래 단위 0 — 구멍이 그대로(main)', offBad.join(',') || `${ids.length}종`);
  const onBad = ids.filter((it) => { const r = zOn.noRot[it]; return [r.api, r.save].some((x) => x.isLot || x.stage || x.guard || x.units !== 10 || x.inv !== 10); });
  const fe = zOn.noRot.feather;
  ok(onBad.length === 0 && fe && fe.api.units === 10 && fe.save.units === 10, '★★④ 켬 — **깃털 30일 뒤 그대로**(로트 아님 · 화면 신선도 칸 없음 · 거래 단위 10 = 갓 얻은 것 · 거절 없음) · 열둘 다',
    onBad.join(',') || `깃털 ${JSON.stringify(fe.api)}`);
  ok(onBad.length === 0, '④ 켬 — 켜기 전에 얻어 저장에 남은 로트 레코드도 안 읽는다(나이가 뜻이 없다)', `${ids.length}종`);
  const diff = Object.keys(zOn.isLot).filter((it) => zOn.isLot[it] !== zOff.isLot[it]);
  const extra = diff.filter((it) => !zOn.noRot[it]), missing = ids.filter((it) => !diff.includes(it));
  ok(extra.length === 0 && missing.length === 0, '★④ 두 판의 로트 여부 차이 = 출처 표 열둘뿐 — 먹을 것·작물·씨앗·생가죽은 그대로', `다름 ${diff.length}종 · 표 밖 ${extra.join(',') || 0} · 빠짐 ${missing.join(',') || 0}`);
  ok(zOn.coreNoRot.length === 0, '④ 출처 표 ∩ 로트 핵심(`LOT_CORE` — 먹을 것·작물·씨앗) = 0');
  ok(zOff.isLot.hide === false && zOn.isLot.hide === false, '④ 생가죽(`hide`)은 두 판 다 로트가 아니다 — 출처는 "썩는다"(무두질 전) · 넓히기는 재민 칸(이 카드는 좁히기만)');
}

say('\n⑤ 배선');
{
  const fnOf = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  const f = fnOf(ZSRC, 'tryVillageDeposit');
  //   ★[T732] 환산 콜백은 한 줄 위에서 `_uo` 로 한 번 만든다(곳간 문이 **같은** 콜백으로 낸 로트에 무게를 매긴다 — 둘이 다른 환산이면 사본)
  const g = f.indexOf('if (T725_HALL) {'), s = f.indexOf('_spoiledGuardItems('), u = f.indexOf('const _uo = T725_HALL ? _unitsOfFor(player) : undefined;'), d = f.search(/SimVillages\.playerVillageDeposit\(vil, player\.inventory, want \|\| \{\}, _uo\)/), c = f.indexOf('Carry.takeKg(');
  ok(g > 0 && s > g && u > s && d > u && c > d && /if \(T725_HALL\) \{ for \(const \[it, n\] of Object\.entries\(r\.taken/.test(f),
    '★⑤ 회관 문 — 상한 것 판정 → 정본 넣기(끄면 `undefined` = 종전 개수) → 낸 개체 빼기 · 셋 다 손잡이 뒤 · 같은 함수(`_spoiledGuardItems` · `_unitsOfFor` · `Carry.takeKg`)');
  ok(/_t732DoorEnd\(_d732, player, !!\(r && r\.ok\), vil, _uo\);/.test(f) && f.indexOf('_t732DoorBegin(') < d && f.indexOf('_t732DoorEnd(') > d,
    '⑤ 곳간 문(T732 · 끔 기본 — T716 임시 고침을 걷은 자리)도 같은 무게(`_uo`)로 — 끄면 `undefined` = 종전 개수 그대로');
  const il = fnOf(LSRC, 'isLot');
  ok(il.indexOf('LOT_CORE.has(item)') > 0 && il.indexOf('if (T725_KINDS && NO_ROT[item]) return false;') > il.indexOf('LOT_CORE.has(item)'),
    '⑤ `isLot` — 로트 핵심 다음 · 특산 규칙 앞에서 출처 표만 뺀다(손잡이 뒤)');
  const LS = require(SV('lots.js'));
  const srcs = Object.entries(LS.NO_ROT || {});
  ok(srcs.length > 0 && srcs.every(([, v]) => typeof v === 'string' && /\(.+\)/.test(v)), '⑤ 출처 표 — 줄마다 출처(괄호 안 문헌)', `${srcs.length}줄`);
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
