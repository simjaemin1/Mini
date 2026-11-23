#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1402-deeds-work.js — 사유지에서 일인 것(★T1402 덧붙임 둘 · 재민 11-21 판정 26 · 27): 세계가 바뀐 손 · 보관함은 뺀다 · 되돌린 손 0 ==========
//
// ★지키는 것(존 정본 경로 · 켬 `T1305_DEEDS=1` · 아이 판 · 시계는 넣는 길 `_t1332SetClock`)
//   ⓐ 김매기(익기 전 E = 돌보기 — 짐이 안 바뀌는 일)가 점수를 올린다 · 할 일이 없는 밭(김을 다 맸다)에 E 는 0
//   ⓑ 수리 — 부서진 내 건물을 고치면 오른다 · 멀쩡한 건물 "수리"는 거절 · 0
//   ⓒ 땅 파기 — 움집 터파기(곡괭이 · 짐은 안 바뀌고 도구가 닳고 터가 선다)가 오른다
//   ⓓ 보관함 넣기 · 꺼내기는 일이 아니다(판정 27 · 0) · 열어 보기(서버 사건 0) · 거절된 손 0
//   ⓔ 되돌린 손 0 — 보관함을 일로 되돌린 판(`T1402_CHEST_WORK=1`)에서도 넣었다 빼고 다시 넣으면 첫 손만 오른다(제자리로 돌린 손 = 0)
//   ★미끼 셋(이 파일 안 · 사본은 `server/_t1402wbait-*` · 판 끝에 지움): ① 짐 서명만 보는 옛 존 사본 → ⓐ 빨강 ·
//     ② 멀쩡한 건물도 고치는 존 사본(재료를 내고 고침) → ⓑ 빨강 · ③ 되돌림을 안 보는 존 사본 → ⓔ 빨강
// ★박힌 날짜 0 · 벽시계는 "지금"에서 더하기만(밭의 심은 날 = 오늘 게임일에서 뺌).
//   node scripts/test-t1402-deeds-work.js   (아이 판 다섯 · 약 40초)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1402W_MODE || '';
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 260); };

