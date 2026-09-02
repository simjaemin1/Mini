#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-tame.js — 길들이기 시대 게이트 E2E =========================
//
// ★왜 [2026-08-02d 배치 5 ③]
//   `era.js` 는 "송국리기엔 기마 없음"을 표(UNLOCK.early_iron.tame = ['horse'])로 적어 뒀는데
//   **`canTame` 호출부가 0곳**이었다 — 표는 있고 배선이 없었다. `breeding:true` 13종이 시대와
//   무관하게 먹이 3번에 길들여졌다. 이 하네스가 그 배선을 실서버 `tryFeed` 로 못박는다.
//
// ★검사의 요점은 "말이 막히나"가 아니라 **"말만 막히나"** 다.
//   UNLOCK 의 tame 목록은 "이 시대에 **새로 알려지는** 것"이라 망라 목록이 아니다.
//   화이트리스트로 구현하면 양·염소·닭·오리·벌·누에까지 전부 막힌다(13종 중 11종).
//   그래서 ②가 **전 축종 전수**다 — 한 종이라도 억울하게 막히면 FAIL.
//
// 실행: node scripts/test-tame.js   (실서버를 임시 DB·임시 포트로 띄운다 — 라이브 무접촉)
'use strict';
const path = require('path');
const fs = require('fs');

