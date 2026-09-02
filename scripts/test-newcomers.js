#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-newcomers.js — 유저 마을 시작지 등록 [재민 확정 2026-09-02 · T19] ==
//
// ★설계 정본 `설계/설계_게임성_사건레이어_TODO.md` §9.3 · 회부 온보딩 A-4.
//   *"유저 마을도 시작지 등록 가능("이방인 받기" ON) — 시작 지도가 곧 길드 모집 채널.
//     자격: 쉼터 보유 · 길드 벌점 낮음 · 최근 활동."*  구현 정본 `server/newcomers.js`.
//
// ★★이 하네스가 재는 것 — 순서가 곧 카드다
//   ⓪ **검사 상황 assert** — 실서버의 정본을 쥐고 있나.
//   ① ★**§0 결함 재현과 수리** — 방금 선 마을이 `clientVillages()` 에 **그 자리에서** 오른다.
//      (여태 시딩 때 한 번 만든 `clientPayload` 에 안 들어가 **재시작 전엔 세계에 없었다**.)
//   ② 스위치: 기본 **꺼짐** · 켜면 회관 `data` 에 남고 · **재시작(=data 왕복)을 넘는다**.
//   ③ 자격 셋이 **각각 따로** 막는다 — 쉼터(사람·곳간) · 길드 벌점 · 최근 활동.
//      ★한 인자만 바꿔 답이 뒤집히는지 본다(다 같이 바꾸면 무엇이 막았는지 모른다).
//   ④ 지도: 켬 + 자격 = `listed` · 끄면 **사라진다**(자격이 남아도).
//   ⑤ 권한: 남의 마을 회관은 못 켠다 — **재고 열람과 같은 술어**(`_furnaceCanUse`)임을 소스로 확인.
//   ⑥ 도착 지점: 유저 마을도 **이방인이 내릴 자리**가 있어야 지도에 오른다.
//   ⑦ ★검사기 자가 검사 — 일부러 틀린 것을 넣으면 위 판정이 실제로 실패하는가.
//
// 실행: node scripts/test-newcomers.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37400 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-newcomer-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CLAIM_ABSENCE = '0';
process.env.NEWCOMER_SCAN_MS = process.env.NEWCOMER_SCAN_MS || '3600000';   // 배치 타이머는 안 돌린다 — 아래서 값을 직접 꽂는다
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { buildings, players, BUILDING_SIZE: SZ, Newcomers, SimVillages, Onboarding } = H;
const DAY = 24 * 60 * 60 * 1000;

// ── 픽스처 — 사람이 세운 마을 하나를 **정본 모양 그대로** 세운다 ─────────────
//   ⚠`ENABLE_VILLAGES=0` 이라 `foundPlayerVillage` 는 안 돈다(마을 시뮬 자체가 꺼져 있다).
//     그래서 여기서는 **`newcomers.js` 가 실제로 읽는 모양**만 갖춘다 —
//     `{ dbId, name, econ:{ founder, npcs, storage… } }` + 회관 건물 한 채.
//     ★그리고 ①은 그 대신 **정본 소스**로 잰다(등록 줄이 실제로 거기 있는가) — 아래 주석 참조.
let _bn = 0;
function mkVillage(vid, opts) {
  const o = opts || {};
  const econ = {
    founder: o.founder === null ? null : (o.founder || 'nc_founder'),
    founderName: o.founderName || '세운이',
    npcs: new Array(o.pop == null ? 3 : o.pop).fill(0).map((_, i) => ({ id: `n${i}` })),
    // ★곳간은 **econ 정본이 실제로 읽는 키를 다 갖춘다**. 1차 판은 `food` 하나만 넣었는데
    //   `totalFoodEquivalent` 가 `fish + meat + cooked_food` 를 더하다 **NaN** 이 됐고,
    //   `NaN < 3` 이 false 라 곳간 판정이 **조용히 자명 통과**했다(족보 76 의 재판).
    storage: Object.assign({ food: o.food == null ? 300 : o.food, fish: 0, meat: 0, cooked_food: 0 }, o.storage || {}),
    land: { size: 100 },
  };
  const vil = { dbId: vid, name: o.name || `테스트마을${vid}`, ccx: 900 + vid * 40, ccy: 900, econ, _tribeId: o.tribeId || null };
  const hid = `hall${_bn++}`;
  const hall = { id: hid, dbId: 5000 + vid, type: 'village_hall', ownerId: econ.founder, ownerName: econ.founderName,
    x: vil.ccx * SZ + SZ / 2, y: vil.ccy * SZ + SZ / 2,
    data: { villageDbId: vid, owner: econ.founder, tribeId: o.tribeId || null } };
  buildings.set(hid, hall);
  return { vil, hall };
}
const _vils = new Map();
// 정본이 부르는 자리를 **랩의 마을 표**로 갈아 끼운다(마을 시뮬이 꺼져 있으므로).
//   ★판정 함수는 갈아 끼우지 않는다 — 오직 "마을 목록을 어디서 읽나"만 바꾼다.
function initLab() {
  Newcomers.init({
    buildings, players, central: { getPlayer: async () => null, getTribe: async () => null }, ZONE_ID: 'hanbando',
    econ: require(path.join(ROOT, 'sim', 'economy-sim')),
    villageOf: (vid) => _vils.get(vid | 0) || null,
    playerVillages: () => [..._vils.values()],
    arrivalOf: (vid) => (_arrOk.has(vid | 0) ? { x: 1, y: 1, kind: 'gate' } : null),
    updateBuildingData: (dbId, json) => { _saved.set(dbId, json); },
    holdDays: 14,
    send: () => {},
  });
}
initLab();
const _arrOk = new Set();
const _saved = new Map();
const remote = (vid, rec) => Newcomers.__probe.remote.set(vid | 0, Object.assign({ vp: null, idleDays: null, at: Date.now() }, rec || {}));

