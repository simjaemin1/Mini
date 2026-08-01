#!/usr/bin/env node
// === scripts/test-furnace.js — 노(爐)·숯가마 E2E 하네스 =======================
//
// ★왜 실행 검증인가 [2026-08-02]
//   기존 서버 하네스(test-psite-server.js)는 **소스 텍스트**를 읽어 계약이 실재하는지 본다.
//   그 방식은 "규약이 이식 중에 빠지는 것"은 잡지만 **좌표 기하**는 못 잡는다.
//   노는 2×2 발자국이 사유지 안에 들어가야 하는데, 사유지 한 장은 정확히 1셀(32px)이다.
//   → 코드를 읽으면 멀쩡해 보이는데 실제로는 **한 번도 지을 수 없었다.**
//   이 하네스가 그걸 처음 잡았다. 그래서 여기서는 실서버를 띄우고 진짜 함수를 부른다.
//
// 검증 범위 (사유지 생성 → 터 → 단계 → 완공 → 조업 왕복 + 권한 거부)
//   ① 노: 착공 → ②③ 시공 → 완공 → 조업(청동기 수율) — 재료·도구·인벤 수지 전부
//   ② 권한 거부 3종: 사유지 밖 · 타인 개인 노 · 타길드 노
//   ③ 재료/연료 부족 시 **상태 무변화**(외상 없음)
//   ④ 시대 축: setEra('early_iron') → 같은 노의 수율 급등 · 괴련로 해금
//   ⑤ 숯가마: 노와 같은 계약 · 조업 수율이 노천 탄화보다 좋다
//
// 실행: node scripts/test-furnace.js       (실서버를 임시 DB·임시 포트로 띄운다 — 라이브 무접촉)
'use strict';
const path = require('path');
const fs = require('fs');

