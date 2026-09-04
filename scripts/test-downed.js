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

// ★★[T64 동봉 · T56 회부] **야생은 두 증인이 있어야 야생이다.**
//   T56 에서 `e2e-downed` 가 마을 한복판을 "완충 0 인 야생"으로 집어 들어 판정 넷이 헛돌았다
//   (화면의 완충값은 텔레포트 직후 낡아 있을 수 있다). 여기 서버 정본은 안 낡지만,
//   **두 술어가 독립으로 같은 답을 해야** 한쪽이 조용히 틀려도 잡힌다:
//     증인 ①  `SimVillages.shelterAt(x,y) === 0`   (추위·쓰러짐이 쓰는 완충 정본)
//     증인 ②  시딩된 모든 마을 중심에서 **반경 정본 최댓값 + 여유** 밖   (마을 목록에서 유도)
//   ⚠반경은 여기 적지 않는다 — `clientVillages()` 가 `r`(=`_maxRPx`)를 실어 주므로 **거기서 잰다**.
const _VILS = () => { try { return SimVillages.clientVillages() || []; } catch (e) { return []; } };
const VIL_SAFE_PX = (() => {
  const rs = _VILS().map((v) => v.r || 0);
  return Math.round((rs.length ? Math.max(...rs) : 2152) * 1.2);   // 최댓값 +20% 여유
})();
const farFromVillages = (x, y) =>
  _VILS().every((v) => Math.hypot(v.cx * 32 + 16 - x, v.cy * 32 + 16 - y) > VIL_SAFE_PX);
