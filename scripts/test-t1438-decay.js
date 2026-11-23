#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1438-decay.js — 구조물은 낡는다(T1438 · 손잡이 `T1438_DECAY` 끔 기본) ============================================
//
// ★왜 [지시 T1438 · ★재민 11-22 판정 38 · 39 · 11-08 "플레이어와 NPC 는 같은 활동을 같은 규칙으로"]
//   재료 셋(풀 · 나무 · 흙돌)의 빠르기로 구조물이 낡는다 · 구조물은 제 재료를 따른다 · 문턱 없이 비례 · 수리 = 넣은 재료만큼 · NPC 도 같은 규칙.
//   시계 = 서버가 켜져 있던 시간(T1402 사유지 시계) · 읽을 때 셈(쓰기 0 · DB 행 0) · 한 값(판정 39 — 공격과 낡음이 같은 칸).
// 판(운영 함수 그대로 · 사본 0):
//   ㉮ 셈(`server/decay.js` 순수) — ①a 빠르기 = 고증 가운데(풀 1.5해 · 나무 15해 · 흙돌 17해) · 끝 값 둘(lo · hi) ①b 구조물은 제 재료(울 = 판자 = 나무 ·
//     움집 = 지붕 풀 + 뼈대 나무 · 곳간 = 판자 + 돌 섞음 — 원자재 몫 무게) · 불 자리 · 밭 · 폐허 · 움집에 붙은 벽은 따로 안 낡는다 ①c 읽을 때 셈은 곧은 줄(문턱 0 · 바닥 0)
//     ①d 수리 몫 = 넣은 원자재 ÷ 그 부위 원자재(카드 보기 "지붕 풀 15 가운데 5 = ⅓") ①e 기능 비례(자리 칸 · 실내 배율 — f = 1 종전 · 0 바닥 · 곧은 줄)
//   ㉯ 존 켬(아이 · 한반도 존을 임시 DB 로 · 마을 층 끔 · 시계 주입 `_t1332SetClock`):
//     ②a 울 한 값 — 체력이 곧 내구 · 15해(나무 가운데) 곧게 줄고 0 에서 부서짐(종전 공격 0 과 같은 상태) · 켜는 날 앞에 선 행 = 켜는 날 방금 지은 것
//     ②b 수리 = 재료 몫 — 재료 0 이면 안 오른다(우클릭 문 `repair_building` 그대로) · 판자 n 개 = n × 몫 · 절반 넘으면 다시 막힌다
//     ②c 공격과 낡음이 같은 칸 — 0.3 남은 울(9)을 사람 공격 10 이 한 번에 부순다(낡음을 안 읽는 공격이면 30 − 10 = 20 이 남는다) · 움집 벽을 치면 그 움집 뼈대가 준다(atk ÷ 80)
//     ②d 움집 두 부위 — 지붕(풀) · 뼈대(나무)가 제 빠르기 · 집 안 실내 몫 = 지붕 몫(문턱 0 — ¾ · ¼) · 날씨 칸 `indoorF` 같은 값 · 이엉 넣기 = 넣은 만큼
//     ②e 뼈대 0 = 무너짐 — 발자국 행(벽 · 바닥)과 앵커가 걷히고 남은 지붕 몫만큼 이엉이 바닥에 · 폐허 한 칸(안 낡는다 · 치우면 걷힌다)
//     ②f 쓰기 0 · 행 0 — 하루 조각이 몇 바퀴를 돌아도 건물 행 쓰기 0 · 행 수 그대로(0 에 닿은 것만 쓴다)
//     ②g 곳간 · 상자 부패 자리 칸 = 남은 몫만큼(곳간 반 = 밀폐 0.85 · 완충 0.275) · 우클릭 답(`t1438_info`) = 부위별 내구 · 넣을 수 있는 내 짐
//   ㉰ 꺼진 시간(아이 둘 · 같은 DB) — 앞 아이가 울을 세우고 시계를 적고 내린다 · 뒤 아이는 벽시계를 30일 뒤로 밀어 뜬다 → 그 울은 그대로(꺼진 동안 안 낡는다)
//   ㉱ 존 끔(아이 · 손잡이 끔) — 낡음 셈 0 · 날씨 칸 0 · 수리는 종전 문(판자 건물 재료 0 으로 +25 — 종전 그대로)
//   ㉲ 마을(아이 · 마을 층 함수 그대로 · 꾸민 마을 셋 — 사람 0 · 사람 8 · 사람 8 통나무가 1인 비축 밑):
//     ③a 같은 규칙 — NPC 집 지붕 · 뼈대가 플레이어 움집과 같은 값(존 아이의 그 날 값과 견준다) · 곳간도 낡는다
//     ③b NPC 손질 — 가장 낡은 것 먼저 · 낱개(이엉 풀 하나 = 지붕 1/32 · 통나무 하나 = 뼈대 1/28) · 통나무는 곳간 잉여만(`woodSpare`) · 품 = 단계 수 × 몫(쓴 품 장부)
//     ③c 사람 0 마을의 집은 15해에 무너진다 — 존 문(`t1438RemoveTag`)이 발자국을 걷고 마을 줄 · 침상 명부에서 빠진다 · 곳간 몫이 econ 마을 칸에 적힌다(로트 장부가 읽는다)
//     ③d 집 짓는 날 손질 품을 낱 단계로 뺀다(조각은 이월) ③e 발자국 색인(존이 몸 칸마다 묻는 길 — 집을 다 훑지 않는다)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 꺼진 시간에 낡는 사본(시계 = 벽시계) → ㉰ 빨강 · ㉡ 문턱 사본(지붕 반 넘으면 실내 1 · 밑이면 0) → ②d 빨강 ·
//     ㉢ 재료 없이 오르는 수리 사본(켬에서도 종전 수리 문) → ②b 빨강 · ㉣ 공격과 낡음이 다른 칸 사본(공격이 낡은 체력을 안 읽는다) → ②c 빨강 · ㉤ NPC 집만 안 낡는 사본 → ③a 빨강
// 실행: node scripts/test-t1438-decay.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');   // [T1383] 미끼 사본의 바꾼 자리를 센다
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), VFILE = path.join(ROOT, 'server', 'villages.js'), DFILE = path.join(ROOT, 'server', 'decay.js');
const BAITS = {
  offtime: { file: ZFILE, at: ['function _t1438Now() { return _t1332Clock() / _t1438DayMs(); }', 'function _t1438Now() { return Date.now() / _t1438DayMs(); }   // 미끼 ㉠ — 벽시계(꺼진 시간도 센다)'] },
  step: { file: ZFILE, at: ['  const v = _t1438RoofOfTag(R);\n  return v == null ? 1 : v;', '  const v = _t1438RoofOfTag(R);\n  return v == null ? 1 : (v >= 0.5 ? 1 : 0);   // 미끼 ㉡ — 문턱'] },
  free: { file: ZFILE, at: ["if (T1438_DECAY) _t1438Repair(player, msg); else tryRepairBuilding(player);", 'tryRepairBuilding(player); /* 미끼 ㉢ — 종전 수리 문 */'] },
  split: { file: ZFILE, at: ['  if (H) { b.data = b.data || {}; b.data.hp = H.hp; b.data.dkT = now; }', '  // 미끼 ㉣ — 공격이 낡은 체력을 안 읽는다'] },
  npc: { file: VFILE, at: ['return { k, v: Decay.readParts(k.multi ? k : { parts: k.parts }, e._dk, now, _t1438VT0(e)) };', "return { k, v: type === 'house' ? { roof: 1, frame: 1 } : Decay.readParts(k.multi ? k : { parts: k.parts }, e._dk, now, _t1438VT0(e)) };   // 미끼 ㉤"] },
};
function baitHook(name) {
  const bait = name && name !== '-' ? BAITS[name] : null; if (!bait) return;
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === bait.file) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
}
const YEAR = 365;