// ── 실서버 부팅(격리) ────────────────────────────────────────────────────────
const TMP = `/tmp/test-furnace-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = process.env.PORT || String(39000 + (process.pid % 900));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';   // 노 계약에 마을은 무관 — 부팅을 가볍게
process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0';
process.env.ENABLE_ROADS = '0';

const _log = console.log, _warn = console.warn, _err = console.error;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
const Era = require(path.join(__dirname, '..', 'server', 'era.js'));
quiet = false; console.log = _log;

const H = Zone.__furnaceBind();
const SZ = H.BUILDING_SIZE;

let pass = 0, fail = 0;
const say = (...a) => _log(...a);
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };
const eq = (a, b, m) => ok(a === b, `${m} (${JSON.stringify(a)} === ${JSON.stringify(b)})`);

// ── 목 플레이어 ──────────────────────────────────────────────────────────────
let _pid = 0;
function mkPlayer(name, opts = {}) {
  const notices = [];
  const ws = { readyState: 999, send: () => {} };   // rawSend 는 OPEN 일 때만 보낸다 → 조용
  const p = {
    playerId: `test_${++_pid}`, name, ws, x: 0, y: 0, floor: 0,
    inventory: Object.assign({}, opts.inv || {}),
    toolItems: (opts.tools || []).map((t, i) => ({ id: `t${_pid}_${i}`, type: t, d: 100, max: 100 })),
    equipped: null, hotkey1: null, tribeId: opts.tribeId || null, tribeName: opts.tribeName || null,
    hunger: 100, thirst: 100, oreCarry: {}, notices,
  };
  // notice 를 가로챈다 — send() 는 ws.readyState 로 걸러지므로 여기선 ws 를 감시자로 만든다
  ws.readyState = 1;   // WebSocket.OPEN
  ws.send = (str) => { try { const o = JSON.parse(str); if (o.type === 'notice') notices.push(o.text); } catch (e) {} };
  return p;
}
const lastNotice = (p) => p.notices[p.notices.length - 1] || '';
const noticed = (p, re) => p.notices.some((t) => re.test(t));

// ── 빈 땅 찾기(물·바위 없는 2×2 + 여유) ──────────────────────────────────────
function findClearSpot() {
  for (let cy = 200; cy < 900; cy += 3) {
    for (let cx = 200; cx < 900; cx += 3) {
      let clear = true;
      for (let x = cx - 1; x <= cx + 2 && clear; x++) for (let y = cy - 1; y <= cy + 2 && clear; y++) {
        if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear = false;
      }
      if (clear) return { cx, cy };
    }
  }
  return null;
}
// 2×2 발자국을 덮는 사유지 4장을 직접 깐다(tryClaim 은 슬롯·길드 규칙이 있어 하네스가 우회 —
// 검증 대상은 "사유지가 있을 때 노가 서는가"지 "사유지를 어떻게 얻는가"가 아니다).
function layClaims(cx, cy, ownerPid, ownerName, kind, guildTribeId) {
  const made = [];
  for (let x = cx; x <= cx + 1; x++) for (let y = cy; y <= cy + 1; y++) {
    const c = { id: H.newClaimId(), ownerPid, ownerName, x: x * SZ, y: y * SZ, w: SZ, h: SZ,
                kind, guildTribeId: guildTribeId || null, createdAt: 0 };
    H.claims.set(c.id, c); made.push(c);
  }
  return made;
}
const findBuilding = (type) => [...H.buildings.values()].filter((b) => b.type === type);
const at = (p, cx, cy) => { p.x = (cx + 1) * SZ; p.y = (cy + 1) * SZ; };

say('=== 노(爐)·숯가마 E2E — 실서버 함수 왕복 ===');
say(`  zone=${process.env.ZONE_ID} port=${process.env.PORT} db=${TMP}`);
say(`  시대=${Era.currentEra()} · 도가니로 tech=${Era.hasTech('crucible')} · 괴련로 tech=${Era.hasTech('bloomery')}`);

const spot = findClearSpot();
if (!spot) { say('❌ 빈 땅을 못 찾음 — 지형 로드 실패'); process.exit(1); }
say(`  실험 좌표: 셀 (${spot.cx},${spot.cy})`);

// ══ ① 사유지 없이 착공 = 거부 ═══════════════════════════════════════════════
say('\n[① 사유지 밖에서는 못 짓는다]');
{
  const p = mkPlayer('무단', { inv: { stone: 99, wood: 99, hide: 99 }, tools: ['pickaxe'] });
  at(p, spot.cx, spot.cy);
  const before = findBuilding('furnace_site').length;
  H.tryFurnaceStart(p, spot.cx * SZ + 1, spot.cy * SZ + 1);
  eq(findBuilding('furnace_site').length, before, '노 터가 생기지 않았다');
  ok(/사유지/.test(lastNotice(p)), `거부 사유가 사유지 — "${lastNotice(p)}"`);
  eq(p.inventory.stone, 99, '★거부인데 재료가 깎이지 않았다(외상 없음)');
  eq(p.toolItems[0].d, 100, '★거부인데 곡괭이 내구가 닳지 않았다');
}

// ══ ② 정상 왕복: 사유지 → 터 → ②③ → 완공 ═══════════════════════════════════
say('\n[② 정상 왕복 — 사유지 4장 → 터 → 시공 2회 → 완공]');
let furnaceId = null;
const owner = mkPlayer('대장장이', { inv: { stone: 20, wood: 10, hide: 8, iron_ore: 3, charcoal: 20 }, tools: ['pickaxe'] });
{
  at(owner, spot.cx, spot.cy);
  layClaims(spot.cx, spot.cy, owner.playerId, owner.name, 'personal', null);
  const need0 = { stone: 6 };
  H.tryFurnaceStart(owner, spot.cx * SZ + 1, spot.cy * SZ + 1);
  const sites = findBuilding('furnace_site');
  ok(sites.length === 1, `노 터 1동 생성 (${sites.length})`);
  if (!sites.length) { say('  ↳ 이후 검증 불가 — 중단'); process.exit(1); }
  const site = sites[0];
  eq(owner.inventory.stone, 20 - need0.stone, '① 단계 재료(돌 6) 차감');
  eq(owner.toolItems[0].d, 98, '① 단계 곡괭이 내구 2 소모');
  eq(site.data.stage, 1, '단계=1');
  eq(site.data.tribeId, null, '개인 사유지 위 → 개인 노(tribeId 없음)');
  eq(site.data.kind, 'crucible', '기본 종류 = 도가니로');

  // ②
  H.tryFurnaceAdvance(owner, site.id);
  eq(site.data.stage, 2, '② 노벽 → 단계=2');
  eq(owner.inventory.stone, 20 - 6 - 8, '② 단계 돌 8 차감');
  eq(owner.inventory.wood, 10 - 4, '② 단계 통나무 4 차감');

  // ③ 재료 부족 케이스 — 가죽을 잠깐 뺏는다
  const keepHide = owner.inventory.hide; owner.inventory.hide = 1;
  H.tryFurnaceAdvance(owner, site.id);
  eq(site.data.stage, 2, '★재료 부족이면 단계가 안 오른다');
  eq(owner.inventory.wood, 6, '★재료 부족이면 다른 재료도 안 깎인다');
  ok(/부족/.test(lastNotice(owner)), '부족 안내');
  owner.inventory.hide = keepHide;

  H.tryFurnaceAdvance(owner, site.id);
  eq(findBuilding('furnace_site').length, 0, '완공 시 터 제거');
  const fs2 = findBuilding('furnace');
  ok(fs2.length === 1, `노 1동 완공 (${fs2.length})`);
  furnaceId = fs2[0] && fs2[0].id;
  ok(fs2[0] && fs2[0].data.owner === owner.playerId, '소유자 = 시공자');
  eq(owner.inventory.hide, 8 - 4, '③ 단계 가죽 4 차감');
}

// ══ ③ 조업 — 청동기 물리 ════════════════════════════════════════════════════
say('\n[③ 조업 — era.js 물리가 그대로 답한다(청동기)]');
{
  const yBronze = Era.smeltYield('iron', { furnace: 'crucible', fuel: 'charcoal', bellows: true });
  say(`  청동기 도가니로 철 수율 = ${(yBronze * 100).toFixed(1)}%`);
  ok(yBronze > 0 && yBronze < 0.10, '청동기 철 수율은 "거의 불가능" 구간(0<y<10%)');

  const ore0 = owner.inventory.iron_ore, ch0 = owner.inventory.charcoal;
  H.tryFurnaceSmelt(owner, furnaceId);
  eq(owner.inventory.iron_ore, ore0 - 1, '정광 1 소모');
  eq(owner.inventory.charcoal, ch0 - H.FURNACE_FUEL_PER_ORE, `숯 ${H.FURNACE_FUEL_PER_ORE} 소모`);
  ok((owner.inventory.iron || 0) === 0, '★청동기 1회 조업으로는 철 덩이가 안 나온다(부스러기 이월)');
  const carry = owner.oreCarry._iron_smelt || 0;
  ok(carry > 0, `해면철 부스러기 이월 ${carry.toFixed(3)}kg — 버리지 않는다`);
  ok(Math.abs(carry - H.Specialty.CHUNK_KG * yBronze) < 1e-3, '이월량 = 덩이무게×수율(era.js 와 일치 — 이월은 소수 3자리 저장)');

  // 연료 부족 = 상태 무변화
  const keep = owner.inventory.charcoal; owner.inventory.charcoal = 1;
  const ore1 = owner.inventory.iron_ore;
  H.tryFurnaceSmelt(owner, furnaceId);
  eq(owner.inventory.iron_ore, ore1, '★숯 부족이면 정광이 소모되지 않는다');
  ok(/숯 부족/.test(lastNotice(owner)), '숯 부족 안내');
  owner.inventory.charcoal = keep;

  // 정광 부족
  const keepOre = owner.inventory.iron_ore; owner.inventory.iron_ore = 0;
  const ch1 = owner.inventory.charcoal;
  H.tryFurnaceSmelt(owner, furnaceId);
  eq(owner.inventory.charcoal, ch1, '★정광 없으면 숯이 소모되지 않는다');
  owner.inventory.iron_ore = keepOre;
}

// ══ ④ 권한 — 타인·타길드 거부 ═══════════════════════════════════════════════
say('\n[④ 권한 거부 — 개인 노엔 타인 관여 불가]');
{
  const other = mkPlayer('남', { inv: { iron_ore: 5, charcoal: 20, stone: 99, wood: 99, hide: 99 }, tools: ['pickaxe'] });
  at(other, spot.cx, spot.cy);
  H.tryFurnaceSmelt(other, furnaceId);
  eq(other.inventory.iron_ore, 5, '타인은 남의 개인 노에서 조업 못 한다(재료 무변화)');
  ok(/주인이 아닙니다/.test(lastNotice(other)), `거부 사유 — "${lastNotice(other)}"`);

  // 길드 노 — 같은 길드는 되고 다른 길드는 안 된다
  const spot2 = { cx: spot.cx + 6, cy: spot.cy };
  let clear2 = true;
  for (let x = spot2.cx; x <= spot2.cx + 1; x++) for (let y = spot2.cy; y <= spot2.cy + 1; y++) if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear2 = false;
  if (!clear2) { say('  (길드 자리 지형 불가 — 건너뜀)'); }
  else {
    const gLeader = mkPlayer('길드장', { inv: { stone: 20, wood: 10, hide: 8 }, tools: ['pickaxe'], tribeId: 'guildA' });
    at(gLeader, spot2.cx, spot2.cy);
    layClaims(spot2.cx, spot2.cy, 'village_x', '길드A 영토', 'guild', 'guildA');
    H.tryFurnaceStart(gLeader, spot2.cx * SZ + 1, spot2.cy * SZ + 1);
    const gs = findBuilding('furnace_site');
    ok(gs.length === 1, '길드 사유지 위 노 터 생성');
    if (gs.length) {
      eq(gs[0].data.tribeId, 'guildA', '★길드 땅에 지으면 길드 노(tribeId 기록)');
      H.tryFurnaceAdvance(gLeader, gs[0].id);
      H.tryFurnaceAdvance(gLeader, gs[0].id);
      const gf = findBuilding('furnace').find((b) => b.data.tribeId === 'guildA');
      ok(!!gf, '길드 노 완공');
      if (gf) {
        const mate = mkPlayer('같은길드원', { inv: { iron_ore: 2, charcoal: 10 }, tribeId: 'guildA' });
        at(mate, spot2.cx, spot2.cy);
        H.tryFurnaceSmelt(mate, gf.id);
        eq(mate.inventory.iron_ore, 1, '같은 길드원은 길드 노를 쓴다');
        const enemy = mkPlayer('다른길드원', { inv: { iron_ore: 2, charcoal: 10 }, tribeId: 'guildB' });
        at(enemy, spot2.cx, spot2.cy);
        H.tryFurnaceSmelt(enemy, gf.id);
        eq(enemy.inventory.iron_ore, 2, '★다른 길드원은 못 쓴다(재료 무변화)');
        ok(/우리 길드의 노가 아닙니다/.test(lastNotice(enemy)), `거부 사유 — "${lastNotice(enemy)}"`);
      }
    }
  }
}

// ══ ⑤ 시대 축 — 같은 노, 다른 수율 · 괴련로 해금 ════════════════════════════
say('\n[⑤ 시대 축 — 같은 노가 시대에 따라 다른 답을 낸다]');
{
  const before = Era.smeltYield('iron', { furnace: 'crucible', fuel: 'charcoal', bellows: true });
  // 청동기엔 괴련로를 아예 못 짓는다
  const bp = mkPlayer('선구자', { inv: { stone: 30, wood: 20, hide: 10 }, tools: ['pickaxe'] });
  const spot3 = { cx: spot.cx, cy: spot.cy + 6 };
  let clear3 = true;
  for (let x = spot3.cx; x <= spot3.cx + 1; x++) for (let y = spot3.cy; y <= spot3.cy + 1; y++) if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear3 = false;
  at(bp, spot3.cx, spot3.cy);
  if (clear3) layClaims(spot3.cx, spot3.cy, bp.playerId, bp.name, 'personal', null);
  const nSite0 = findBuilding('furnace_site').length;
  H.tryFurnaceStart(bp, spot3.cx * SZ + 1, spot3.cy * SZ + 1, 'bloomery');
  eq(findBuilding('furnace_site').length, nSite0, '★청동기엔 괴련로를 못 짓는다');
  ok(/알려지지 않았다/.test(lastNotice(bp)), `거부 사유 — "${lastNotice(bp)}"`);

  Era.setEra('early_iron');
  const after = Era.smeltYield('iron', { furnace: 'crucible', fuel: 'charcoal', bellows: true });
  const bloom = Era.smeltYield('iron', { furnace: 'bloomery', fuel: 'charcoal', bellows: true });
  say(`  도가니로 ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}% · 괴련로 ${(bloom * 100).toFixed(1)}%`);
  ok(after > before * 10, '시대가 열리면 같은 노의 수율이 한 자릿수 배로 뛴다(지식이 풀린 것)');
  ok(bloom > after, '괴련로가 도가니로보다 낫다');

  if (clear3) {
    H.tryFurnaceStart(bp, spot3.cx * SZ + 1, spot3.cy * SZ + 1, 'bloomery');
    const bs = findBuilding('furnace_site').filter((b) => b.data.kind === 'bloomery');
    ok(bs.length === 1, '★시대가 열리면 괴련로를 짓는다');
    if (bs.length) {
      eq(bp.inventory.stone, 30 - 10, '괴련로 ① 단계 돌 10(도가니로보다 크다)');
      H.tryFurnaceAdvance(bp, bs[0].id);
      H.tryFurnaceAdvance(bp, bs[0].id);
      const bf = findBuilding('furnace').find((b) => b.data.kind === 'bloomery');
      ok(!!bf, '괴련로 완공');
      if (bf) {
        // ★정광 1덩이(3.5kg) × 수율 88% = 3.08kg < 덩이 3.5kg — 1회로는 덩이가 안 떨어진다.
        //   광석 1덩이에서 금속 1덩이가 나오는 게 아니다(슬래그로 빠진 만큼 손해). 2회면 나온다.
        bp.inventory.iron_ore = 2; bp.inventory.charcoal = 10; bp.oreCarry = {};
        H.tryFurnaceSmelt(bp, bf.id);
        const oneShot = bp.inventory.iron || 0;
        H.tryFurnaceSmelt(bp, bf.id);
        eq(oneShot, 0, '정광 1덩이로는 철 덩이가 안 떨어진다(수율 88%<100% — 슬래그 손실)');
        ok((bp.inventory.iron || 0) >= 1, `★괴련로 정광 2덩이 → 철 ${bp.inventory.iron || 0}덩이 — 시대가 열리면 실용`);
        ok(bp.oreCarry._iron_smelt > 0, '남는 부스러기는 계속 이월된다');
      }
    }
  }
  Era.setEra(null);   // 원복 — 이후 검증은 청동기
  eq(Era.currentEra(), 'bronze', '시대 원복');
}

// ══ ⑥ 숯가마 — 노와 같은 계약, 더 나은 수율 ═════════════════════════════════
say('\n[⑥ 숯가마 — 노와 같은 건설 계약 · 노천 탄화보다 나은 수율]');
{
  const spot4 = { cx: spot.cx + 6, cy: spot.cy + 6 };
  let clear4 = true;
  for (let x = spot4.cx; x <= spot4.cx + 1; x++) for (let y = spot4.cy; y <= spot4.cy + 1; y++) if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear4 = false;
  if (!clear4) say('  (숯가마 자리 지형 불가 — 건너뜀)');
  else {
    const k = mkPlayer('숯쟁이', { inv: { stone: 12, wood: 12 }, tools: ['pickaxe'] });
    at(k, spot4.cx, spot4.cy);
    // 사유지 없이 먼저 시도
    H.tryKilnStart(k, spot4.cx * SZ + 1, spot4.cy * SZ + 1);
    eq(findBuilding('kiln_site').length, 0, '숯가마도 사유지 밖엔 못 짓는다');
    layClaims(spot4.cx, spot4.cy, k.playerId, k.name, 'personal', null);
    H.tryKilnStart(k, spot4.cx * SZ + 1, spot4.cy * SZ + 1);
    const ks = findBuilding('kiln_site');
    ok(ks.length === 1, '숯가마 터 생성');
    if (ks.length) {
      eq(k.inventory.stone, 12 - 4, '① 구덩이 돌 4 차감');
      H.tryKilnAdvance(k, ks[0].id);
      const kd = findBuilding('charcoal_kiln');
      ok(kd.length === 1, '숯가마 2단계로 완공(풀무 불필요 — 공기를 막는 설비다)');
      if (kd.length) {
        const w0 = k.inventory.wood;
        H.tryKilnBurn(k, kd[0].id);
        eq(k.inventory.wood, w0 - H.CHARCOAL_KILN_WOOD, `조업 통나무 ${H.CHARCOAL_KILN_WOOD} 장입`);
        eq(k.inventory.charcoal, H.CHARCOAL_KILN_YIELD, `조업 숯 ${H.CHARCOAL_KILN_YIELD} 산출`);
        const openAir = 2 / 3, kiln = H.CHARCOAL_KILN_YIELD / H.CHARCOAL_KILN_WOOD;
        ok(kiln > openAir, `★가마 수율 ${kiln.toFixed(2)} > 노천 탄화 ${openAir.toFixed(2)} (고증: 밀폐 가마가 낫다)`);
        // 타인 조업 거부
        const th = mkPlayer('도둑', { inv: { wood: 9 } });
        at(th, spot4.cx, spot4.cy);
        H.tryKilnBurn(th, kd[0].id);
        eq(th.inventory.wood, 9, '타인은 남의 숯가마를 못 쓴다');
      }
    }
  }
}

// ══ 결과 ════════════════════════════════════════════════════════════════════
say(`\n=== 노·숯가마 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
