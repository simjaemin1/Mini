// ═══════════════════════════════════════════════════════════════════════════
// _road-probe.js — 답압 길(ROADS) 실측 프로브. 전쟁실험실.html 무수정(읽기만).
//   하네스 = _scramble-probe.js 동형(LIFE/TP grab · rAF 단일 슬롯 · 헤드리스) — 관찰(slow) 모드 simSpeed 90.
//   검증: (a) N일 후 길 형성·마을 중심 주변 집중 (b) 게으른 감쇠(스탬프 중단→가상 일수→강등·Set 제거·소멸)
//         (c) 속도: 같은 이동을 길 유/무로 — moveNPC(주민)·_muTickMarch(행군) (d) 부지 제외: 집터·potSet에 길 셀 불성립
//         (e) 프레임 비용: 스탬프 오버헤드 vs sepAgents. 결정론: __mr 시드 주입 — 프로브 자신 Math.random 미사용.
//   실행: node sim/_road-probe.js [days=10] [seed=7] [nvil=4]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const _log = console.log;

const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function loadLabFull(nvil) {
  const LAB = path.join(ROOT, '전쟁실험실.html');
  const H = fs.readFileSync(LAB, 'utf8');
  delete require.cache[require.resolve('./battle-core.js')];
  const _win = global.window; global.window = undefined;
  const BattleCore = require('./battle-core.js');
  global.window = _win;
  delete require.cache[require.resolve('./economy-engine.browser.js')];
  require('./economy-engine.browser.js');

  const G = global;
  G.N = 1600; G.idx = (x, y) => y * 1600 + x; G.inG = (x, y) => x >= 0 && y >= 0 && x < 1600 && y < 1600;
  G.smt = t => t * t * (3 - 2 * t);
  G.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  G.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
  G.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
  G.MAX_CELLS = Math.PI * 60 * 60;
  G.__mr = __mr; G.BattleCore = BattleCore;
  const vals = { pop: String(global.__POP || 8), fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '90', nvil: String(nvil || 4) };
  const els = {};
  G.document = {
    getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {}, onclick: null }),
    querySelector: () => ({ appendChild: () => {} }),
    createElement: () => ({ style: {}, className: '', innerHTML: '', appendChild: () => {} }),
    activeElement: null, addEventListener: () => {},
  };
  G.draw = () => {}; G.V = null; G.TR = null; G.life = null; G.lifeOn = false; G.lifeGM = 0; G.lifeLast = 0; G.lifeSlow = false;
  G.dispatchTrades = () => {};
  G.buildWalls = () => new Set(); G.nowMs = 0; G.performance = { now: () => G.nowMs };
  G.rafCb = null; G.requestAnimationFrame = cb => { G.rafCb = cb; };
  G.cv = { addEventListener: () => {} };
  G.addEventListener = () => {};
  G.window = G;
  const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
  const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
    PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
    TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
    LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
  const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const BLOCK4 = blocks[blocks.length - 1][1];
  G.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
  G.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
  G.frame = function () { G.nowMs += 16; const cb = G.rafCb; G.rafCb = null; if (cb) cb(G.nowMs); };
  G.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE + '\n' + BLOCK4 +
    "\nglobal.getGM=function(){return lifeGM;};" +
    "\nglobal.setGM=function(v){lifeGM=v;};" +
    "\nglobal.getROADS=function(){return ROADS;};" +
    "\nglobal.getRC=function(){return _roadCells;};" +
    "\nglobal.RL=roadLevel; global.RS=roadStamp;" +
    "\nglobal.RK=function(){return {T1:L_ROAD_T1,T2:L_ROAD_T2,MAX:L_ROAD_MAX,DK:L_ROAD_DK,SPD:L_ROAD_SPD,COST:L_ROAD_COST,WALK:L_WALK};};" +
    "\nglobal.clearTP=function(){_tradePaths={};};" +
    "\nglobal.swapROADS=function(m){const o=ROADS;ROADS=m;return o;};" +
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*1440;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0 };
}