console.log('\n=== 유저 마을 시작지 등록 — "이방인 받기" (T19) ===');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⓪ 검사 상황 — 실서버의 정본을 쥐고 있나');
{
  ok(!!Newcomers && typeof Newcomers.listable === 'function', '`server/newcomers.js` 정본이 붙어 있다');
  ok(Newcomers.CFG.MAX_GUILD_VP === 30,
    `길드 벌점 문턱이 central 의 '청정' 경계 그대로다 (vp < ${Newcomers.CFG.MAX_GUILD_VP})`);
  ok(Newcomers.activeDays() === 14,
    `최근 활동 문턱이 T45 의 "자리를 비웠다" 선 그대로다 (${Newcomers.activeDays()}일) — 축이 하나다`);
  ok(typeof SimVillages.playerVillages === 'function' && typeof SimVillages.villageByDbId === 'function',
    '사람이 세운 마을을 고르는 정본 둘이 열려 있다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① ★§0 결함 — 방금 선 마을이 그 자리에서 세계에 오르는가');
{
  // ★이 절은 **소스로** 잰다. 마을 시뮬을 켜고 실제로 3단계를 지어 올리는 건 `e2e-village` 의 몫이고,
  //   여기서 재려는 것은 "등록하는 줄이 실제로 그 함수 안에 있는가"다.
  //   ⚠"있다"만 보면 자명 통과다 — **없으면 무엇이 깨지는지**를 같이 못 박는다.
  const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const fn = vsrc.slice(vsrc.indexOf('function foundPlayerVillage'), vsrc.indexOf('// 교역 거리 행렬(BFS·지형)'));
  ok(/state\.clientPayload\.push\(/.test(fn), '① 마을을 세우면 `clientPayload` 에 **그 자리에서** 오른다');
  ok(/sim_village_add/.test(fn), '① 클라에도 그 한 항목이 간다(`sim_village_add`)');
  ok(/onVillageAdded/.test(fn), '① 온보딩이 그 마을의 도착 지점을 굽도록 통지한다');
  // ★통제: 여태 그 셋이 없었다는 사실을 **다른 쪽에서** 확인한다 — 하루 틱은 여전히 **갱신만** 한다
  ok(/for \(const cv of \(state\.clientPayload \|\| \[\]\)\)/.test(vsrc),
    '①-b 하루 틱은 여전히 **기존 항목 갱신**뿐이다 — 그래서 등록은 창설 그 자리에서 해야 한다');
  const osrc = fs.readFileSync(path.join(ROOT, 'server', 'onboarding.js'), 'utf8');
  ok(/function noteVillage/.test(osrc) && /if \(_arrDone\) return null;/.test(osrc),
    '① `arrivalOf` 의 `_arrDone` 조기반환은 그대로 두고 **새 문**(`noteVillage`)으로 한 곳만 굽는다',
    '전체 무효화면 51곳 37초 정지다(회부 B-7)');
  ok(typeof Onboarding.noteVillage === 'function', '① 그 문이 실제로 열려 있다');
  ok(Onboarding.noteVillage(999999) === null, '① 없는 마을엔 아무 일도 안 한다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② 스위치 — 기본 꺼짐 · 켜면 회관에 남는다');
{
  const { vil, hall } = mkVillage(1);
  _vils.set(1, vil); _arrOk.add(1);
  ok(!Newcomers.isOn(1), '② 기본은 **꺼짐**이다 — 아무 마을이나 지도에 오르지 않는다');
  ok(Newcomers.hallOf(1) === hall, '② 마을↔회관 결속은 **이미 있는 것**(`data.villageDbId`)을 읽는다');
  const r = Newcomers.setOn(1, true);
  ok(r.ok && Newcomers.isOn(1), '② 켜진다');
  ok(_saved.has(hall.dbId) && /welcomeStrangers/.test(_saved.get(hall.dbId)),
    '② 회관 `data` 로 **영속된다** — 새 표 0 · 새 컬럼 0', JSON.stringify(_saved.get(hall.dbId)).slice(0, 70));
  // 재시작 = data 왕복
  const round = JSON.parse(_saved.get(hall.dbId));
  hall.data = round;
  ok(Newcomers.isOn(1), '② 재시작(=`data` 왕복)을 넘는다');
  Newcomers.setOn(1, false);
  ok(!Newcomers.isOn(1), '② 다시 끌 수 있다');
  Newcomers.setOn(1, true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ 자격 셋 — 한 인자만 바꿔 답이 뒤집히는가');
{
  const base = () => { remote(1, { vp: 0, idleDays: 1 }); _vils.get(1).econ.npcs = [{}, {}, {}];
    _vils.get(1).econ.storage = { food: 300, fish: 0, meat: 0, cooked_food: 0 }; _arrOk.add(1); };
  base();
  const e0 = Newcomers.listable(1);
  ok(e0.ok && e0.listed, '③ 기준 상태 — 자격을 다 갖췄다(아래가 자명 통과가 아니다)',
    `인구 ${e0.pop} · 자립 ${e0.foodDays}일 · vp ${e0.vp} · ${e0.idleDays}일 전`);
  ok(Number.isFinite(e0.foodDays) && e0.foodDays > 0,
    '③ ★상황 assert — 곳간이 **실제로 재졌다**(NaN 이면 아래 곳간 절이 자명 통과다)', `${e0.foodDays}일`);
  // ⓐ 쉼터 — 사람이 없다
  _vils.get(1).econ.npcs = [];
  const a1 = Newcomers.listable(1);
  ok(!a1.ok && a1.why.join().includes('사람이 살지 않는다'), '③ⓐ 사람이 없으면 막힌다', JSON.stringify(a1.why));
  base();
  // ⓐ' 쉼터 — 곳간이 얇다
  _vils.get(1).econ.storage.food = 1;
  const a2 = Newcomers.listable(1);
  ok(!a2.ok && a2.why.join().includes('곳간이 얇다'), '③ⓐ′ 먹일 것이 없으면 막힌다', JSON.stringify(a2.why));
  base();
  // ⓐ″ ★못 읽으면 **통과시키지 않는다** — NaN 이 조용히 지나가면 이 절 전체가 거짓이 된다
  delete _vils.get(1).econ.storage.fish;
  const a3 = Newcomers.listable(1);
  ok(!a3.ok && a3.why.join().includes('곳간을 읽지 못했다') && a3.foodDays === null,
    '③ⓐ″ ★곳간을 못 읽으면 막힌다 — `NaN < 3` 은 false 라 그냥 두면 자명 통과한다', JSON.stringify(a3.why));
  base();
  // ⓑ 길드 벌점
  remote(1, { vp: Newcomers.CFG.MAX_GUILD_VP, idleDays: 1 });
  const b1 = Newcomers.listable(1);
  ok(!b1.ok && b1.why.join().includes('벌점'), '③ⓑ 길드 벌점이 문턱에 닿으면 막힌다', JSON.stringify(b1.why));
  remote(1, { vp: Newcomers.CFG.MAX_GUILD_VP - 0.1, idleDays: 1 });
  ok(Newcomers.listable(1).ok, '③ⓑ′ 문턱 **바로 아래**는 통과한다 — 경계가 살아 있다');
  base();
  // ⓒ 최근 활동
  remote(1, { vp: 0, idleDays: Newcomers.activeDays() + 0.5 });
  const c1 = Newcomers.listable(1);
  ok(!c1.ok && c1.why.join().includes('안 온다'), '③ⓒ 촌장이 오래 안 오면 막힌다', JSON.stringify(c1.why));
  remote(1, { vp: 0, idleDays: Newcomers.activeDays() - 0.5 });
  ok(Newcomers.listable(1).ok, '③ⓒ′ 문턱 바로 아래는 통과한다');
  base();
  // ⓓ central 을 모르면 **막지 않는다**(안전한 쪽 — 마을의 죄가 아니다)
  Newcomers.__probe.remote.delete(1);
  const d1 = Newcomers.listable(1);
  ok(d1.ok && d1.vp === null && d1.idleDays === null,
    '③ⓓ central 이 안 뜨면 **모른 채로 통과** — 잠깐 못 물어본 것을 마을의 죄로 삼지 않는다');
  base();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 지도 — 켬 + 자격 = 오른다 · 끄면 사라진다');
{
  remote(1, { vp: 0, idleDays: 1 });
  ok(Newcomers.listable(1).listed, '④ 켜고 자격을 갖추면 지도에 오른다');
  Newcomers.setOn(1, false);
  const off = Newcomers.listable(1);
  ok(!off.listed && off.ok, '④ ★끄면 **자격이 남아도** 사라진다 — 그게 스위치의 뜻이다',
    `ok=${off.ok} · listed=${off.listed}`);
  Newcomers.setOn(1, true);
  // 사람이 안 세운 마을(NPC)은 아예 대상이 아니다
  const npc = { dbId: 2, name: 'NPC마을', ccx: 700, ccy: 700,
    econ: { founder: null, npcs: [{}, {}], storage: { food: 900, fish: 0, meat: 0, cooked_food: 0 }, land: {} } };
  _vils.set(2, npc); _arrOk.add(2);
  const e2 = Newcomers.listable(2);
  ok(!e2.ok && e2.why.join().includes('사람이 세운 마을이 아니다'), '④ NPC 마을은 이 스위치의 대상이 아니다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ 권한 — 재고 열람과 **같은 술어**다');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const fn = zsrc.slice(zsrc.indexOf('function tryVillageWelcome'), zsrc.indexOf('function tryVillageWelcome') + 1400);
  ok(/_furnaceCanUse\(player, b\)/.test(fn), '⑤ 스위치가 `_furnaceCanUse` 를 쓴다 — 새 권한 개념 0');
  ok(/> 200\)/.test(fn), '⑤ 거리도 재고 열람과 같은 200px 다');
  const nsrc = fs.readFileSync(path.join(ROOT, 'server', 'newcomers.js'), 'utf8');
  ok(!/tribeId\s*===\s*.*tribeId/.test(nsrc) && !/function\s+\w*[Cc]anUse/.test(nsrc),
    '⑤ ★`newcomers.js` 에 권한 술어를 **다시 적지 않았다**');
  // 실제로 남의 마을은 못 켠다 — 정본 경로로 밟는다
  const { hall } = mkVillage(3, { founder: 'nc_other' });
  _vils.set(3, { dbId: 3, name: '남의마을', ccx: 1100, ccy: 900,
    econ: { founder: 'nc_other', founderName: '남', npcs: [{}, {}, {}],
      storage: { food: 300, fish: 0, meat: 0, cooked_food: 0 }, land: {} } });
  _arrOk.add(3);
  const msgs = [];
  const me = { pid: 'p_me', playerId: 'nc_founder', name: '나', ws: { readyState: 1, send: (t) => { try { msgs.push(JSON.parse(t)); } catch (e) {} } },
    x: hall.x, y: hall.y, tribeId: null, inventory: {} };
  players.set(me.pid, me);
  H.tryVillageWelcome(me, hall.id, true);
  const last = msgs.filter((m) => m.type === 'notice').slice(-1)[0];
  ok(!Newcomers.isOn(3) && last && /관리자가 아닙니다/.test(last.text),
    '⑤ 남의 마을 회관은 못 켠다 — 거절이 말뿐이 아니다', JSON.stringify(last && last.text));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 도착 지점 — 이방인이 내릴 자리가 있어야 오른다');
{
  remote(1, { vp: 0, idleDays: 1 });
  _arrOk.delete(1);
  const noArr = Newcomers.listable(1);
  ok(!noArr.ok && noArr.why.join().includes('도착 지점'), '⑥ 내릴 자리가 없으면 지도에 안 오른다', JSON.stringify(noArr.why));
  _arrOk.add(1);
  ok(Newcomers.listable(1).ok, '⑥ 생기면 오른다 — NPC 마을과 **같은 조건**이다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥-b ★배치가 central 을 실제로 읽는 길 — `scan()` 을 밟는다');
{
  // ★★1차 판의 구멍: ③은 `_remote` 에 값을 **손으로 꽂아** 재서, 그 값을 **만드는 길**(`scan`)이
  //   한 번도 안 밟혔다. 그 사이에 `p.last_seen | 0`(int32 절단 · 족보 77)이 숨어 있었고
  //   `e2e-village` 가 **"촌장이 20679일째 안 온다"**(=56년)로 잡았다 — 방금 로그인한 사람이었다.
  //   ⇒ 여기서 가짜 central 로 그 길을 직접 밟는다.
  const NOW = Date.now();
  const seen = NOW - 3 * DAY;
  Newcomers.init({
    buildings, players, ZONE_ID: 'hanbando',
    econ: require(path.join(ROOT, 'sim', 'economy-sim')),
    villageOf: (vid) => _vils.get(vid | 0) || null,
    playerVillages: () => [_vils.get(1)],
    arrivalOf: () => ({ x: 1, y: 1, kind: 'gate' }),
    updateBuildingData: () => {},
    holdDays: 14, send: () => {},
    central: {
      getPlayer: async () => ({ last_seen: seen, tribe_id: 42 }),
      getTribe: async () => ({ tribe: { id: 42, vp: 7.5 } }),
    },
  });
  return require('util').promisify(setImmediate)().then(() => Newcomers.scan()).then(() => {
    const r = Newcomers.__probe.remote.get(1);
    ok(!!r, '⑥-b 배치가 그 마을을 실제로 재고 갔다');
    ok(r && Math.abs(r.idleDays - 3) < 0.01,
      '⑥-b ★`last_seen` 이 **날 수로 바르게** 온다 — `| 0` 절단이 없다(1차 판은 20679일이 나왔다)',
      `idleDays=${r ? r.idleDays.toFixed(3) : '?'} (기대 3)`);
    ok(r && r.vp === 7.5, '⑥-b 길드 벌점도 central 정본에서 온다', `vp=${r && r.vp}`);
    // ★통제: epoch ms 를 `| 0` 하면 실제로 말도 안 되는 수가 나온다(이 검사가 무엇을 막는지)
    const bad = (NOW - (seen | 0)) / DAY;
    ok(bad > 1000, `⑥-b′ 통제 실험: \`| 0\` 을 쓰면 ${Math.round(bad)}일이 나온다 — 이 검사가 막는 것이 그것이다`);
    return main2();
  });
}

function main2() {
// ★⑥-b 가 host 를 갈아 끼웠다 — 되돌린다(안 되돌리면 ⑦의 도착 지점·영속 갈래가 딴 것을 잰다).
initLab();
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ ★이 하네스가 실패할 줄 아는가');
{
  // ⑦-a 자격 판정이 **상수가 아니다** — 같은 마을에서 한 인자만 움직여 답이 두 번 뒤집힌다
  remote(1, { vp: 0, idleDays: 1 });
  const on1 = Newcomers.listable(1).ok;
  _vils.get(1).econ.npcs = [];
  const off1 = Newcomers.listable(1).ok;
  _vils.get(1).econ.npcs = [{}, {}, {}];
  const on2 = Newcomers.listable(1).ok;
  ok(on1 && !off1 && on2, '⑦-a 통제 실험: 인구 하나로 답이 켜졌다 꺼졌다 켜진다(상수가 아니다)');
  // ⑦-b `listed` 가 스위치와 자격 **둘 다**를 본다 — 하나만 보면 여기서 걸린다
  Newcomers.setOn(1, false); const s0 = Newcomers.listable(1);
  Newcomers.setOn(1, true);  _arrOk.delete(1); const s1 = Newcomers.listable(1); _arrOk.add(1);
  const s2 = Newcomers.listable(1);
  ok(!s0.listed && !s1.listed && s2.listed,
    '⑦-b 통제 실험: 스위치만 켜도, 자격만 갖춰도 안 오른다 — **둘 다**여야 오른다');
  // ⑦-c 문턱이 실제로 그 수에 걸려 있다(1 차이로 갈린다)
  remote(1, { vp: Newcomers.CFG.MAX_GUILD_VP - 0.01, idleDays: 1 });
  const justOk = Newcomers.listable(1).ok;
  remote(1, { vp: Newcomers.CFG.MAX_GUILD_VP + 0.01, idleDays: 1 });
  const justNo = Newcomers.listable(1).ok;
  ok(justOk && !justNo, `⑦-c 통제 실험: 벌점 ${Newcomers.CFG.MAX_GUILD_VP} 을 0.02 사이에 두고 답이 갈린다`);
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
}
