#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-mob-hp-door.js — 짐승(존 몹) HP 는 문 하나(`setMobHp`)로 쓴다(T954 · 실서버 함수 그대로 · 한 프로세스 · 몇 초) ===
//   T942 회부 ①: 사람 · 마을 NPC 몸 hp 는 문(`setHp`) 하나가 됐는데 존 몹 hp 는 다섯 자리가 제각각 썼다. T954 가 그 다섯을 문 하나로 모았다 —
//   값은 부르는 쪽 식 그대로(하한 · 상한은 자리마다 종전 그대로) · 문은 쓰기 → 저장 표(`dirty`) → `mob_damaged` 방송을 낱말 표대로.
//   이 하네스가 실서버 함수(`__testBind` — test-tame 꼴)로 지키는 것:
//     ⓪ 문 자체 — 낱말 다섯 × 값(0 밑 · 0 · 소수 · maxHp 위) × 앞 값: 값 그대로(깎기 0 — 깎기는 자리의 식) · 저장 표 · 방송이 낱말 표대로
//     ① 사람 공격(`tryAttack`) — 10씩 깎이고 0 밑 그대로 · 저장 표 · 방송 hp = 그 값 · 0 이하에서 사체 · 몹이 빠진다
//     ② 화살(`tryRangedAttack` → `stepArrows`) — 0 하한 · 저장 표 **안** 세움(종전 그대로) · 방송 · 0 에서 사체
//     ③ NPC 가 싸우는 늑대(`npcStep`) — 8씩 · 0 밑 그대로 · 저장 표 · 방송 · 0 이하에서 지움(`mob_removed`)
//     ④ 길들인 짐승 먹이(`tryFeed`) — +5 · maxHp 상한 · 저장 표 · 방송 · 알림
//     ⑤ 야생 — 존이 야생에 넘긴 host 의 문이 이 문이다(야생 tick 의 그림자 동기 = 조용한 `wild` · 하한 1)
//   ①~④ 의 `[관찰]` 줄은 문 앞 트리(main)에서도 같은 글자로 나와야 한다(T954 보고 §3 A/B — 그 판에선 ⓪ · ⑤ 만 문이 없어 빨갛다).
//   ★[T967 2026-10-27 · ★PM 결함 둘] 손잡이 `T967_MOB_HP`(켬 기본 · `=0` 되돌림): 켬 = 화살도 저장 표(`dirty`) · 죽음 하한 0(문 안 한 번 — 0 밑 갈래
//     `npc` · `player` 가 0 에서 멈추고 방송 hp 도 0) · 끔 = T954 문 그대로. 이 프로세스는 제 판(env)대로 재고, 부모(env 없음 = 켬)는 끝에 자기를
//     `T967_MOB_HP=0` 자식으로 한 번 더 돌려 끔 판을 본다 — 끔 판의 `[관찰]` 줄 넷은 T954 의 그 글자와 같아야 한다(종전 그대로).
// 실행: node scripts/test-mob-hp-door.js   (실서버를 임시 DB · 임시 포트로 한 프로세스에 띄운다 — 라이브 무접촉)
'use strict';
// ★[T1065 판 꾸밈] 이 하네스가 재는 것 = 짐승 hp 문(맨손 10 · 화살 25 피해 픽스처) — 도구 문(`T1065_TOOL_GATE` · 맨손 거부 · 활 없음)은 `test-t1065-tool-gate` 가 잰다. 단언 무변 · 손으로 켜 볼 수 있다(env 를 주면 그 값).
process.env.T1065_TOOL_GATE = process.env.T1065_TOOL_GATE || '0';
const path = require('path');
const fs = require('fs');
const TMP = `/tmp/test-mob-hp-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = process.env.PORT || String(39800 + (process.pid % 90));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0';   // 존 안의 야생은 끈다 — ⑤ 는 야생 모듈을 따로 새로 적재해 존의 문을 host 로 넣는다
process.env.ENABLE_BANDITS = '0';
process.env.ENABLE_ROADS = '0';
process.env.LATENCY_MS = '0';
const ROOT = path.join(__dirname, '..');
const _log = console.log, _warn = console.warn, _err = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _log; console.warn = _warn; console.error = _err;
const H = Zone.__testBind();
const ON = process.env.T967_MOB_HP !== '0';   // ★[T967] 이 프로세스의 판(env 없음 = 켬)
const CHILD = process.env.T967_DOOR_CHILD === '1';
const exp = (v) => (ON ? Math.max(0, v) : v);   // ★[T967] 켬 = 죽음 하한 0(문 안) · 끔 = 값 그대로
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; _log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const seen = (m) => _log(`  [관찰] ${m}`);
// 방송을 받는 눈 — 존의 `players` 에 소켓 하나(멀리 · 사람 아님 판정에 안 걸리게)
const msgs = [];
H.players.set('t954_watch', { pid: 't954_watch', playerId: 't954_watch', name: '눈', x: -1e7, y: -1e7, floor: 0, isNpc: false,
  ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } } });
const mobMsgs = (mid) => msgs.filter((o) => (o.type === 'mob_damaged' || o.type === 'mob_removed') && o.mid === mid).map((o) => (o.type === 'mob_damaged' ? o.hp : 'removed'));
let _pid = 0, _mid = 0;
function mkPlayer(inv) {
  const notices = [];
  const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notices.push(o.text); } catch (e) {} } };
  return { pid: `t954p${++_pid}`, playerId: `t954_${_pid}`, name: '사냥꾼', ws, x: 5000, y: 5000, floor: 0, inventory: Object.assign({}, inv || {}),
    toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null, tribeId: null, tribeName: null, hunger: 100, thirst: 100, oreCarry: {},
    lastAttackAt: 0, lastRangedAt: 0, vp: 0, notices };
}
function placeMob(type, x, y, hp) {
  const d = H.MOB_DEFS[type];
  const m = { mid: `t954m${++_mid}`, type, x, y, z: 0, floor: 0, hp: hp != null ? hp : d.maxHp, maxHp: d.maxHp,
    tameOwner: null, tameOwnerName: null, tameProgress: 0, aggroTarget: null, dirty: false };
  H.mobs.set(m.mid, m);
  return m;
}
const typeWith = (pred) => Object.keys(H.MOB_DEFS).find((k) => pred(H.MOB_DEFS[k]));

_log(`\n=== 짐승(존 몹) HP 를 쓰는 문 — T954 · T967(${ON ? '켬' : '끔 =0'}) ===`);
ok(H.T967_MOB_HP === ON, `★[T967] 손잡이 \`T967_MOB_HP\` 가 env 대로 선다(없음 = 켬 · \`=0\` = 끔)`, `존 ${H.T967_MOB_HP} · env ${process.env.T967_MOB_HP == null ? '없음' : process.env.T967_MOB_HP}`);

