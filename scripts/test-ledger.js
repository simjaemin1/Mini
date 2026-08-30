#!/usr/bin/env node
// === scripts/test-ledger.js — 개체 kg 원장 승격 서버 E2E ==========================
//
// ★[재민 확정 2026-08-30 · 정비 배치 §2-A] 인벤·바닥 목록 비대칭의 **뿌리**를 재는 하네스다.
//   비대칭의 실체는 UI 가 아니라 자료구조였다:
//     · 바닥 = 드롭 인스턴스 배열({id,item,count,kg}) — 개체마다 주소가 있다
//     · 인벤 = 품목→개수 **스칼라 맵** — 주소가 없다. `kgLedger` 는 있었지만 **수의 배열**이라
//       FIFO 로 앞에서만 꺼낼 수 있었고, "2kg 물고기를 골라 버린다"가 구조적으로 불가능했다.
//   이 하네스는 그 불가능이 **없어졌는지**를 판정한다.
//
// ★★족보 준수:
//   · 픽스처를 손으로 빚지 않는다 — 바닥템은 정본 `tryDropItem` 이 낳고 `tryPickupItem` 이 거둔다.
//   · "변하는가"를 재는 절은 **변할 수 있는 상황인지 먼저 assert** 한다(검사 상황 선행 assert).
//   · 불변식은 `CARRY_ASSERT_THROW=1` 로 **던지게** 해서 조용한 통과를 막는다.
//
// 실행: node scripts/test-ledger.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);