// ── ㉯ ㉰ ㉱ 존 아이 ───────────────────────────────────────────────────────────────
function zoneChild(mode, bait) {
  const TMP = process.env.T1438_TEST_DB || require('./lib-tmp').file('t1438z', '.db');   // [T1400] 제 DB 는 판 끝에 지운다(같은 DB 를 넘겨받은 ㉰ 아이 = 부모가 지운다)
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(39660)), DB_PATH: TMP,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1065_TOOL_GATE: '0' });
  if (mode === 'zoff') delete process.env.T1438_DECAY; else process.env.T1438_DECAY = '1';
  if (process.env.T1438_TEST_SHIFT) { const _n = Date.now, sh = +process.env.T1438_TEST_SHIFT; Date.now = () => _n() + sh; }   // ㉰ 뒤 아이 — 벽시계를 민다(꺼져 있던 시간)
  baitHook(bait);
  const _log = console.log, _err = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
  const Zone = require(ZFILE);
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, D = H.Decay, out = { on: H.T1438_DECAY };
  const notes = [];
  const mkP = (id, x, y, inv) => ({ playerId: id, name: id, ws: { readyState: 1, send: (s) => { try { notes.push(JSON.parse(s)); } catch (e) {} } }, x, y, floor: 0, inventory: Object.assign({}, inv || {}),
    vp: 0, hunger: 100, thirst: 100, toolItems: [], lastAttackAt: 0, tribeId: null, isDown: false });
  const note = () => { const n = notes.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : null; };
  const send = (P, msg) => { notes.length = 0; H.handlePlayerInput(P, JSON.stringify(msg)); return note(); };
  const r6 = (x) => Math.round(x * 1e6) / 1e6;

  if (mode === 'offA' || mode === 'offB') {   // ㉰ 꺼진 시간 — 같은 DB · 앞 아이는 세우고 적고 내린다 · 뒤 아이는 30일 뒤에 뜬다
    const FX = 1500 * BS + BS / 2, FY = 1500 * BS + BS / 2;
    let b = null;
    if (mode === 'offA') { b = H._liveBuildRow('fence', FX, FY, { floor: 0 }, 'pA', 'A'); b._born = Date.now(); }
    else { const rows = H.db.getBuildingsInRect(FX - 1, FY - 1, FX + 1, FY + 1).filter((r) => r.type === 'fence'); b = rows.length ? H._rowToBuilding(rows[0]) : null; }
    const Hp = b ? H._t1438Hp(b, H._t1438Now()) : null;
    out.fence = Hp ? { hp: Hp.hp, max: Hp.max } : null;
    out.now = H._t1438Now(); out.dayMs = H._t1438DayMs(); out.gap = H._t1402Stat().gap;
    if (mode === 'offA') H._t1402Save(Date.now());
    process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
  }

  const meta = H._t1438Meta ? H._t1438Meta() : null;
  const DAYMS = H._t1438DayMs(), OFF = H._t1402Stat().off;
  const EP = meta ? meta.epoch : 0;
  let T = EP + 1000; H._t1332SetClock(() => T);
  const DAY = (n) => { T = EP + n * DAYMS; return H._t1438Now(); };
  const BORN = () => T + OFF;   // 가동 ms → 벽 ms(이 부팅의 꺼진 합만큼)
  out.dayMs = DAYMS;

  if (mode === 'zoff') {   // ㉱ 끔
    DAY(0);
    const f = H._liveBuildRow('fence', 1200 * BS + BS / 2, 1200 * BS + BS / 2, { floor: 0 }, 'p1', 'P1'); f._born = BORN();
    f.data.hp = 5;   // 종전 공격으로 깎인 울
    DAY(20 * YEAR);
    const st = H._t1438Stat();
    out.off = { eval: st.eval, meta: !!meta, hp: f.data.hp, damaged: !!f.data.damaged };
    const P = mkP('p1', f.x + 8, f.y, {});
    H.players.set(P.playerId, P);
    const n = send(P, { type: 'repair_building' });
    out.off.repair = { hp: f.data.hp, note: n };
    const W = H.weatherFor({ x: f.x, y: f.y, floor: 0, playerId: 'p1' });
    out.off.wxKey = !!(W && Object.prototype.hasOwnProperty.call(W, 'indoorF'));
    process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
  }

  // ── 켬 ──
  out.meta = !!meta;
  out.types = D.typesList();
  const kf = D.kindOf('fence', null), kh = D.kindOf('hut', null), kg = D.kindOf('guild_granary', null);
  out.kind = { fence: kf && { mats: kf.parts[0].mats, rate: D.partRate(kf.parts[0]) }, hut: kh && kh.parts.map((p) => ({ k: p.k, mats: p.mats, rate: D.partRate(p) })),
    gran: kg && { mats: kg.parts[0].mats, rate: D.partRate(kg.parts[0]) }, campfire: D.kindOf('campfire', null), farmland: D.kindOf('farmland', null), ruin: D.kindOf('ruin', null),
    hutWall: D.kindOf('wall', { hut: [0, 0, 1, 1] }), wall: !!D.kindOf('wall', null) };
  // ②a 울 한 값
  DAY(0);
  const F1 = H._liveBuildRow('fence', 1000 * BS + BS / 2, 1000 * BS + BS / 2, { floor: 0 }, 'p1', 'P1'); F1._born = BORN();
  const life = 1 / (out.kind.fence.rate);   // 날
  out.a = { max: H._t1438Hp(F1).max, life, samples: [] };
  for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9]) { const now = DAY(q * life); out.a.samples.push([q, r6(H._t1438Hp(F1, now).hp)]); }
  out.a.readsWrote = (F1.data && F1.data.hp !== undefined);   // 읽기만 했다 — 칸이 안 생긴다
  // 켜는 날 앞에 선 행 = 켜는 날 방금 지은 것(태어난 날이 켠 날보다 10해 앞)
  DAY(0);
  const F0 = H._liveBuildRow('fence', 1002 * BS + BS / 2, 1000 * BS + BS / 2, { floor: 0 }, 'p1', 'P1'); F0._born = BORN() - 10 * YEAR * DAYMS;
  out.a.legacy = r6(H._t1438Hp(F0, DAY(0)).hp);
  // 0 에서 부서짐(하루 조각의 그 함수)
  let now = DAY(life + 1);
  H._t1438Eval(F1, now, 'day');
  out.a.broke = { damaged: !!F1.data.damaged, hp: F1.data.hp };
  // ②b 수리 = 재료 몫(우클릭 문 그대로)
  const P1 = mkP('p1', F1.x + 8, F1.y, {});
  H.players.set(P1.playerId, P1);
  const n0 = send(P1, { type: 'repair_building', buildingId: F1.id });
  out.b = { none: { hp: F1.data.hp, damaged: !!F1.data.damaged, note: n0 } };
  const one = D.shareOf(kf.parts[0], 'plank', 1);
  P1.inventory.plank = 3;
  const n1 = send(P1, { type: 'repair_building', buildingId: F1.id, item: 'plank' });
  out.b.plank = { one, used: 3 - (P1.inventory.plank || 0), hp: r6(F1.data.hp), max: out.a.max, damaged: !!F1.data.damaged, note: n1 };
  // ②c 공격과 낡음이 같은 칸 — 0.3 남은 울(9)을 공격 10 이 한 번에
  DAY(0);
  const F2 = H._liveBuildRow('fence', 1010 * BS + BS / 2, 1000 * BS + BS / 2, { floor: 0 }, 'p1', 'P1'); F2._born = BORN();
  now = DAY(life * 0.7);
  const A1 = mkP('atk1', F2.x + 10, F2.y, {}); H.players.set(A1.playerId, A1);
  out.c = { before: r6(H._t1438Hp(F2, now).hp) };
  notes.length = 0; H.tryAttack(A1);
  out.c.after = { hp: F2.data.hp, damaged: !!F2.data.damaged, note: note() };
  // ②d 움집 두 부위 · 실내 몫
  const R = [1100, 1100, 1105, 1103], made = [];
  DAY(0);
  for (let x = R[0]; x <= R[2]; x++) { H._liveBuildRow('wall', x * BS, R[1] * BS, { side: 'N', floor: 0, hut: R }, 'p1', 'P1', made); if (x !== R[0] + 2 && x !== R[0] + 3) H._liveBuildRow('wall', x * BS, (R[3] + 1) * BS, { side: 'N', floor: 0, hut: R }, 'p1', 'P1', made); }
  for (let y = R[1]; y <= R[3]; y++) { H._liveBuildRow('wall', R[0] * BS, y * BS, { side: 'E', floor: 0, hut: R }, 'p1', 'P1', made); H._liveBuildRow('wall', (R[2] + 1) * BS, y * BS, { side: 'E', floor: 0, hut: R }, 'p1', 'P1', made); }
  for (let x = R[0]; x <= R[2]; x++) for (let y = R[1]; y <= R[3]; y++) H._liveBuildRow('floor', x * BS + BS / 2, y * BS + BS / 2, { floor: 0, hut: R }, 'p1', 'P1', made);
  const HA = H._liveBuildRow('hut', ((R[0] + R[2] + 1) / 2) * BS, ((R[1] + R[3] + 1) / 2) * BS, { owner: 'p1', floor: 0, hut: R }, 'p1', 'P1', made);
  for (const b of made) b._born = BORN();
  const roofLife = 1 / out.kind.hut.find((p) => p.k === 'roof').rate;
  const IN = { x: (R[0] + 2) * BS + BS / 2, y: (R[1] + 1) * BS + BS / 2, floor: 0, playerId: 'p1' };
  out.d = { indoor: H.isIndoorAt(IN), roofLife };
  for (const [tag, q] of [['q75', 0.25], ['q25', 0.75]]) {
    now = DAY(q * roofLife);
    const v = H._t1438Parts(HA, now).v;
    const W = H.weatherFor(IN);
    out.d[tag] = { roof: r6(v.roof), frame: r6(v.frame), f: r6(H._t1438Roof(IN, true)), wx: W && Object.prototype.hasOwnProperty.call(W, 'indoorF') ? W.indoorF : null };
  }
  // 이엉 넣기 = 넣은 만큼(지붕 ¼ 남은 자리에 이엉 5 → 넷만 든다: 4 × ⅛ = ½ … 모자란 ¾ 은 6 이 필요 — 가진 5 만)
  const P2 = mkP('p1', HA.x, HA.y, { thatch: 5 });
  H.players.set(P2.playerId, P2);
  const rf0 = H._t1438Parts(HA, now).v.roof;
  const n2 = send(P2, { type: 'repair_building', buildingId: HA.id, part: 'roof', item: 'thatch' });
  const rf1 = H._t1438Parts(HA, now).v.roof;
  out.d.thatch = { one: D.shareOf(kh.parts.find((p) => p.k === 'roof'), 'thatch', 1), used: 5 - (P2.inventory.thatch || 0), r0: r6(rf0), r1: r6(rf1), note: n2 };
  // 우클릭 답 — 부위별 내구 · 내 짐에서 넣을 수 있는 것
  P2.inventory.thatch = 2; P2.inventory.wood = 3; notes.length = 0;
  H._t1438Peek(P2, HA.id);
  const info = notes.find((m) => m.type === 't1438_info');
  out.g = { info: info ? { name: info.name, parts: info.parts.map((p) => ({ k: p.k, v: p.v, have: (p.have || []).map((h) => h.it) })) } : null };
  // ②c 둘 — 움집 벽을 치면 그 움집 뼈대
  const w0 = made.find((b) => b.type === 'wall');
  const fr0 = H._t1438Parts(HA, now).v.frame;
  const A2 = mkP('atk2', w0.x + 6, w0.y - 20, {}); H.players.set(A2.playerId, A2);
  notes.length = 0; H.tryAttack(A2);
  const fr1 = H._t1438Parts(HA, now).v.frame;
  out.c.hut = { f0: r6(fr0), f1: r6(fr1), note: note(), wallHp: w0.data.hp === undefined ? null : w0.data.hp };
  // ②e 무너짐 — 공격으로 뼈대 0(지붕은 그대로 → 이엉이 바닥에) · 폐허 · 치우기
  const before = made.filter((b) => H.buildings.has(b.id)).length;
  let hits = 1;
  while (H.buildings.has(HA.id) && hits < 40) { A2.lastAttackAt = 0; H.tryAttack(A2); hits++; }
  const after = made.filter((b) => H.buildings.has(b.id)).length;
  const ruin = [...H.buildings.values()].find((b) => b.type === 'ruin' && b.data && Array.isArray(b.data.ruin) && b.data.ruin.join() === R.join());
  const gi = [...H.groundItems.values()].filter((g) => Math.hypot(g.x - HA.x, g.y - HA.y) < 40).map((g) => [g.item || g.type, g.count || g.n || 1]);
  out.e = { before, after, hits, ruin: ruin ? { id: ruin.id, kind: D.kindOf('ruin', ruin.data), left: ruin.data.left } : null, ground: gi, roofAtFall: r6(rf1) };
  if (ruin) { const P3 = mkP('p1', ruin.x, ruin.y, {}); H.players.set(P3.playerId, P3); notes.length = 0; H._t1438Clear(P3, { id: ruin.id }); out.e.cleared = !H.buildings.has(ruin.id); out.e.clearNote = note(); }
  // ②f 쓰기 0 · 행 0 — 하루 조각 몇 바퀴
  let nW = 0; const _u = H.db.updateBuildingData; H.db.updateBuildingData = function () { nW++; return _u.apply(this, arguments); };
  DAY(10); const F3 = H._liveBuildRow('fence', 1020 * BS + BS / 2, 1000 * BS + BS / 2, { floor: 0 }, 'p1', 'P1'); F3._born = BORN();
  const rowsN = () => H.db.db.prepare('SELECT COUNT(*) AS n FROM buildings').get().n;
  const n0r = rowsN(), lap0 = H._t1438Stat().laps;
  for (let d = 11; d <= 40; d++) { DAY(d); for (let i = 0; i < 400 && H._t1438Stat().laps < lap0 + (d - 10); i++) H._t1438Slice(); }
  out.f = { writes: nW, rows0: n0r, rows1: rowsN(), laps: H._t1438Stat().laps - lap0, metaKeys: H.db.db.prepare("SELECT COUNT(*) AS n FROM world_meta WHERE zone LIKE 'decay:%'").get().n };
  H.db.updateBuildingData = _u;
  // ②g 곳간 · 상자 자리 칸
  DAY(0);
  const G = H._liveBuildRow('guild_granary', 1200 * BS, 1200 * BS, { floor: 0 }, 'p1', 'P1'); G._born = BORN();
  now = DAY(0.5 / out.kind.gran.rate);
  out.g.gran = { f: r6(H._t1438Hp(G, now).hp / H._t1438Hp(G, now).max), pf: H._t1438PlaceFields(G, 'granary') };
  out.stat = H._t1438Stat();
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