const TMP = `/tmp/test-tame-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = process.env.PORT || String(39900 + (process.pid % 90));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0';   // 야생 스폰 없이 — 우리가 직접 심는다(결정론)
process.env.ENABLE_BANDITS = '0';
process.env.ENABLE_ROADS = '0';

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
const _warn = console.warn, _err = console.error;
console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
const Era = require(path.join(__dirname, '..', 'server', 'era.js'));
const { ANIMALS } = require(path.join(__dirname, '..', 'server', 'animals.js'));
quiet = false; console.log = _log; console.warn = _warn; console.error = _err;

const H = Zone.__testBind();
let pass = 0, fail = 0;
const say = (...a) => _log(...a);
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };

// ── 목 플레이어(test-furnace 동형) ───────────────────────────────────────────
let _pid = 0;
function mkPlayer(inv) {
  const notices = [];
  const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notices.push(o.text); } catch (e) {} } };
  return { playerId: `tame_${++_pid}`, name: '길들이', ws, x: 5000, y: 5000, floor: 0,
    inventory: Object.assign({}, inv || {}), toolItems: [], equipped: null, hotkey1: null,
    tribeId: null, tribeName: null, hunger: 100, thirst: 100, oreCarry: {}, notices };
}
const lastNotice = (p) => p.notices[p.notices.length - 1] || '';

// ── 목 동물 심기 — 실서버 mobs 맵에 직접(스폰 규칙·바이옴은 이 검사의 대상이 아니다) ──
let _mid = 0;
function placeMob(type, x, y) {
  const d = H.MOB_DEFS[type];
  const m = { mid: `m${++_mid}`, type, x, y, hp: d.maxHp, maxHp: d.maxHp,
    tameOwner: null, tameOwnerName: null, tameProgress: 0, aggroTarget: null, dirty: false };
  H.mobs.set(m.mid, m);
  return m;
}
function clearMobs() { H.mobs.clear(); }

// 먹이를 tameNeed 번 준다. 성공하면 true.
function feedUntilTamed(p, mob) {
  const need = H.MOB_DEFS[mob.type].tameNeed || 3;
  for (let i = 0; i < need + 1; i++) H.tryFeed(p);
  return mob.tameOwner === p.playerId;
}

const BREEDERS = Object.keys(ANIMALS).filter((k) => ANIMALS[k].breeding);
say(`\n=== 길들이기 시대 게이트 E2E — breeding ${BREEDERS.length}종 ===`);

// ── ① 표와 카탈로그의 id 정합 ────────────────────────────────────────────────
//   표에 카탈로그에 없는 이름이 적혀 있으면 게이트가 **조용히 헛돈다**(막으려던 걸 안 막는다).
say('\n① UNLOCK.tame 의 id 가 ANIMALS 카탈로그에 실재하는가');
{
  const bad = [];
  for (const e of Era.ERAS) for (const a of ((Era.UNLOCK[e] || {}).tame || [])) {
    if (!ANIMALS[a]) bad.push(`${e}:${a}`);
  }
  ok(bad.length === 0, `표의 모든 tame id 가 카탈로그에 존재 ${bad.length ? '— 없는 id: ' + bad.join(', ') : ''}`);
  const gated = BREEDERS.filter((k) => Era.tameEraOf(k));
  say(`    시대 축이 거는 축종: ${gated.map((k) => `${k}→${Era.tameEraOf(k)}`).join(' · ') || '(없음)'}`);
}

// ── ② 청동기 — 말만 막히고 **나머지는 전부 통과** ───────────────────────────
say('\n② 청동기(현 시대) — 말만 막히는가 (전 축종 전수)');
Era.setEra('bronze');
{
  let blocked = [], allowed = [];
  for (const type of BREEDERS) {
    clearMobs();
    const food = H.MOB_DEFS[type].tameFood;
    const p = mkPlayer({ [food]: 20 });
    const mob = placeMob(type, p.x + 10, p.y);
    const tamed = feedUntilTamed(p, mob);
    (tamed ? allowed : blocked).push(type);
  }
  say(`    통과 ${allowed.length}종: ${allowed.join(', ')}`);
  say(`    차단 ${blocked.length}종: ${blocked.join(', ') || '(없음)'}`);
  ok(blocked.length === 1 && blocked[0] === 'horse', '차단은 말 **하나뿐** (기존 가축 무영향)');
  ok(allowed.includes('cow') && allowed.includes('pig') && allowed.includes('chicken')
     && allowed.includes('sheep') && allowed.includes('bee'),
     '소·돼지·닭·양·벌 전부 그대로 길들여진다');
}

// ── ③ 차단 시 계약 — 먹이가 **안 닳고** 진척도 0, 메시지에 시대 노출 없음 ──
say('\n③ 차단의 계약 — 외상 없음 · 몰입 유지');
{
  clearMobs();
  const p = mkPlayer({ oats: 5 });
  const mob = placeMob('horse', p.x + 10, p.y);
  H.tryFeed(p);
  ok((p.inventory.oats || 0) === 5, '먹이가 안 닳는다 (차단은 게이트지 소비가 아니다)');
  ok((mob.tameProgress || 0) === 0, '진척도가 안 오른다');
  ok(mob.tameOwner === null, '주인이 안 붙는다');
  const t = lastNotice(p);
  say(`    메시지: "${t}"`);
  ok(/길들일 수 없/.test(t), '거부 메시지가 나온다');
  ok(!/시대|철기|청동기|era|bronze|iron/i.test(t), '메시지에 **시대를 노출하지 않는다** (몰입 유지)');
}

// ── ④ 시대를 열면 같은 말이 길들여진다 (게이트가 진짜 시대 축인가) ──────────
say('\n④ ERA_FLIP 리허설 — early_iron 을 열면 말이 열린다');
Era.setEra('early_iron');
{
  clearMobs();
  const p = mkPlayer({ oats: 20 });
  const mob = placeMob('horse', p.x + 10, p.y);
  const tamed = feedUntilTamed(p, mob);
  ok(tamed, '시대를 열면 말이 길들여진다');
  ok((p.inventory.oats || 0) < 20, '이번엔 먹이가 실제로 닳는다');
}
// ⑤ 되돌리면 다시 막힌다 — 다이얼이지 일방통행이 아니다
say('\n⑤ 되돌리기 — 다이얼은 양방향이다');
Era.setEra('bronze');
{
  clearMobs();
  const p = mkPlayer({ oats: 20 });
  const mob = placeMob('horse', p.x + 10, p.y);
  ok(!feedUntilTamed(p, mob), '시대를 닫으면 말이 다시 막힌다');
}
Era.setEra(null);

say(`\n=== 길들이기 게이트: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