if (MODE) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1' });
  if (MODE === 'chest') process.env.T1402_CHEST_WORK = '1';
  if (MODE === 'main') process.env.T99_CARE_PAUSE = '0';   // 철(겨울 휴면)에 안 걸리게 — 이 판은 "김매기가 일인가"를 잰다(휴면은 T99 하네스 몫)
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(process.env.__T1402W_ZONE || path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l; console.warn = _w; console.error = _e;
  const D = H.Deeds, F = D.CFG, SZ = H.BUILDING_SIZE, R = {};
  let T = Date.now(); H._t1332SetClock(() => T);
  let n = 0;
  const mk = (X, Y) => {
    const msgs = [], p = { pid: 'p_w' + n, playerId: 't1402w' + n, name: 'w' + n, persistent: false, lastSeen: Date.now() + 864e5, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, msgs,
      x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, toolItems: [{ id: 'tp' + n, type: 'pickaxe', d: 100 }], equipment: [], equipSlots: {}, craftSkill: {} };
    n++; H.players.set(p.pid, p);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { p.x = (X + x) * SZ + SZ / 2; p.y = (Y + y) * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
    p.x = (X + 2) * SZ + SZ / 2; p.y = (Y + 2) * SZ + SZ / 2; delete p._t1332Dw; delete p._t1343Work; p._t1402Hist = [];
    return p;
  };
  // 한 손 뒤 머묾 재기 25초(존 타이머와 같은 간격) — 그동안 들어온 점수
  const score = (p, msg) => {
    let got = 0; const a = D.addPts; D.addPts = function (P, ch, pts) { got += Math.max(0, +pts || 0); return a.apply(this, arguments); };
    try {
      H._t1332Dwell(p, T);
      if (msg) H.handlePlayerInput(p, JSON.stringify(msg));
      const step = Math.max(1000, F.DWELL_MS / 4), t0 = T;
      for (let t = step; t <= 25000; t += step) { T = t0 + t; H._t1332Dwell(p, T); }
    } finally { D.addPts = a; }
    T += 60000; delete p._t1332Dw; delete p._t1343Work;   // 다음 손은 머묾을 새로
    return got;
  };
  const notes = (p) => p.msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  try {
    if (MODE === 'main' || MODE === 'repair' || MODE === 'dig') {
      const p = mk(60000 + n * 40, 60000);
      if (MODE === 'main') {
        // ⓐ 김매기 — 할 일이 김매기인 밭을 찾는다(작물마다 생장 비율이 다르다 · 휴면 철이면 다음 작물)
        const Crops = require(path.join(ROOT, 'server', 'crops.js'));
        const today = H.zoneGameDay ? H.zoneGameDay() : null;
        let weeded = null, pts = 0, pts2 = null, tried = 0;
        const farm = (bid, cid, planted, extra) => H.buildings.set(bid, { id: bid, type: 'farmland', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, dbId: 0, floor: 0,
          data: Object.assign({ crop: cid, plantedDay: planted, seedFresh: 1, farmStage: 0, supply: 1, q: 0.9 }, extra || {}) });
        for (const c of Crops.list()) {
          if (weeded || tried > 60) break;
          const g = Crops.growDaysOf(c.id); if (!(g > 4)) continue;
          for (const off of [Math.ceil(g * 0.15), Math.ceil(g * 0.15) + 30, Math.ceil(g * 0.15) + 60, Math.ceil(g * 0.15) + 90]) {
            if (weeded || ++tried > 60) break;
            const bid = 'b_farm' + tried; farm(bid, c.id, (today | 0) - off);
            p.msgs.length = 0;
            const got = score(p, { type: 'harvest' });
            if (/김을 맸습니다/.test(notes(p).join(' | '))) {
              weeded = c.id; pts = got;
              // 할 일이 없는 밭(김은 다 맸다 · 같은 작물 · 같은 날) — 곧바로 E 는 0
              H.buildings.delete(bid); farm(bid + 'x', c.id, (today | 0) - off, { wd: 6, td: today | 0 }); p.msgs.length = 0;
              pts2 = score(p, { type: 'harvest' }); H.buildings.delete(bid + 'x');
            }
            H.buildings.delete(bid);
          }
        }
        put(R, 'a_weed', !!weeded && pts > 10 && pts2 === 0, `작물 ${weeded} 김매기 1벌 → ${pts.toFixed(1)}점 · 김을 다 맨 밭에 E(할 일 없음) → ${pts2 == null ? '-' : pts2.toFixed(1)}점 · 견준 판 ${tried}`);
        // ⓓ 보관함 넣기 · 꺼내기 · 열어 보기 · 거절된 손
        const cid = 'b_chest_w'; H.buildings.set(cid, { id: cid, type: 'chest', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, dbId: 0, floor: 0, data: { wood: 5 } });
        const c1 = score(p, { type: 'chest_put', buildingId: cid, item: 'wood', amount: 1 }), c2 = score(p, { type: 'chest_take', buildingId: cid, item: 'wood', amount: 1 });
        const o1 = score(p, { type: 'village_inventory', buildingId: cid }), r1 = score(p, { type: 'plant', crop: 'nope' });
        H.buildings.delete(cid);
        put(R, 'd_chest', c1 === 0 && c2 === 0 && o1 === 0 && r1 === 0, `보관함 넣기 ${c1} · 꺼내기 ${c2} · 열어 보기 ${o1} · 거절된 심기 ${r1}`);
      } else if (MODE === 'repair') {
        const wb = 'b_wall_w', mb = 'b_wall_m';
        H.buildings.set(wb, { id: wb, type: 'fence', x: p.x + 16, y: p.y, ownerId: p.playerId, ownerName: p.name, dbId: 0, floor: 0, data: { hp: 5, damaged: true } });
        const r1 = score(p, { type: 'repair_building' }), n1 = notes(p).slice(-1)[0] || '';
        H.buildings.delete(wb);
        H.buildings.set(mb, { id: mb, type: 'fence', x: p.x + 16, y: p.y, ownerId: p.playerId, ownerName: p.name, dbId: 0, floor: 0, data: { hp: 30 } });
        p.msgs.length = 0;
        const r2 = score(p, { type: 'repair_building' }), n2 = notes(p).slice(-1)[0] || '';
        H.buildings.delete(mb);
        put(R, 'b_repair', r1 > 10 && /고쳤습니다/.test(n1), `부서진 울타리 고침 → ${r1.toFixed(1)}점 · ${n1.slice(0, 40)}`);
        put(R, 'b_fresh', r2 === 0, `멀쩡한 울타리 "수리" → ${r2.toFixed(1)}점 · ${n2.slice(0, 40)}`);
      } else {
        const inv0 = JSON.stringify(p.inventory);
        const g = score(p, { type: 'hut_start', atX: p.x, atY: p.y });
        const site = [...H.buildings.values()].some((b) => b.type === 'hut_site' && b.ownerId === p.playerId);
        put(R, 'c_dig', g > 10 && site && JSON.stringify(p.inventory) === inv0, `움집 터파기 → ${g.toFixed(1)}점 · 터 ${site ? '섬' : '없음'} · 짐 ${JSON.stringify(p.inventory) === inv0 ? '그대로(도구만 닳음)' : '바뀜'} · ${notes(p).slice(-1)[0] || ''}`.slice(0, 250));
      }
    } else if (MODE === 'chest') {
      const p = mk(61000, 61000), cid = 'b_chest_r';
      H.buildings.set(cid, { id: cid, type: 'chest', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, dbId: 0, floor: 0, data: { wood: 5 } });
      const a = score(p, { type: 'chest_put', buildingId: cid, item: 'wood', amount: 1 });
      const b = score(p, { type: 'chest_take', buildingId: cid, item: 'wood', amount: 1 });
      const c = score(p, { type: 'chest_put', buildingId: cid, item: 'wood', amount: 1 });
      const d = score(p, { type: 'chest_put', buildingId: cid, item: 'stone', amount: 1 });
      put(R, 'e_revert', a > 10 && b === 0 && c === 0 && d > 10, `넣기 ${a.toFixed(1)} → 빼기(제자리) ${b.toFixed(1)} → 다시 넣기(제자리) ${c.toFixed(1)} → 다른 것 넣기 ${d.toFixed(1)}`);
    }
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1402W ' + JSON.stringify(R));
  for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
} else {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const run = (mode, env) => {
    let out = '';
    try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402W_MODE: mode, DB_PATH: require('./lib-tmp').file(`t1402w_${mode}`, '.db'), PORT: String(require('./lib-port').port(37760)) }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { out = String((e && e.stdout) || ''); }
    const m = /@@T1402W (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
  };
  const show = (R, k, msg) => ok(!!R && R[k] === true, msg, R ? (R[k + '#'] || R.err || '') : '아이 판 없음');
  console.log('\n=== T1402 사유지에서 일인 것 — 세계가 바뀐 손 · 보관함 뺌 · 되돌린 손 0 ===');
  const RM = run('main'), RR = run('repair'), RD = run('dig'), RC = run('chest');
  show(RM, 'a_weed', 'ⓐ 김매기(익기 전 E — 짐이 안 바뀌는 일)가 점수를 올린다 · 할 일이 없는 밭에 E 는 0');
  show(RR, 'b_repair', 'ⓑ 수리 — 부서진 내 울타리를 고치면 오른다');
  show(RR, 'b_fresh', 'ⓑ 멀쩡한 울타리 "수리"는 거절 · 0점');
  show(RD, 'c_dig', 'ⓒ 땅 파기 — 움집 터파기(짐 그대로 · 도구가 닳고 터가 선다)가 오른다');
  show(RM, 'd_chest', 'ⓓ 보관함 넣기 · 꺼내기(판정 27) · 열어 보기 · 거절된 손 = 0점');
  show(RC, 'e_revert', 'ⓔ 되돌린 손 0 — 보관함을 일로 되돌린 판에서도 넣고 · 빼고 · 다시 넣으면 첫 손만 오른다(다른 것을 넣으면 다시 오른다)');
  // ★미끼 셋 — 사본은 server/ 에(상대 require 그대로) · 판 끝에 지운다
  const ZS = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const tmp = (tag) => path.join(ROOT, 'server', `_t1402wbait-${tag}-${process.pid}.js`);
  const bait = (tag, from, to, mode) => {
    const k = ZS.split(from).length - 1, f = tmp(tag);
    let RB = null; try { fs.writeFileSync(f, ZS.split(from).join(to)); RB = run(mode, { __T1402W_ZONE: f }); } finally { try { fs.unlinkSync(f); } catch (e) {} }
    return { k, RB: RB || {} };
  };
  { const { k, RB } = bait('sig', "    if (!T1402_WORLD) return JSON.stringify(p.inventory || {});", "    return JSON.stringify(p.inventory || {});", 'main');
    ok(k === 1 && RB.a_weed === false && RB.d_chest === true, '★미끼 ① — 짐 서명만 보는 옛 존 사본(세계가 바뀐 것을 안 본다) → ⓐ 빨강(ⓓ 는 초록)', `바꾼 자리 ${k} · a_weed=${RB.a_weed} d_chest=${RB.d_chest} · ${RB['a_weed#'] || RB.err || ''}`); }
  { const { k, RB } = bait('fresh', "    if (!b.data?.damaged && (b.data?.hp ?? Infinity) >= (BUILDING_MAX_HP[b.type] || 50)) continue;", "    if (false) continue;", 'repair');
    ok(k === 1 && RB.b_fresh === false && RB.b_repair === true, '★미끼 ② — 멀쩡한 건물도 고치는 존 사본(재료를 내고 고침) → ⓑ 멀쩡한 것 빨강(부서진 것은 초록)', `바꾼 자리 ${k} · b_fresh=${RB.b_fresh} b_repair=${RB.b_repair} · ${RB['b_fresh#'] || RB.err || ''}`); }
  { const { k, RB } = bait('rev', "  const rev = h.some((e) => e.sig === after);", "  const rev = false;", 'chest');
    ok(k === 1 && RB.e_revert === false, '★미끼 ③ — 되돌림을 안 보는 존 사본 → ⓔ 빨강', `바꾼 자리 ${k} · e_revert=${RB.e_revert} · ${RB['e_revert#'] || RB.err || ''}`); }
  console.log(`\n=== T1402 사유지 일: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
