#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-downed.js — 쓰러짐·구조·업기·사망 (서버 정본) ==================
//
// ★★[재민 확정 2026-09-02 · T43 · §12] T44 로 HP 가 실제로 0 에 닿는 세계가 됐다. 그 다음이 이것이다.
//   *"쓰러짐 = HP 0 하나. 원인 표지 없음 — 원인은 쓰러진 몸의 상태 그 자체."*
//   *"구조 창 3분(실시간, 야생). 구조 자체는 '옆에서 N초 붙들기' 하나."*
//   *"마을 안 불사 — 창이 끝나도 마을 사람이 옮긴다. 죽음은 야생에서만."*
//
// ★★이 하네스가 생기기 전까지 **downed 를 판정하는 줄이 레포에 0개였다**(죽음 설계 §0-ⓐ-3).
//   `isDown` 은 다섯 하네스에서 **픽스처 초기값**(`isDown:false`)으로만 등장했다. 회귀 가드가 없었다.
//
// ★★제1 규약 — **픽스처가 검사 대상을 오염시키지 않는지 먼저 본다**(족보 ㊻).
//   · 쓰러뜨릴 땐 정본 피해 경로(`damagePlayer`)만 쓴다. `p.isDown = true` 를 손으로 안 켠다.
//   · 마을/야생을 가를 땐 **게임이 답하는 값**(`SimVillages.shelterAt`)으로 자리를 찾는다.
//   · "빈 배열이 안 나온다"는 **정말 옵션이 0 이 될 조건**(사유지·길드·귀향점 전무)에서만 뜻이 있다.
//
// 실행: node scripts/test-downed.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);

