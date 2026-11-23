#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1423-block-react.js — 길을 막으면: 물 위 · 다리에는 못 짓는다 · 다리 앞 뭍을 막으면 세계가 치운다(T1423 · 손잡이 둘 다 끔 기본) ====
//
// ★왜 [지시 T1423 · ★재민 11-21 판정 31 "가로 가면 되긴 하는데, 다리 바로 앞의 다리가 아닌 곳을 사유지로 차지하거나 막으면 어차피 부수는 로직은 필요할 듯..?"]
//   T1406 재현 판: 플레이어 울타리가 물 위 · 다리 칸에 선다(`_tryBuildAt` 지형 검사 0 · 7/7) · 다리 한 끝은 울타리 둘로 막힌다 · 세계 반응 0(보는 사람 없는 청크는 캐러밴이 울타리를 그냥 지난다).
// 판(운영 함수 그대로 · 사본 0):
//   ㉮ 존(아이 · 한반도 존을 임시 DB 로 · 마을 층 끔 · ㉮ 다리 술어의 지형 어댑터만 꽂는다) — `T1423_NO_BUILD` · `T1423_BLOCK_REACT` 켬:
//     ①a 물 칸 · 다리 칸 · 다리 머리 울타리 거절(알림 한 줄) · 빈 뭍은 선다  ①b 벽은 변을 낀 두 칸 — 한쪽이 다리 머리면 거절  ①c 사유지 한 칸(`tryClaim`) 거절 · 첫 집터 아홉 칸(`_t1392Cells`)이 그 칸을 '다리 끝'으로
//     ①d 짓기 문 자리 열(움집 6×4 · 간이 3×3 · 시설 2×2 · 쉼터 · 곳간 · 집 의뢰 · 사유지 · 첫 집터 · 벽 · 칸 건물) — 글자로 센다  ①e 클라 미리보기 같은 답(서버가 준 ㉮ 칸 줄 + 물 · 다리 술어 — 다리 머리 둘레 칸 전부)
//     ②a 막는 물건 표 — 플레이어 울타리는 든다 · NPC(`npc_`) · 마을 표지 · 도적은 안 든다  ②b 걸음 한 칸이 그 울타리를 지나면 선다 · 곁은 안 선다
//     ②c 잠든 청크(메모리에서 내려간 울타리 — DB 행은 서 있다)도 선다 · DB 행이 없어지면 표에서 빠진다  ②d 부수기 — 친 횟수 = 내구 30 ÷ 사람 공격 10 = 3 · 없어진다 · 재료(울타리)가 그 자리 바닥에 · 표에서 빠진다
//     ②e 적대감 — 접속 중이면 vp +8(T1238 울타리 벌점 값) · 알림 "길을 막고 있습니다 — ○○ 마을 사람들이 치우려 합니다" · 접속 안 했으면 쌓였다가 들어올 때
//   ㉯ 존 끔(아이 · 손잡이 둘 다 끔) — 다리 칸 울타리가 선다(종전) · 표 0
//   ㉰ 마을(아이 · 마을 층 함수 그대로 · 꾸민 세계 — 강(x 100 ~ 104) · 다리(y 50 ~ 51) · 바위 띠 둘(x 105 ~ 125 · 180 ~ 200 · 길목 y 47 ~ 54) · 열린 들(y 120 ~ 200)):
//     캐러밴 1(A → B · y 50)은 길목 1 을 막은 울타리 여덟(G1)을 만난다 · 그 뒤 80칸에 길목 2 를 막은 울타리 여덟(G2) · 캐러밴 2(C → D · y 150)는 들 한가운데 울타리 여섯(GB)을 만난다.
//     ③a 막힘 가름 — G1 = 못 지남(국소 재경로 실패) → 막힘 · GB = 돌아감(비 < 3) → 막힘 아님(반응 0)
//     ③b 소식 — 만난 날 + T7(`rumor.travelDaysOf` — 몸 걸음 시계 · 최소 하루) 날에 캐러밴 집(A)이 안다 · 그날 적대감(막은 사람마다 한 번) · 몸이 나선다
//     ③c 막힘이면 부수러 간다 — G1 의 길 위 울타리만(만난 것) · 길과 안 맞닿은 G1 울타리 · GB · G2(아무 몸도 안 만났다) 0
//     ③d 몸이 실제로 걸어간다 — 나선 몸이 A 명부 몸 · 장부가 날마다 하루 걸음씩(순간이동 0) · 닿은 날 = 나선 날 + ⌈길 ÷ 하루 걸음⌉ · 친 자리는 울타리에서 60px(사람 공격 거리) 안 · 그다음 집으로 걸어 일과로
//     ③e 끔(`T1423_BLOCK_REACT` 끔) — 같은 세계에서 만남 0 · 일감 0 · 캐러밴이 울타리를 그냥 지난다(종전)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 지형 문을 뺀 사본(zone.js — `T1423_NO_BUILD` 를 거짓으로) → ①a ①b ①c 빨강 ·
//     ㉡ 모든 울타리에 반응하는 사본(가름 0) → ③a ③c 빨강 · ㉢ 멀리서 저절로 아는 사본(앞 구간이 아니라 길 전체를 안다) → ③c 빨강 · ㉣ 순간 삭제 사본(닿기를 안 기다린다) → ③d 빨강
// 실행: node scripts/test-t1423-block-react.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');   // [T1383] 미끼 사본의 바꾼 자리를 센다
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  noGate: { file: ZFILE, at: ["const T1423_NO_BUILD = process.env.T1423_NO_BUILD === '1';", "const T1423_NO_BUILD = false && process.env.T1423_NO_BUILD === '1';   // 미끼 ㉠ — 지형 문을 뺀다"] },
  allFence: { file: VFILE, at: ['const cut = !rp, ratio = cut ? null : (oldLen > 0 ? newLen / oldLen : 1), block = cut || ratio > T1423_RATIO;', 'const cut = !rp, ratio = cut ? null : (oldLen > 0 ? newLen / oldLen : 1), block = true;   // 미끼 ㉡ — 모든 울타리에 반응한다'] },
  afar: { file: VFILE, at: ['const _t1423A = _t1423h ? _t1423Ahead(body, body.prog, Math.min(body.len, body.prog + CARAVAN_REPAIR_LOOKAHEAD_PX)) : null;', 'const _t1423A = _t1423h ? _t1423Ahead(body, body.prog, body.len) : null;   // 미끼 ㉢ — 길 전체를 안다(멀리서 저절로)'] },
  instant: { file: VFILE, at: ['if (!alive.every((pid) => _t1423Arrived(state.bodyExits && state.bodyExits.get(pid)))) continue;\n      job.arriveDay = d; S.arrive++; job.hit = [];', 'if (false) continue;   // 미끼 ㉣ — 닿기를 안 기다린다(순간 삭제)\n      job.arriveDay = d; S.arrive++; job.hit = [];'] },   // ★[T1447] 자리 글자를 다음 줄까지 늘렸다 — T1447 토벌 사다리가 같은 걷기 문 줄을 쓴다(뜻 무변)
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

