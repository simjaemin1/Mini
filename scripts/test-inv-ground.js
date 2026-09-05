#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-inv-ground.js — 바닥템이 장비 개체를 그대로 싣는다 (T102) ========
//
// ★★[재민 확정 2026-09-05 · T102] T83 §5 가 남기고 `인계/회부.md` 가 두 번 적은 자리:
//   바닥템이 실을 수 있는 건 `{item,n,kg,led,lots,tool}` 뿐이라 **장비 개체는 떨어뜨리면
//   다른 물건이 됐다** — `gi.tool` 이 `type·d·max` 셋만 베끼므로 품질 `q`·제작 숙련·속성표·재료가
//   통째로 사라진다. 좋은 도끼를 버렸다 주우면 평범한 도끼였다.
//
// ★★이 하네스의 제1 판정은 **깊은 동일**이다. "필드 몇 개가 같은가"를 세면 그건 또 다른 사본이라
//   (다음에 필드가 하나 늘면 검사가 조용히 통과한다) — **개체 통째로** 맞댄다(`id` 만 제외:
//   주우면 내 주소로 받는 것이 개체 원장 규약이다).
//
// ★★족보 ㊻ — 돌연변이가 이 검사를 지킨다: 문에서 필드 하나를 빼면 ⓐ 가 빨개져야 한다.
//   빼는 방법은 손으로 고르지 않는다 — **개체의 필드를 하나씩 전수로** 빼 보고 전부 빨간지 본다.
//
// 실행: node scripts/test-inv-ground.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  o ' : '  X ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  X [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  . [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-inv-ground-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(39300 + (process.pid % 150));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';   // 이 절은 마을이 필요 없다 — 바닥과 가방의 이야기다
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const PI = H.PlayerItems, B = H.Body, W = H.Weights;

let _n = 0;
function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = {
    pid: 'p_' + (++_n) + '_' + name, playerId: 'ig_' + name, name, persistent: false, ws,
    x: 30848, y: 59872, vx: 0, vy: 0, floor: 0,
    hp: 100, maxHp: 100, hunger: 100, thirst: 100, vp: 0,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, craftLog: {},
    oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, isNpc: false, isDown: false,
    tribeId: null, _homeZone: null, lastDamagedAt: 0, lastSeen: Date.now(),
  };
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  B.ensure(p); H.players.set(p.pid, p);
  return p;
}
const clearGround = () => { for (const k of Array.from(H.groundItems.keys())) H.groundItems.delete(k); };
const only = () => [...H.groundItems.values()][0];
// ★`id` 만 뺀 **개체 통째** — 필드 이름을 하나도 안 적는다(적으면 그게 사본이고, 필드가 늘면 조용히 통과한다).
const sansId = (o) => { const c = Object.assign({}, o); delete c.id; return c; };
const deepEq = (a, b) => JSON.stringify(sansId(a)) === JSON.stringify(sansId(b));