_log('\n⓪ 문 자체(`setMobHp`) — 값(켬: 0 밑은 0) · 저장 표 · 방송은 낱말 표대로');
if (typeof H.setMobHp !== 'function') ok(false, '★⓪ 문 `setMobHp` 가 하네스 문(`__testBind`)에 있다', '없음 — 문 앞 트리');
else {
  const WHYS = ['npc', 'feed', 'arrow', 'player', 'wild'];
  const KEEP = new Set(ON ? ['npc', 'feed', 'arrow', 'player'] : ['npc', 'feed', 'player']), LOUD = new Set(['npc', 'feed', 'arrow', 'player']);   // ★[T967] 켬 = 화살도 저장 표
  let n = 0, same = 0, keepOk = 0, loudOk = 0;
  for (const why of WHYS) for (const prev of [0, 7, 30]) for (const v of [-3, 0, 0.5, 12, 999]) {
    const m = { mid: `t954d${n}`, hp: prev, maxHp: 30, dirty: false };
    const k0 = msgs.length;
    H.setMobHp(m, v, why); n++;
    const got = msgs.slice(k0).filter((o) => o.mid === m.mid);
    if (Object.is(m.hp, exp(v))) same++;
    if (m.dirty === KEEP.has(why)) keepOk++;
    if (LOUD.has(why) ? (got.length === 1 && got[0].type === 'mob_damaged' && Object.is(got[0].hp, exp(v))) : got.length === 0) loudOk++;
  }
  if (ON) {
    ok(same === n, '★★⓪ [T967 켬] 값은 부르는 쪽 식 그대로이되 0 밑은 0 — 문 안에서 한 번(0 · 소수 · maxHp 위는 그 값 · 상한은 자리 식)', `${same}/${n}`);
    ok(keepOk === n, '★⓪ [T967 켬] 저장 표(`dirty`)는 npc · feed · arrow · player(화살도 — ★PM 결함) · 그림자 `wild` 는 안 세운다', `${keepOk}/${n}`);
    ok(loudOk === n, '★⓪ `mob_damaged` 방송은 npc · feed · arrow · player 만 · hp = 쓴 값(0 밑은 0) 한 건 — 0 밑 방송 0(그림자 동기 `wild` 는 조용하다)', `${loudOk}/${n}`);
  } else {
    ok(same === n, '★★⓪ [끔] 값은 부르는 쪽 식 그대로 — 문은 깎지 않는다(0 밑 · 0 · 소수 · maxHp 위 다 그 값 · T954)', `${same}/${n}`);
    ok(keepOk === n, '★⓪ [끔] 저장 표(`dirty`)는 npc · feed · player 만(T954 · 화살 · 그림자는 안 세웠다)', `${keepOk}/${n}`);
    ok(loudOk === n, '★⓪ [끔] `mob_damaged` 방송은 npc · feed · arrow · player 만 · hp = 쓴 값 한 건(그림자 동기 `wild` 는 조용하다)', `${loudOk}/${n}`);
  }
  ok(H.MOB_HP_KEEP instanceof Set && H.MOB_HP_LOUD instanceof Set && [...H.MOB_HP_KEEP].sort().join() === 'feed,npc,player' && [...H.MOB_HP_LOUD].sort().join() === 'arrow,feed,npc,player',
    '★⓪ 존의 낱말 표 = 위 견줌의 표(하네스가 손으로 적은 표와 존 표가 같다)', `${[...(H.MOB_HP_KEEP || [])].join(',')} / ${[...(H.MOB_HP_LOUD || [])].join(',')}`);
}

