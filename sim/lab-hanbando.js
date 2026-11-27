'use strict';
// === sim/lab-hanbando.js — 한반도 51마을 랩 세계를 **판 자(t17)와 같은 차례로** 세운다 (T1497 ② · ★재민 판정 81 · T1468 회부 1) ===
//
// ★왜: 판 자(`scripts/t17-metrics.js`)는 서버 시딩(실지도 → 마을 자리 → 배치 → 땅 값)으로 51마을을 세우는데,
//   브라우저 랩(마을실험실 · 전쟁실험실)은 제 세계('마을i' · 제 지형 · 역할별 손 비옥도)를 세웠다 — 재민이 화면으로 보는 자리가 지도 밖이었다.
//   이 파일은 판 자가 econ 세계를 세우는 **그 몇 줄**(`createWorldV2` → 마을마다 `createVillage(땅 값)` · 좌표 · 집 크루 · 나무 층 · 지형 거리 행렬)을
//   한 함수로 둔다 — 재료는 `sim/lab-hanbando-pack.json`(`scripts/t1497-hanbando-pack.js` 가 판 자의 시딩 캐시 · 거리 행렬 캐시에서 굽는다 · 새 수 0).
//   node(하네스 · 판 자 맞대기)와 번들(브라우저 랩 — `EconEngine.LabHanbando`)이 같은 함수를 부른다(사본 0).
//   ⚠지형 · 몸(생활층)은 안 싣는다 — 브라우저 랩의 한반도 판은 econ 세계(판 자와 같은 세계)를 돌리고 화면은 마을 표 · 지도 점으로 보인다.
//
//   build(pack, { seed }) → world(econ v2 세계 · 날 0) · tick(world) = 하루
function build(pack, opts) {
  const econ = require('./economy-sim'), econV2 = require('./economy-sim-v2'), trees = require('../server/trees');
  const seed = (opts && opts.seed != null) ? +opts.seed : 1020;
  const world = econV2.createWorldV2({ seed, villageCount: pack.villages.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  world.villages = []; world.events = [];
  if (trees && trees.attachToWorld) trees.attachToWorld(world);   // 판 자 · 서버와 같은 나무 층 문
  for (const s of pack.villages) {
    const ev = econ.createVillage(Object.assign({}, s.lp, { initialPop: pack.initialPop, name: s.name }));
    ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
    world.villages.push(ev);
    if (s.houses != null) econ.labHouseAttach(ev, s.houses, pack.life);   // 판 자와 같은 집 크루(시딩 집 칸 수 · 서버 크루 두 수)
  }
  world.day = 0;
  if (pack.dist) econ.setDistMatrix(world, pack.dist.map((r) => r.map((d) => (d == null ? Infinity : d))));   // 판 자 T1047 과 같은 지형 거리
  return world;
}
function tick(world) { return require('./economy-sim-v2').tickWorldV2(world); }
// 화면이 읽는 수 — 판 자 끝 줄과 같은 자리(인구 = 명부 · 영토 칸 = `land.size × 25` · 지도 끝 = 구운 표)
function rows(world) {
  const econ = require('./economy-sim'); let T = null; try { T = econ.t1468Table ? econ.t1468Table() : null; } catch (e) { T = null; }
  return world.villages.map((v) => {
    const cells = Math.round((v.land.size || 0) * 25), R = T && T._byName ? T._byName[v.name] : null, endCells = R ? Math.round(R.max * 25) : null;
    return { name: v.name, pop: v.npcs.length, cells, endCells, out: endCells != null && cells > endCells, K: v._dpDebug ? v._dpDebug.K : null,
      foodDays: v.npcs.length ? +(((v.storage && v.storage.food) || 0) / v.npcs.length).toFixed(1) : 0 };
  });
}
// ── 브라우저 판(`?map=hanbando`) — 두 랩 HTML 이 이 한 함수를 부른다(사본 0). 판 자와 같은 세계(build · tick)를 돌리고 마을 표 · 지도 점을 그린다.
//   말씨 = 하십시오체 · 먹선(검은 1px 선 · 흰 바탕). 이 판에는 아래 랩의 손 조작(영토 배율 · 마을 수 · 인구 칸)이 닿지 않는다 — "지도 밖".
function panel(doc, opts) {
  if (!doc || !doc.body) return null;
  const E = (typeof globalThis !== 'undefined' && globalThis.EconEngine) || {};
  const pack = E.HanbandoPack; if (!pack) { doc.body.insertAdjacentHTML('afterbegin', '<div style="padding:8px;border:1px solid #000;background:#fff">한반도 짐이 번들에 없습니다.</div>'); return null; }
  const qs = (opts && opts.search) || ''; const sp = new URLSearchParams(qs);
  let seed = +(sp.get('seed') || 1020), world = build(pack, { seed }), run = false, perFrame = +(sp.get('speed') || 4);
  const env = (k) => { try { return (typeof process !== 'undefined' && process.env && process.env[k]) || ''; } catch (e) { return ''; } };
  const box = doc.createElement('div'); box.id = 't1497-hanbando';
  box.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#fff;color:#000;font:13px/1.45 sans-serif;display:flex;gap:12px;padding:10px;box-sizing:border-box;overflow:hidden';
  box.innerHTML = '<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:6px">'
    + '<canvas id="t1497-map" width="300" height="556" style="border:1px solid #000;width:300px;height:556px;max-width:none;flex:none"></canvas></div>'
    + '<div style="flex:1 1 auto;display:flex;flex-direction:column;min-width:0">'
    + '<div id="t1497-head" style="border-bottom:1px solid #000;padding-bottom:6px"></div>'
    + '<div style="display:flex;gap:6px;padding:6px 0;align-items:center">'
    + '<button id="t1497-run" style="border:1px solid #000;background:#fff;color:#000;padding:2px 8px;white-space:nowrap">▶ 돌리기</button>'
    + '<button id="t1497-800" style="border:1px solid #000;background:#fff;color:#000;padding:2px 8px;white-space:nowrap">800날까지</button>'
    + '<label style="color:#000;white-space:nowrap">시드 <select id="t1497-seed" style="border:1px solid #000;color:#000;background:#fff">' + [1020, 7, 42].map((x) => '<option' + (x === seed ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>'
    + '<label style="color:#000;white-space:nowrap">하루/그림 <input id="t1497-speed" type="number" min="1" max="50" value="' + perFrame + '" style="width:44px;border:1px solid #000;color:#000;background:#fff"></label>'
    + '<span style="margin-left:auto">아래 랩의 손 조작(영토 배율 · 마을 수 · 인구)은 이 판에 닿지 않습니다 — <b>지도 밖</b></span></div>'
    + '<div style="overflow:auto;flex:1 1 auto;border-top:1px solid #000"><table id="t1497-tab" style="border-collapse:collapse;width:100%"></table></div></div>';
  doc.body.appendChild(box);
  const $ = (id) => doc.getElementById(id), ctx = $('t1497-map').getContext('2d');
  const W = 2188, H = 4063, sx = 300 / W, sy = 556 / H;
  function draw() {
    const R = rows(world), pop = R.reduce((a, r) => a + r.pop, 0), cells = R.reduce((a, r) => a + r.cells, 0), out = R.filter((r) => r.out).length;
    $('t1497-head').innerHTML = '<b>한반도 51마을</b> — 판 자(t17)와 같은 세계입니다 · 시드 ' + seed + ' · 날 <b>' + world.day + '</b> · 인구 <b>' + pop.toLocaleString() + '</b> · 영토 <b>' + cells.toLocaleString() + '</b>칸'
      + ' · 빈 마을 ' + R.filter((r) => !r.pop).length + (out ? ' · 지도 밖 땅 ' + out + '곳' : '')
      + '<br><span style="font-size:12px">손잡이(URL 대문자 칸): T1468_LAB_LAND=' + (env('T1468_LAB_LAND') || '끔') + ' · T1457_NO_K_DEATH=' + (env('T1457_NO_K_DEATH') || '끔') + ' · 짐 지문 ' + pack.sig + '</span>';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 556); ctx.strokeStyle = '#000';
    for (let i = 0; i < pack.villages.length; i++) {
      const s = pack.villages[i], r = R[i], rad = 1.5 + Math.sqrt(r.pop) * 0.45;
      ctx.beginPath(); ctx.arc(s.ccx * sx, s.ccy * sy, rad, 0, Math.PI * 2); ctx.fillStyle = r.pop ? (r.out ? '#000' : '#888') : '#fff'; ctx.fill(); ctx.stroke();
    }
    $('t1497-tab').innerHTML = '<tr>' + ['마을', '인구', '영토 칸', '지도 끝 칸', 'K', '곳간 날치'].map((h) => '<th style="border-bottom:1px solid #000;text-align:right;padding:1px 6px">' + h + '</th>').join('') + '</tr>'
      + R.map((r) => '<tr><td style="text-align:right;padding:1px 6px">' + r.name + '</td><td style="text-align:right;padding:1px 6px">' + r.pop + '</td><td style="text-align:right;padding:1px 6px">' + r.cells.toLocaleString()
        + (r.out ? ' <b>지도 밖</b>' : '') + '</td><td style="text-align:right;padding:1px 6px">' + (r.endCells != null ? r.endCells.toLocaleString() : '—') + '</td><td style="text-align:right;padding:1px 6px">' + (r.K != null ? r.K : '—')
        + '</td><td style="text-align:right;padding:1px 6px">' + r.foodDays + '</td></tr>').join('');
  }
  function step(n) { for (let i = 0; i < n; i++) tick(world); }
  function loop() { if (run) { step(Math.max(1, Math.min(50, perFrame))); draw(); } (doc.defaultView || globalThis).requestAnimationFrame(loop); }
  $('t1497-run').onclick = () => { run = !run; $('t1497-run').textContent = run ? '⏸ 멈추기' : '▶ 돌리기'; };
  $('t1497-800').onclick = () => { run = false; $('t1497-run').textContent = '▶ 돌리기'; step(Math.max(0, 800 - world.day)); draw(); };
  $('t1497-seed').onchange = (e) => { seed = +e.target.value; world = build(pack, { seed }); draw(); };
  $('t1497-speed').onchange = (e) => { perFrame = +e.target.value || 1; };
  draw(); loop();
  return { world: () => world, step, draw, rows: () => rows(world) };
}
module.exports = { build, tick, rows, panel };