// ── ㉮ ㉯ 존 아이 ───────────────────────────────────────────────────────────────────────────
function zoneChild() {
  const TMP = `/tmp/t1423-z-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(39620));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  baitHook(process.argv[3]);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(ZFILE);
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, SV = H.SimVillages;
  SV.__t1423.setup({ zoneId: 'hanbando' });   // 마을 층 끔 판 — `init` 이 세우던 존 이름(㉮ 다리 술어가 존 설정 다리를 읽는다)
  SV.__labProbe._huntProbe.setTa({ isWater: (cx, cy) => H.isWaterTileLocal(cx * BS + BS / 2, cy * BS + BS / 2) });   // ㉮ 다리 술어의 지형 어댑터(마을 층 `makeTerrainAdapter` 의 isWater 그 식)
  const C = (cx, cy) => [cx * BS + BS / 2, cy * BS + BS / 2];
  const isW = (cx, cy) => H.isWaterTileLocal(...C(cx, cy)), isB = (cx, cy) => H.isBridgeTileLocal(...C(cx, cy)), blk = (cx, cy) => H.isTerrainBlockedLocal(...C(cx, cy));
  const br = require(path.join(ROOT, 'server', 'zone-config')).ZONES.hanbando.bridges || [];
  let bw = null; for (let i = 0; i + 1 < br.length && !bw; i += 2) if (isW(br[i], br[i + 1]) && isB(br[i], br[i + 1])) bw = [br[i], br[i + 1]];
  const HL = SV.t1406BridgeCells(), heads = new Set(); for (let i = 0; i + 1 < HL.length; i += 2) heads.add(HL[i] + ',' + HL[i + 1]);
  let hd = null; for (let i = 0; i + 1 < HL.length && !hd; i += 2) if (!isW(HL[i], HL[i + 1]) && !isB(HL[i], HL[i + 1]) && !blk(HL[i], HL[i + 1])) hd = [HL[i], HL[i + 1]];
  const ring = (c, R, f) => { for (let r = 1; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = c[0] + dx, y = c[1] + dy; if (f(x, y)) return [x, y]; } return null; };
  const wt = bw && ring(bw, 30, (x, y) => isW(x, y) && !isB(x, y));
  const pl = hd && ring(hd, 40, (x, y) => !blk(x, y) && !isW(x, y) && !isB(x, y) && !heads.has(x + ',' + y) && Math.max(Math.abs(x - hd[0]), Math.abs(y - hd[1])) >= 4
    && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].every(([dx, dy]) => !blk(x + dx, y + dy) && !heads.has((x + dx) + ',' + (y + dy)) && !isW(x + dx, y + dy)));
  //   다리 머리 가장자리 칸(곧은 이웃 하나가 빈 뭍) — 벽 변 · 발자국 문을 잰다
  const plain = (x, y) => !blk(x, y) && !isW(x, y) && !isB(x, y) && !heads.has(x + ',' + y);
  let hd2 = null, hdN = null;
  for (let i = 0; i + 1 < HL.length && !hd2; i += 2) { const x = HL[i], y = HL[i + 1]; if (isW(x, y) || isB(x, y) || blk(x, y)) continue; const n = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => plain(a, b)); if (n) { hd2 = [x, y]; hdN = n; } }
  const out = { knobs: { noBuild: H.T1423_NO_BUILD, react: H.T1423_BLOCK_REACT }, cells: { bw, hd, wt, pl, hd2, hdN } };
  const notes = [];
  const mkP = (name) => ({ playerId: 'test_' + name, name, ws: { readyState: 1, send: (s) => { try { notes.push(JSON.parse(s)); } catch (e) {} } }, x: 0, y: 0, floor: 0, inventory: { wood: 50, stone: 50, plank: 50 }, vp: 0, hunger: 100, thirst: 100, toolItems: [] });
  const A = mkP('A');
  const at = (P, c) => { P.x = c[0] * BS + BS / 2; P.y = c[1] * BS + BS / 2; };
  const note = () => { const n = notes.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : null; };
  const build = (c, type, side) => { if (!c) return null; notes.length = 0; at(A, c); let ok = false; try { ok = !!H._tryBuildAt(A, type, 0, side || null, null, { skipCost: true }); } catch (e) { return { ok: false, err: String(e.message) }; } return { ok, note: note() }; };
  //   ① 못 놓는 자리
  out.fence = { bw: build(bw, 'fence'), hd: build(hd, 'fence'), wt: build(wt, 'fence'), pl: build(pl, 'fence') };
  //   벽 — 다리 머리 칸과 그 곁 뭍 칸 사이 변(곁 칸에 서서 그 변 쪽으로)
  if (hd2 && hdN) { const dx = hd2[0] - hdN[0], dy = hd2[1] - hdN[1], side = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N'; out.wall = { hdEdge: build(hdN, 'wall', side) }; }
  if (pl) out.wall = Object.assign(out.wall || {}, { plEdge: build([pl[0] + 1, pl[1]], 'wall', 'N') });
  //   사유지 한 칸
  const claim = (c) => { if (!c) return null; notes.length = 0; at(A, c); const n0 = H.claims.size; try { H.tryClaim(A, 'personal'); } catch (e) { return { err: String(e.message) }; } return { added: H.claims.size - n0, note: note() }; };
  out.claim = { bw: claim(bw), hd: claim(hd) };
  //   첫 집터 아홉 칸 — 다리 머리를 가운데로
  try { out.lot = hd ? H._t1392Cells(A.playerId, hd[0], hd[1]).filter((c) => c.why).map((c) => c.why) : null; } catch (e) { out.lot = { err: String(e.message) }; }
  out.rect = (hd2 && hdN) ? H._t1423NoBuildRect(Math.min(hd2[0], hdN[0]), Math.min(hd2[1], hdN[1]), Math.max(hd2[0], hdN[0]), Math.max(hd2[1], hdN[1])) : null;   // 빈 뭍 + 다리 머리 한 칸을 낀 발자국
  out.rectPlain = pl ? H._t1423NoBuildRect(pl[0] - 1, pl[1], pl[0] + 1, pl[1]) : null;
  //   클라 같은 답 — 다리 머리 칸과 그 8방(서버 술어 ↔ 클라 식: 다리 칸 · 물 · ㉮ 칸 줄)
  let same = 0, diff = 0; const ex = [];
  if (H.T1423_NO_BUILD) for (const k of heads) { const [x0, y0] = k.split(',').map(Number); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = x0 + dx, y = y0 + dy;
    const sv = !!H._t1423NoBuild(x, y), cl = isB(x, y) || isW(x, y) || heads.has(x + ',' + y); if (sv === cl) same++; else { diff++; if (ex.length < 5) ex.push([x, y, sv, cl]); } } }
  out.client = { same, diff, ex, payload: HL.length / 2 };
  //   ② 막는 물건 표 · 걸음 · 부수기 · 적대감
  if (H.T1423_BLOCK_REACT && pl) {
    const fid = [...H.buildings.values()].find((b) => b.ownerId === A.playerId && b.type === 'fence' && Math.floor(b.x / BS) === pl[0] && Math.floor(b.y / BS) === pl[1]);
    out.idx = { has: H._t1423Has(), n: H._t1423Idx.n, fenceIn: !!(fid && H._t1423Idx.byId.has(fid.id)) };
    out.idx.npc = H._t1423IdxAdd({ id: 'bnpc', dbId: null, type: 'fence', ownerId: 'npc_7', ownerName: 'NPC', x: (pl[0] + 9) * BS + 16, y: pl[1] * BS + 16, data: {}, floor: 0 });
    out.idx.vil = H._t1423IdxAdd({ id: 'bvil', dbId: null, type: 'wall', ownerId: 'test_Z', ownerName: 'Z', x: (pl[0] + 9) * BS, y: pl[1] * BS, data: { side: 'N', hut: 1 }, floor: 0 });
    out.idx.bandit = H._t1423IdxAdd({ id: 'bbdt', dbId: null, type: 'fence', ownerId: 'bandit_den', ownerName: '도적', x: (pl[0] + 9) * BS + 16, y: (pl[1] + 1) * BS + 16, data: {}, floor: 0 });
    const step = (a, b) => { const S = new Set(); const r = H._t1423StepHit(a[0] * BS + 16, a[1] * BS + 16, b[0] * BS + 16, b[1] * BS + 16, S); return { r, ids: [...S].map((e) => e.id) }; };
    const wid = [...H.buildings.values()].find((b) => b.ownerId === A.playerId && b.type === 'wall' && Math.floor(b.x / BS) === pl[0] + 1 && Math.floor(b.y / BS) === pl[1]);
    out.step = { cross: step([pl[0] - 1, pl[1]], [pl[0], pl[1]]), past: step([pl[0] - 1, pl[1] - 1], [pl[0] + 1, pl[1] - 1]), wall: step([pl[0] + 1, pl[1]], [pl[0] + 1, pl[1] - 1]), wallId: wid ? wid.id : null, along: step([pl[0] + 1, pl[1]], [pl[0] + 2, pl[1]]) };
    //   잠든 청크 — 메모리에서 내린다(DB 행은 그대로) · 그래도 선다
    if (fid) { H.buildings.delete(fid.id); out.sleep = { stillHit: step([pl[0] - 1, pl[1]], [pl[0], pl[1]]).r, info: !!H._t1423Info(fid.id) }; }
    //   부수기
    const g0 = new Set(H.groundItems.keys()), by = { x: pl[0] * BS + 16 - 24, y: pl[1] * BS + 16 };
    const br2 = fid ? H._t1423Break(fid.id, by) : null;
    const gi = [...H.groundItems.values()].filter((g) => !g0.has(g.id));
    out.break = { r: br2, gone: fid ? !H.buildings.has(fid.id) && !H._t1423Idx.byId.has(fid.id) : null, ground: gi.map((g) => ({ item: g.item, n: g.count, cx: Math.floor(g.x / BS), cy: Math.floor(g.y / BS), d: Math.round(Math.hypot(g.x - (pl[0] * BS + 16), g.y - (pl[1] * BS + 16))) })),
      after: step([pl[0] - 1, pl[1]], [pl[0], pl[1]]).r, again: fid ? H._t1423Break(fid.id, by) : null };
    //   DB 행이 없어진 울타리(다른 길로 사라짐) — 표에서 빠진다
    const q = [pl[0], pl[1] + 3]; build(q, 'fence');
    const f2 = [...H.buildings.values()].find((b) => b.ownerId === A.playerId && b.type === 'fence' && Math.floor(b.x / BS) === q[0] && Math.floor(b.y / BS) === q[1]);
    if (f2) { H.buildings.delete(f2.id); try { H.db.deleteBuilding(f2.dbId); } catch (e) {} const s0 = H._t1423Z.idxStale; out.stale = { hit: step([q[0] - 1, q[1]], q).r, stale: H._t1423Z.idxStale - s0, inIdx: H._t1423Idx.byId.has(f2.id) }; }
    //   적대감 — 접속 중 · 접속 안 함
    const B = mkP('B'); H.players.set('pB', Object.assign(B, { pid: 'pB' })); notes.length = 0;
    const h1 = H._t1423Hostile('test_B', 'B', '시험골');
    const C2 = mkP('C2'); const h2 = H._t1423Hostile('test_C2', 'C2', '시험골'); const owe = Object.assign({}, H._t1423Owe.get('test_C2') || {});
    notes.length = 0; H._t1423Collect(C2);
    out.hostile = { h1, vpB: B.vp, noteB: null, h2, owe, vpC: C2.vp, noteC: note() };
    notes.length = 0; H.players.delete('pB');
    B.vp = 0; H.players.set('pB', B); H._t1423Hostile('test_B', 'B', '이웃골'); out.hostile.noteB = note(); H.players.delete('pB');
  }
  //   ①d 글자 — 짓기 문 자리(zone.js)
  const src = fs.readFileSync(ZFILE, 'utf8');
  out.sites = { gate: (src.match(/if \(T1423_NO_BUILD\) \{ const _w = _t1423NoBuild\(/g) || []).length, rect: (src.match(/if \(T1423_NO_BUILD\) \{ const _w = _t1423NoBuildRect\(/g) || []).length, lot: (src.match(/if \(!why && T1423_NO_BUILD\) \{ const w = _t1423NoBuild\(x, y\);/g) || []).length };   // [T1440 합침] 다시 잡는 칸(T1403)이어도 다리 끝이면 막는 꼴
  const cl = ['public/client/11-r1-mountain.js', 'public/client/30-n-net.js', 'public/client/32-m-render.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  out.clientSrc = { noAt: /function _t1423NoAt\(ax, ay\)[\s\S]{0,260}isBridgeAtAbs\(wx, wy\) \|\| isWaterAtAbs\(wx, wy\) \|\| _t1423NoAbs\.has/.test(cl), welcome: /msg\.t1423NoBuild[\s\S]{0,120}_t1423NoAbs\.on = true/.test(cl), ghost: (cl.match(/_t1423NoAt\(/g) || []).length };
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── ㉰ 마을 아이(꾸민 세계) ────────────────────────────────────────────────────────────────────
function vilChild() {
  process.env.ENABLE_VILLAGES = '0';
  baitHook(process.argv[3]);
  const _log = console.log; console.log = () => {};
  const V = require(VFILE), T = V.__t1423, PF = require(path.join(ROOT, 'server', 'pathfind')), R7 = require(path.join(ROOT, 'server', 'rumor'));
  const SZ = 32, MOVE = 0.5;   // 몸 걸음 0.5 px/s → 하루(정본 운영 하루) 걸음이 짧아 장부가 여러 날을 걷는다(순간이동 0 을 날마다 본다)
  const inRiver = (x, y) => x >= 100 && x <= 104 && y >= 0 && y <= 100;
  const bridge = (x, y) => inRiver(x, y) && (y === 50 || y === 51);
  const band = (x, y) => ((x >= 105 && x <= 125) || (x >= 180 && x <= 200)) && y >= 0 && y <= 100 && (y < 47 || y > 54);
  const tblk = (px, py) => { const x = Math.floor(px / SZ), y = Math.floor(py / SZ); return (inRiver(x, y) && !bridge(x, y)) || band(x, y); };
  //   울타리 무리 — G1(길목 1 · x 110 · y 47 ~ 54) · G2(길목 2 · x 190) · GB(들 · x 150 · y 147 ~ 152)
  const fences = new Map(); let fid = 0;
  const put = (g, x, y) => { const id = 'f' + (++fid); fences.set(x + ',' + y, { id, g, ownerId: 'test_P', ownerName: '길막이', type: 'fence', cx: x, cy: y, px: x * SZ + 16, py: y * SZ + 16 }); };
  for (let y = 47; y <= 54; y++) put('G1', 110, y);
  for (let y = 47; y <= 54; y++) put('G2', 190, y);
  for (let y = 147; y <= 152; y++) put('GB', 150, y);
  const knob = V.T1423_BLOCK_REACT, broke = [], hostile = [];
  const byId = () => { const m = new Map(); for (const e of fences.values()) m.set(e.id, e); return m; };
  const stepHit = (ox, oy, nx, ny, out) => {   // 존 `_t1423StepHit` 의 꾸민 판 — 들어선 칸 울타리(이 세계엔 벽 0 · 대각은 두 곧은 이웃 칸으로 나눠 본다)
    let cx = Math.floor(ox / SZ), cy = Math.floor(oy / SZ); const tx = Math.floor(nx / SZ), ty = Math.floor(ny / SZ);
    while (cx !== tx || cy !== ty) { const sx = Math.sign(tx - cx), sy = Math.sign(ty - cy); cx += sx; cy += sy; const e = fences.get(cx + ',' + cy); if (e) { if (out) out.add(e); return true; } }
    return false;
  };
  const players = new Map(), npcs = new Set();
  const deps = {
    players, npcs, broadcast: () => {}, moveSpeed: MOVE, corpseMs: 0, deathDrop: () => 0,
    isPositionActive: () => false, isBlockedByWall: () => false, isTerrainBlockedLocal: tblk,
    t1423Has: () => fences.size > 0, t1423StepHit: stepHit,
    t1423Info: (id) => { const e = byId().get(id); return e ? { id: e.id, type: 'fence', ownerId: e.ownerId, ownerName: e.ownerName, cx: e.cx, cy: e.cy, px: e.px, py: e.py } : null; },
    t1423Break: (id, by) => { const e = byId().get(id); if (!e) return { gone: true }; fences.delete(e.cx + ',' + e.cy); broke.push({ id, g: e.g, cx: e.cx, cy: e.cy, day: world.day, by: by ? [by.x, by.y] : null, reach: by ? Math.hypot(by.x - e.px, by.y - e.py) : null }); return { hits: 3, hp0: 30, item: 'item_fence' }; },
    t1423Hostile: (o, n, v) => { hostile.push({ o, v, day: world.day }); return 'offline'; },
  };
  const world = { day: 10, caravans: [], tradeLog: [] };
  const mkV = (dbId, name, cx, cy, n) => { const e = { name, npcs: [] }, v = { dbId, name, ccx: cx, ccy: cy, econ: e, npcPids: [] };
    for (let i = 0; i < n; i++) { const pid = `v${dbId}_${i}`; players.set(pid, { pid, name: name + i, isNpc: true, hp: 100, maxHp: 100, simJob: i === 0 ? 'farmer' : 'warrior', x: cx * SZ + 16, y: cy * SZ + 16, vx: 0, vy: 0, inventory: {} }); npcs.add(pid); v.npcPids.push(pid); }
    return v; };
  const VA = mkV(1, '가촌', 60, 50, 4), VB = mkV(2, '나촌', 240, 50, 2), VC = mkV(3, '다촌', 60, 150, 4), VD = mkV(4, '라촌', 240, 150, 2);
  const vils = [VA, VB, VC, VD], byDbId = new Map(vils.map((v) => [v.dbId, v])), byEcon = new Map(vils.map((v) => [v.econ, v]));
  const mkCar = (id, a, b) => {
    const c = { id, from: a.econ, to: b.econ, state: 'outbound', departDay: 10, arriveDay: 13, returnArriveDay: 16, giveRes: 'food', giveAmt: 10, escort: 0, travelDays: 3, pFrom_at_depart: 1 };
    const pid = 'car_' + id; players.set(pid, { pid, name: '상인' + id, isNpc: true, hp: 100, maxHp: 100, x: a.ccx * SZ + 16, y: a.ccy * SZ + 16, vx: 0, vy: 0, inventory: {} });
    const pts = [{ x: a.ccx * SZ + 16, y: a.ccy * SZ + 16 }, { x: b.ccx * SZ + 16, y: b.ccy * SZ + 16 }], cum = [0, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)];
    return { id, pid, c, phase: 'outbound', toV: b.econ, pts, cum, len: cum[1], prog: 0, segIdx: 0, delayedDays: 0, repairFailN: 0, lastRepairAt: 0, escorts: [], pxPerDay: cum[1] / 3, arriveAt: 0, nomPxMs: 1 };
  };
  const B1 = mkCar(1, VA, VB), B2 = mkCar(2, VC, VD);
  const BEX = new Map();
  T.setup({ deps, world, villages: vils, byDbId, byEcon, caravanBodies: new Map([[1, B1], [2, B2]]), pathfind: PF, zoneId: 'hanbando', bodyExits: BEX, war: null, warBodies: null, roads: null, dayMs: require(path.join(ROOT, 'server', 'zone-config')).WORLD.dayLengthMs });
  const log = { days: [], walk: [] };
  let now = 1e9;
  const drive = (B) => {   // 그날 캐러밴 몸이 길을 걷는다 — 막히면 재경로(`caravanBlockedResponse`)
    const p = players.get(B.pid); let guard = 0;
    while (B.prog < B.len - 0.5 && guard++ < 50) {
      now += 2500;
      const blocked = T.walk1182(B, p, Math.min(B.len, B.prog + 2400), 1000);
      if (blocked) { T.blocked(B, p, now); if (B.repairFailN > 0) break; }
    }
  };
  for (let d = 10; d <= 22; d++) {
    world.day = d;
    drive(B1); drive(B2);
    T.t681Day(now);
    const ex = []; for (const [pid, r] of BEX) if (r.t1423 != null) ex.push([pid, Math.round(r.L || 0), Math.round(r.len), r.d0]);
    log.walk.push([d, ex]);
  }
  const S = T.S, known = [...T.known.values()].map((k) => ({ vname: k.vname, ids: k.ids, cut: k.cut, ratio: k.ratio, meetDay: k.meetDay, learnDay: k.learnDay, lag: k.lag, st: k.st, at: k.at, stand: k.stand, knownDay: k.knownDay, breakDay: k.breakDay }));
  const jobs = T.jobs.map((j) => ({ vid: j.vid, ids: j.ids, pids: j.pids, d0: j.d0, arriveDay: j.arriveDay, breakDay: j.breakDay, homeDay: j.homeDay, st: j.st, hit: j.hit, walked: j.walked, len: j.len }));
  const meets = S.meets.map((m) => ({ d: m.d, cid: m.cid, ids: m.ids, cut: m.cut, ratio: m.ratio, block: m.block, x: m.x, y: m.y }));
  const G = {}; for (const e of fences.values()) G[e.g] = (G[e.g] || 0) + 1;
  const npcBack = [...npcs].filter((pid) => /^v1_/.test(pid)).length;
  const ppd = MOVE / 1000 * require(path.join(ROOT, 'server', 'zone-config')).WORLD.dayLengthMs;
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify({ knob, S: { stopSleep: S.stopSleep, resp: S.resp, meet: S.meet, meetPass: S.meetPass, meetBlock: S.meetBlock, learned: S.learned, jobs: S.jobs, bodies: S.bodies, breaks: S.breaks, home: S.home },
    known, jobs, meets, broke, hostile, left: G, npcBack, vA: VA.npcPids, ppd, b1: { prog: Math.round(B1.prog), len: Math.round(B1.len), fail: B1.repairFailN }, b2: { prog: Math.round(B2.prog), len: Math.round(B2.len) }, walk: log.walk,
    rumor: R7.travelDaysOf(Math.round((110 - 60) * SZ) / (SZ / 2.5)) }) + '\n');
  process.exit(0);
}

if (process.argv[2] === '--zone') return zoneChild();
if (process.argv[2] === '--vil') return vilChild();

// ── 부모 ──────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`); };
const run = (mode, bait, env) => {
  const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename, mode, bait || '-'], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20,
    env: Object.assign({}, process.env, { T1423_NO_BUILD: '', T1423_BLOCK_REACT: '', T1423_REACT_MEET: '' }, env || {}) });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${String(r.stderr || '').slice(-600)}` };
  return JSON.parse(line.slice(2));
};
const ON = { T1423_NO_BUILD: '1', T1423_BLOCK_REACT: '1' };
//   ㉮ 존 켬
const Z = run('--zone', '-', ON);
console.log(`[㉮ 존 켬] ${Z.err || ''}`);
const zA = (z) => !!(z && z.fence && z.fence.bw && !z.fence.bw.ok && /다리 위/.test(z.fence.bw.note || '') && !z.fence.hd.ok && /다리 끝/.test(z.fence.hd.note || '') && z.fence.wt && !z.fence.wt.ok && /물 위/.test(z.fence.wt.note || '') && z.fence.pl && z.fence.pl.ok);
const zB = (z) => !!(z && z.wall && z.wall.hdEdge && !z.wall.hdEdge.ok && /다리 끝/.test(z.wall.hdEdge.note || '') && z.wall.plEdge && z.wall.plEdge.ok);
const zC = (z) => !!(z && z.claim && z.claim.bw && z.claim.bw.added === 0 && /땅을 잡을 수 없습니다/.test(z.claim.bw.note || '') && z.claim.hd.added === 0 && /다리 끝/.test(z.claim.hd.note || '') && Array.isArray(z.lot) && z.lot.includes('head') && z.lot.includes('bridge') && z.rect === 'head' && z.rectPlain === null);
ok(zA(Z), '①a 물 칸 · 다리 칸 · 다리 머리 울타리 거절(알림 한 줄) · 빈 뭍은 선다', Z.fence ? `다리 ${JSON.stringify(Z.fence.bw)} · 머리 ${JSON.stringify(Z.fence.hd)} · 물 ${JSON.stringify(Z.fence.wt)} · 뭍 ${JSON.stringify(Z.fence.pl)} · 칸 ${JSON.stringify(Z.cells)}` : Z.err);
ok(zB(Z), '①b 벽 — 변을 낀 칸 하나가 다리 머리면 거절 · 뭍 변은 선다', JSON.stringify(Z.wall));
ok(zC(Z), '①c 사유지 한 칸 거절(다리 · 다리 끝) · 첫 집터 아홉 칸이 다리 칸 · 다리 머리를 막힌 칸으로 · 다리 머리 한 칸을 낀 발자국 거절 · 빈 뭍 발자국은 지난다', `${JSON.stringify(Z.claim)} · 아홉 칸 ${JSON.stringify(Z.lot)} · 발자국 ${Z.rect} · 빈 뭍 ${Z.rectPlain}`);
ok(Z.sites && Z.sites.gate === 3 && Z.sites.rect === 6 && Z.sites.lot === 1, '①d 짓기 문 자리 — 칸 문 3(벽 변 · 칸 건물 · 사유지 한 칸) · 발자국 문 6(움집 6×4 · 간이 3×3 · 시설 2×2 · 쉼터 6×4 · 곳간 5×3 · 집 의뢰 6×4) · 첫 집터 1', JSON.stringify(Z.sites));
ok(Z.client && Z.client.diff === 0 && Z.client.same > 100 && Z.clientSrc && Z.clientSrc.noAt && Z.clientSrc.welcome && Z.clientSrc.ghost >= 4, '①e 클라 미리보기 같은 답(다리 머리 둘레 칸 전부 · 서버 술어 = 다리 칸 ∨ 물 ∨ ㉮ 칸 줄) · welcome 칸 줄 · 고스트',
  `같음 ${Z.client && Z.client.same} · 다름 ${Z.client && Z.client.diff} ${JSON.stringify(Z.client && Z.client.ex)} · 칸 줄 ${Z.client && Z.client.payload} · ${JSON.stringify(Z.clientSrc)}`);
ok(Z.idx && Z.idx.has && Z.idx.fenceIn && Z.idx.npc === false && Z.idx.vil === false && Z.idx.bandit === false, '②a 막는 물건 표 — 플레이어 울타리 든다 · NPC · 마을 표지 · 도적은 안 든다', JSON.stringify(Z.idx));
ok(Z.step && Z.step.cross.r && Z.step.cross.ids.length === 1 && !Z.step.past.r && Z.step.wall.r && Z.step.wall.ids[0] === Z.step.wallId && !Z.step.along.r, '②b 걸음 한 칸이 그 울타리 칸 · 그 벽 변을 지나면 선다 · 곁 칸 · 벽을 따라 걷기는 안 선다', JSON.stringify(Z.step));
ok(Z.sleep && Z.sleep.stillHit && Z.sleep.info && Z.stale && !Z.stale.hit && Z.stale.stale === 1 && !Z.stale.inIdx, '②c 잠든 청크(메모리에서 내린 울타리 · DB 행 있음)도 선다 · DB 행이 없어지면 표에서 빠진다', `${JSON.stringify(Z.sleep)} · ${JSON.stringify(Z.stale)}`);
ok(Z.break && Z.break.r && Z.break.r.hits === 3 && Z.break.gone && Z.break.ground.length === 1 && Z.break.ground[0].n === 1 && /fence/.test(Z.break.ground[0].item) && Z.break.ground[0].d <= 24 && !Z.break.after && Z.break.again && Z.break.again.gone,
  '②d 부수기 — 친 횟수 3(내구 30 ÷ 사람 공격 10) · 없어진다 · 울타리 재료 하나가 그 자리 바닥에 · 그 칸이 열린다 · 두 번 못 부순다', JSON.stringify(Z.break));
ok(Z.hostile && Z.hostile.h1 === 'online' && Z.hostile.vpB === 8 && /길을 막고 있습니다 — 이웃골 사람들이 치우려 합니다/.test(Z.hostile.noteB || '') && Z.hostile.h2 === 'offline' && Z.hostile.owe.vp === 8 && Z.hostile.vpC === 8 && /시험골/.test(Z.hostile.noteC || ''),
  '②e 적대감 — 접속 중 vp +8 · 알림 "길을 막고 있습니다 — ○○ 마을 사람들이 치우려 합니다" · 접속 안 함 = 쌓였다가 들어올 때', JSON.stringify(Z.hostile));
//   ㉯ 존 끔
const Zo = run('--zone', '-', {});
ok(Zo.fence && Zo.fence.bw && Zo.fence.bw.ok && Zo.fence.hd.ok && !Zo.idx && Zo.knobs && !Zo.knobs.noBuild && !Zo.knobs.react, '㉯ 끔 — 다리 칸 · 다리 머리 울타리가 선다(종전) · 막는 물건 표 0', JSON.stringify({ fence: Zo.fence && { bw: Zo.fence.bw, hd: Zo.fence.hd }, idx: Zo.idx || null, err: Zo.err }));
//   ㉰ 마을 켬
const M = run('--vil', '-', { T1423_BLOCK_REACT: '1' });
console.log(`[㉰ 마을 켬] ${M.err || ''}`);
const g1 = (M.known || []).find((k) => k.ids.length && (M.meets || []).some((m) => m.block && m.ids.join() === k.ids.join()));
const mA = (m) => !!(m && m.meets && m.meets.some((x) => x.cid === 1 && x.block && x.cut) && m.meets.some((x) => x.cid === 2 && !x.block && x.ratio != null && x.ratio < 3) && m.known && m.known.length === 1 && m.known[0].vname === '가촌');
ok(mA(M), '③a 막힘 가름 — 길목 울타리(G1) = 못 지남 → 막힘 · 들 울타리(GB) = 돌아감(비 < 3) → 막힘 아님 · 소식은 G1 하나', JSON.stringify((M.meets || []).map((x) => [x.d, x.cid, x.block, x.cut, x.ratio, x.ids.length])));
ok(g1 && g1.learnDay === g1.meetDay + M.rumor && M.rumor >= 1 && M.hostile && M.hostile.length === 1 && M.hostile[0].day === g1.learnDay && M.jobs && M.jobs.length === 1 && M.jobs[0].d0 === g1.learnDay,
  '③b 소식 — 만난 날 + T7 날(몸 걸음 시계 · 최소 하루)에 가촌이 안다 · 그날 적대감 · 그날 몸이 나선다', g1 ? `만남 d${g1.meetDay} · 앎 d${g1.learnDay} · T7 ${M.rumor} · 적대 ${JSON.stringify(M.hostile)} · 일감 d${M.jobs && M.jobs[0] && M.jobs[0].d0}` : JSON.stringify(M.known));
const metIds = new Set((M.meets || []).filter((x) => x.block).flatMap((x) => x.ids));
const mC = (m) => !!(m && m.broke && m.broke.length >= 1 && m.broke.every((b) => b.g === 'G1' && metIds.has(b.id)) && (m.left.G1 || 0) >= 6 && m.left.G2 === 8 && m.left.GB === 6);
ok(mC(M), '③c 막힘이면 부수러 간다 — 만난 G1 울타리(길 위)만 · 길과 안 맞닿은 G1 · 아무도 안 만난 G2 · 들 울타리 GB 는 그대로', `부숨 ${JSON.stringify((M.broke || []).map((b) => [b.g, b.cx, b.cy, b.day]))} · 남음 ${JSON.stringify(M.left)}`);
const J = M.jobs && M.jobs[0];
const wDays = (m) => { const j = m && m.jobs && m.jobs[0]; return j && j.len && m.ppd ? Math.max(...j.len.map((L) => Math.ceil(L / m.ppd))) : null; }, walkDays = wDays(M);
const mD = (m) => { const j = m && m.jobs && m.jobs[0], wd = wDays(m); return !!(j && j.pids.every((pid) => (m.vA || []).includes(pid)) && j.arriveDay === j.d0 + wd && wd >= 2 && j.breakDay === j.arriveDay
  && (j.walked || []).every(([L, len, d0]) => L >= len - 0.5 && d0 === j.d0) && (j.hit || []).every((h) => h.gone || (h.step != null && h.step <= 64)) && (m.broke || []).every((b) => b.reach != null && b.reach <= 60 && b.day === j.arriveDay)
  && m.walk.some(([d, ex]) => ex.some(([pid, L, len]) => L > 0 && L < len)) && j.homeDay > j.breakDay && j.st === 'done' && m.npcBack === 4); };
ok(mD(M), '③d 몸이 실제로 걸어간다 — 가촌 명부 몸 · 장부가 날마다 하루 걸음씩(가운데 날 0 < 걸음 < 길) · 닿은 날 = 나선 날 + ⌈길 ÷ 하루 걸음⌉ · 친 자리 60px 안 · 그다음 집으로 걸어 일과로',
  J ? `나섬 d${J.d0} · 닿음 d${J.arriveDay}(걸음 ${walkDays}날 · 하루 ${Math.round(M.ppd)}px · 길 ${J.len}) · 부숨 d${J.breakDay} · 집 d${J.homeDay} · 친 거리 ${JSON.stringify((M.broke || []).map((b) => Math.round(b.reach)))} · 붙은 걸음 ${JSON.stringify((J.hit || []).map((h) => h.step))}px · 장부 ${JSON.stringify(M.walk.filter(([d, ex]) => ex.length).map(([d, ex]) => [d, ex.map((e) => e[1])]))}` : JSON.stringify(M.jobs || M.err));
//   ㉰ 마을 끔
const Mo = run('--vil', '-', {});
ok(Mo.S && Mo.S.meet === 0 && Mo.S.jobs === 0 && (Mo.broke || []).length === 0 && Mo.b1 && Mo.b1.prog >= Mo.b1.len - 1, '③e 끔 — 만남 0 · 일감 0 · 캐러밴 1 이 울타리를 그냥 지나 나촌에 닿는다(종전 — 보는 사람 없는 청크)', JSON.stringify({ S: Mo.S, b1: Mo.b1, err: Mo.err }));
//   미끼(바꾼 자리 = 원본에서 앵커가 나온 수 · 아이도 1 이 아니면 멈춘다)
const nB = (k) => LB.count(fs.readFileSync(BAITS[k].file, 'utf8'), BAITS[k].at[0]);
const bz = run('--zone', 'noGate', ON);
ok(!bz.baitErr && nB('noGate') === 1 && !zA(bz) && !zB(bz) && !zC(bz), '미끼 ㉠ 지형 문을 뺀 사본 → ①a ①b ①c 빨강', bz.baitErr || `바꾼 자리 ${nB('noGate')} · ①a ${zA(bz)} · ①b ${zB(bz)} · ①c ${zC(bz)}`);
const ba = run('--vil', 'allFence', { T1423_BLOCK_REACT: '1' });
ok(!ba.baitErr && nB('allFence') === 1 && !mA(ba) && ba.broke && ba.broke.some((b) => b.g === 'GB'), '미끼 ㉡ 모든 울타리에 반응하는 사본 → ③a 빨강 · 들 울타리를 부순다', ba.baitErr || `바꾼 자리 ${nB('allFence')} · ③a ${mA(ba)} · 부숨 ${JSON.stringify((ba.broke || []).map((b) => b.g))}`);
const bf = run('--vil', 'afar', { T1423_BLOCK_REACT: '1' });
const mCf = (m) => { const met = new Set((m.meets || []).filter((x) => x.block).flatMap((x) => x.ids)); return !!(m && m.broke && m.broke.length >= 1 && m.broke.every((b) => b.g === 'G1' && met.has(b.id) && Math.abs(b.cx - 110) <= 1) && m.left.G2 === 8); };
ok(!bf.baitErr && nB('afar') === 1 && !mCf(bf) && bf.broke && bf.broke.some((b) => b.g === 'G2'), '미끼 ㉢ 멀리서 저절로 아는 사본(길 전체) → ③c 빨강 · 아무도 안 만난 G2 를 부순다', bf.baitErr || `바꾼 자리 ${nB('afar')} · ③c ${mCf(bf)} · 부숨 ${JSON.stringify((bf.broke || []).map((b) => b.g))}`);
const bi = run('--vil', 'instant', { T1423_BLOCK_REACT: '1' });
const Ji = bi.jobs && bi.jobs[0];
ok(!bi.baitErr && nB('instant') === 1 && !mD(bi) && Ji && Ji.breakDay === Ji.d0 && (Ji.hit || []).some((h) => h.step > 64), '미끼 ㉣ 순간 삭제 사본(닿기를 안 기다린다) → ③d 빨강 · 나선 날 부순다 · 마을에서 울타리 앞으로 건너뛴다', bi.baitErr || `바꾼 자리 ${nB('instant')} · ③d ${mD(bi)} · 부숨 d${Ji && Ji.breakDay} · 나섬 d${Ji && Ji.d0} · 건너뛴 걸음 ${JSON.stringify(((Ji && Ji.hit) || []).map((h) => h.step))}px`);
console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