_log('\n① 사람 공격(`tryAttack`)');
{
  H.mobs.clear();
  const prey = typeWith((d) => !d.tameFood && d.maxHp >= 20) || 'deer';
  const p = mkPlayer();
  const m = placeMob(prey, p.x + 20, p.y, 15);
  const hs = [];
  for (let i = 0; i < 3 && H.mobs.has(m.mid); i++) { p.lastAttackAt = 0; H.tryAttack(p); hs.push(m.hp); }
  const ms = mobMsgs(m.mid), corpse = [...(H.corpses ? H.corpses.values() : [])].some((c) => c && c.mobType === m.type && Math.abs(c.x - m.x) < 1 && Math.abs(c.y - m.y) < 1);
  seen(`사람 공격 ${prey} hp 15 → ${hs.join(' → ')} · 방송 ${ms.join(',')} · 저장 표 ${m.dirty} · 사체 ${corpse} · 몹 남음 ${H.mobs.has(m.mid)}`);
  if (ON) {
    ok(hs[0] === 5 && hs[1] === 0 && hs.length === 2, '★★① [T967 켬] 10씩 깎이고 0 에서 멈춘다(자리 식 `hp − atk` 은 그대로 · 문이 0 밑을 0 으로)', hs.join(' → '));
    ok(ms.join(',') === '5,0,removed' && m.dirty === true, '★① [T967 켬] 방송 hp = 그 값(0 밑 방송 0) · 저장 표 · 0 에서 `mob_removed`(죽음 판 `hp <= 0` 그대로)', ms.join(','));
  } else {
    ok(hs[0] === 5 && hs[1] === -5 && hs.length === 2, '★★① [끔] 10씩 깎이고 0 밑을 그대로 둔다(종전 식 `hp -= atk` — 하한 없음)', hs.join(' → '));
    ok(ms.join(',') === '5,-5,removed' && m.dirty === true, '★① [끔] 방송 hp = 그 값(0 밑 그대로) · 저장 표 · 0 이하에서 `mob_removed`', ms.join(','));
  }
  ok(corpse && !H.mobs.has(m.mid), '① 0 이하에서 사체가 서고 몹이 빠진다(죽음 차례 그대로)');
}