const isWildSpot = (x, y) =>
  (SimVillages.shelterAt(x, y) || 0) === 0 && farFromVillages(x, y)
  && !H.isWaterTileLocal(x, y) && !H.isTerrainBlockedLocal(x, y);

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
    // ★[T62] 그 마을의 쉼터를 **지금 세운다** — 백필 타이머를 기다리지 않는다(정본 함수를 그대로 부른다).
    if (vspot && SimVillages.ensureShelter) {
      for (const v of (SimVillages.clientVillages() || [])) {
        if (Math.abs(v.cx * 32 + 16 - vspot.x) < 1 && Math.abs(v.cy * 32 + 16 - vspot.y) < 1) {
          try { SimVillages.ensureShelter(v.id, H.Onboarding ? H.Onboarding.arrivalOf(v.id) : null); } catch (e) {}
        }
      }
    }
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
      // ★★[T62 2026-09-03] **그 문장이 이제 참인가** — 옮겨 준 자리가 진짜 쉼터인가.
      //   T43 은 "쉼터로 옮겼다"고 쓰면서 **도착 지점**에 내려놓았다(쉼터가 세계에 없었으니까).
      //   T62 가 시설을 만들었으므로, 여기서 **좌표로** 확인한다(문장만 보면 여전히 자명 통과다).
      if (SimVillages.shelterOf) {
        let vid = null;
        for (const v of (SimVillages.clientVillages() || [])) if (Math.abs(v.cx * 32 + 16 - vspot.x) < 1 && Math.abs(v.cy * 32 + 16 - vspot.y) < 1) vid = v.id;
        const sh = vid != null ? SimVillages.shelterOf(vid) : null;
        pre(!!sh, '[T62] 그 마을에 쉼터가 실제로 서 있다(없으면 아래는 아무것도 안 잰다)',
          sh ? `(${sh.cx},${sh.cy})` : '없음');
        if (sh) {
          ok(Math.hypot(p.x - sh.x, p.y - sh.y) < 40,
            '★★⑤-b [T62] **깨어난 자리가 그 마을 쉼터 앞이다** — 문장이 좌표와 맞는다',
            `깨어난 (${p.x.toFixed(0)},${p.y.toFixed(0)}) vs 쉼터 (${sh.x.toFixed(0)},${sh.y.toFixed(0)})`);
          const w = H.nearestVillageWake(vspot.x, vspot.y);
          ok(!!(w && w.kind === 'shelter'), '★⑤-b 사다리가 스스로 "쉼터"라고 말한다(도착 지점 폴백이 아니다)', w ? w.kind : '');
        }
      }
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
        if (isWildSpot(x, y)) { wild = { x, y }; break; }   // ★두 증인(T64 동봉)
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
      // 짐꾸러미 — ★[T83] **"전부"가 아니라 "절반"이다**(죽음 캐논 ⓑ · 재민 확정 09-03).
      //   종전 이 자리는 `수량 2종 + 도구 1` 이 **다** 떨어졌는지를 봤다. 이제 규칙이 바뀌었으므로
      //   판정도 바뀐다 — 다만 **뜻은 더 세진다**: 떨어진 것도, **남은 것도** 같이 잰다.
      const bundles = Array.from(H.groundItems.values()).filter((g) => g.keep);
      ok(bundles.length >= 1, '★★⑥ **짐이 그 자리에 떨어졌다**', `${bundles.length}덩이`);
      ok(bundles.every((g) => Math.hypot(g.x - dx0, g.y - dy0) < 64),
        '★★⑥ 그리고 **죽은 그 자리**다 — 찾으러 가야 한다', bundles.map((g) => g.item).join(','));
      const leftN = (p.inventory.wood || 0) + (p.inventory.stone || 0) + (p.toolItems || []).length;
      ok(leftN > 0, '★★⑥ [T83] 그런데 **몸에도 남았다** — "일부"가 캐논이다(전부가 아니다)',
        `wood ${p.inventory.wood || 0} · stone ${p.inventory.stone || 0} · 도구 ${(p.toolItems || []).length}개`);
      // 무거운 것부터 떨어졌나 — 떨어진 것의 개당 kg 이 남은 것보다 가볍지 않아야 한다.
      const _kg = (it) => H.Weights.kgOfOrDefault(it);
      const dropMin = Math.min(...bundles.map((g) => _kg(g.item)));
      const leftItems = [];
      for (const [it, c] of Object.entries(p.inventory || {})) if ((c | 0) > 0) leftItems.push(it);
      for (const t of (p.toolItems || [])) leftItems.push(t.type);
      const leftMax = leftItems.length ? Math.max(...leftItems.map(_kg)) : 0;
      ok(dropMin >= leftMax - 1e-9, '★★⑥ [T83] **무거운 것부터** 떨어졌다(남은 것 중 가장 무거운 것 ≤ 떨어진 것 중 가장 가벼운 것)',
        `떨어진 최소 ${dropMin}kg · 남은 최대 ${leftMax}kg`);
      // ★[T83] 도구 내구도·개체 kg 원장 검사는 ⑭ 로 옮겼다 — **이 픽스처에선 안 밟힌다.**
      //   도끼는 1.2kg 이라 (돌 4kg · 통나무 3kg 이 있는 몸에서) 무거운 절반에 절대 안 든다.
      //   못 밟는 갈래를 여기서 요구하면 그건 규칙이 아니라 픽스처를 검사하는 것이다.
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
      p.inventory.wood = 2; p.inventory.stone = 2;   // ★[T83] 절반이라 두 종을 준다 — 한 종이면 "절반"이 0 일 수 있다
      H.damagePlayer(p, 200, 'fall');
      const opts = H.listRespawnOptions(p);
      H.tryRespawnChoice(p, opts[0].claimId);
      ok(p._deadUntil > 0, '★★⑩ 포기해도 **즉시 부활이 아니다** — 값을 치르고 시간이 흐른다');
      const bundles = Array.from(H.groundItems.values()).filter((g) => g.keep);
      const stillHas = (p.inventory.wood || 0) + (p.inventory.stone || 0);
      ok(bundles.length >= 1, '★★⑩ 야생에서 포기하면 **짐도 떨어진다**(창 소진과 같은 값)',
        `${bundles.length}덩이 · 몸에 ${stillHas}개 남음`);
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
        if (!isWildSpot(x, y)) continue;                   // ★두 증인(T64 동봉)
        wild = { x, y }; break;
      }
    }
    pre(!!wild, '야생 자리를 찾았다(완충 0 **그리고** 마을 중심에서 먼 곳 — 두 증인)',
      wild ? `(${wild.x},${wild.y}) · 안전거리 ${VIL_SAFE_PX}px` : '못 찾음');
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
      if (!isWildSpot(x, y)) continue;                     // ★두 증인(T64 동봉)
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

  // ═══ ⑭ [T83 ⓐ] 짐 "일부" = kg 절반 · 무거운 것부터 ══════════════════════════
  say('\n⑭ [T83] 짐은 **절반**만 떨어진다 — kg 기준 · 무거운 것부터');
  {
    clearPlayers();
    const _kg = (it) => H.Weights.kgOfOrDefault(it);
    // ★고르는 일만 떼어 낸 정본(`_deathDropPick`)에 물어본다 — 픽스처를 세 번 죽이지 않는다.
    const mkFix = (name, inv, tools) => {
      const p = mkPlayer(name, 30848, 59872);
      Object.assign(p.inventory, inv || {});
      p.toolItems = (tools || []).slice();
      return p;
    };
    const fixtures = [
      ['빈손', {}, []],
      ['중간', { wood: 6, stone: 4, berry: 10 }, [{ id: 'x1', type: 'axe', d: 50, max: 60 }]],
      ['과적', { wheat: 30, wood: 20, stone: 12, fish: 5, berry: 20 },
        [{ id: 'x2', type: 'axe', d: 50, max: 60 }, { id: 'x3', type: 'pickaxe', d: 40, max: 60 }]],
    ];
    say('     | 표본 | 개체 | 총 kg | frac 0 | frac 0.5 | frac 1 | 첫 낙하 |');
    say('     |---|---|---|---|---|---|---|');
    let allOK = true, halfOK = true, heavyOK = true;
    for (const [nm, inv, tools] of fixtures) {
      const p = mkFix(nm, inv, tools);
      const z = H._deathDropPick(p, 0), h = H._deathDropPick(p, 0.5), f = H._deathDropPick(p, 1);
      const heaviest = h.cand.length ? Math.max(...h.cand.map((c) => c.kg)) : 0;
      const first = h.cand.find((c, ix) => h.picked.has(ix));
      say(`     | ${nm} | ${h.cand.length} | ${h.total} | ${z.picked.size}개 | **${h.picked.size}개 · ${h.kg}kg** | ${f.picked.size}개 | ${first ? `${first.item}(${first.kg}kg)` : '—'} |`);
      if (z.picked.size !== 0) allOK = false;
      if (f.picked.size !== h.cand.length) allOK = false;
      // 절반 — 목표에 **닿되 한 개 이상 넘지 않는다**(개체 단위라 정확히 반이 될 수는 없다)
      const tgt = h.total * 0.5;
      if (!(h.kg >= tgt - 1e-9 && h.kg < tgt + heaviest + 1e-9)) halfOK = false;
      // 무거운 것부터 — 고른 것의 최소 kg ≥ 안 고른 것의 최대 kg
      const inKg = h.cand.filter((c, ix) => h.picked.has(ix)).map((c) => c.kg);
      const outKg = h.cand.filter((c, ix) => !h.picked.has(ix)).map((c) => c.kg);
      if (inKg.length && outKg.length && Math.min(...inKg) < Math.max(...outKg) - 1e-9) heavyOK = false;
    }
    ok(halfOK, '★★⑭ⓐ 떨어진 kg 이 **절반에 닿되 한 개 이상 넘지 않는다**(개체 단위 — 반 개는 없다)');
    ok(heavyOK, '★★⑭ⓐ **무거운 것부터** — 고른 것의 최소 kg ≥ 안 고른 것의 최대 kg');
    ok(allOK, '★★⑭ⓐ 손잡이가 **양 끝에서 정확하다** — 0 이면 0개 · 1 이면 전부(= 종전 · 대조군)');
    const mid = mkFix('중간2', { wood: 6, stone: 4, berry: 10 }, [{ id: 'x9', type: 'axe', d: 50, max: 60 }]);
    const h2 = H._deathDropPick(mid, 0.5);
    ok(h2.cand.length > 0 && h2.picked.size > 0 && h2.picked.size < h2.cand.length,
      '★★자명 통과 금지 — 절반이 **0도 전부도 아니다**(양 끝이면 위 검사들이 공짜다)',
      `${h2.picked.size}/${h2.cand.length}개`);

    // ── ★돌연변이: 선별을 "전부"로 바꾸면 ⓐ 가 빨강이어야 한다 ─────────────────
    //   `frac = 1` 이 곧 "선별을 전부로 바꾼 것"이다(고르는 자리가 한 함수라 수 하나로 바꿔 끼운다).
    const mut = H._deathDropPick(mid, 1);
    const mutTgt = mut.total * 0.5;
    const mutHeaviest = Math.max(...mut.cand.map((c) => c.kg));
    ok(!(mut.kg >= mutTgt - 1e-9 && mut.kg < mutTgt + mutHeaviest + 1e-9),
      '★★⑭ⓓ **선별을 "전부"로 바꾸면 ⓐ 가 빨강이다** — 절반 판정이 실제로 무언가를 지키고 있다',
      `전부 ${mut.kg}kg vs 절반 상한 ${(mutTgt + mutHeaviest).toFixed(1)}kg`);

    // ── 낙하 경로가 그대로인가 — 도구 내구도 · 개체 kg 원장(⑥에서 옮겨 온 두 자리) ──
    {
      const p = mkFix('도구만', {}, [{ id: 'x4', type: 'axe', d: 37, max: 60 }]);
      for (const k of Array.from(H.groundItems.keys())) H.groundItems.delete(k);
      H._deathDrop(p);
      const g = Array.from(H.groundItems.values()).filter((x) => x.keep);
      const axe = g.find((x) => x.item === 'axe');
      ok(axe && axe.tool && axe.tool.d === 37,
        '★★⑭ 도구는 **내구도까지** 실려 떨어진다(정본 낙하 경로 무변)', axe ? `내구 ${axe.tool.d}/${axe.tool.max}` : '없음');
      ok((p.toolItems || []).length === 0, '★⑭ 그리고 몸에서 빠졌다(도구 하나뿐이면 그 하나가 절반이다)');
    }
    {
      const p = mkFix('통나무만', { wood: 2 }, []);
      Carry.noteInstance(p, 'wood', 5.5, H.gameDayNow());   // ★무거운 개체 하나 — 이게 먼저 떨어져야 한다
      for (const k of Array.from(H.groundItems.keys())) H.groundItems.delete(k);
      H._deathDrop(p);
      const g = Array.from(H.groundItems.values()).filter((x) => x.keep);
      const wd = g.find((x) => x.item === 'wood');
      ok(wd && wd.led && wd.led.length, '★★⑭ 개체 kg 원장이 실린다(줍고 나면 같은 무게로 돌아온다)',
        wd ? JSON.stringify(wd.led) : '없음');
      ok(wd && Math.abs(wd.led[0].kg - 5.5) < 1e-6,
        '★★⑭ 그리고 떨어진 것이 **무거운 그 개체**다(5.5kg — 3kg 표준이 아니다)', wd ? wd.led[0].kg : '—');
      ok((p.inventory.wood || 0) === 1, '★⑭ 가벼운 한 개는 몸에 남았다', `wood ${p.inventory.wood}`);
    }
    // ── 지게는? — **입은 것은 안 떨어진다**(종전 규약 · T43 회부 유지) ────────────
    {
      const p = mkFix('지게꾼', { stone: 4 }, []);
      let made = null;
      try { made = H.PlayerItems.materializeFromVillage('carrier', 0.9, () => 0.5, { plank: 4 }); } catch (e) {}
      if (made) { made.id = 'eq_c1'; p.equipment.push(made); p.equipSlots.back = 'eq_c1'; }
      const pk = H._deathDropPick(p, 1);
      ok(!!made && !pk.cand.some((c) => c.item === 'carrier'),
        '★★⑭ **지게는 후보에 아예 없다** — `equipSlots.back` 의 입은 장비다(바닥템이 장비 인스턴스를 못 싣는다 · T43 회부)',
        made ? `후보 ${pk.cand.length}개 · 전부 ${pk.cand.map((c) => c.item).filter((v, i, a) => a.indexOf(v) === i).join(',')}` : '지게 생성 실패');
      ok(!!made && Carry.carrierOf(p), '★전제 — 지게를 실제로 지고 있다(안 지고 있으면 위가 자명하다)',
        made ? `상한 ${Carry.capKg(p)}kg` : '—');
    }
  }

  // ═══ ⑮ [T83 ⓑ] 깨어날 자리 순서 — 길드 → 개인 → 처음 고른 마을 ═══════════════
  say('\n⑮ [T83] 순서 — 길드 > 개인 > 처음 고른 마을');
  {
    clearPlayers();
    const SZc = H.BUILDING_SIZE;
    const wipeClaims = () => { for (const [id, c] of [...H.claims]) { if (c.dbId) { try { H.db.deleteClaim(c.dbId); } catch (e) {} } H.claims.delete(id); } };
    // ★사유지는 **정본 경로**(`tryClaim`)로 세운다 — 손으로 `claims.set` 하면 그게 사본이다.
    //   개인 사유지는 내 길드 영토 안에만 서므로, 마을 영토와 같은 모양의 땅을 먼저 깐다.
    let _gl = 0;
    const guildLand = (cx, cy, half, tribeId) => {
      const id = `t83gl${_gl++}`, cells = [];
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) cells.push([cx + dx, cy + dy]);
      H.claims.set(id, { id, dbId: null, ownerPid: `village_t83_${_gl}`, ownerName: 'T83 영토',
        x: (cx - half) * SZc, y: (cy - half) * SZc, w: (half * 2 + 1) * SZc, h: (half * 2 + 1) * SZc,
        kind: 'guild', cells, guildTribeId: tribeId, guildTribeName: 'T83길드', state: 'active' });
      return id;
    };
    const claimAt = (p, cx, cy, kind) => {
      p.x = cx * SZc + SZc / 2; p.y = cy * SZc + SZc / 2;
      p.inventory.wood = (p.inventory.wood || 0) + 20; p.inventory.stone = (p.inventory.stone || 0) + 20;
      H.tryClaim(p, kind || 'personal');
    };
    const CX = 964, CY = 1871;   // 마을에서 떨어진 빈 자리(아래에서 자리 자체는 안 쓴다)
    // ⓐ 길드 + 개인 둘 다
    {
      wipeClaims(); clearPlayers();
      const p = mkPlayer('both', CX * SZc, CY * SZc);
      p.tribeId = 'tribe_t83'; p.tribeName = 'T83길드';
      guildLand(CX, CY, 6, 'tribe_t83');
      claimAt(p, CX + 1, CY + 1, 'personal');
      const opts = H.listRespawnOptions(p);
      const kinds = opts.map((o) => o.kind);
      pre(kinds.includes('personal') && kinds.includes('guild'),
        '길드와 개인이 **둘 다 목록에 있다**(하나만 있으면 순서 검사가 자명하다)', kinds.join(','));
      ok(opts[0] && opts[0].kind === 'guild',
        '★★⑮ⓑ 둘 다 있으면 **길드가 먼저**다(캐논: 길드 사유지 또는 개인 사유지)', kinds.join(','));
      // ★대조 — 옛 순서(개인 먼저)를 그대로 적용하면 첫 자리가 personal 이 되어 이 검사가 빨강이다.
      const oldFirst = opts.slice().sort((a, b) => {
        const r = (k) => (k === 'personal' || k === 'temporary') ? 0 : (k === 'guild' ? 1 : 2);
        return r(a.kind) - r(b.kind);
      })[0];
      ok(oldFirst && oldFirst.kind !== 'guild',
        '★★⑮ⓓ **옛 순서(개인 먼저)로 정렬하면 첫 자리가 달라진다** — 이 검사가 순서를 실제로 지킨다',
        `옛 첫 자리 ${oldFirst ? oldFirst.kind : '—'} vs 지금 ${opts[0].kind}`);
    }
    // ⓑ 개인만
    {
      wipeClaims(); clearPlayers();
      const p = mkPlayer('solo', CX * SZc, CY * SZc);
      p.tribeId = 'tribe_t83'; p.tribeName = 'T83길드';
      guildLand(CX, CY, 6, 'tribe_t83');
      claimAt(p, CX + 1, CY + 1, 'personal');
      // ★개인 사유지는 **길드 영토 안에만** 선다(T45 종전 규칙) — 그래서 땅을 깔 때만 소속이 필요했다.
      //   재는 것은 "**길드 사유지가 없는 몸**"이므로 여기서 소속을 뗀다(길드를 나간 사람 · 실제로 있는 상태).
      p.tribeId = null; p.tribeName = null;
      const opts = H.listRespawnOptions(p);
      pre(!opts.some((o) => o.kind === 'guild'), '길드 사유지가 목록에 없다', opts.map((o) => o.kind).join(','));
      ok(opts[0] && (opts[0].kind === 'personal' || opts[0].kind === 'temporary'),
        '★★⑮ⓑ 개인만 있으면 **개인**이다', opts.map((o) => o.kind).join(','));
    }
    // ⓒ 둘 다 없다 → **처음 고른 마을**(가장 가까운 마을이 아니다)
    {
      wipeClaims(); clearPlayers();
      const list = SimVillages.clientVillages() || [];
      // 쉼터가 서 있어야 문간이 나온다(T62 백필은 부팅 몇 판 뒤에 돈다 — 여기선 정본을 직접 민다)
      for (let k = 0; k < 12; k++) { const r = H._shelterBackfill(); if (!(r.left > 0)) break; await sleep(800); }
      const withSh = list.filter((v) => { try { return !!SimVillages.shelterOf(v.id); } catch (e) { return false; } });
      pre(withSh.length >= 2, '쉼터가 선 마을이 둘 이상이다', `${withSh.length}/${list.length}곳`);
      // ★"처음 고른 마을"과 "지금 가장 가까운 마을"이 **다른** 자리에서 죽인다 — 아니면 자명 통과다.
      const near = withSh[0];
      let far = null, bd = 0;
      for (const v of withSh) { const d = Math.hypot(v.cx - near.cx, v.cy - near.cy); if (d > bd) { bd = d; far = v; } }
      pre(far && far.id !== near.id, '먼 마을을 골랐다', far ? `${near.name} ↔ ${far.name} (${Math.round(bd)}셀)` : '—');
      const p = mkPlayer('rookie', near.cx * SZc + SZc / 2, near.cy * SZc + SZc / 2);
      // 처음 고른 마을 = **먼** 마을. 정본(온보딩 상태)에 적는다.
      const st = H.Onboarding.stateOf(p.playerId); st.start_vid = far.id; st.arrived = 1;
      pre(H._startVidOf(p) === far.id, '온보딩 정본이 "처음 고른 마을"을 안다', `start_vid=${H._startVidOf(p)}`);
      const opts = H.listRespawnOptions(p);
      ok(opts[0] && opts[0].kind === 'start' && opts[0].vid === far.id,
        '★★⑮ⓑ 사유지가 없으면 **처음 고른 마을**이다', `${opts[0] && opts[0].kind} vid=${opts[0] && opts[0].vid} (${opts[0] && opts[0].vname})`);
      const nw = H.nearestVillageWake(p.x, p.y);
      ok(nw && nw.vid !== far.id,
        '★★자명 통과 금지 — **가장 가까운 마을은 다른 곳이다**(같으면 위 검사가 공짜다)',
        `가장 가까운 ${nw && nw.vid} vs 처음 고른 ${far.id}`);
      const sh = SimVillages.shelterOf(far.id);
      ok(sh && Math.abs(opts[0].x - sh.x) < 1e-6 && Math.abs(opts[0].y - sh.y) < 1e-6,
        '★★⑮ⓒ 그 자리는 **그 마을 쉼터의 문간**이다(좌표를 짓지 않고 `shelterOf` 를 부른다)',
        sh ? `(${sh.x | 0},${sh.y | 0})` : '쉼터 없음');
    }
    // 뒷정리 — 뒤 절이 내 클레임을 물려받지 않게
    for (const [id, c] of [...H.claims]) { if (c.dbId) { try { H.db.deleteClaim(c.dbId); } catch (e) {} } H.claims.delete(id); }
  }

  // ═══ ⑯ [T83 ⓒ] 깨어나는 칸 — 문간 → 근처 칸 → 쉼터 문간 ═════════════════════
  say('\n⑯ [T83] 칸 — 벽 안이나 물 위에서 눈뜨지 않는다');
  {
    clearPlayers();
    // ⓐ 문간 문법이 **정본과 같은 칸**을 내는가 — 쉼터에 대고 돌려 `villages.shelterOf` 와 맞댄다.
    //   (쉼터도 움집도 같은 정본(`_liveHut6x4`)이 세우므로, 여기서 맞으면 사유지 움집에서도 맞는다.)
    const list = SimVillages.clientVillages() || [];
    // ★★[족보 ㊻] **행이 메모리에 있는 쉼터를 골라야 한다.** `shelterOf` 는 DB 행만 봐도 좌표를 내지만,
    //   문간은 그 움집의 **벽 행**을 읽어야 안다 — 청크가 꺼져 있으면 `buildings` 에 행이 없다.
    //   아무 쉼터나 잡으면 이 절이 "문법이 틀렸다"가 아니라 "행이 없다"로 간헐 빨강이 된다(실제로 그랬다).
    //   ⇒ 행이 실재하는 표본을 고르고, **그 사실 자체를 상황으로 적는다**.
    const _rects = new Set();
    for (const b of H.buildings.values()) { const t = b && b.data && b.data.hut; if (Array.isArray(t)) _rects.add(t.join(',')); }
    let sample = null;
    for (const v of list) {
      const sh = SimVillages.shelterOf ? SimVillages.shelterOf(v.id) : null;
      if (!sh) continue;
      // 쉼터의 발자국 렉트는 [cx-5, cy-5, cx+0, cy-2] — 그 키가 메모리에 있나
      if (!_rects.has([sh.cx - 5, sh.cy - 5, sh.cx + 0, sh.cy - 2].join(','))) continue;
      sample = { v, sh }; break;
    }
    pre(!!sample, '움집 **행이 메모리에 있는** 쉼터가 있다(청크가 꺼져 있으면 문간 대신 근처 칸으로 내려간다 — 안전한 축소)',
      sample ? `${sample.v.name} · 메모리 렉트 ${_rects.size}개` : `없음(메모리 렉트 ${_rects.size}개)`);
    if (sample) {
      const d = H._hutDoorNear(sample.sh.bx, sample.sh.by, H.BUILDING_SIZE * 3);
      ok(d && Math.abs(d.x - sample.sh.x) < 1e-6 && Math.abs(d.y - sample.sh.y) < 1e-6,
        '★★⑯ⓒ 문간 문법이 **`villages.shelterOf` 와 같은 칸**을 낸다(문 자리를 상수로 안 적었다)',
        d ? `(${d.x | 0},${d.y | 0}) vs 정본 (${sample.sh.x | 0},${sample.sh.y | 0})` : '못 찾음');
      ok(d && !H.isTerrainBlockedLocal(d.x, d.y), '★⑯ⓒ 그리고 그 칸은 **설 수 있다**');
      // 사유지 kind 로 감싸서 `wakeCellOf` 가 실제로 문간을 고르는지
      const w = H.wakeCellOf({ kind: 'personal', x: sample.sh.bx, y: sample.sh.by, cw: 96, ch: 96 });
      ok(w && w.cellKind === 'door' && Math.abs(w.x - sample.sh.x) < 1e-6,
        '★★⑯ⓒ 움집이 있으면 `wakeCellOf` 가 **문간**을 고른다', w ? `${w.cellKind} (${w.x | 0},${w.y | 0})` : '—');
    }
    // ⓑ 움집이 없고 중심이 막혔으면 — **가장 가까운 설 수 있는 칸**
    {
      let blocked = null;
      for (let r = 2000; r <= 90000 && !blocked; r += 1500) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
          const x = 30848 + dx * r, y = 59872 + dy * r;
          if (x < 2000 || y < 2000 || x > 400000 || y > 400000) continue;
          if (H.isWaterTileLocal(x, y) || H.isRockTileLocal(x, y)) { blocked = { x, y }; break; }
        }
      }
      pre(!!blocked, '중심이 **실제로 막힌** 자리를 찾았다(물이나 바위)', blocked ? `(${blocked.x},${blocked.y})` : '못 찾음');
      if (blocked) {
        ok(H.isTerrainBlockedLocal(blocked.x, blocked.y), '★전제 — 게임이 그 자리를 "막혔다"고 답한다');
        const w = H.wakeCellOf({ kind: 'personal', x: blocked.x, y: blocked.y, cw: 32, ch: 32 });
        ok(w && w.cellKind === 'near' && !H.isTerrainBlockedLocal(w.x, w.y),
          '★★⑯ⓒ 움집이 없고 중심이 막혔으면 **가장 가까운 설 수 있는 칸**으로 내린다',
          w ? `${w.cellKind} (${w.x | 0},${w.y | 0}) — ${Math.round(Math.hypot(w.x - blocked.x, w.y - blocked.y))}px` : '—');
        ok(w && (w.x !== blocked.x || w.y !== blocked.y), '★⑯ⓒ 실제로 **움직였다**(막힌 자리를 그대로 주지 않는다)');
      }
    }
    // ⓒ 마을 이송은 **무변** — kind 가 사유지가 아니면 좌표를 안 건드린다
    {
      const before = { kind: 'shelter', x: 12345, y: 67890, vid: 1 };
      const after = H.wakeCellOf(before);
      ok(after && after.x === 12345 && after.y === 67890 && after.cellKind === undefined,
        '★★⑯ 마을 안 이송(shelter·arrive·center)은 **한 글자도 안 바뀐다**(T83 규칙 셋 밖)');
    }
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