// ── ㉲ 마을 아이(마을 층 함수 그대로 · 꾸민 마을 셋) ─────────────────────────────────
function vilChild(bait) {
  process.env.T1438_DECAY = '1';
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const SV = require(VFILE), Dm = require(DFILE);
  console.log = _log;
  const out = {};
  let NOW = 0;
  const removed = [], rows = new Map();
  const fdb = { db: { prepare: (sql) => ({ get: (id) => (rows.has(id) ? Object.assign({ id }, rows.get(id)) : null), run: (id) => { rows.delete(id); } }) },
    updateVillageBuildingData: (id, d) => { rows.set(id, { data: d }); } };
  const deps = { t1438Now: () => NOW, t1438DayMs: () => 1, t1438EpochDay: () => 0, t1438Up: (w) => w, t1438RemoveTag: (R, o, P) => { removed.push({ R, o, roof: P && P.v.roof }); }, moveSpeed: 100 };
  const mkV = (dbId, n, wood, stone) => {
    const v = { dbId, name: '시험' + dbId, ccx: 500, ccy: 500 + dbId * 40, _houseCells: [], housesPx: [], _granList: [], _pHouses: [],
      econ: { npcs: Array.from({ length: n }, (_, i) => ({ id: i })), storage: { wood, stone } } };
    const h = { cx: 500, cy: v.ccy + 5, _vb: dbId * 10 + 1, _born: 0 }, g = { cx: 510, cy: v.ccy, _vb: dbId * 10 + 2, _born: 0 };
    v._houseCells.push(h); v.housesPx.push({ x: h.cx * 32 + 16, y: h.cy * 32 + 16 }); v._granList.push(g);
    rows.set(h._vb, { data: null }); rows.set(g._vb, { data: null });
    return v;
  };
  const V0 = mkV(1, 0, 0, 0), V8 = mkV(2, 8, 60, 40), V7 = mkV(3, 8, 30, 0);   // V7 = 통나무가 1인 비축(5 × 8 = 40) 밑인 마을
  SV.__t1438.setup({ deps, villages: [V0, V8, V7], db: fdb, zoneId: 'test' });
  const Econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  const P = (v, type) => { const e = type === 'house' ? v._houseCells[0] : v._granList[0]; return e ? SV.__t1438.parts(type, e, NOW).v : null; };
  const S0 = Object.assign({}, SV.__t1438.V);
  out.a = {};
  for (const d of [30, 137, 400]) { NOW = d; out.a['d' + d] = { house: P(V0, 'house'), gran: P(V0, 'granary') }; }
  // ③b 손질 — 사람 8 마을 800날
  const w0 = V8.econ.storage.wood, s0 = V8.econ.storage.stone;
  let minRoof = 1, minFrame = 1, maxUsed = 0, minSpare = Infinity;
  for (let d = 1; d <= 800; d++) {
    NOW = d; SV.__t1438.villageDay(V8); SV.__t1438.villageDay(V7);
    const v = P(V8, 'house'); minRoof = Math.min(minRoof, v.roof); minFrame = Math.min(minFrame, v.frame); maxUsed = Math.max(maxUsed, V8._t1438Used || 0);
    minSpare = Math.min(minSpare, Econ.woodSpare(V8.econ));
  }
  out.poor = { wood: V7.econ.storage.wood, frame: P(V7, 'house').frame, roof: P(V7, 'house').roof, reserve: Econ.RESERVE_PC.wood * 8 };
  const S1 = SV.__t1438.V;
  out.b = { minRoof, minFrame, maxUsed, minSpare, house: P(V8, 'house'), gran: P(V8, 'granary'), woodUsed: w0 - V8.econ.storage.wood, stoneUsed: s0 - V8.econ.storage.stone,
    d: ['repairs', 'roofRep', 'frameRep', 'granRep', 'fiber', 'wood', 'stone', 'labor', 'noWood'].reduce((o, k) => (o[k] = +(S1[k] - (S0[k] || 0)).toFixed(6), o), {}),
    granF: V8.econ._t1438GranF, saved: rows.get(V8._houseCells[0]._vb) };
  // ③c 사람 0 마을 — 15해 + 1 날에 무너진다
  NOW = 15 * 365 + 2; SV.__t1438.villageDay(V0);
  out.c = { removed: removed.map((r) => ({ R: r.R, o: r.o, roof: r.roof })), houses: V0._houseCells.length, px: V0.housesPx.length, rowGone: !rows.has(11), granF: V0.econ._t1438GranF };
  // ③e 발자국 색인(존이 몸 칸마다 묻는 길) — 찾고 · 명부에서 빠지면 못 찾는다
  const R8 = SV.__t1438.fp('house', V8._houseCells[0].cx, V8._houseCells[0].cy), g8 = SV.__t1438.fp('granary', V8._granList[0].cx, V8._granList[0].cy);
  const f1 = SV.__t1438.find(R8), f2 = SV.__t1438.find(g8), at = SV.t1438HouseAt(R8, NOW);
  const keep = V8._houseCells.splice(0, 1)[0]; const f3 = SV.__t1438.find(R8); V8._houseCells.push(keep); const f4 = SV.__t1438.find(R8);
  out.e = { hit: !!(f1 && f1.type === 'house' && f1.e === keep), gran: !!(f2 && f2.type === 'granary'), at: at && { name: at.name, roof: at.roof }, gone: f3 === null, back: !!(f4 && f4.e === keep) };
  // ③d 집 짓는 날 — 손질 품 조각 이월
  const V9 = { _t1438Used: 0.3 }, a1 = SV.__t1438.ded(V9); V9._t1438Used = 0.5; const a2 = SV.__t1438.ded(V9); V9._t1438Used = 0.4; const a3 = SV.__t1438.ded(V9);
  out.d = { a1, a2, a3, carry: +V9._t1438Carry.toFixed(6) };
  out.rates = { grass: Dm.perDay('grass', 'mid'), wood: Dm.perDay('wood', 'mid') };
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

if (process.argv[2] === '--zone') return zoneChild(process.argv[4] || 'zone', process.argv[3]);
if (process.argv[2] === '--vil') return vilChild(process.argv[3]);

// ── 부모 ───────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`); };
const run = (args, env) => {
  const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20,
    env: Object.assign({}, process.env, { T1438_DECAY: '', T1438_DECAY_SET: '', T1438_TEST_SHIFT: '', T1438_TEST_DB: '' }, env || {}) });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${String(r.stderr || '').slice(-800)}` };
  return JSON.parse(line.slice(2));
};
const near = (a, b, e) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ㉮ 셈(순수)
console.log('[㉮ 셈 — decay.js]');
let D = null; try { D = require(DFILE); } catch (e) { console.log(`  셈 정본이 없다(${String(e.message).slice(0, 80)}) — 아래 줄이 빨강이어야 한다`); }   // 옛 코드 판(정본 0)에서도 단언으로 선다
const pd = (m, s) => (D ? D.perDay(m, s) : NaN);
ok(near(pd('grass', 'mid'), 1 / (1.5 * YEAR), 1e-12) && near(pd('wood', 'mid'), 1 / (15 * YEAR), 1e-12) && near(pd('earth', 'mid'), 1 / (17 * YEAR), 1e-12)
  && near(pd('grass', 'lo'), 1 / YEAR, 1e-12) && near(pd('grass', 'hi'), 1 / (2 * YEAR), 1e-12) && near(pd('wood', 'lo'), 1 / (10 * YEAR), 1e-12) && near(pd('wood', 'hi'), 1 / (20 * YEAR), 1e-12),
  '①a 빠르기 = 고증 가운데(풀 1.5 · 나무 15 · 흙돌 17해) · 끝 값 lo(풀 1 · 나무 10) · hi(풀 2 · 나무 20)', `풀 ${(1 / pd('grass', 'mid') / YEAR).toFixed(2)}해 · 나무 ${(1 / pd('wood', 'mid') / YEAR).toFixed(2)}해 · 흙돌 ${(1 / pd('earth', 'mid') / YEAR).toFixed(2)}해`);
const pr = D ? D.part('roof', '지붕', { fiber: 15 }, 'grass') : null;
const sr = D ? D.shareOf(pr, 'fiber', 5) : NaN;
ok(!!D && near(sr, 1 / 3, 1e-12) && D.qtyFor(pr, 'fiber', 0.5, 99) === 8 && D.qtyFor(pr, 'fiber', 0.5, 3) === 3 && D.shareOf(pr, 'stone', 5) === 0,
  '①d 수리 몫 = 넣은 원자재 ÷ 그 부위 원자재(지붕 풀 15 가운데 5 = ⅓) · 모자란 몫까지만(½ → 8) · 가진 만큼 · 다른 재료는 0', `5 → ${sr.toFixed(4)}`);
const lin = D ? [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4].map((t) => D.readFrac(1, 0.5, 0, t)) : [];
ok(!!D && lin.every((v, i) => i === 0 || near(lin[i - 1] - v, i <= 5 ? 0.2 : 0, 1e-12)) && lin[5] === 0 && lin[6] === 0 && D.readFrac(1, 0.5, 3, 2) === 1,
  '①c 읽을 때 셈 = 곧은 줄(문턱 0) · 바닥 0 · 적은 날 앞은 그대로', JSON.stringify(lin.map((v) => +v.toFixed(3))));
const pf = { m: 0.7, w: 0.55 }, sp = D ? [1, 0.75, 0.5, 0.25, 0].map((f) => D.scalePlace(pf, f)) : [];
ok(!!D && sp[0] === pf && near(sp[2].m, 0.85) && near(sp[2].w, 0.275) && near(sp[4].m, 1) && near(sp[4].w, 0) && near(sp[1].m - sp[2].m, sp[2].m - sp[3].m - 0, 1e-12)
  && near(D.indoorMult(0.4, 1), 0.4) && near(D.indoorMult(0.4, 0.5), 0.7) && near(D.indoorMult(0.4, 0), 1),
  '①e 기능 비례 — 자리 칸(f = 1 종전 · ½ = 밀폐 0.85 · 완충 0.275 · 0 = 바닥) · 실내 배율(0.4 → ½ = 0.7 → 0 = 1)', JSON.stringify(sp.map((x) => [+x.m.toFixed(3), +x.w.toFixed(3)])));

// ㉯ 존 켬
console.log('\n[㉯ 존 켬]');
const Z = run(['--zone', '-', 'zone'], { T1438_DECAY: '1' });
if (Z.err) console.log('  ' + Z.err);
const K = Z.kind || {};
ok(Z.on === true && Z.meta && K.fence && near(K.fence.rate, pd('wood', 'mid'), 1e-15) && K.hut && near(K.hut[0].rate, pd('grass', 'mid'), 1e-15) && near(K.hut[1].rate, pd('wood', 'mid'), 1e-15) && K.hut[1].mats.wood === 22 && K.hut[1].mats.grass === 6
  && K.gran && K.gran.mats.wood > 0 && K.gran.mats.earth > 0 && K.gran.rate < pd('wood', 'mid') && K.gran.rate > pd('earth', 'mid') && K.campfire === null && K.farmland === null && K.ruin === null && K.hutWall === null && K.wall
  && (Z.types || []).includes('fence') && (Z.types || []).includes('hut') && !(Z.types || []).includes('campfire'),
  '①b 구조물은 제 재료 — 울 = 나무 · 움집 지붕 = 풀(이엉) · 뼈대 = 나무(기둥 · 서까래 22 + 결속 풀 6 — 빠르기는 나무 · 몫은 28 가운데) · 곳간 = 판자 + 돌 섞음(원자재 몫 무게) · 불 자리 · 밭 · 폐허 · 움집 벽 따로 안 낡음',
  K.hut ? `뼈대 ${(1 / K.hut[1].rate / YEAR).toFixed(2)}해 · 곳간 ${(1 / K.gran.rate / YEAR).toFixed(2)}해 · 종류 ${(Z.types || []).length}` : '');
const A = Z.a || {};
const zA = (z) => { const a = z && z.a; if (!a || !a.samples) return false; const m = a.max; return a.samples.every(([q, hp]) => near(hp, m * (1 - q), 1e-6)) && !a.readsWrote && near(a.legacy, m, 1e-6) && a.broke.damaged && a.broke.hp === 0; };
ok(zA(Z), '②a 울 한 값 — 체력이 곧 내구 · 15해 곧게(10 · 25 · 50 · 75 · 90%) · 읽기는 안 쓴다 · 켜는 날 앞에 선 행 = 방금 지은 것 · 0 에서 부서짐',
  A.samples ? `${JSON.stringify(A.samples)} · 옛 행 ${A.legacy} · 0 ${JSON.stringify(A.broke)}` : '');
const zB = (z) => { const b = z && z.b; if (!b) return false; return b.none.hp === 0 && b.none.damaged && /재료가 없습니다/.test(b.none.note || '') && b.plank.used >= 1 && near(b.plank.hp, Math.min(1, b.plank.used * b.plank.one) * b.plank.max, 1e-6) && b.plank.damaged === (b.plank.hp < b.plank.max / 2); };
ok(zB(Z), '②b 수리 = 재료 몫 — 재료 0 이면 안 오른다(우클릭 문 그대로) · 판자 n 개 = n × 몫 · 절반 넘으면 다시 막힌다', Z.b ? `없음 ${JSON.stringify(Z.b.none)} · 판자 ${JSON.stringify(Z.b.plank)}` : '');
const zC = (z) => { const c = z && z.c; return !!(c && near(c.before, 9, 1e-6) && c.after.damaged && c.after.hp === 0 && c.hut && near(c.hut.f0 - c.hut.f1, 10 / 80, 1e-6) && c.hut.wallHp === null); };
ok(zC(Z), '②c 공격과 낡음이 같은 칸 — 0.3 남은 울(9)을 공격 10 이 한 번에 부순다 · 움집 벽을 치면 그 움집 뼈대 −10/80(벽 체력 칸 0)', Z.c ? JSON.stringify(Z.c) : '');
const zD = (z) => { const d = z && z.d; if (!d || !d.q75 || !d.q25) return false; return d.indoor && near(d.q75.roof, 0.75, 1e-6) && near(d.q75.f, d.q75.roof, 1e-9) && near(d.q25.roof, 0.25, 1e-6) && near(d.q25.f, d.q25.roof, 1e-9)
  && (d.q75.wx == null || near(d.q75.wx, d.q75.roof, 1e-3)) && d.thatch.used === 5 && near(d.thatch.r1 - d.thatch.r0, 5 * d.thatch.one, 1e-6); };
ok(zD(Z), '②d 움집 두 부위 — 집 안 실내 몫 = 지붕 몫(¾ → 0.75 · ¼ → 0.25 · 문턱 0) · 날씨 칸 같은 값 · 이엉 5 = 5 × ⅛', Z.d ? `¾ ${JSON.stringify(Z.d.q75)} · ¼ ${JSON.stringify(Z.d.q25)} · 이엉 ${JSON.stringify(Z.d.thatch)}` : '');
const E = Z.e || {};
ok(E.after === 0 && E.before > 30 && E.ruin && E.ruin.kind === null && E.ground.some(([it, n]) => it === 'thatch' && n === Math.floor(8 * E.roofAtFall + 1e-9)) && E.cleared && /치웠습니다/.test(E.clearNote || ''),
  '②e 뼈대 0 = 무너짐 — 발자국 행 · 앵커가 걷히고 남은 지붕 몫만큼 이엉이 바닥에 · 폐허 한 칸(안 낡는다) · 치우면 걷힌다', JSON.stringify(E));
const Fw = Z.f || {};
ok(Fw.writes === 0 && Fw.rows0 === Fw.rows1 && Fw.laps >= 25 && Fw.metaKeys === 1, '②f 쓰기 0 · 행 0 — 하루 조각 30 바퀴(0 에 안 닿은 건물들) · 건물 행 쓰기 0 · 행 수 그대로 · 켠 날 열쇠 하나', JSON.stringify(Fw));
const Gi = Z.g || {};
ok(Gi.gran && near(Gi.gran.f, 0.5, 1e-6) && near(Gi.gran.pf.m, 0.85, 1e-6) && near(Gi.gran.pf.w, 0.275, 1e-6) && Gi.info && Gi.info.parts.length === 2 && Gi.info.parts.find((p) => p.k === 'roof').have.includes('thatch')
  && Gi.info.parts.find((p) => p.k === 'frame').have.includes('wood') && !Gi.info.parts.find((p) => p.k === 'roof').have.includes('wood'),
  '②g 곳간 자리 칸 = 남은 몫(반 = 밀폐 0.85 · 완충 0.275) · 우클릭 답 = 부위별 내구 · 넣을 수 있는 내 짐(지붕 ← 이엉 · 뼈대 ← 통나무)', JSON.stringify(Gi));

// ㉰ 꺼진 시간
console.log('\n[㉰ 꺼진 시간 — 같은 DB · 30일 꺼짐]');
const LT = require('./lib-tmp');   // [T1400] 판 끝에 지운다(정상 · exit · SIGTERM)
const TDB = LT.file('t1438off', '.db'), TDB2 = LT.file('t1438off', '.db');
const SHIFT = String(30 * 24 * 3600 * 1000);
const oA = run(['--zone', '-', 'offA'], { T1438_DECAY: '1', T1438_TEST_DB: TDB });
for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TDB + s, TDB2 + s); } catch (e) {} }
const oB = run(['--zone', '-', 'offB'], { T1438_DECAY: '1', T1438_TEST_DB: TDB, T1438_TEST_SHIFT: SHIFT });
const zOff = (a, b) => !!(a && b && a.fence && b.fence && b.gap >= +SHIFT && near(b.fence.hp, a.fence.hp, 1e-3 * a.fence.max) && (b.now - a.now) * a.dayMs < 120000);
ok(zOff(oA, oB), '㉰ 꺼져 있던 30일 — 시계가 안 흐르고(가동 날 차 < 2분) 울은 그대로', oA.err || oB.err || `앞 ${JSON.stringify(oA.fence)} · 뒤 ${JSON.stringify(oB.fence)} · 틈 ${Math.round((oB.gap || 0) / 86400000)}일`);

// ㉱ 존 끔
console.log('\n[㉱ 존 끔]');
const Zo = run(['--zone', '-', 'zoff'], {});
ok(Zo.on === false && Zo.off && Zo.off.eval === 0 && !Zo.off.meta && Zo.off.hp === 5 && Zo.off.repair.hp === 30 && !Zo.off.wxKey,
  '㉱ 끔 — 낡음 셈 0 · 켠 날 열쇠 0 · 20해 뒤 울 체력 그대로 · 수리는 종전 문(판자 건물 재료 0 으로 +25 — 종전 그대로) · 날씨 칸 0', Zo.err || JSON.stringify(Zo.off));

// ㉲ 마을
console.log('\n[㉲ 마을 — NPC 도 같은 규칙]');
const M = run(['--vil', '-'], { T1438_DECAY: '1' });
if (M.err) console.log('  ' + M.err);
const mA = (m, z) => { const a = m && m.a; if (!a || !a.d30 || !a.d137) return false; const g = pd('grass', 'mid'), w = pd('wood', 'mid');
  return near(a.d30.house.roof, 1 - 30 * g, 1e-9) && near(a.d30.house.frame, 1 - 30 * w, 1e-9) && near(a.d137.house.roof, 1 - 137 * g, 1e-9) && a.d400.gran.body < 1 && a.d400.gran.body > 0.9
    && (!z || !z.d || !z.d.q75 || near(1 - 0.25 * z.d.roofLife * g, a.d137.house.roof, 1e-2)); };
ok(mA(M, Z), '③a 같은 규칙 — NPC 집 지붕 · 뼈대가 플레이어 움집과 같은 셈(30 · 137날 — 존 아이 ¾ 날과 같은 값) · 곳간도 낡는다', M.a ? JSON.stringify(M.a) : '');
const mb = M.b || {}, mbd = mb.d || {};
ok(mbd.roofRep > 0 && mbd.fiber >= mbd.roofRep && mb.minRoof >= 1 - 1 / 32 - 2 * pd('grass', 'mid') && mb.minFrame >= 1 - 1 / 28 - 2 * pd('wood', 'mid') && mbd.frameRep > 0 && mbd.wood > 0 && near(mb.woodUsed, mbd.wood, 1e-9)
  && mbd.granRep > 0 && near(mb.stoneUsed, mbd.stone, 1e-9) && mb.minSpare >= -1e-9 && M.poor && M.poor.wood === 30 && M.poor.frame < 1 - 790 * pd('wood', 'mid') + 1e-9 && M.poor.roof > 0.9 && mbd.labor > 0 && mbd.labor <= mbd.fiber / 32 + 2 * mbd.wood / 14 + (mbd.stone || 0) / 14 + 1e-9 && mb.maxUsed <= 2 + 1e-9 && mb.saved && /"dk"/.test(mb.saved.data || ''),
  '③b NPC 손질 — 낱개(풀 하나 = 지붕 1/32 · 통나무 하나 = 뼈대 1/28) · 통나무는 곳간 잉여만(`woodSpare` — 1인 비축 밑으로 안 내려간다 · 비축 밑 마을은 뼈대를 못 고친다) · 곳간도 손질 · 품 ≤ 크루 하루(2) · 마을 집 줄에 적는다',
  `지붕 최저 ${mb.minRoof && mb.minRoof.toFixed(4)} · 뼈대 최저 ${mb.minFrame && mb.minFrame.toFixed(4)} · 잉여 최저 ${mb.minSpare} · ${JSON.stringify(mbd)} · 곳간 통나무 −${mb.woodUsed} · 돌 −${mb.stoneUsed} · 비축 밑 마을 ${JSON.stringify(M.poor)}`);
const mc = M.c || {};
ok(mc.removed && mc.removed.length === 1 && mc.removed[0].o === 'npc_simvil_1' && mc.houses === 0 && mc.px === 0 && mc.rowGone && mc.granF > 0 && mc.granF < 1 && mb.granF > 0 && mb.granF <= 1,
  '③c 사람 0 마을의 집은 15해에 무너진다 — 존 문이 발자국을 걷고 마을 줄 · 침상 명부에서 빠진다 · 곳간 몫이 econ 마을 칸에(로트 장부가 읽는다)', JSON.stringify(mc));
const me = M.e || {};
ok(me.hit && me.gran && me.at && /움집/.test(me.at.name) && me.at.roof >= 0 && me.at.roof <= 1 && me.gone && me.back, '③e 발자국 색인 — 집 · 곳간을 찾고(존이 몸 칸마다 묻는 길) · 명부에서 빠지면 못 찾고 · 돌아오면 다시 찾는다', JSON.stringify(me));
const md = M.d || {};
ok(md.a1 === 0 && md.a2 === 0 && md.a3 === 1 && near(md.carry, 0.2, 1e-9), '③d 집 짓는 날 손질 품 — 낱 단계로 뺀다(0.3 → 0 · 0.8 → 0 · 1.2 → 1 · 이월 0.2)', JSON.stringify(md));

// 미끼(바꾼 자리 = 원본에서 앵커가 나온 수 · 아이도 1 이 아니면 멈춘다)
console.log('\n[미끼]');
const nB = (k) => LB.count(fs.readFileSync(BAITS[k].file, 'utf8'), BAITS[k].at[0]);
const bB = run(['--zone', 'offtime', 'offB'], { T1438_DECAY: '1', T1438_TEST_DB: TDB2, T1438_TEST_SHIFT: SHIFT });
ok(!bB.baitErr && nB('offtime') === 1 && !zOff(oA, bB) && bB.fence && bB.fence.hp < oA.fence.hp - 0.2 * oA.fence.max, '미끼 ㉠ 꺼진 시간에 낡는 사본(시계 = 벽시계) → ㉰ 빨강 · 30일 꺼진 동안 울이 낡는다',
  bB.baitErr || bB.err || `바꾼 자리 ${nB('offtime')} · 뒤 ${JSON.stringify(bB.fence)}`);
const bS = run(['--zone', 'step', 'zone'], { T1438_DECAY: '1' });
ok(!bS.baitErr && nB('step') === 1 && !zD(bS) && bS.d && bS.d.q75.f === 1 && bS.d.q25.f === 0, '미끼 ㉡ 문턱 사본(지붕 반 넘으면 실내 1 · 밑이면 0) → ②d 빨강', bS.baitErr || bS.err || `바꾼 자리 ${nB('step')} · ¾ ${bS.d && bS.d.q75.f} · ¼ ${bS.d && bS.d.q25.f}`);
const bF = run(['--zone', 'free', 'zone'], { T1438_DECAY: '1' });
ok(!bF.baitErr && nB('free') === 1 && !zB(bF) && bF.b && bF.b.none.hp > 0, '미끼 ㉢ 재료 없이 오르는 수리 사본(켬에서도 종전 수리 문) → ②b 빨강 · 재료 0 으로 체력이 오른다', bF.baitErr || bF.err || `바꾼 자리 ${nB('free')} · ${JSON.stringify(bF.b && bF.b.none)}`);
const bP = run(['--zone', 'split', 'zone'], { T1438_DECAY: '1' });
ok(!bP.baitErr && nB('split') === 1 && !zC(bP) && bP.c && !bP.c.after.damaged, '미끼 ㉣ 공격과 낡음이 다른 칸 사본(공격이 낡은 체력을 안 읽는다) → ②c 빨강 · 0.3 남은 울이 공격을 견딘다', bP.baitErr || bP.err || `바꾼 자리 ${nB('split')} · ${JSON.stringify(bP.c && bP.c.after)}`);
const bN = run(['--vil', 'npc'], { T1438_DECAY: '1' });
ok(!bN.baitErr && nB('npc') === 1 && !mA(bN, Z) && bN.a && bN.a.d30.house.roof === 1, '미끼 ㉤ NPC 집만 안 낡는 사본 → ③a 빨강 · 30날 지붕 1', bN.baitErr || bN.err || `바꾼 자리 ${nB('npc')} · ${JSON.stringify(bN.a && bN.a.d30)}`);

console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