_log('\n② 화살(`tryRangedAttack` → `stepArrows`)');
{
  H.mobs.clear();
  const prey = typeWith((d) => !d.tameFood && d.maxHp >= 20) || 'deer';
  const p = mkPlayer();
  const m = placeMob(prey, p.x + 200, p.y, 30);
  const hs = [];
  for (let shot = 0; shot < 3 && H.mobs.has(m.mid); shot++) {
    p.lastRangedAt = 0; H.tryRangedAttack(p, m.x, m.y);
    for (let i = 0; i < 60 && H.mobs.has(m.mid); i++) { const h0 = m.hp; H.stepArrows(1 / 30); if (m.hp !== h0) { hs.push(m.hp); break; } }
  }
  const ms = mobMsgs(m.mid), corpse = [...(H.corpses ? H.corpses.values() : [])].some((c) => c && c.mobType === m.type && Math.abs(c.x - m.x) < 1 && Math.abs(c.y - m.y) < 1);
  seen(`화살 ${prey} hp 30 → ${hs.join(' → ')} · 방송 ${ms.join(',')} · 저장 표 ${m.dirty} · 사체 ${corpse} · 몹 남음 ${H.mobs.has(m.mid)}`);
  ok(hs[0] === 5 && hs[1] === 0 && hs.length === 2, '★★② 25씩 깎이고 0 에서 멈춘다(종전 식 `max(0, hp − dmg)` — 하한 0)', hs.join(' → '));
  if (ON) ok(ms.join(',') === '5,0,removed' && m.dirty === true, '★② [T967 켬] 방송 hp = 그 값 · 저장 표를 **세운다**(★PM 결함 — 화살만 맞은 몹도 주기 저장이 적는다) · 0 에서 `mob_removed`', `${ms.join(',')} · dirty ${m.dirty}`);
  else ok(ms.join(',') === '5,0,removed' && m.dirty === false, '★② [끔] 방송 hp = 그 값 · 저장 표는 **안** 세운다(T954 화살 자리 그대로) · 0 에서 `mob_removed`', `${ms.join(',')} · dirty ${m.dirty}`);
  ok(corpse && !H.mobs.has(m.mid), '② 0 에서 사체가 서고 몹이 빠진다');
}

_log('\n③ NPC 가 싸우는 늑대(`npcStep`)');
{
  H.mobs.clear();
  const w = placeMob('wolf', 8000, 8000, 20);
  const npc = { pid: 't954_npc', playerId: 'npc_t954', name: '사냥 NPC', isNpc: true, x: 8010, y: 8000, vx: 0, vy: 0, floor: 0,
    behavior: 'fight', fightTarget: w.mid, lastAttackAt: 0, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100 };
  const hs = []; let now = 1e6;
  for (let i = 0; i < 6 && H.mobs.has(w.mid); i++) { now += 1001; H.npcStep(npc, 1 / 30, now); hs.push(w.hp); }
  const ms = mobMsgs(w.mid);
  seen(`NPC 대 늑대 hp 20 → ${hs.join(' → ')} · 방송 ${ms.join(',')} · 저장 표 ${w.dirty} · 몹 남음 ${H.mobs.has(w.mid)} · NPC ${npc.behavior}`);
  if (ON) {
    ok(hs.slice(0, 3).join() === '12,4,0' && !H.mobs.has(w.mid), '★★③ [T967 켬] 8씩 깎이고 0 에서 멈춘다(문이 0 밑을 0 으로) · 0 에서 지운다', hs.join(' → '));
    ok(ms.join(',') === '12,4,0,removed' && w.dirty === true, '★③ [T967 켬] 방송 hp = 그 값(0 밑 방송 0) · 저장 표 · 0 에서 `mob_removed`(죽음 차례 그대로)', ms.join(','));
  } else {
    ok(hs.slice(0, 3).join() === '12,4,-4' && !H.mobs.has(w.mid), '★★③ [끔] 8씩 깎이고 0 밑을 그대로 둔다(종전 식 `hp -= 8`) · 0 이하에서 지운다', hs.join(' → '));
    ok(ms.join(',') === '12,4,-4,removed' && w.dirty === true, '★③ [끔] 방송 hp = 그 값 · 저장 표 · 0 이하에서 `mob_removed`(죽음 차례 그대로)', ms.join(','));
  }
}