const DAYS = +(process.argv[2] || 10), SEED = +(process.argv[3] || 7), NVIL = +(process.argv[4] || 4) || 4;
global.__POP = +(process.argv[5] || 8) || 8;
_log(`═══ 답압 길 프로브 · ${DAYS}일 · 시드${SEED} · ${NVIL}마을 · pop${global.__POP} · simSpeed 90(관찰) ═══`);
const lab = loadLabFull(NVIL);
const __H = fs.readFileSync(path.join(ROOT, '전쟁실험실.html'), 'utf8');
const __B4 = [...__H.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const G = global;
const VILS = lab.run0(SEED);
const K = G.RK();
_log(`마을 ${VILS.length}개 · 계수 T1=${K.T1} T2=${K.T2} MAX=${K.MAX} 감쇠=${K.DK} 배속=${K.SPD} A*할인=${K.COST}`);
let ok = 0, bad = 0;
const chk = (name, cond, detail) => { (cond ? ok++ : bad++); _log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── (a) 형성: DAYS일 관찰 구동 ──
const FPD = 1000;   // 90×·16ms → 1.44분/프레임 = 1000프레임/일
const t0 = Date.now(); let ft = 0, fn = 0;
for (let d = 0; d < DAYS; d++) {
  const td = Date.now();
  for (let f = 0; f < FPD; f++) G.frame();
  ft += Date.now() - td; fn += FPD;
  if (d === 0 || d === DAYS - 1) _log(`  d+${d + 1}: ROADS=${G.getROADS().size} 등급셀=${G.getRC().size}`);
}
const wall = Date.now() - t0;
// 한낮 표본(출근·통근 시간대 3회 — 자정 종료 직후엔 전원 취침이라 길 위 0명)
let onRoad = 0, mulOk = 0;
for (let f = 0; f < 250; f++) G.frame();
for (let ss = 0; ss < 3; ss++) { for (let f = 0; f < 100; f++) G.frame();
  let o = 0, m = 0; for (const v of VILS) for (const a of v.agents) { if (a.state === 'home' || a.state === 'battle') continue; const lv = G.RL(Math.round(a.px), Math.round(a.py)); if (lv >= 1) { o++; if (a._rmul > 1) m++; } }
  if (o > onRoad) { onRoad = o; mulOk = m; } }
const ROADS = G.getROADS(), RC = G.getRC();
const centers = VILS.map(v => v.center);
let l1 = 0, l2 = 0; const dists = [];
for (const k of [...RC]) { const x = (k / 1600) | 0, y = k - x * 1600; const lv = G.RL(x, y); if (!lv) continue; (lv === 2 ? l2++ : l1++); let md = 1e9; for (const c of centers) md = Math.min(md, Math.hypot(x - c.cx, y - c.cy)); dists.push(md); }
dists.sort((a, b) => a - b);
const med = dists.length ? dists[dists.length >> 1] : -1, near = dists.filter(d => d <= 60).length;
chk('(a) 길 형성 >0', l1 + l2 > 0, `흙길 ${l1} · 다져진 ${l2} · ROADS(원시) ${ROADS.size}`);
chk('(a) 통근선 집중(중심 60셀 내)', dists.length > 0 && near / dists.length >= 0.7, `비율 ${(near / Math.max(1, dists.length) * 100).toFixed(0)}% · 중앙값 ${med.toFixed(1)}셀`);
// 실개체 배속 캐시 전파(한낮 최대 표본에서 길 위 개체 → _rmul>1)
chk('(a) 길 위 개체 _rmul>1 전파', onRoad > 0 && mulOk / onRoad >= 0.6, `길 위 ${onRoad}명 중 ${mulOk}명(스탬프 시점 등급 랙 허용)`);

// ── (c) 속도: 같은 직선 이동 — 길 유/무 (moveNPC · 실캐시 계약 재현) ──
function walkTest(x0, y0, gmTot) {
  const a = { px: x0, py: y0, path: [], pi: 0, _rmul: 1, _lc: null };
  for (let i = 1; i <= 200; i++) a.path.push({ x: x0 + i, y: y0 });
  let gm = 0; const step = 0.75;
  while (gm < gmTot) { const rx = Math.round(a.px), ry = Math.round(a.py), rk = rx * 1600 + ry; if (a._lc !== rk) { a._lc = rk; a._rmul = K.SPD[G.RL(rx, ry)]; } G.moveNPC(a, K.WALK * step); gm += step; }
  return a.px - x0;
}
const TY = 20, TX = 100;   // 맵 밖곽의 가상 트랙(moveNPC는 경로 추종만 — 지형 무관 단위시험)
for (let i = 0; i <= 200; i++) { for (let s = 0; s < 10; s++) G.RS(TX + i, TY + 40); for (let s = 0; s < 40; s++) G.RS(TX + i, TY + 80); }   // y+40=흙길(v10) · y+80=다져진(v40)
const d0 = walkTest(TX, TY, 40), dD = walkTest(TX, TY + 40, 40), dP = walkTest(TX, TY + 80, 40);
chk('(c) 보행: 흙길 ×1.10', Math.abs(dD / d0 - 1.10) < 0.02, `풀 ${d0.toFixed(1)} vs 흙길 ${dD.toFixed(1)} (${(dD / d0).toFixed(3)}×)`);
chk('(c) 보행: 다져진 ×1.15', Math.abs(dP / d0 - 1.15) < 0.02, `다져진 ${dP.toFixed(1)} (${(dP / d0).toFixed(3)}×)`);
// 행군(_muTickMarch): 전쟁 IIFE 지역함수라 실제 소스를 grab해 미니 스코프에서 구동(_livebattle-probe 동형 — 드리프트 0)
let mOK = true, mG, mR;
try {
  const mSrc = (__B4.match(/function _muTickMarch\(g, dDays, dir\)\{[\s\S]*?\n  return false;\n\}/) || [null])[0];
  if (!mSrc) throw new Error('_muTickMarch 소스 추출 실패');
  const mkTick = new Function('MU', '_muSeparate', '_muSyncAgents', 'roadLevel', 'L_ROAD_SPD', 'Math', mSrc + '\nreturn _muTickMarch;');
  const tick = mkTick({ FOLLOW_SNAP: 0.6, ARR_TGT_R: 3 }, () => {}, () => {}, G.RL, K.SPD, Math);
  const TRY = 520;   // 가상 트랙 행(맵 위 임의 — 미니 스코프라 지형 콜라이더 함수 부재=직진, 길 조회는 실 ROADS)
  const marchTest = y => { const g = { cmd: { x: 300, y }, def: { center: { cx: 700, cy: y } }, units: [], marchSpd: 100, heading: 0, isPlayer: false };
    const u = { cmd: true, x: 300, y, slx: 0, sly: 0, jx: 0, jy: 0, type: 'spear' }; g.units.push(u); g.commander = u;
    for (let t = 0; t < 30; t++) tick(g, 0.01, null);
    return { d: g.cmd.x - 300, mul: g._rmul }; };
  mG = marchTest(TRY);
  for (let i = 0; i <= 400; i++) for (let t = 0; t < 40; t++) G.RS(300 + i, TRY + 4);
  mR = marchTest(TRY + 4);
} catch (e) { mOK = false; _log('  행군 단위시험 예외: ' + e.message); }
if (mOK) chk('(c) 행군: 다져진 길 ×1.15', Math.abs(mR.d / mG.d - 1.15) < 0.02, `풀 ${mG.d.toFixed(2)} vs 길 ${mR.d.toFixed(2)} (${(mR.d / mG.d).toFixed(3)}×, g._rmul=${mR.mul})`);
else chk('(c) 행군 단위시험', false, '예외');

// ── (a2) 경로 선호: 교역 A* 재계산이 길을 끌어당김(할인 0.93/0.87) — 캐시 재계산 시 반영 계약 ──
try {
  const stash0 = null; const pairs = [];
  for (let i = 0; i < VILS.length; i++) for (let j = i + 1; j < VILS.length; j++) pairs.push([VILS[i].center, VILS[j].center]);
  const lvIn = (m, x, y) => { const r = m.get(x * 1600 + y); return r && r.v >= K.T1 ? 1 : 0; };
  G.clearTP(); let sumNew = 0, lens = 0;
  const newPaths = pairs.map(([a, b]) => { const p = G.getTradePath(a, b) || []; for (const q of p) sumNew += lvIn(G.getROADS(), q.x, q.y); lens += p.length; return p; });
  const stash = G.swapROADS(new Map()); G.clearTP(); let sumOld = 0;
  for (const [a, b] of pairs) { const p = G.getTradePath(a, b) || []; for (const q of p) sumOld += lvIn(stash, q.x, q.y); }
  G.swapROADS(stash); G.clearTP();
  chk('(a2) 교역 A*: 길 경유 셀 무할인 대비 ≥', sumNew >= sumOld, `할인 재계산 ${sumNew}셀 vs 무할인 ${sumOld}셀 (경로 총길이 ${lens})`);
} catch (e) { chk('(a2) 교역 A* 재계산', false, '예외 ' + e.message); }

// ── (b) 게으른 감쇠: 스탬프 중단 → 가상 일수 경과 ──
const snap = [...ROADS.entries()].map(([k, r]) => ({ k, v: r.v }));
const lvOf = v => v >= K.T2 ? 2 : (v >= K.T1 ? 1 : 0);
const gm0 = G.getGM();
G.setGM(gm0 + 160 * 1440);   // +160일(반감 ~138일: ×0.449)
let down = 0, out = 0, still = 0, checked = 0;
for (const e of snap) { const x = (e.k / 1600) | 0, y = e.k - x * 1600; const was = lvOf(e.v); if (!was) continue; checked++; const now = G.RL(x, y); if (now < was) down++; if (now < 1 && !G.getRC().has(e.k)) out++; if (now === was) still++; }
chk('(b) +160일: 등급 하락 발생', down > 0, `강등 ${down}/${checked} · Set 제거 ${out} · 유지 ${still}`);
const expDrop = snap.filter(e => lvOf(e.v) >= 1 && e.v * Math.pow(K.DK, 160) < K.T1).length;
chk('(b) 강등 수 = 수식 예측', out === expDrop, `실측 ${out} vs 0.995^160 예측 ${expDrop}`);
G.setGM(gm0 + 2400 * 1440);   // +2400일 → v<1 전 소멸
for (const e of snap) { const x = (e.k / 1600) | 0, y = e.k - x * 1600; G.RL(x, y); }
chk('(b) +2400일: 전부 풀로 복귀(희소 Map 소거)', ROADS.size === 0 && G.getRC().size === 0, `ROADS ${ROADS.size} · 등급셀 ${G.getRC().size}`);
G.setGM(gm0);

// ── (d) 부지 제외 ──
const s0 = VILS[0]; G.life = s0; G.V = s0.V;
// 집터: 무길 상태의 1순위 부지(nh0) 확보 → 되돌리고 그 부지에 길 시드 → 재판정이 그 자리를 기피(+새 부지 무길)
let houseChecked = false;
for (const sV of [...VILS].sort((a, b) => ((b.V && b.V.territory) ? b.V.territory.length : 0) - ((a.V && a.V.territory) ? a.V.territory.length : 0))) {
  const nh0 = G.addHouseSite(sV);
  if (!(nh0 && nh0.builtFloors === 0 && (nh0.floors || 1) === 1)) continue;   // 증축 폴백 → 다음 마을
  const ix = sV.houses.lastIndexOf(nh0); if (ix >= 0) sV.houses.splice(ix, 1); if (sV.V) sV.V.houses = sV.houses;   // 되돌림
  for (let dx = -6; dx <= 5; dx++) for (let dy = -6; dy <= 5; dy++) for (let t = 0; t < 10; t++) G.RS(nh0.cx + dx, nh0.cy + dy);
  const nh1 = G.addHouseSite(sV);
  const isNew = nh1 && nh1.builtFloors === 0 && (nh1.floors || 1) === 1;
  const moved = isNew && (nh1.cx !== nh0.cx || nh1.cy !== nh0.cy);
  let roadIn = 0; if (isNew) { for (let dx = -6; dx <= 5; dx++) for (let dy = -6; dy <= 5; dy++) if (G.RL(nh1.cx + dx, nh1.cy + dy) >= 1) roadIn++; }
  chk('(d) 집터: 길 깔린 1순위 부지 기피 + 새 부지 무길', (moved && roadIn === 0) || (!isNew && !!nh1), isNew ? `1순위 (${nh0.cx},${nh0.cy}) → 길 시드 후 (${nh1.cx},${nh1.cy}) · 새 부지 내 길 ${roadIn}` : '대안 부지 없음 → 증축 폴백(기피 자체는 성립)');
  houseChecked = true; break;
}
if (!houseChecked) chk('(d) 집터: 신규 부지 표본', false, '전 마을 빈 부지 없음(증축만)');
// potSet: 현 잠재농지 20셀에 길 시드 → relayout 후 potSet에 길 셀 부재(불변식: potSet ∩ 길 = ∅)
const seeded = [];
for (const c of (s0.potFarm || []).slice(0, 20)) { for (let s = 0; s < 10; s++) G.RS(c.cx, c.cy); seeded.push(c.cx + ',' + c.cy); }
try {
  const _cl = console.log; console.log = () => {}; G.relayoutVillage(s0, Math.max(2, Math.round(s0.pop))); console.log = _cl;
  let roaded = 0; for (const k of s0.potSet.keys()) { const i = k.indexOf(','); const x = +k.slice(0, i), y = +k.slice(i + 1); if (G.RL(x, y) >= 1) roaded++; }
  const seededBack = seeded.filter(k => s0.potSet.has(k)).length;
  chk('(d) potSet: 길 셀 후보 불성립', roaded === 0 && seededBack === 0, `potSet ${s0.potSet.size}개 중 길 위 ${roaded} · 시드 20셀 재선정 ${seededBack}`);
} catch (e) { chk('(d) potSet(relayout)', false, '예외 ' + e.message); }

// ── (e) 프레임 비용: 스탬프+조회 마이크로벤치 vs sepAgents ──
let nag = 0; for (const v of VILS) nag += v.agents.length;
const tS = Date.now(); for (let i = 0; i < 300; i++) G.sepAgents(0.05); const sepMs = (Date.now() - tS) / 300;
const tR = Date.now(); const M = 500000; for (let i = 0; i < M; i++) { const x = 100 + (i % 200), y = 20 + ((i / 200) | 0) % 3 * 40; (i & 1) ? G.RS(x, y) : G.RL(x, y); } const perOp = (Date.now() - tR) / M * 1000;
const stampFrame = nag * perOp;   // 프레임당 전 개체가 셀을 옮기는 최악 가정(µs)
chk('(e) 스탬프 오버헤드 미미', stampFrame < sepMs * 1000 * 0.2 || stampFrame < 50, `개체 ${nag} · ${perOp.toFixed(3)}µs/op → 프레임 최악 ${stampFrame.toFixed(1)}µs vs sepAgents ${(sepMs * 1000).toFixed(1)}µs/프레임`);
_log(`관찰 ${DAYS}일 벽시계 ${(wall / 1000).toFixed(1)}s · ${(ft / fn).toFixed(2)}ms/프레임`);
_log(`═══ 결과: ${ok}✅ ${bad}❌ ═══`);
process.exit(bad ? 1 : 0);