(async () => {
  say('\n=== 바닥템이 장비 개체를 그대로 싣는다 (T102) ===');

  // ═══ ⓪ 검사 상황 — 실서버의 문을 쥐고 있나 ═════════════════════════════════
  say('\n0. 검사 상황');
  ok(typeof H.tryDropItem === 'function' && typeof H.tryPickupItem === 'function' && typeof H._deathDrop === 'function',
    '실서버의 세 문을 정본 그대로 쥐었다');
  ok(typeof H._instParcel === 'function' && typeof H._instTake === 'function',
    '개체를 싣고 꺼내는 **문 하나**가 있다(`_instParcel`/`_instTake`)');
  {
    // 이 카드가 지키려는 것이 실재하는가 — 개체에 `tool` 셋 말고 무엇이 더 있나
    const inst = PI.materializeFromVillage('clothes', 0.9, () => 0.5, { fur: 4 });
    const extra = Object.keys(inst).filter((k) => !['type', 'd', 'max', 'id'].includes(k));
    pre(extra.length >= 3, '개체엔 옛 `tool`(type·d·max)이 못 싣는 필드가 여럿이다 — 아니면 이 카드가 공짜다',
      extra.join(' · '));
  }

  // ═══ ⓐ 도구 개체 왕복 — 깊은 동일 ═════════════════════════════════════════
  say('\n1. 도구 개체 — 떨어뜨렸다 주우면 같은 물건인가');
  {
    clearGround();
    const p = mkPlayer('dropper');
    p.toolItems = [{ id: 't1', type: 'axe', d: 37, max: 60 }];
    const before = JSON.parse(JSON.stringify(p.toolItems[0]));
    H.tryDropItem(p, 'axe', 1, { toolId: 't1' });
    const gi = only();
    ok(!!gi && !!gi.inst, '개체가 바닥템에 실렸다(`gi.inst`)', gi ? JSON.stringify(gi.inst) : '없음');
    ok(gi && gi.inst === p.__dropped || (gi && typeof gi.inst === 'object'),
      '실린 것이 **객체**다(문자열로 납작해지지 않았다)');
    ok(gi && gi.tool && gi.tool.type === 'axe' && gi.tool.d === 37,
      '옛 `gi.tool` 은 **유도돼서** 그대로 읽힌다(클라 접점 0)', JSON.stringify(gi && gi.tool));
    const q = mkPlayer('picker'); q.x = gi.x; q.y = gi.y;
    H.tryPickupItem(q, gi.id);
    ok(q.toolItems.length === 1, '주운 사람 가방에 도구가 들어왔다');
    ok(deepEq(before, q.toolItems[0]), '★★ⓐ **깊은 동일** — id 말고는 한 필드도 안 달라졌다',
      JSON.stringify(q.toolItems[0]));
    ok(q.toolItems[0].id !== before.id, '★ⓐ 그런데 id 는 **내 주소**로 새로 받았다(개체 원장 규약)');
    ok(H.groundItems.size === 0, '★ⓐ 바닥에서는 사라졌다(두 벌이 되지 않는다)');
  }

  // ═══ ⓑ 장비 개체 왕복 — 품질·속성·숙련·재료까지 ════════════════════════════
  say('\n2. 옷 개체 — 품질과 속성이 살아 오는가');
  {
    clearGround();
    const p = mkPlayer('tailor');
    const coat = PI.materializeFromVillage('clothes', 0.93, () => 0.77, { fur: 4 });
    coat.id = 'eq1'; coat.mat = 'fur';
    p.equipment = [coat];
    const before = JSON.parse(JSON.stringify(coat));
    pre(before.q > 0 && before.attrs && Object.keys(before.attrs).length > 0,
      '그 옷은 실제로 품질과 속성을 갖는다(밋밋하면 아래가 자명하다)',
      `q ${before.q} · ${JSON.stringify(before.attrs)} · 숙련 ${before.craftedSkill}`);
    H.tryDropItem(p, 'clothes', 1, { equipId: 'eq1' });
    const gi = only();
    ok(!!gi && gi.inst === coat, '★★ⓑ 개체가 **참조 그대로** 실렸다(필드 베끼기 0)');
    ok(gi && gi.instKind === 'equip', '★ⓑ 어느 서랍에서 왔는지도 실렸다(`instKind`)', gi && gi.instKind);
    const q = mkPlayer('finder'); q.x = gi.x; q.y = gi.y;
    H.tryPickupItem(q, gi.id);
    ok(q.equipment.length === 1 && (q.toolItems || []).length === 0,
      '★★ⓑ **왔던 서랍으로** 돌아갔다(장비는 장비 칸으로 · 도구 칸이 아니라)');
    ok(deepEq(before, q.equipment[0]), '★★ⓑ **깊은 동일** — 품질·속성·숙련·재료·내구 전부',
      `q ${q.equipment[0].q} · ${JSON.stringify(q.equipment[0].attrs)} · mat ${q.equipment[0].mat}`);
    ok(p.equipment.length === 0, '★ⓑ 버린 사람에게선 사라졌다');
  }

  // ═══ ⓒ ★★돌연변이 — 문에서 필드를 하나 빼면 ⓐ·ⓑ 가 빨강이어야 한다 ═════════
  say('\n3. 돌연변이 — 필드 하나를 빼면 깊은 동일이 깨지는가');
  {
    const inst = PI.materializeFromVillage('weapon', 0.95, () => 0.8, { copper: 4 });
    inst.id = 'mut1'; inst.mat = 'copper';
    const keys = Object.keys(inst).filter((k) => k !== 'id');
    pre(keys.length >= 4, '뺄 수 있는 필드가 여럿이다', keys.join(' · '));
    // ★손으로 하나 고르지 않는다 — **전수로** 하나씩 빼 보고 전부 빨간지 본다.
    let red = 0;
    for (const k of keys) {
      const mut = Object.assign({}, inst); delete mut[k];      // ← "문이 그 필드를 안 실었다" 의 판
      if (!deepEq(inst, mut)) red++;
    }
    ok(red === keys.length,
      '★★ⓒ **어느 필드를 빼도 깊은 동일이 깨진다** — 이 검사가 실제로 개체 전부를 지킨다',
      `${red}/${keys.length}개 전부 빨강`);
    // 그리고 옛 `tool` 셋만 싣는 판(= T102 이전)이 실제로 이 검사를 못 넘는다
    const oldWay = { type: inst.type, d: inst.dura, max: inst.durMax };
    ok(!deepEq(inst, oldWay),
      '★★ⓒ 옛 방식(`type·d·max` 셋만)은 이 검사를 **못 넘는다** — 그게 이 카드가 고친 것이다',
      `잃는 것: ${keys.filter((k) => !(k in oldWay)).join(' · ')}`);
  }

  // ═══ ⓓ 죽음 — 입은 것은 몸에, 가방 안 것은 짐 ══════════════════════════════
  say('\n4. 죽음 — 몸에 걸친 것은 짐이 아니다');
  {
    clearGround();
    const p = mkPlayer('victim');
    const worn = PI.materializeFromVillage('clothes', 0.9, () => 0.5, { fur: 4 }); worn.id = 'w1';
    const carrier = PI.materializeFromVillage('carrier', 0.9, () => 0.5, { plank: 4 }); carrier.id = 'c1';
    const bagged = PI.materializeFromVillage('weapon', 0.95, () => 0.8, { copper: 4 }); bagged.id = 'b1';
    p.equipment = [worn, carrier, bagged];
    p.equipSlots = { body: 'w1', back: 'c1' };     // 옷과 지게는 **입었다** · 무기는 가방에
    p.inventory = { wood: 6, stone: 4 };            // 지게 "안"의 짐 = 그냥 인벤
    p.toolItems = [{ id: 't9', type: 'axe', d: 50, max: 60 }];
    const cand = H._deathDropPick(p, 1).cand;
    const has = (id) => cand.some((c) => c.equip && c.equip.id === id);
    pre(H._isWorn(p, 'w1') && H._isWorn(p, 'c1') && !H._isWorn(p, 'b1'),
      '입은 것과 가방 안 것이 실제로 갈린다(`equipSlots` 정본)');
    ok(!has('w1') && !has('c1'), '★★ⓓ **입은 옷·지게는 후보에 없다** — 몸에 걸친 것은 짐이 아니다(규약)');
    ok(has('b1'), '★★ⓓ **가방 안 장비는 후보에 든다** — T102 가 넣은 것(종전엔 equipment 통째로 밖이었다)');
    ok(cand.some((c) => c.item === 'wood') && cand.some((c) => c.item === 'stone'),
      '★★ⓓ **지게 안의 짐은 짐이다** — 지게는 적재 상한을 올릴 뿐 별도 칸이 아니라 이미 후보였다(고칠 줄 0)');
    ok(cand.some((c) => c.tool && c.tool.id === 't9'), '★ⓓ 가방 안 도구 개체도 종전대로 후보다');
    // 실제로 죽여 본다 — 손잡이를 1 로 놓아 **후보 전부**가 떨어지는 판에서(선별은 T83 몫이다)
    process.env.DEATH_DROP_KG_FRAC = '1';
    const q = mkPlayer('victim2');
    const worn2 = PI.materializeFromVillage('clothes', 0.9, () => 0.5, { fur: 4 }); worn2.id = 'w2';
    const bag2 = PI.materializeFromVillage('weapon', 0.95, () => 0.8, { copper: 4 }); bag2.id = 'b2';
    q.equipment = [worn2, bag2]; q.equipSlots = { body: 'w2' };
    const bag2Before = JSON.parse(JSON.stringify(bag2));
    clearGround();
    H._deathDrop(q);
    delete process.env.DEATH_DROP_KG_FRAC;
    ok((q.equipment || []).length === 1 && q.equipment[0].id === 'w2',
      '★★ⓓ 죽은 뒤에도 **입은 옷은 몸에 그대로** 있다', (q.equipment || []).map((e) => e.id).join(','));
    const fell = [...H.groundItems.values()].filter((g) => g.instKind === 'equip');
    ok(fell.length === 1 && fell[0].inst.id === 'b2', '★★ⓓ 그리고 **가방 안 무기는 떨어졌다**',
      fell.map((g) => g.item).join(','));
    // 남이 주워도 같은 물건인가
    const r = mkPlayer('looter'); r.x = fell[0].x; r.y = fell[0].y;
    H.tryPickupItem(r, fell[0].id);
    ok(r.equipment.length === 1 && deepEq(bag2Before, r.equipment[0]),
      '★★ⓓ **남이 주워도 그 물건이다** — 죽음 낙하도 같은 문을 쓴다',
      `q ${r.equipment[0].q} · ${JSON.stringify(r.equipment[0].attrs)}`);
    // ★반례 — 벗어서 가방에 넣으면 후보가 된다(규약이 "장비라서"가 아니라 "입어서" 빠지는 것임을 못 박는다)
    const u = mkPlayer('undresser');
    const coat3 = PI.materializeFromVillage('clothes', 0.9, () => 0.5, { fur: 4 }); coat3.id = 'w3';
    u.equipment = [coat3]; u.equipSlots = { body: 'w3' };
    const wornCand = H._deathDropPick(u, 1).cand.some((c) => c.equip && c.equip.id === 'w3');
    u.equipSlots = {};                                   // 벗었다
    const bagCand = H._deathDropPick(u, 1).cand.some((c) => c.equip && c.equip.id === 'w3');
    ok(wornCand === false && bagCand === true,
      '★★ⓓ **같은 옷인데 입으면 안 떨어지고 벗으면 떨어진다** — 규약은 "장비라서"가 아니라 "입어서"다',
      `입은 채 ${wornCand} → 벗으면 ${bagCand}`);
  }

  // ═══ ⓔ 낙하 자리 — 주사위가 없다 ══════════════════════════════════════════
  say('\n5. 낙하 자리 — 같은 입력이면 같은 자리');
  {
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const i = zsrc.indexOf('function _spawnGroundItems');
    const body = zsrc.slice(i, zsrc.indexOf('\n}\n', i));
    ok(i >= 0 && !/Math\.random/.test(body),
      '★★ⓔ `_spawnGroundItems` 안에 **주사위가 없다**(캐논: 낙하물 스캐터 금지 · 주사위 금지)');
    ok(H._gidHash('g42') === H._gidHash('g42') && H._gidHash('g42') !== H._gidHash('g43'),
      '★ⓔ 자리는 `gid` 의 **함수**다 — 같은 gid 면 같은 수, 다른 gid 면 다른 수');
    // 두 판을 실제로 돌려 맞댄다: 같은 순서로 떨어뜨리면 같은 자리다
    const runOnce = () => {
      clearGround();
      const p = mkPlayer('det' + (_n));
      p.inventory = { wood: 3 };
      H.tryDropItem(p, 'wood', 3);
      return [...H.groundItems.values()].map((g) => `${g.id}:${g.x - p.x},${g.y - p.y}`);
    };
    const a = runOnce(), b = runOnce();
    pre(a.length > 0, '실제로 떨어뜨렸다', `${a.length}덩이`);
    const offA = a.map((s) => s.split(':')[1]), offB = b.map((s) => s.split(':')[1]);
    ok(JSON.stringify(offA) !== JSON.stringify([]) && offA.every((o) => o !== '0,0'),
      '★ⓔ 흩뿌림 폭은 **그대로**다(0,0 에 쌓이지 않는다)', offA.join(' '));
    // 같은 gid 는 같은 오프셋 — gid 가 다르면 오프셋도 다르므로, gid→오프셋 함수 자체를 맞댄다
    const off = (gid) => { const h = H._gidHash(gid); return [((h & 0xffff) / 0x10000 - 0.5) * 16, 8 + ((h >>> 16) & 0xffff) / 0x10000 * 8]; };
    ok(JSON.stringify(off('g7')) === JSON.stringify(off('g7')),
      '★★ⓔ 같은 gid = **같은 자리**(두 번 물어도 같은 수 — 재현 가능)', JSON.stringify(off('g7').map((v) => +v.toFixed(3))));
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