const TMP = `/tmp/test-downed-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37200 + (process.pid % 150));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';     // ★마을 반경 술어를 재려면 마을이 서 있어야 한다
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★시간 손잡이만 줄인다 — 창 3분·붙들기 5초·깨어남 2분을 하네스가 기다릴 수는 없다.
//   ⚠**값의 뜻은 안 바꾼다**: 줄인 건 시간뿐이고 사슬(창→이송/사망→깨어남)은 그대로다.
process.env.DOWN_RESCUE_WINDOW_MS = process.env.DOWN_RESCUE_WINDOW_MS || '3000';
//   ★붙들기는 **틱 간격보다 길게** 잡는다 — 1초로 두면 첫 틱에 이미 끝나 "업힌 동안"을 못 잰다
//     (초안이 그래서 "게이지가 멎는다"를 **일어난 뒤**의 몸으로 재고 없는 결함을 냈다).
process.env.DOWN_RESCUE_HOLD_MS = process.env.DOWN_RESCUE_HOLD_MS || '4000';
process.env.DOWN_WAKE_GAMEMIN = process.env.DOWN_WAKE_GAMEMIN || '2';   // 2 게임분 = 2초

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const B = H.Body;
const Carry = H.Carry, Lots = H.Lots, SimVillages = H.SimVillages;

let _pidN = 0;
function mkPlayer(name, x, y) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = {
    pid: 'p_' + (++_pidN) + '_' + name, playerId: 'td_' + name, name, persistent: false, ws,
    x: x != null ? x : 30848, y: y != null ? y : 59872, vx: 0, vy: 0, floor: 0,
    hp: 100, maxHp: 100, hunger: 100, thirst: 100, vp: 0,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, craftLog: {},
    oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, isNpc: false, isDown: false,
    tribeId: null, tribeName: null, _homeZone: null, lastDamagedAt: 0, lastSeen: Date.now(),
  };
  p.__msgs = msgs;
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  B.ensure(p);
  H.players.set(p.pid, p);
  return p;
}
const clearPlayers = () => { for (const k of Array.from(H.players.keys())) H.players.delete(k); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ★틱을 **정본 함수**로 민다(하네스가 사슬을 다시 짜지 않는다). 내부에서 1초 게이트가 돈다.
const tick = async (secs) => { for (let i = 0; i < secs; i++) { await sleep(1050); H.tickDowned(Date.now()); } };
// ★★**"몇 초 기다렸다"가 아니라 "그 일이 났다"로 적는다**(족보 — 무게 배치 교훈의 시간 판).
//   창·깨어남·붙들기가 전부 초 단위라 고정 대기로 재면 경계에서 흔들린다.
const until = async (pred, maxSecs) => {
  for (let i = 0; i < (maxSecs || 20); i++) { await sleep(1050); H.tickDowned(Date.now()); if (pred()) return true; }
  return pred();
};

(async () => {
  say('\n=== 쓰러짐·구조·업기·사망 (T43 · §12) ===');

  // ═══ ⓪ 전제 — 손잡이가 살아 있고 값이 §12 그대로인가 ════════════════════════
  say('\n⓪ 전제 — 손잡이와 채택값');
  ok(H.RESCUE_WINDOW_MS === 3000, '★⓪ 구조 창이 **env 손잡이**다(하네스가 줄여 쓸 수 있다)', `${H.RESCUE_WINDOW_MS}ms`);
  {
    // ★채택값의 근거를 소스에서 확인한다 — "표에 없는 값을 지어내지 마라"의 자리(무게 배치 교훈)
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/DOWN_RESCUE_WINDOW_MS[^\n]*\|\| 180000/.test(zsrc),
      '★★⓪ 채택값 **3분**(§12) — 종전 10초는 근거가 없었고 지금은 주석에 근거가 있다');
    ok(/DOWN_CARRY_PERSON_KG[^\n]*\|\| 60/.test(zsrc), '★⓪ 업는 무게 **60kg**(고증표 성인)');
  }

  // ═══ ① 쓰러짐 = HP 0 **하나** ═══════════════════════════════════════════════
  //   §12: *"쓰러짐 = HP 0 하나. 원인 표지 없음."*
  say('\n① 쓰러짐 — HP 0 하나 · 원인 표지 없음');
  {
    const p = mkPlayer('fall1');
    H.damagePlayer(p, 200, 'fall');
    ok(p.hp === 0 && p.isDown === true && p.downedAt > 0, '★★① 정본 피해로 HP 0 → **쓰러진다**', `hp ${p.hp} · isDown ${p.isDown}`);
    const dn = p.__msgs.filter((m) => m.type === 'player_downed');
    ok(dn.length === 1, '★① 본인에게 `player_downed` 가 한 번 간다', `${dn.length}건`);
    // ★원인 표지가 몸에 안 남는다 — 원인은 몸 상태 그 자체다(§12)
    ok(!('deathCause' in p) && !('downCause' in p), '★★① **원인 표지를 몸에 안 남긴다**(§12 — 원인은 몸 상태다)');
    // 쓰러진 사람은 더 못 맞는다(방어자 보호 — 종전 계약 유지)
    const before = p.hp;
    H.damagePlayer(p, 50, 'mob:wolf');
    ok(p.hp === before, '★① 쓰러진 사람은 **더 안 맞는다**(종전 계약 유지)', `${before} → ${p.hp}`);
  }

  // ═══ ②★ 막다른 골목이 없다 — 옵션이 **절대 안 빈다** ════════════════════════
  //   죽음 설계 §0-ⓐ-1: 사유지·길드·귀향점이 전부 없으면 옵션 배열이 비어 클라가
  //   *"부활 가능한 지점이 없습니다"* 를 띄웠다 — 벗어날 길이 로그아웃뿐인 막다른 골목.
  say('\n② 깨어날 자리 사다리 — 빈 배열 금지');
  {
    const p = mkPlayer('nobody', 30848, 59872);
    pre(!p.tribeId && !p._homeZone, '진짜로 아무것도 없는 몸이다(사유지·길드·귀향점 전무) — 아니면 아래가 자명하다',
      `tribe ${p.tribeId} · home ${p._homeZone}`);
    let mine = 0; for (const c of H.claims.values()) if (c.ownerId === p.playerId) mine++;
    pre(mine === 0, '사유지도 0곳이다', `${mine}곳`);
    const opts = H.listRespawnOptions(p);
    ok(opts.length >= 1, '★★② **옵션이 절대 안 빈다** — 마지막 보루(가장 가까운 마을 도착 지점)가 코드에 있다',
      `${opts.length}개 · ${opts.map((o) => o.kind).join(',')}`);
    ok(opts.some((o) => o.kind === 'shelter'), '★② 그 보루가 **마을 쉼터**다', JSON.stringify(opts[0]));
    const w = H.nearestVillageWake(p.x, p.y);
    ok(w && Number.isFinite(w.x) && Number.isFinite(w.y), '★② 쉼터 좌표를 **마을 정본**에서 얻는다(지어내지 않는다)',
      w ? `${w.name} (${Math.round(w.x)},${Math.round(w.y)})` : 'null');
    ok(w && !H.isWaterTileLocal(w.x, w.y) && !H.isRockTileLocal(w.x, w.y),
      '★★② 그 자리가 **설 수 있는 자리**다(물·바위가 아니다 — 온보딩 도착 지점 재사용)');
  }

  // ═══ ③ 구조 = 옆에서 N초 붙들기 하나 · 낯선 이도 구한다 ══════════════════════
  say('\n③ 구조 — 업기 = 붙들기 · 자격은 소속이 아니다');
  {
    clearPlayers();
    const a = mkPlayer('down_a', 30848, 59872);
    const b = mkPlayer('resc_b', 30848 + 40, 59872);
    a.tribeId = 7; a.tribeName = '가'; b.tribeId = 9; b.tribeName = '나';   // ★서로 **다른 길드**
    H.damagePlayer(a, 200, 'fall');
    pre(a.isDown, '쓰러졌다');
    H.tryRescue(b, a.pid);
    ok(b._carrying === a.pid && a._carriedBy === b.pid,
      '★★③ **낯선 사람도 업는다** — 같은 길드 제한이 사라졌다(§12 "다른 플레이어")');
    // 업는 순간 구조자가 쓰러진 사람의 **상태를 본다**(새 패널 0 · 기존 알림 문법)
    ok(b.__notices().some((t) => /상태 —/.test(t)),
      '★★③ 구조자가 **왜 쓰러졌는지** 본다(§12: 원인은 몸 상태다 · 새 UI 0)',
      JSON.stringify(b.__notices().filter((t) => /상태 —/.test(t))));
    // 업으면 무거워진다 — 소프트 과적 곡선 그대로
    const eff = Carry.effects(b);
    ok(eff.kg >= H.CARRY_PERSON_KG && eff.ratio > 1 && eff.moveMult < 1,
      '★★③ 업으면 **짐이 된다** — 60kg 이 적재에 더해지고 과적 곡선이 그대로 걸린다',
      `${eff.kg}kg / ${eff.cap}kg = ${eff.ratio} · 이속 ×${eff.moveMult}`);
    // 업힌 동안 위치가 따라온다 + 게이지가 멎는다
    b.x += 500; b.y += 300;
    const h0 = a.hunger, t0 = a.thirst;
    await tick(1);
    pre(a.isDown, '아직 업힌 채다(붙들기가 첫 틱에 안 끝났다) — 아니면 아래는 일어난 뒤의 몸을 잰다', `hold ${a._rescueHoldMs}ms`);
    ok(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, '★★③ 업힌 사람은 **따라 움직인다**', `(${Math.round(a.x)},${Math.round(a.y)})`);
    ok(a.hunger === h0 && a.thirst === t0, '★★③ 업힌 동안 **게이지가 멎는다**(§12)', `${h0}/${t0} → ${a.hunger}/${a.thirst}`);
    // N초 붙들면 깨어난다 — ★일어난 **그 순간**에 HP 를 읽는다(자연 회복이 곧 덮어쓴다)
    let hpAtWake = null;
    await until(() => { if (!a.isDown && hpAtWake === null) hpAtWake = a.hp; return hpAtWake !== null; }, 10);
    ok(hpAtWake === Math.round(a.maxHp * H.RESCUE_HP_FRAC),
      '★★③ **N초 붙들면 일어난다 — HP 는 소폭**(§12)', `hp ${hpAtWake} (${H.RESCUE_HP_FRAC})`);
    ok(!b._carrying && !a._carriedBy && Carry.effects(b).kg < H.CARRY_PERSON_KG,
      '★③ 일으키면 등이 비고 무게도 빠진다', `${Carry.effects(b).kg}kg`);
  }
  // ★업고 있던 사람이 **사라지면**(접속 종료·존 이동) 등도 비어야 한다.
  //   안 그러면 그 구조자는 60kg 을 평생 지고 다닌다 — 짐은 사람이 있을 때만 짐이다.
  {
    clearPlayers();
    const a = mkPlayer('gone_a', 30848, 59872);
    const b = mkPlayer('hold_b', 30848 + 40, 59872);
    H.damagePlayer(a, 200, 'fall');
    H.tryRescue(b, a.pid);
    pre(b._carrying === a.pid && Carry.effects(b).kg >= H.CARRY_PERSON_KG, '업은 채다', `${Carry.effects(b).kg}kg`);
    H.players.delete(a.pid);                     // ★접속이 끊긴 것과 같은 자리(정본 맵에서 사라진다)
    await tick(1);
    ok(!b._carrying && Carry.effects(b).kg < H.CARRY_PERSON_KG,
      '★★③ 업고 있던 사람이 사라지면 **등이 빈다** — 60kg 이 남아 평생 비틀거리지 않는다',
      `${Carry.effects(b).kg}kg`);
  }

  // ═══ ④★ 극단 축이 남아 있으면 **다시 눕는다** — 새 규칙 0 (T44 와의 접점) ════
  say('\n④ 일어나도 극단이 남았으면 다시 눕는다 — 새 규칙 0');
  {
    clearPlayers();
    const a = mkPlayer('starve', 30848, 59872);
    const b = mkPlayer('helper', 30848 + 40, 59872);
    a.hunger = 0; a.thirst = 0;                       // ★극단 둘
    pre(B.extremeHpRate(a).rate > 0, '진짜로 극단이다 — 아니면 아래가 자명하다', `${B.extremeHpRate(a).rate.toFixed(5)} HP/게임분`);
    H.damagePlayer(a, 200, 'extreme:hunger+thirst');
    H.tryRescue(b, a.pid);
    await until(() => !a.isDown, 12);
    ok(!a.isDown && a.hp > 0, '★④ 일단은 일어났다', `hp ${a.hp}`);
    ok(B.extremeHpRate(a).rate > 0,
      '★★④ 그런데 **극단은 그대로다** — 먹여 주지 않았으니 당연하다(§12 의 요점)',
      `${B.extremeHpRate(a).rate.toFixed(5)} HP/게임분 · 남은 시간 ${Math.round(a.hp / B.extremeHpRate(a).rate)}초`);
    // ★새 규칙이 없다는 것을 소스로 못 박는다 — "다시 눕히는" 별도 코드가 없어야 한다
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    ok(!/재쓰러짐|reDown|collapseAgain/.test(zsrc),
      '★★④ **다시 눕히는 새 규칙이 코드에 없다** — T44 의 같은 식이 알아서 한다(§12)');
  }

  // ═══ ⑤ 마을 안 불사 — 죽지 않고 쉼터로 옮겨진다 ═════════════════════════════
  say('\n⑤ 마을 안 불사 — 죽음은 야생에서만');
  {
    clearPlayers();
    // ★자리는 **찾는다**(족보 73) — 마을 반경 술어가 답하는 곳으로 간다
    let vspot = null;
    for (const v of (SimVillages.clientVillages() || [])) {
      const x = v.cx * 32 + 16, y = v.cy * 32 + 16;
      if ((SimVillages.shelterAt(x, y) || 0) > 0.5) { vspot = { x, y, name: v.name }; break; }
    }
    pre(!!vspot, '마을 한복판을 찾았다', vspot ? `${vspot.name} (${vspot.x},${vspot.y})` : '못 찾음');
    if (vspot) {
      const p = mkPlayer('villager', vspot.x, vspot.y);
      p.inventory.wood = 5;
      H.damagePlayer(p, 200, 'fall');
      await until(() => !p.isDown, 20);        // 창(3초) 소진 → 이송 → 깨어남(2초)
      ok(!p.isDown, '★★⑤ **마을 안에선 창이 끝나도 죽지 않는다** — 깨어난다', `hp ${p.hp}`);
      ok((p.inventory.wood || 0) === 5, '★★⑤ **짐도 그대로다** — 마을에선 잃지 않는다', `wood ${p.inventory.wood}`);
      ok(B.aftermathLeft(p, H.gameDayNow()) === 0, '★★⑤ 후유증도 없다 — 죽은 게 아니다');
      ok(p.__notices().some((t) => /쉼터|마을 사람/.test(t)), '★⑤ 화면이 "마을 사람들이 옮겼다"고 말한다',
        JSON.stringify(p.__notices().slice(-1)));
      let bundles = 0; for (const g of H.groundItems.values()) if (g.keep) bundles++;
      ok(bundles === 0, '★★⑤ 짐꾸러미가 **안 생긴다**(자명 통과 금지 — 아래 ⑥과 대조군이다)', `${bundles}개`);
    }
  }

  // ═══ ⑥ 야생 사망 — 짐꾸러미 · 후유증 · 스킬 무손실 · 깨어남 ═════════════════
  say('\n⑥ 야생 사망 — 짐은 그 자리에, 이력서는 그대로');
  {
    clearPlayers();
    for (const k of Array.from(H.groundItems.keys())) H.groundItems.delete(k);
    // 야생 = 마을 완충 0 인 자리(게임이 답하는 값으로 찾는다)
    let wild = null;
    for (let r = 3000; r <= 60000 && !wild; r += 5000) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = 30848 + dx * r, y = 59872 + dy * r;
        if (x < 500 || y < 500) continue;
        if ((SimVillages.shelterAt(x, y) || 0) === 0 && !H.isWaterTileLocal(x, y) && !H.isRockTileLocal(x, y)) { wild = { x, y }; break; }
      }
    }
    pre(!!wild, '야생 자리를 찾았다(마을 완충 0)', wild ? `(${wild.x},${wild.y})` : '못 찾음');
    if (wild) {
      const p = mkPlayer('wildman', wild.x, wild.y);
      p.inventory.wood = 4; p.inventory.stone = 3;
      p.toolItems = [{ id: 't1', type: 'axe', d: 37, max: 60 }];
      p.craftSkill = { toolmaking: 12.5 }; p.craftLog = { axe: { n: 3 } };
      Carry.noteInstance(p, 'wood', 1.2, H.gameDayNow());
      const day0 = H.gameDayNow();
      const dx0 = p.x, dy0 = p.y;
      H.damagePlayer(p, 200, 'mob:wolf');
      await until(() => !p.isDown, 20);
      ok(!p.isDown, '★⑥ 창 소진 → 사망 → **게임 시간이 흐른 뒤 깨어난다**', `hp ${p.hp}`);
      ok(Math.hypot(p.x - dx0, p.y - dy0) > 100, '★★⑥ 깨어난 자리는 **죽은 자리가 아니다**(옮겨졌다)',
        `${Math.round(Math.hypot(p.x - dx0, p.y - dy0))}px 이동`);
      // 짐꾸러미
      const bundles = Array.from(H.groundItems.values()).filter((g) => g.keep);
      ok(bundles.length >= 3, '★★⑥ **짐이 그 자리에 떨어졌다**(수량 2종 + 도구 1)', `${bundles.length}개`);
      ok(bundles.every((g) => Math.hypot(g.x - dx0, g.y - dy0) < 64),
        '★★⑥ 그리고 **죽은 그 자리**다 — 찾으러 가야 한다', bundles.map((g) => g.item).join(','));
      ok((p.inventory.wood || 0) === 0 && (p.toolItems || []).length === 0,
        '★⑥ 몸에서는 사라졌다', `wood ${p.inventory.wood} · 도구 ${(p.toolItems || []).length}개`);
      const axe = bundles.find((g) => g.item === 'axe');
      ok(axe && axe.tool && axe.tool.d === 37, '★★⑥ 도구는 **내구도까지** 실려 떨어진다(정본 낙하 경로 재사용)',
        axe ? `내구 ${axe.tool.d}/${axe.tool.max}` : '없음');
      const wd = bundles.find((g) => g.item === 'wood');
      ok(wd && wd.led && wd.led.length, '★★⑥ 개체 kg 원장도 실린다 — 1.2kg 통나무가 그대로 있다',
        wd ? JSON.stringify(wd.led) : '없음');
      // ★디스폰 금지 — 10분 청소를 건너뛴다
      ok(bundles.every((g) => g.keep === 1), '★★⑥ 짐꾸러미는 **안 사라진다**(§12 디스폰 금지 — `keep` 표)');
      // 이력서 무손실
      ok(p.craftSkill.toolmaking === 12.5 && p.craftLog.axe && p.craftLog.axe.n === 3,
        '★★⑥ **경험치·스킬은 한 톨도 안 잃는다**(§6 "부재해도 안 썩는 것")', JSON.stringify(p.craftSkill));
      // 후유증
      const left = B.aftermathLeft(p, day0);
      ok(left > 0 && B.staminaCap(p, day0) < 1,
        '★★⑥ **후유증 — 며칠은 숨이 덜 붙는다**(스태미나 상한만 눌린다)',
        `남은 ${left.toFixed(2)}일 · 상한 ${B.staminaCap(p, day0)}`);
      ok(B.staminaCap(p, day0 + B.CFG.AFTERMATH_DAYS) === 1, '★⑥ 그리고 며칠 뒤엔 **완전히 낫는다**');
      // ★연속 — 계단이 아니다
      let worst = 0, prev = null;
      for (let d = day0; d <= day0 + B.CFG.AFTERMATH_DAYS + 0.5; d += 0.05) {
        const c = B.staminaCap(p, d);
        if (prev !== null) worst = Math.max(worst, Math.abs(c - prev));
        prev = c;
      }
      ok(worst < 0.02, `★★⑥ 후유증 회복이 **연속**이다 — 0.05일 최대 도약 ${worst.toFixed(4)}(계단 금지 §8.3)`);
    }
  }

  // ═══ ⑦★ 로그아웃이 부활이 아니다 ════════════════════════════════════════════
  //   죽음 설계 §0-ⓐ-2: `savePlayer` 패치에 hp 도 isDown 도 없어 **쓰러진 채 창을 닫으면
  //   같은 자리에서 풀피로 섰다** — 죽음의 대가가 0 이었다.
  say('\n⑦ 로그아웃 ≠ 부활');
  {
    clearPlayers();
    const p = mkPlayer('logout', 30848, 59872);
    H.damagePlayer(p, 200, 'fall');
    pre(p.isDown && p.hp === 0, '쓰러진 채다');
    const blob = H.serializeBody(p);
    ok(blob.vital && blob.vital.isDown === true && blob.vital.hp === 0,
      '★★⑦ **저장본에 쓰러짐이 실린다**(`serializeBody.vital` — T47 이 이미 실어 뒀다)', JSON.stringify(blob.vital));
    const restored = H.parseBody(JSON.parse(JSON.stringify(blob)), { vitals: true });
    ok(restored.vital && restored.vital.isDown === true && restored.vital.hp === 0,
      '★★⑦ 그리고 **복원이 그걸 돌려준다** — 다시 들어와도 여전히 쓰러져 있다');
    // ★자명 통과 금지 — 안 쓰러진 몸의 HP 도 보존되는지 같이 잰다(부수 효과를 숨기지 않는다)
    const q = mkPlayer('hurt', 30848, 59872);
    H.damagePlayer(q, 30, 'mob:wolf');
    const rb = H.parseBody(JSON.parse(JSON.stringify(H.serializeBody(q))), { vitals: true });
    ok(rb.vital && rb.vital.hp === 70 && rb.vital.isDown === false,
      '★★⑦ **부수 효과를 숨기지 않는다** — 안 쓰러진 몸도 HP 가 보존된다(공짜 풀피가 사라졌다)',
      `hp ${rb.vital.hp}`);
    // ★로그인 경로가 정말 `vitals:true` 를 쓰는지 소스로 못 박는다(주석이 아니라 코드)
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const falseN = (zsrc.match(/parseBody\([^)]*\{\s*vitals:\s*false\s*\}/g) || []).length;
    ok(falseN === 0, '★★⑦ 코드에 `vitals:false` 로 몸을 읽는 자리가 **한 곳도 없다**', `${falseN}곳`);
  }

  // ═══ ⑧★ HP 0 의 뜻이 하나다 — 음식도 쓰러뜨린다 ═════════════════════════════
  //   죽음 설계 §0-ⓐ-4: `doEat` 의 `hpDelta` 갈래만 `damagePlayer` 밖에 있어
  //   **hp 0 인데 쓰러지지 않은 몸**이 만들어졌다(더 안 맞고 영원히 안 아무는 몸).
  say('\n⑧ HP 0 의 뜻이 하나 — 음식도 정본 경로로');
  {
    clearPlayers();
    const p = mkPlayer('eater', 30848, 59872);
    p.hp = 2; p.hunger = 10;
    p.inventory.meat_raw = 1;
    pre(H.FOOD_EFFECTS.meat_raw.hpDelta < 0, '날고기가 정말 HP 를 깎는 표다', `${H.FOOD_EFFECTS.meat_raw.hpDelta}`);
    H.doEat(p, 'meat_raw');
    ok(p.hp === 0 && p.isDown === true,
      '★★⑧ HP 2 에서 날고기를 먹으면 **쓰러진다**(종전엔 hp 0 인데 안 쓰러지는 몸이 됐다)',
      `hp ${p.hp} · isDown ${p.isDown}`);
    // ★자명 통과 금지 — 풀피에서 같은 걸 먹으면 −3 이 실제로 일어난다(안 깎이는 게 아니다)
    const q = mkPlayer('eater2', 30848, 59872);
    q.hunger = 10; q.inventory.meat_raw = 1;
    H.doEat(q, 'meat_raw');
    ok(q.hp === 97 && !q.isDown, '★⑧ 자명 통과 금지 — 풀피에선 그냥 −3 이다', `hp ${q.hp}`);
    // ★소스 계약 — 플레이어 hp 에 쓰는 자리가 정본 넷 밖에 없다
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const writes = (zsrc.match(/\bplayer\.hp\s*=|\bp\.hp\s*=|\btarget\.hp\s*=/g) || []).length;
    ok(writes <= 8, '★⑧ 플레이어 HP 에 쓰는 자리가 손에 꼽는다(정본 경로 밖으로 새지 않았다)', `${writes}곳`);
  }

  // ═══ ⑨ 구조 창 — 안/밖 · 거리 안/밖 (각 판정을 쪼개서) ══════════════════════
  say('\n⑨ 구조 게이트 — 창 · 거리');
  {
    clearPlayers();
    const a = mkPlayer('g_a', 30848, 59872);
    const b = mkPlayer('g_b', 30848 + 400, 59872);      // ★멀리
    H.damagePlayer(a, 200, 'fall');
    H.tryRescue(b, a.pid);
    ok(!b._carrying && b.__notices().some((t) => /떨어짐/.test(t)),
      '★⑨ **멀면 못 업는다** — 거절 사유가 거리라고 말한다', JSON.stringify(b.__notices().slice(-1)));
    b.x = a.x + 40;
    H.tryRescue(b, a.pid);
    ok(b._carrying === a.pid, '★⑨ 가까우면 업힌다');
    H.tryRescue(b, a.pid);
    ok(!b._carrying && !a._carriedBy, '★★⑨ **같은 키가 내려놓기다**(상태 토글 · 새 동사 0)');
    // 창 밖
    a.downedAt = Date.now() - (H.RESCUE_WINDOW_MS + 1000);
    H.tryRescue(b, a.pid);
    ok(!b._carrying && b.__notices().some((t) => /시간이 지났/.test(t)),
      '★★⑨ **창이 지나면 못 업는다**', JSON.stringify(b.__notices().slice(-1)));
  }

  // ═══ ⑩ 포기(부활 패널) = 창 소진과 **같은 값** ══════════════════════════════
  say('\n⑩ "고르는 부활"은 없다 — 포기도 값을 치른다');
  {
    clearPlayers();
    for (const k of Array.from(H.groundItems.keys())) H.groundItems.delete(k);
    let wild = null;
    for (let r = 3000; r <= 60000 && !wild; r += 5000) {
      for (const [dx, dy] of [[1, 1], [-1, -1]]) {
        const x = 30848 + dx * r, y = 59872 + dy * r;
        if (x < 500 || y < 500) continue;
        if ((SimVillages.shelterAt(x, y) || 0) === 0 && !H.isWaterTileLocal(x, y) && !H.isRockTileLocal(x, y)) { wild = { x, y }; break; }
      }
    }
    if (wild) {
      const p = mkPlayer('quitter', wild.x, wild.y);
      p.inventory.wood = 2;
      H.damagePlayer(p, 200, 'fall');
      const opts = H.listRespawnOptions(p);
      H.tryRespawnChoice(p, opts[0].claimId);
      ok(p._deadUntil > 0, '★★⑩ 포기해도 **즉시 부활이 아니다** — 값을 치르고 시간이 흐른다');
      const bundles = Array.from(H.groundItems.values()).filter((g) => g.keep);
      ok(bundles.length >= 1 && (p.inventory.wood || 0) === 0,
        '★★⑩ 야생에서 포기하면 **짐도 떨어진다**(창 소진과 같은 값)', `${bundles.length}개`);
      await until(() => !p.isDown, 15);
      ok(!p.isDown && p.hp > 0, '★⑩ 그리고 깨어난다', `hp ${Math.round(p.hp)}`);
    }
  }

  // ═══ ⑫ 외침 — 소리가 없으면 창 3분은 근거가 없다 (T56) ═════════════════════
  //   §12 의 구조는 "소리를 듣고 달려오는 사람"의 일이다. T43 까지 그 소리가 없었다.
  say('\n⑫ 외침 — 야생에서만 · 반경 · 주기 · 결정론');
  {
    // 야생 자리를 **찾는다**(족보 73 — 좌표를 지어내지 않는다)
    let wild = null;
    for (let x = 4000; x < 60000 && !wild; x += 3000) {
      for (let y = 4000; y < 120000; y += 3000) {
        if (H.isWaterTileLocal(x, y) || H.isTerrainBlockedLocal(x, y)) continue;
        if ((SimVillages.shelterAt(x, y) || 0) > 0) continue;
        wild = { x, y }; break;
      }
    }
    pre(!!wild, '야생 자리를 찾았다(마을 완충 0)', wild ? `(${wild.x},${wild.y})` : '못 찾음');
    const R = H.Rescue.CFG.SHOUT_RANGE_PX;
    clearPlayers();
    const a = mkPlayer('shout_a', wild.x, wild.y);
    const near = mkPlayer('near_b', wild.x + Math.round(R * 0.5), wild.y);
    const far = mkPlayer('far_c', wild.x + R + 4000, wild.y);
    // ★★정본 경로로 쓰러뜨린다 — `Rescue.shoutOnce` 를 손으로 부르면 "훅이 걸려 있는가"를 안 재게 된다.
    H.damagePlayer(a, 200, 'fall');
    pre(a.isDown, '쓰러졌다');
    const nn = near.__notices().filter((t) => /쓰러졌다/.test(t));
    const fn = far.__notices().filter((t) => /쓰러졌다/.test(t));
    ok(nn.length === 1, '★★⑫ 쓰러진 **그 순간** 반경 안 사람이 듣는다 — `damagePlayer` 가 부른다(훅 검사)', JSON.stringify(nn));
    ok(fn.length === 0, '★★⑫ 반경 밖은 **못 듣는다** — 소리에는 끝이 있다', `${R}px 밖 · ${fn.length}건`);
    ok(/걸음/.test(nn[0] || '') && !/px/.test(nn[0] || ''),
      '★★⑫ 거리는 **걸음으로** 말한다(§60 · 화면에 px 를 흘리지 않는다)', nn[0]);
    ok(/해 지는|해 뜨는|북쪽|남쪽/.test(nn[0] || ''),
      '★★⑫ 방위는 **촌장과 같은 어휘**다(온보딩 `dirWord` 정본 · 사본 0)', nn[0]);
    // 결정론 — 같은 상황이면 같은 소리
    const s1 = H.Rescue.shoutOnce(a, Date.now()), t1 = near.__notices().slice(-1)[0];
    const s2 = H.Rescue.shoutOnce(a, Date.now() + 12345), t2 = near.__notices().slice(-1)[0];
    ok(s1 === s2 && t1 === t2, '★★⑫ **주사위 0** — 같은 자리·같은 사람이면 글자까지 같다', `${s1}명 · "${t1}"`);
    // 걸음 환산이 캐논(32px=1m=1셀)에서 온다
    ok(H.Rescue.steps(32 * 7) === 7 && H.Rescue.steps(0) === 0,
      '★⑫ 1걸음 = 1셀 = 32px — 새 환산을 안 만들었다', `${H.Rescue.steps(224)}걸음`);
    // ★돌연변이 — 반경을 0 으로 만들면 위 판정이 **빨강이 된다**(항상 통과하는 검사가 아니다)
    {
      const keep = H.Rescue.CFG.SHOUT_RANGE_PX;
      H.Rescue.CFG.SHOUT_RANGE_PX = 0;
      const heard = H.Rescue.shoutOnce(a, Date.now());
      H.Rescue.CFG.SHOUT_RANGE_PX = keep;
      ok(heard === 0, '★★⑫ 돌연변이 — 반경 0 이면 **아무도 못 듣는다**(판정이 ✗ 를 낼 수 있다)', `${heard}명`);
    }
  }
  // ★마을 안에서는 외치지 않는다 — 부를 사람이 이미 와 있고, 거기선 죽지도 않는다(§12)
  {
    let vspot = null;
    for (const v of (SimVillages.clientVillages() || [])) {
      const x = v.cx * 32 + 16, y = v.cy * 32 + 16;
      if ((SimVillages.shelterAt(x, y) || 0) > 0.5) { vspot = { x, y, name: v.name }; break; }
    }
    pre(!!vspot, '마을 한복판을 찾았다', vspot ? vspot.name : '못 찾음');
    clearPlayers();
    const a = mkPlayer('v_down', vspot.x, vspot.y);
    const b = mkPlayer('v_near', vspot.x + 200, vspot.y);
    H.damagePlayer(a, 200, 'fall');
    pre(a.isDown, '마을 안에서 쓰러졌다');
    ok(b.__notices().filter((t) => /쓰러졌다/.test(t)).length === 0,
      '★★⑫ **마을 안에서는 안 외친다** — 마을 사람이 옮기는 자리다(§12)');
    // ★자명 통과 금지 — 같은 두 사람을 야생에 세우면 들린다(마을이라서 조용한 게 맞다)
    a.isDown = false; a.downedAt = 0; a.hp = 100;
    let wild2 = null;
    for (let x = 4000; x < 60000 && !wild2; x += 3000) for (let y = 4000; y < 120000; y += 3000) {
      if (H.isWaterTileLocal(x, y) || H.isTerrainBlockedLocal(x, y)) continue;
      if ((SimVillages.shelterAt(x, y) || 0) > 0) continue;
      wild2 = { x, y }; break;
    }
    a.x = wild2.x; a.y = wild2.y; b.x = wild2.x + 200; b.y = wild2.y;
    H.damagePlayer(a, 200, 'fall');
    ok(b.__notices().filter((t) => /쓰러졌다/.test(t)).length === 1,
      '★★⑫ 자명 통과 금지 — **같은 두 사람이 야생에 서면 들린다**');
  }

  // ═══ ⑬ 구조 동사 둘 — 먹이기·물 (T56) ══════════════════════════════════════
  say('\n⑬ 구조 동사 둘 — /먹이기 · /물');
  {
    clearPlayers();
    const a = mkPlayer('eat_a', 30848, 59872);          // 쓰러질 사람
    const b = mkPlayer('give_b', 30848 + 40, 59872);    // 먹여 줄 사람
    a.hunger = 0; a.thirst = 50;
    b.inventory.berry = 3;
    const bHunger0 = b.hunger;
    H.damagePlayer(a, 200, 'extreme:hunger');
    pre(a.isDown, '쓰러졌다');
    pre(H.FOOD_EFFECTS.berry && H.FOOD_EFFECTS.berry.hunger > 0, '산딸기가 정말 허기를 채우는 표다',
      `+${H.FOOD_EFFECTS.berry && H.FOOD_EFFECTS.berry.hunger}`);
    const ok1 = H.Rescue.handleChat(b, '/먹이기 berry');
    ok(ok1 === true, '★⑬ `/먹이기` 는 채팅 명령이다 — 클라 코드 0(T11 선례)');
    ok(a.hunger > 0, '★★⑬ **받는 사람의 허기가 찬다**', `0 → ${Math.round(a.hunger)}`);
    ok(b.hunger === bHunger0, '★★⑬ **주는 사람은 안 먹는다** — 대상 인자가 실제로 갈린다', `${b.hunger}`);
    ok((b.inventory.berry || 0) === 2, '★★⑬ **주는 사람 인벤에서 빠진다**(원장 정합)', `berry ${b.inventory.berry}`);
    ok((a.inventory.berry || 0) === 0, '★⑬ 받는 사람 인벤은 안 늘어난다(먹인 것이지 준 것이 아니다)');
    ok(a.__notices().some((t) => /섭취/.test(t)), '★⑬ "섭취했다"는 **받는 사람**의 말이다',
      JSON.stringify(a.__notices().filter((t) => /섭취/.test(t))));
    ok(b.__notices().some((t) => /먹였다/.test(t)), '★⑬ 먹여 준 쪽은 제 문장을 듣는다',
      JSON.stringify(b.__notices().filter((t) => /먹였다/.test(t))));
    // ★★돌연변이 — 대상 인자를 안 주면 **주는 사람이 먹는다**(위 두 판정이 ✗ 를 낼 수 있다)
    {
      b.hunger = 50;                          // ★배부른 몸으로는 못 잰다 — 100 은 더 안 오른다(자명 통과)
      const h0 = a.hunger, bh0 = b.hunger;
      H.doEat(b, 'berry', 1);                 // ← 대상 없음(종전 호출과 동형)
      ok(b.hunger > bh0 && a.hunger === h0,
        '★★⑬ 돌연변이 — 대상 인자를 빼면 **먹는 사람이 바뀐다**(판정이 자명 통과가 아니다)',
        `주는이 ${Math.round(bh0)}→${Math.round(b.hunger)} · 받는이 ${Math.round(h0)} 그대로`);
    }
    // 거리 게이트 — T43 의 그 거리 하나다(소속은 안 본다)
    b.x = 30848 + 4000;
    const far = H.Rescue.handleChat(b, '/먹이기 berry');
    ok(far === true && b.__notices().slice(-1)[0].includes('쓰러진 사람이 없다'),
      '★⑬ 멀면 못 먹인다 — 거절 사유를 말한다', b.__notices().slice(-1)[0]);
  }
  // ── /물 — 물은 들고 다닐 수 없다. 물가로 업고 가야 한다. ──────────────────
  {
    // 민물 옆·바다 옆 자리를 **찾는다**
    let fresh = null, sea = null;
    for (let x = 2000; x < 68000 && (!fresh || !sea); x += 500) {
      for (let y = 2000; y < 128000; y += 500) {
        if (H.isWaterTileLocal(x, y) || H.isTerrainBlockedLocal(x, y)) continue;
        const w = H.Rescue.freshWaterNear(x, y), s = H.Rescue.seaOnlyNear(x, y);
        if (w && !fresh) fresh = { x, y };
        if (s && !sea) sea = { x, y };
        if (fresh && sea) break;
      }
    }
    pre(!!fresh, '민물 옆자리를 찾았다', fresh ? `(${fresh.x},${fresh.y})` : '못 찾음');
    pre(!!sea, '바다만 옆에 있는 자리를 찾았다', sea ? `(${sea.x},${sea.y})` : '못 찾음');
    if (fresh) {
      clearPlayers();
      // ★물을 뜨는 것은 **구조자의 손**이다 ⇒ 물가에 서는 쪽은 b 다(쓰러진 이는 업혀 온 것).
      const b = mkPlayer('pour_b', fresh.x, fresh.y);
      const a = mkPlayer('thirst_a', fresh.x + 40, fresh.y);
      a.thirst = 5;
      H.damagePlayer(a, 200, 'extreme:thirst');
      pre(a.isDown, '쓰러졌다');
      H.Rescue.handleChat(b, '/물');
      ok(a.thirst > 5, '★★⑬ 그릇이 없으면 물가에서 **손으로 떠 먹인다**', `5 → ${Math.round(a.thirst)}`);
      ok(Math.round(a.thirst - 5) === Math.round(H.WATER_DRINK_AMOUNT),
        '★⑬ 손으로 뜬 회복량은 **정본 한 모금**이다(새 수를 안 만들었다)', `+${H.WATER_DRINK_AMOUNT}`);
    }
    // ★★[T54 접점] **들고 온 물이 먼저다** — 그릇이 열렸으니 물가가 아니어도 먹일 수 있다.
    {
      const Tidal = require(path.join(ROOT, 'server', 'tidal.js'));
      clearPlayers();
      const a = mkPlayer('carry_a', 30848, 59872);
      const b = mkPlayer('carry_b', 30848 + 40, 59872);
      a.thirst = 5;
      b.inventory[Tidal.FRESH] = 2;
      pre(!H.Rescue.freshWaterNear(b.x, b.y), '물가가 **아닌** 자리다(그릇 갈래만 남는다)');
      H.damagePlayer(a, 200, 'extreme:thirst');
      pre(a.isDown, '쓰러졌다');
      H.Rescue.handleChat(b, '/물');
      ok(a.thirst > 5, '★★⑬ **들고 온 민물로 먹인다** — 물가가 아니어도 된다(T54 그릇 일반화)',
        `5 → ${Math.round(a.thirst)}`);
      ok((b.inventory[Tidal.FRESH] || 0) === 1, '★★⑬ 물은 **준 사람 인벤에서** 빠진다', `민물 ${b.inventory[Tidal.FRESH]}`);
      ok((b.inventory[H.Salt.VESSEL] || 0) === 1 && (a.inventory[H.Salt.VESSEL] || 0) === 0,
        '★★⑬ 그리고 **빈 병은 준 사람 손에 남는다** — 먹인 것이지 준 게 아니다(T54 `returns` 계약)',
        `준이 ${b.inventory[H.Salt.VESSEL] || 0} · 받은이 ${a.inventory[H.Salt.VESSEL] || 0}`);
    }
    if (sea) {
      clearPlayers();
      const b = mkPlayer('salt_b', sea.x, sea.y);
      const a = mkPlayer('salt_a', sea.x + 40, sea.y);
      a.thirst = 5;
      H.damagePlayer(a, 200, 'extreme:thirst');
      pre(a.isDown, '바닷가에서 쓰러졌다');
      H.Rescue.handleChat(b, '/물');
      ok(a.thirst === 5, '★★⑬ **짠물은 못 먹인다** — T4 의 그 판정을 다시 부른다', `목마름 ${a.thirst} 그대로`);
      ok(b.__notices().slice(-1)[0].includes('짠물'),
        '★⑬ 그리고 **왜 안 되는지** 말한다("물이 없다"가 아니라 "짠물이다")', b.__notices().slice(-1)[0]);
    }
    // ★정합 — `/물` 과 채집 정본이 **같은 자리에서 같은 답**을 한다(두 술어가 갈리지 않는다)
    if (fresh && sea) {
      ok(H.Rescue.freshWaterNear(fresh.x, fresh.y) && !H.Rescue.freshWaterNear(sea.x, sea.y),
        '★★⑬ 물이냐 짠물이냐는 **정본 술어 둘**이 가른다(표를 새로 안 들었다)');
    }
  }
  // ── 먹이고 일으키면 안 눕는다 vs 안 먹이면 다시 눕는다 — **두 갈래 다** ────
  say('\n⑬-나 먹이고 일으키면 유지 · 안 먹이면 재도 (T43 ④의 짝)');
  {
    for (const fed of [true, false]) {
      clearPlayers();
      const a = mkPlayer(fed ? 'fed_a' : 'unfed_a', 30848, 59872);
      const b = mkPlayer(fed ? 'fed_b' : 'unfed_b', 30848 + 40, 59872);
      a.hunger = 0; a.thirst = 0;
      b.inventory.berry = 40;
      H.damagePlayer(a, 200, 'extreme:hunger+thirst');
      pre(a.isDown, `${fed ? '먹인' : '안 먹인'} 갈래 — 쓰러졌다`);
      if (fed) {
        // ★배부를 때까지 먹인다 — 한 알로 극단을 벗어난다고 우기지 않는다(정본 함수를 반복해 부른다)
        for (let i = 0; i < 30 && B.extremeHpRate(a).rate > 0; i++) H.Rescue.handleChat(b, '/먹이기 berry');
        pre(B.extremeHpRate(a).rate === 0, '먹여서 극단을 벗어났다',
          `허기 ${Math.round(a.hunger)} · 목마름 ${Math.round(a.thirst)}`);
      }
      H.tryRescue(b, a.pid);
      await until(() => !a.isDown, 12);
      pre(!a.isDown, '일으켰다', `hp ${a.hp}`);
      const rate = B.extremeHpRate(a).rate;
      const hp0 = a.hp;
      // ★★기다리는 시간은 **유도한다**(감으로 고르지 않는다). T44 는 이월분이 1HP 를 넘을 때
      //   비로소 정본 피해로 나간다 ⇒ 첫 1HP 까지 1/rate 초. 그 두 배를 기다리면 충분하다.
      //   (`_wakeUp` 이 빚을 0 으로 지우므로 시계는 **일어난 순간**부터다.)
      const need = rate > 0 ? Math.ceil(2 / rate) : 20;
      let dropped = false;
      for (let i = 0; i < need && !dropped; i++) { await sleep(1000); if (a.hp < hp0 - 0.5) dropped = true; }
      const dHp = a.hp - hp0;
      if (fed) {
        ok(rate === 0 && dHp >= 0,
          '★★⑬ **먹이고 일으키면 안 눕는다** — 감소율 0 이고 HP 는 오히려 찬다',
          `rate ${rate} · HP ${Math.round(hp0)} → ${Math.round(a.hp)}`);
      } else {
        ok(rate > 0 && dropped,
          '★★⑬ **안 먹이고 일으키면 도로 깎인다** — 대조군(새 규칙 0 · T44 식이 한다)',
          `rate ${rate.toFixed(5)} HP/게임분 · HP ${Math.round(hp0)} → ${a.hp.toFixed(2)}`
          + ` (${Math.round(1 / rate)}초에 1HP · 남은 시간 ${Math.round(a.hp / rate / 60)}분)`);
      }
    }
  }
  // ── 후유증이 화면 재료에 실린다 ───────────────────────────────────────────
  {
    clearPlayers();
    const p = mkPlayer('after_p', 30848, 59872);
    ok(B.selfPayload(p).aftermath === null, '★⑬ 후유증이 없으면 **null 이다**(0 을 보내면 없는 말을 하게 된다)');
    B.startAftermath(p, H.gameDayNow());
    B.tick(p, 1, { day: H.gameDayNow(), night: false, indoor: false, moving: false, shelter: 0 });
    const am = B.selfPayload(p).aftermath;
    ok(am && am.cap === B.staminaCap(p, H.gameDayNow()) && am.days > 0,
      '★★⑬ 죽고 나면 **화면 재료에 실린다** — 값은 몸의 정본과 같은 수다(사본 0)', JSON.stringify(am));
  }

  // ═══ ⑪ 대리 지표 ═══════════════════════════════════════════════════════════
  say('\n⑪ 대리 지표 — 시나리오별 시간');
  {
    const rate = (o) => { const P = { hunger: 100, thirst: 100, hp: 100 }; B.ensure(P);
      Object.assign(P, o.g || {}); Object.assign(B.ensure(P), o.b || {}); return B.extremeHpRate(P).rate; };
    const to0 = (r) => (r > 0 ? Math.round(100 / r) : null);
    const W = Math.round(180000 / 1000), K = Math.round(120);
    say(`     극단 → HP 0 → 창 → 사망까지(실시간 · 채택값 기준):`);
    for (const [n, o] of [['갈증만', { g: { thirst: 0 } }], ['허기+갈증', { g: { hunger: 0, thirst: 0 } }],
      ['한겨울 밤 셋', { g: { hunger: 0, thirst: 0 }, b: { cold: 1 } }]]) {
      const t = to0(rate(o));
      say(`       ${n.padEnd(12)} HP0 까지 ${t ? (t / 60).toFixed(1) + '분' : '-'} + 구조 창 ${(W / 60).toFixed(0)}분 + 깨어남 ${(K / 60).toFixed(0)}분`
        + `  ⇒ 쓰러짐부터 깨어남까지 ${((W + K) / 60).toFixed(0)}분`);
    }
    say(`     후유증 회복 — 죽은 날 상한 ${B.CFG.AFTERMATH_STAM_CAP} → ${B.CFG.AFTERMATH_DAYS} 게임일에 걸쳐 1 로(연속)`);
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