_log('\n④ 길들인 짐승 먹이(`tryFeed`)');
{
  H.mobs.clear();
  const Era = require(path.join(ROOT, 'server', 'era.js'));
  const pet = Object.keys(H.MOB_DEFS).filter((k) => H.MOB_DEFS[k].tameFood && H.MOB_DEFS[k].maxHp >= 10 && Era.canTame(k)).sort()[0];
  const def = H.MOB_DEFS[pet];
  const p = mkPlayer({ [def.tameFood]: 50 });
  const m = placeMob(pet, p.x + 10, p.y);
  for (let i = 0; i < (def.tameNeed || 3); i++) H.tryFeed(p);
  const tamed = m.tameOwner === p.playerId;
  m.hp = m.maxHp - 3; m.dirty = false; const k0 = msgs.length;   // 하네스가 몸을 다치게 세운다(존 소스가 아니다 — 문 검사 밖)
  H.tryFeed(p);
  const h1 = m.hp, d1 = m.dirty;
  m.hp = m.maxHp - 9;
  H.tryFeed(p);
  const h2 = m.hp;
  const ms = msgs.slice(k0).filter((o) => o.mid === m.mid && o.type === 'mob_damaged').map((o) => o.hp);
  seen(`먹이 ${pet}(maxHp ${m.maxHp}) 길듦 ${tamed} · maxHp−3 → ${h1} · maxHp−9 → ${h2} · 방송 ${ms.join(',')} · 저장 표 ${d1} · 알림 ${p.notices.slice(-1)[0] || ''}`);
  ok(tamed && h1 === m.maxHp && h2 === m.maxHp - 4, '★★④ +5 · maxHp 상한(종전 식 `min(maxHp, hp + 5)`)', `${h1} · ${h2}`);
  ok(ms.join(',') === `${m.maxHp},${m.maxHp - 4}` && d1 === true && /HP \+5/.test(p.notices.slice(-1)[0] || ''), '★④ 방송 hp = 그 값 · 저장 표 · 알림 "HP +5"', ms.join(','));
}

