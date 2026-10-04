#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-ghost-band.js — 이웃 존에 보내는 유령 목록이 색인 전후로 한 바이트도 안 다르다 (T621) ================
//
// ★왜 [지시 T621 · T605 §4-6] `syncGhostsToNeighbors` 가 100ms 마다 건물 **전부**를 훑었다(관측자 0 에서 부름당 0.59ms = 틱 비용의 23%).
//   제품은 `buildings` Map 이 **경계 띠 색인**을 같이 들게 했다(`_BuildingMap` — set·delete·clear 한 자리 · 후보 = 그 함수가 보내는 종류이면서
//   경계 띠 안 · 순서 = `buildings` 순서). 게이트는 하나다: **같은 판에서 매 부름 보내는 목록이 바이트 같다.**
//     ① 글자 — 색인 한 자리(`buildings` 가 `_BuildingMap`) · 함수가 색인을 훑는다 · 띠 폭은 한 수(`GHOST_REACH` 모듈 상수 하나)
//     ② 같은 판 1,000부름 — 짓기·부수기·부서짐·같은 키 덮어쓰기·통째 비우기(청크 내림)가 섞인 시나리오를 시드로 한 번 만들고,
//        **전**(같은 함수 본문에서 색인 한 줄만 `buildings.values()` 로 되돌린 판 · 평범한 Map) ↔ **후**(지금 판 · `_BuildingMap`)에
//        똑같이 흘려 부름마다 보낸 몸통(이웃 존 · 경로 · JSON)을 해시해 견준다 — 존 둘(한반도 · 닛폰)
//     ③ `--ref <git ref>` — 전 = 그 ref 의 `server/zone.js` 함수 글자 그대로(색인 전 원본) · 후 = 지금 판(보고용 — 기본은 ②의 되돌린 판)
//     (자명 통과 금지 — ② 안에서) 보낸 건물이 실제로 있다 · 띠 밖 후보·딴 종류가 실제로 섞였다 · 덮어쓰기 재계산이 실제로 불렸다 ·
//       미끼 셋(색인에서 안 빼는 판 · 덮어쓸 때 다시 안 세는 판 · 띠 폭을 바꾼 판)은 **갈린다**
// ⚠존을 부팅하지 않는다 — 존 소스는 글자로 떠서 함수로 돌린다(test-coll-grid · test-move-soa ⑭ 와 같은 문법 · 사본 0).
//   이웃 존 판정은 정본 `server/zone-config.js` `findZoneAt` 그대로 · 보내기(`postJSON`)는 몸통만 받아 적고 끝나지 않는 약속을 돌려준다
//   (T512 왕복 `ow` 가 0 으로 남아 두 판의 몸통이 시계에 안 묶인다).
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const argv = process.argv.slice(2);
const REF = (() => { const i = argv.indexOf('--ref'); return i >= 0 ? argv[i + 1] : null; })();
const CALLS = 1000;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
// 글자 뜨기 — 함수 하나 · 색인 덩이(`GHOST_REACH` 줄부터 `_BuildingMap` 끝까지)
const fnOf = (src) => (src.match(/\nfunction syncGhostsToNeighbors\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
const blockOf = (src) => { const a = src.indexOf('\nconst GHOST_REACH = '), b = src.indexOf('\nconst buildings = new _BuildingMap();'); return a >= 0 && b > a ? src.slice(a, b) : ''; };
const FN = fnOf(Z), BLOCK = blockOf(Z);

console.log('\n=== 이웃 존에 보내는 유령 목록 — 색인 전후 바이트 같음 (T621) ===');
console.log('\n① 글자 — 색인 한 자리 · 함수가 색인을 훑는다 · 띠 폭 한 수');
ok(FN.length > 1500 && BLOCK.length > 400, '① [전제] 제품의 함수와 색인 덩이를 떴다', `함수 ${FN.length}자 · 색인 ${BLOCK.length}자`);
ok((Z.match(/^const buildings = new _BuildingMap\(\);/m) || []).length === 1 && !/^const buildings = new Map\(\)/m.test(Z), '① ★`buildings` 는 `_BuildingMap` 하나다(색인을 넣고 빼는 자리 = 그 Map 의 set·delete·clear)');
ok(/for \(const b of buildings\.ghostBand\(\)\)/.test(FN) && !/for \(const b of buildings\.values\(\)\)/.test(FN), '① ★함수의 건물 줄이 색인을 훑는다(전수 `buildings.values()` 0)');
ok((Z.match(/\bconst GHOST_REACH = /g) || []).length === 1 && /^const GHOST_REACH = 1200;/m.test(Z), '① ★띠 폭은 모듈 상수 하나(`GHOST_REACH` 1200 — 함수와 색인이 같은 수)');
ok(/b\.type !== 'wall' && b\.type !== 'door' && b\.type !== 'fence'/.test(FN) && /b\.type !== 'wall' && b\.type !== 'door' && b\.type !== 'fence'/.test(BLOCK), '① 함수와 색인이 같은 종류 셋을 본다(벽·문·울타리)');

// ── 판 만들기 ────────────────────────────────────────────────────────────────────────
//   make(fnSrc, block) → { sync, newMap } — 주입: players · ZONE · findZoneAt · ZONE_ID · buildings · ZONES · T512 · _ghostRtt · postJSON · performance
function make(fnSrc, block, zid, sinkRef) {
  const ZONE = ZC.ZONES[zid];
  const players = new Map();
  const postJSON = (host, port, p, body) => { sinkRef.out.push(p + ' ' + host + ':' + port + ' ' + JSON.stringify(body)); return new Promise(() => {}); };
  const f = new Function('players', 'ZONE', 'findZoneAt', 'ZONE_ID', 'ZONES', 'T512_GHOST_EXTRAP', '_ghostRtt', 'postJSON', 'performance', '__mk',
    (block || '') + '\nlet buildings = __mk(typeof _BuildingMap === "function" ? _BuildingMap : null);\n' + fnSrc +
    '\nreturn { sync: syncGhostsToNeighbors, buildings: () => buildings, reset: (m) => { buildings = m; } };');
  const h = f(players, ZONE, ZC.findZoneAt, zid, ZC.ZONES, true, new Map(), postJSON, require('perf_hooks').performance,
    (BM) => (BM ? new BM() : new Map()));
  return { h, players, ZONE };
}

// 시나리오 — 시드로 한 번 만든 연산 열(두 판에 똑같이 흘린다)
const TYPES = ['wall', 'wall', 'wall', 'door', 'fence', 'fence', 'floor', 'farmland', 'chest', 'stair', 'hut_site', 'guild_granary'];
function scenario(zid, seed) {
  const ZONE = ZC.ZONES[zid], zw = ZONE.zoneWidth, zh = ZONE.zoneHeight, R = rng(seed);
  const cell = (v) => Math.floor(v / 32) * 32;
  const pos = () => {   // 절반은 경계 2,000px 안(띠 안팎 둘 다) · 절반은 아무 데나
    const u = R();
    if (u < 0.5) {
      const side = Math.floor(R() * 4), d = R() * 2000;
      if (side === 0) return [cell(d), cell(R() * zh)];
      if (side === 1) return [cell(zw - d), cell(R() * zh)];
      if (side === 2) return [cell(R() * zw), cell(d)];
      return [cell(R() * zw), cell(zh - d)];
    }
    return [cell(R() * zw), cell(R() * zh)];
  };
  let seq = 1;
  const mkB = (id) => { const [x, y] = pos(); const type = TYPES[Math.floor(R() * TYPES.length)];
    return { id: id || ('b' + (seq++)), dbId: seq, type, ownerId: 'p' + Math.floor(R() * 5), ownerName: 'n', x, y, floor: R() < 0.2 ? 1 : 0,
      data: { side: R() < 0.5 ? 'N' : 'E', floor: 0, damaged: R() < 0.1 ? true : undefined } }; };
  const ops = [];   // [kind, ...]
  const init = []; for (let i = 0; i < 1500; i++) init.push(mkB());
  const ids = init.map((b) => b.id);
  const live = new Set(ids);
  const pl = []; for (let i = 0; i < 12; i++) { const [x, y] = pos(); pl.push({ pid: i, playerId: 'u' + i, name: 'u' + i, x, y, vx: 0, vy: 0, isNpc: i % 5 === 0, handingOff: false }); }
  for (let c = 0; c < CALLS; c++) {
    const step = [];
    const nAdd = Math.floor(R() * 6), nDel = Math.floor(R() * 6), nDmg = Math.floor(R() * 3);
    for (let i = 0; i < nAdd; i++) { const b = mkB(); live.add(b.id); step.push(['add', b]); }
    const arr = [...live];
    for (let i = 0; i < nDel && arr.length; i++) { const k = arr[Math.floor(R() * arr.length)]; if (live.delete(k)) step.push(['del', k]); }
    for (let i = 0; i < nDmg && arr.length; i++) { const k = arr[Math.floor(R() * arr.length)]; if (live.has(k)) step.push(['dmg', k, R() < 0.5]); }
    if (R() < 0.03 && arr.length) { const k = arr[Math.floor(R() * arr.length)]; if (live.has(k)) step.push(['reset', mkB(k)]); }   // 같은 키 덮어쓰기(종류·자리가 바뀐 새 몸)
    if (R() < 0.004) { step.push(['clear']); live.clear(); for (let i = 0; i < 200; i++) { const b = mkB(); live.add(b.id); step.push(['add', b]); } }   // 통째로 내림(청크 비활성) 뒤 다시 올림
    if (R() < 0.02) { const xs = R() * zw, ys = R() * zh; step.push(['region', xs, ys, xs + 9000, ys + 9000]); }   // 한 구역 통째로 내림
    const moves = pl.map(() => [(R() - 0.5) * 600, (R() - 0.5) * 600, R() < 0.05]);
    step.push(['players', moves]);
    ops.push(step);
  }
  return { init, ops, pl };
}
// 판 하나에 시나리오를 흘린다 — 부름마다 보낸 몸통의 해시
function run(fnSrc, block, zid, sc, opts) {
  const sink = { out: [] };
  const { h, players } = make(fnSrc, block, zid, sink);
  let B = h.buildings();
  const clone = (b) => JSON.parse(JSON.stringify(b));
  for (const b of sc.init) B.set(b.id, clone(b));
  for (const p of sc.pl) players.set(p.pid, Object.assign({}, p));
  const hashes = [], st = { sentB: 0, sentP: 0, calls: 0, nonEmpty: 0, maxBand: 0, maxAll: 0 };
  for (let c = 0; c < CALLS; c++) {
    for (const op of sc.ops[c]) {
      if (op[0] === 'add') B.set(op[1].id, clone(op[1]));
      else if (op[0] === 'del') { if (!(opts && opts.leakDelete)) B.delete(op[1]); else Map.prototype.delete.call(B, op[1]); }
      else if (op[0] === 'dmg') { const b = B.get(op[1]); if (b) { b.data = b.data || {}; if (op[2]) b.data.damaged = true; else delete b.data.damaged; } }
      else if (op[0] === 'reset') B.set(op[1].id, clone(op[1]));
      else if (op[0] === 'clear') B.clear();
      else if (op[0] === 'region') { for (const [k, b] of [...B]) if (b.x >= op[1] && b.x < op[3] && b.y >= op[2] && b.y < op[4]) B.delete(k); }
      else if (op[0] === 'players') { let i = 0; for (const p of players.values()) { const m = op[1][i++]; p.x = Math.max(0, p.x + m[0]); p.y = Math.max(0, p.y + m[1]); p.vx = m[0]; p.vy = m[1]; p.handingOff = m[2]; } }
    }
    sink.out.length = 0;
    h.sync();
    st.calls++;
    let nb = 0, np = 0; for (const s of sink.out) { const j = JSON.parse(s.slice(s.indexOf('{'))); nb += j.buildings.length; np += j.players.length; }
    st.sentB += nb; st.sentP += np; if (nb) st.nonEmpty++;
    if (B.ghostBand) { let n = 0; for (const _ of B.ghostBand()) n++; if (n > st.maxBand) st.maxBand = n; }
    if (B.size > st.maxAll) st.maxAll = B.size;
    hashes.push(crypto.createHash('sha1').update(sink.out.join('\n')).digest('hex'));
  }
  return { hashes, st };
}
const same = (a, b) => { let d = 0, first = -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d++; if (first < 0) first = i; } return { d, first }; };

// ── ② 같은 판 1,000부름 ───────────────────────────────────────────────────────────────
const OLD_FN = FN.replace('for (const b of buildings.ghostBand())', 'for (const b of buildings.values())');
const ZIDS = ['hanbando', 'nippon'];
for (const zid of ZIDS) {
  console.log(`\n② 같은 판 ${CALLS}부름 — ${zid}(전 = 색인 한 줄만 되돌린 판 · 평범한 Map ↔ 후 = 지금 판)`);
  const sc = scenario(zid, zid === 'hanbando' ? 621 : 1004);
  // 전: 색인 덩이 없이(`_BuildingMap` 없음 ⇒ 평범한 Map) · `GHOST_REACH` 는 같은 줄 한 줄만 싣는다
  const reachLine = (BLOCK.match(/\nconst GHOST_REACH = [^\n]*/) || [''])[0];
  const A = run(OLD_FN, reachLine, zid, sc), Bn = run(FN, BLOCK, zid, sc);
  const r = same(A.hashes, Bn.hashes);
  ok(A.hashes.length === CALLS && Bn.hashes.length === CALLS, `② [전제] 두 판 다 ${CALLS}부름을 돌았다`);
  ok(Bn.st.sentB > 1000 && Bn.st.nonEmpty > CALLS * 0.9, '② [자명 통과 금지] 보낸 건물이 실제로 있다', `부름당 건물 ${(Bn.st.sentB / CALLS).toFixed(1)} · 건물 보낸 부름 ${Bn.st.nonEmpty}/${CALLS} · 유령 몸 ${Bn.st.sentP}`);
  ok(Bn.st.maxAll > Bn.st.maxBand * 2, '② [자명 통과 금지] 띠 밖·딴 종류가 실제로 섞였다(색인이 훑는 몫 < 전수)', `색인 최대 ${Bn.st.maxBand} · 건물 최대 ${Bn.st.maxAll}`);
  const resets = sc.ops.flat().filter((o) => o[0] === 'reset').length, clears = sc.ops.flat().filter((o) => o[0] === 'clear').length, regions = sc.ops.flat().filter((o) => o[0] === 'region').length;
  const adds = sc.ops.flat().filter((o) => o[0] === 'add').length, dels = sc.ops.flat().filter((o) => o[0] === 'del').length;
  ok(resets > 5 && clears >= 1 && regions >= 5, '② [자명 통과 금지] 짓기·부수기·덮어쓰기·통째 비우기·구역 내림이 섞였다', `짓기 ${adds} · 부수기 ${dels} · 덮어쓰기 ${resets} · 통째 비우기 ${clears} · 구역 내림 ${regions}`);
  ok(r.d === 0, `② ★★매 부름 보낸 몸통이 **바이트 같다**(${CALLS}부름 해시)`, r.d ? `다른 부름 ${r.d} · 첫 ${r.first}` : `끝 해시 ${Bn.hashes[CALLS - 1].slice(0, 12)}`);
  // 미끼 — 갈려야 한다
  const leak = run(FN, BLOCK, zid, sc, { leakDelete: true });
  ok(same(A.hashes, leak.hashes).d > 0, '② [미끼] 색인에서 안 빼는 판(지운 건물이 띠에 남는다)은 **갈린다**', `다른 부름 ${same(A.hashes, leak.hashes).d}`);
  const noRebuild = BLOCK.replace('else this.#rebuild();', 'else gb.set(k, v);');
  ok(noRebuild !== BLOCK, '② [미끼 전제] 덮어쓰기 재계산 줄을 떠서 바꿨다');
  const nr = run(FN, noRebuild, zid, sc);
  ok(same(A.hashes, nr.hashes).d > 0, '② [미끼] 같은 키 덮어쓰기 때 다시 안 세는 판(순서가 끝으로 밀린다)은 **갈린다**', `다른 부름 ${same(A.hashes, nr.hashes).d}`);
  const narrow = BLOCK.replace(/\nconst GHOST_REACH = 1200;/, '\nconst GHOST_REACH = 1200; const __GR_IDX = 600;').replace(/function _ghostBandOf\(b\) \{([\s\S]*?)GHOST_REACH([\s\S]*?)\n\}/, (m) => m.split('GHOST_REACH').join('__GR_IDX'));
  ok(narrow !== BLOCK, '② [미끼 전제] 색인의 띠 폭만 바꾼 판을 만들었다');
  const nw = run(FN, narrow, zid, sc);
  ok(same(A.hashes, nw.hashes).d > 0, '② [미끼] 색인 띠 폭이 함수와 다른 판(600 ↔ 1200)은 **갈린다** — 한 수여야 한다', `다른 부름 ${same(A.hashes, nw.hashes).d}`);
}

// ── ③ 원본 대조(보고용) ────────────────────────────────────────────────────────────────
if (REF) {
  console.log(`\n③ 원본 대조 — 전 = \`${REF}\` 의 server/zone.js 함수 글자 그대로(색인 전) ↔ 후 = 지금 판`);
  const RZ = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, maxBuffer: 256 << 20 }).toString();
  const RFN = fnOf(RZ);
  ok(RFN.length > 1500 && /for \(const b of buildings\.values\(\)\)/.test(RFN), `③ [전제] ${REF} 의 함수는 건물 전수를 훑는 원본이다`);
  for (const zid of ZIDS) {
    const sc = scenario(zid, zid === 'hanbando' ? 621 : 1004);
    const A = run(RFN, '', zid, sc), Bn = run(FN, BLOCK, zid, sc);
    const r = same(A.hashes, Bn.hashes);
    ok(r.d === 0, `③ ★${zid} ${CALLS}부름 — 원본 ↔ 지금 판 몸통 **바이트 같다**`, r.d ? `다른 부름 ${r.d} · 첫 ${r.first}` : `끝 해시 ${Bn.hashes[CALLS - 1].slice(0, 12)}`);
  }
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
console.log('    접점: syncGhostsToNeighbors · _BuildingMap · ghostBand · GHOST_REACH · findZoneAt · /ghost_sync');
process.exit(fail ? 1 : 0);