const TMP = `/tmp/test-ledger-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37200 + (process.pid % 190));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★불변식이 어긋나면 **던진다** — 하네스가 조용히 통과하는 길을 막는다.
process.env.CARRY_ASSERT_THROW = '1';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const W = H.Weights, C = H.Carry, L = H.Lots;

function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'test_' + name, name, persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
    oreLedger: {}, oreCarry: {}, ws, isNpc: false, isDown: false, vx: 0, vy: 0 };
  p.__msgs = msgs;
  p.__last = (t) => [...msgs].reverse().find((m) => m.type === t) || null;
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  return p;
}
// 바닥에서 이 플레이어 근처 것만 (정본 지도를 읽는다 — 사본 안 만든다)
const nearGround = (p) => [...H.groundItems.values()].filter((g) => Math.hypot(g.x - p.x, g.y - p.y) <= 100);
const clearGround = () => { for (const k of [...H.groundItems.keys()]) H.groundItems.delete(k); };

(async () => {
  say('\n=== 개체 kg 원장 승격 (서버 정본 E2E) ===');

  // ── ① 원장 항목 id · 임의 제거 · 특정 개체 드롭 ───────────────────────────
  say('\n① 주소가 있는가 — id 로 지목해 그 개체만 빠지는가');
  {
    clearGround();
    const p = mkPlayer('a');
    // 정본 경로로만 개체를 만든다(낚시가 쓰는 그 함수).
    C.noteInstance(p, 'fish', 2.0, 3);
    C.noteInstance(p, 'fish', 0.4, 3);
    C.noteInstance(p, 'fish', 1.1, 3);
    p.inventory.fish = 3;
    C.reconcile(p, p.inventory);
    const ent = C.entries(p, 'fish');
    ok(ent.length === 3, '원장 항목 3개', ent.map((e) => e.kg).join('/'));
    ok(ent.every((e) => Number.isFinite(e.id)), '모든 항목에 id 가 있다', ent.map((e) => e.id).join(','));
    ok(new Set(ent.map((e) => e.id)).size === 3, 'id 가 서로 다르다');

    // ★검사 상황 선행 assert — 2.0kg 는 **맨 앞이 아니다**(FIFO 로는 못 꺼내는 자리여야 의미가 있다)
    const target = ent.find((e) => e.kg === 2.0);
    const idx = ent.indexOf(target);
    ok(idx === 0, "(상황) 2.0kg 가 원장 맨 앞 — 그래서 한가운데 것을 고르면 FIFO 와 구별된다", `idx=${idx}`);
    const mid = ent[1];   // 0.4kg — 한가운데. FIFO 라면 절대 안 나온다.
    const before = C.totalKg(p);
    H.tryDropItem(p, 'fish', 1, { ids: [mid.id] });
    const after = C.entries(p, 'fish');
    ok(after.length === 2, '지목 뒤 원장 2개', after.map((e) => e.kg).join('/'));
    ok(!after.some((e) => e.id === mid.id), '★지목한 그 id 가 빠졌다 (FIFO 강제 해제)');
    ok(after.some((e) => e.kg === 2.0) && after.some((e) => e.kg === 1.1), '나머지 둘은 그대로');
    ok(p.inventory.fish === 2, '스칼라도 1 줄었다', p.inventory.fish);
    const g = nearGround(p);
    ok(g.length === 1 && g[0].item === 'fish' && g[0].count === 1, '바닥에 물고기 1덩이', g.length);
    ok(Math.abs(g[0].kg - 0.4) < 1e-6, '★그 kg 만 빠져 바닥에 놓였다', `${g[0].kg}kg`);
    ok(Math.abs((before - C.totalKg(p)) - 0.4) < 1e-6, '총 무게가 정확히 0.4kg 줄었다',
       `${before.toFixed(3)} → ${C.totalKg(p).toFixed(3)}`);
  }

  // ── ② 불변식: 모든 변경 경로 스윕 후 Σ원장 == 스칼라 ──────────────────────
  say('\n② 불변식 — 모든 변경 경로를 쓸어도 Σ원장 == 스칼라');
  {
    clearGround();
    const p = mkPlayer('b');
    const inv = () => Math.max(0, Math.floor(p.inventory.fish || 0));
    const led = () => C.entries(p, 'fish').length;
    const paths = [];
    // ★쓸개(reconcile) **전후를 따로** 잰다. 전(前)이 어긋나면 그 경로가 원장을 안 건드린 것이고,
    //   후(後)만 맞는 건 "쓸개가 뒤에서 잘라 메웠다" = 어느 개체의 kg 이 사라졌는지 임의라는 뜻이다.
    const step = (name, fn, clean) => { fn(); const pre = led(), pi = inv(); C.reconcile(p, p.inventory); paths.push([name, inv(), led(), pre === pi, !!clean]); };

    step('취득(낚시 경로)', () => { for (let i = 0; i < 5; i++) C.noteInstance(p, 'fish', 0.3 + i * 0.4, 3); p.inventory.fish = 5; });
    step('드롭(수량)',      () => H.tryDropItem(p, 'fish', 1), true);
    step('드롭(지목)',      () => H.tryDropItem(p, 'fish', 1, { ids: [C.entries(p, 'fish')[1].id] }), true);
    step('바닥 줍기',       () => { const g = nearGround(p)[0]; H.tryPickupItem(p, g.id); }, true);
    step('원장 없이 증가',  () => { p.inventory.fish = (p.inventory.fish || 0) + 3; });   // ★쓸개가 메워야 한다
    step('원장 없이 감소',  () => { p.inventory.fish = Math.max(0, (p.inventory.fish || 0) - 2); });
    step('소비 정본(consumeItem)', () => H.consumeItem(p, 'fish', 1), true);   // 먹기·요리 투입·제작 투입·상자 넣기가 전부 이 함수를 쓴다
    step('거래 소비 경로',  () => { C.takeKg(p, 'fish', 1); p.inventory.fish -= 1; });
    step('전량 소진',       () => { const n = inv(); C.takeKg(p, 'fish', n); p.inventory.fish = 0; delete p.inventory.fish; });

    let bad = 0, dirty = 0;
    for (const [name, i, l, preOk, clean] of paths) {
      const good = (i === 0) ? (l === 0) : (l === i);
      if (!good) bad++;
      if (clean && !preOk) dirty++;
      ok(good, `  ${name}: 인벤 ${i} · 원장 ${l}${clean ? (preOk ? ' · 쓸개 이전에 이미 정합' : ' · ★쓸개가 메웠다(누수)') : ''}`);
    }
    ok(bad === 0, `★변경 경로 ${paths.length}종 전부 불변식 유지`, `어긋남 ${bad}`);
    ok(dirty === 0, '★정본 경로는 쓸개 **이전에** 이미 정합하다 — 쓸개는 안전망이지 정본이 아니다', `누수 ${dirty}`);
    // 던지기 모드가 실제로 켜져 있는지 — 켜지지 않았다면 위 통과는 의미가 없다(검사 상황 선행 assert)
    let threw = false;
    try { C.assertInvariant({ kgLedger: { fish: [{ id: 1, kg: 1 }] } }, { fish: 5 }, 'selftest'); }
    catch (e) { threw = true; }
    ok(threw, '★(상황) 불변식 assert 가 실제로 던진다 — 안 던지면 위 판정이 무의미하다');
  }

  // ── ③ 드롭 → 재획득 kg 왕복 보존 ─────────────────────────────────────────
  say('\n③ 왕복 보존 — 2kg 물고기를 버렸다 주우면 2kg 로 돌아오는가');
  {
    clearGround();
    const p = mkPlayer('c');
    C.noteInstance(p, 'fish', 2.0, 3); C.noteInstance(p, 'fish', 0.35, 3);
    p.inventory.fish = 2; C.reconcile(p, p.inventory);
    const std = W.kgOfOrDefault('fish');
    ok(Math.abs(std - 2.0) > 0.05, '(상황) 표준 kg 와 2.0kg 가 다르다 — 같으면 왕복을 못 잰다', `표준 ${std}kg`);
    const before = C.totalKg(p);
    const heavy = C.entries(p, 'fish').find((e) => e.kg === 2.0);
    H.tryDropItem(p, 'fish', 1, { ids: [heavy.id] });
    const g = nearGround(p)[0];
    ok(!!g && Array.isArray(g.led) && g.led.length === 1, '바닥템이 개체를 싣고 있다', JSON.stringify(g && g.led));
    H.tryPickupItem(p, g.id);
    const back = C.entries(p, 'fish');
    ok(back.length === 2, '원장이 2개로 복귀', back.map((e) => e.kg).join('/'));
    ok(back.some((e) => Math.abs(e.kg - 2.0) < 1e-6), '★2.0kg 그대로 돌아왔다 (표준으로 뭉개지지 않았다)');
    ok(Math.abs(C.totalKg(p) - before) < 1e-6, '총 무게 왕복 보존', `${before.toFixed(3)} → ${C.totalKg(p).toFixed(3)}`);
  }

  // ── ④ 무기한 벌크는 원장을 만들지 않는다 (3층 캐논) ────────────────────────
  say('\n④ 3층 캐논 — 무기한 벌크는 원장이 없다(펼칠 것이 없는 게 정상)');
  {
    clearGround();
    const p = mkPlayer('d');
    p.inventory.twig = 10;
    ok(!L.isLot('twig'), '(상황) 잔가지는 로트 품목이 아니다 — 벌크가 맞다');
    C.reconcile(p, p.inventory);
    ok(!C.hasLedger(p, 'twig'), '취득만으로는 원장이 안 생긴다');
    H.tryDropItem(p, 'twig', 4);
    const g = nearGround(p);
    ok(g.length === 1 && g[0].count === 4, '벌크는 한 덩이로 떨어진다(낱개로 안 쪼갠다)', `${g.length}덩이`);
    ok(!g[0].led, '바닥템에도 개체 목록이 없다');
    H.tryPickupItem(p, g[0].id);
    ok(!C.hasLedger(p, 'twig'), '★버렸다 주워도 원장이 안 생긴다 (옛 결함: 무조건 만들었다)');
    ok(p.inventory.twig === 10, '수량은 온전', p.inventory.twig);
    const view = C.viewLedger(p, p.inventory);
    ok(!view.twig, 'UI 페이로드에도 안 실린다 → 클라가 ▶ 를 그릴 재료가 없다');
  }

  // ── ⑤ 로트 품목 펼침 데이터 정합(취득일 순) ───────────────────────────────
  say('\n⑤ 로트 펼침 — 취득일이 다른 몫이 따로 서고, 지목해서 버릴 수 있는가');
  {
    clearGround();
    const p = mkPlayer('e');
    ok(L.isLot('berry'), '(상황) 베리는 로트 품목이다');
    L.note(p, 'berry', 3, 10);
    L.note(p, 'berry', 2, 14);
    p.inventory.berry = 5;
    const day = 16;
    const v = L.viewAll(p, p.inventory, day);
    ok(!!v.berry && v.berry.length === 2, '로트 2줄', v.berry && v.berry.length);
    ok(v.berry[0].day === 10 && v.berry[1].day === 14, '★오래된 것부터 정렬', v.berry.map((x) => x.day).join('<'));
    ok(v.berry[0].ageDays === 6 && v.berry[1].ageDays === 2, '나이는 (오늘−취득일)', v.berry.map((x) => x.ageDays).join('/'));
    ok(v.berry.reduce((s, x) => s + x.n, 0) === 5, 'Σ로트 == 스칼라', p.inventory.berry);
    // 지목 드롭 — **새 로트(14일)만** 버린다. FIFO 라면 10일 것이 나간다.
    H.tryDropItem(p, 'berry', 2, { lotDay: 14 });
    const v2 = L.viewAll(p, p.inventory, day);
    ok(p.inventory.berry === 3, '스칼라 3', p.inventory.berry);
    ok(!!v2.berry && v2.berry.length === 1 && v2.berry[0].day === 10,
       '★지목한 새 로트만 빠졌다 (FIFO 였다면 10일 것이 나갔다)', JSON.stringify(v2.berry));
  }

  // ── ⑥ 저장 왕복 — 재접속을 넘어 개체가 살아남는가 ─────────────────────────
  say('\n⑥ 저장 왕복 — 개체 kg·id 가 재접속을 넘어 살아남는가');
  {
    const p = mkPlayer('f');
    C.noteInstance(p, 'fish', 2.0, 3); C.noteInstance(p, 'fish', 0.4, 3);
    p.inventory.fish = 2; C.reconcile(p, p.inventory);
    const blob = JSON.parse(JSON.stringify(C.toSave(p)));
    const q = mkPlayer('f2'); q.inventory.fish = 2;
    C.fromSave(q, blob); C.reconcile(q, q.inventory);
    const a = C.entries(p, 'fish').map((e) => e.kg).sort();
    const b = C.entries(q, 'fish').map((e) => e.kg).sort();
    ok(JSON.stringify(a) === JSON.stringify(b), '★kg 가 그대로 복원', JSON.stringify(b));
    // 복원 뒤 새 개체를 넣어도 id 가 안 겹친다(카운터 되짚기)
    C.noteInstance(q, 'fish', 1.0, 4); q.inventory.fish = 3;
    const ids = C.entries(q, 'fish').map((e) => e.id);
    ok(new Set(ids).size === ids.length, '★복원 뒤 새 항목의 id 가 안 겹친다', ids.join(','));
    // 옛 저장(수의 배열)도 올라온다
    const r = mkPlayer('f3'); r.inventory.fish = 2;
    C.fromSave(r, { fish: [1.5, 0.6] });
    const re = C.entries(r, 'fish');
    ok(re.length === 2 && re.every((e) => Number.isFinite(e.id)), '★옛 저장(수의 배열)이 항목 모양으로 승격', JSON.stringify(re));
    ok(Math.abs(C.peekKg(r, 'fish', 2) - 2.1) < 1e-6, '승격해도 무게는 같다', C.peekKg(r, 'fish', 2));
  }

  // ── ⑦ 페이로드 실측 — 200마리 낚시 후 원장이 얼마나 무거운가(대리 지표) ──────
  say('\n⑦ 페이로드 실측 — 원장 항목 수 상한(§5 대리 지표)');
  {
    const p = mkPlayer('g');
    for (let i = 0; i < 200; i++) C.noteInstance(p, 'fish', +(0.2 + Math.random() * 2.2).toFixed(3), 3);
    p.inventory.fish = 200;
    C.reconcile(p, p.inventory);
    const view = C.viewLedger(p, p.inventory);
    const bytes = Buffer.byteLength(JSON.stringify({ type: 'inventory', inventory: p.inventory, ledger: view, lots: {} }), 'utf8');
    const perEntry = bytes / 200;
    say(`     200마리 원장 페이로드 = ${bytes} B (항목당 ${perEntry.toFixed(1)} B)`);
    ok(bytes < 32 * 1024, '★인벤 메시지 < 32KB — 압축 없이 견딘다', `${(bytes / 1024).toFixed(1)}KB`);
    ok(view.fish.length === 200, '항목이 안 잘린다', view.fish.length);
  }

  say(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