_log('\n⑤ 야생 — 존이 넘긴 host 의 문');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const i = zsrc.indexOf('\nWildlife.init({'), j = zsrc.indexOf('\n});', i);
  const host = i >= 0 && j > i ? zsrc.slice(i, j) : '';
  ok(/\n  setMobHp,/.test(host), '★⑤ `Wildlife.init` host 가 존의 짐승 HP 문 `setMobHp` 를 넘긴다(야생은 그 문으로 그림자 hp 를 쓴다 · 사본 0)');
  // 야생 모듈을 새로 적재해(켬) 존의 그 문을 host 로 넣고 한 판 — 그림자 동기가 문을 지나 조용한 `wild` · 하한 1 인가
  const WP = path.join(ROOT, 'server', 'wildlife.js'); delete require.cache[require.resolve(WP)];
  const env0 = process.env.ENABLE_WILDLIFE; process.env.ENABLE_WILDLIFE = '1';
  console.log = () => {};
  let W = null; try { W = require(WP); } catch (e) { W = null; }
  process.env.ENABLE_WILDLIFE = env0;
  const calls = []; const k0 = msgs.length;
  const door = typeof H.setMobHp === 'function' ? (m, v, why) => { calls.push([why, v]); return H.setMobHp(m, v, why); } : null;
  let shadows = 0;
  if (W && door) {
    //   최소 host — `test-zone-fauna` ④ 의 그 host 꼴(활성 청크 전부 · 사냥터 개체군 100 · 숲 배수 2) + 씨 뿌린 흐름(결정론) + 존의 문
    const N = 64, CH = 512, CC = CH / 32, mobs = new Map();
    const LED = new Map(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
    const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
    let st = 1020 | 0; const rng = () => { st = (st + 0x6D2B79F5) | 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    try {
      W.init({ rng, ZONE_ID: 'hanbando', TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
        WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
        isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 },
        chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
        players: new Map(), mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
        spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {}, setMobHp: door, simVillages: () => [], legacyVillages: [], warThreats: () => [],
        gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size });
      let t = 60000; for (let k = 0; k < 600; k++) { t += 1000 / 30; W.tick(t); }
      shadows = mobs.size;
    } catch (e) { shadows = -1; }
  }
  console.log = _log;
  const ws = calls.filter((c) => c[0] === 'wild');
  ok(!!door && shadows > 0 && ws.length > 0 && calls.every((c) => c[0] === 'wild') && ws.every((c) => c[1] >= 1) && msgs.length === k0,
    '★★⑤ 야생 tick 의 그림자 동기가 그 문을 지난다 — 낱말 `wild` 만 · 값 ≥ 1(하한 1 은 그 식) · 방송 0', door ? `그림자 ${shadows} · 문 ${ws.length}번 · 방송 ${msgs.length - k0}` : '문 없음 — 문 앞 트리');
}
if (!CHILD) {
  _log('\n⑥ [T967] 끔 판(`T967_MOB_HP=0` 자식 — 이 하네스 그대로 한 번 더) — T954 문 그대로인가');
  //   끔 판의 `[관찰]` 줄 넷 = T954 가 잰 그 글자(T954 보고 §2-2 · 문 앞 트리와도 같았던 줄) — 종전 그대로의 증거
  const T954_SEEN = [
    '사람 공격 wolf hp 15 → 5 → -5 · 방송 5,-5,removed · 저장 표 true · 사체 true · 몹 남음 false',
    '화살 wolf hp 30 → 5 → 0 · 방송 5,0,removed · 저장 표 false · 사체 true · 몹 남음 false',
    'NPC 대 늑대 hp 20 → 12 → 4 → -4 · 방송 12,4,-4,removed · 저장 표 true · 몹 남음 false · NPC wander',
    '먹이 camel_domestic(maxHp 80) 길듦 true · maxHp−3 → 80 · maxHp−9 → 76 · 방송 80,76 · 저장 표 true · 알림 camel_domestic HP +5',
  ];
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000,
    env: Object.assign({}, process.env, { T967_MOB_HP: '0', T967_DOOR_CHILD: '1', PORT: String(38600 + (process.pid % 90)) }) });
  const out = String(r.stdout || '');
  const got = out.split('\n').filter((l) => /\[관찰\]/.test(l)).map((l) => l.replace(/^\s*\[관찰\]\s*/, ''));
  const tail = (out.match(/=== (\d+)건 중 PASS (\d+) · FAIL (\d+) ===/) || []);
  ok(r.status === 0 && tail[3] === '0' && Number(tail[2]) > 0, '★⑥ 끔 자식이 제 판 검사를 다 통과한다(끔 = T954 문 — 값 그대로 · 화살 저장 표 없음 · 0 밑 방송)', tail[0] || `종료 ${r.status}`);
  ok(got.length === 4 && got.every((l, i) => l === T954_SEEN[i]), '★★⑥ 끔 판의 `[관찰]` 줄 넷이 T954 의 그 글자와 같다(되돌림 `=0` = 종전 그대로)', got.length === 4 ? '넷 같음' : `줄 ${got.length}`);
  if (!(got.length === 4 && got.every((l, i) => l === T954_SEEN[i]))) for (const l of got) _log(`    끔: ${l}`);
}
_log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
try { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) fs.unlinkSync(f); } catch (e) {}
process.exit(fail ? 1 : 0);
