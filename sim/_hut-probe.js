// ═══════════════════════════════════════════════════════════════════════════
// _hut-probe.js — ①움집 절충(L_MAXFL 4→2 = 집당 최대 8명) A/B 실측 + ②경도 로컬 시각 실측.
//   사용자 승인 설계: "영토·논밭이 어떻게 되는지 보자" — HEAD(4층)와 현행(2층)을 같은 시드·같은 프레임으로
//   빨리감기 ~900일 돌려 마을별 인구·집·침대·영토·파셀·경작률·침대 대기(집터 병목 징후)를 비교.
//   판정: 인구 수렴 ±15% 이내면 '영토 확장이 흡수', 이탈이면 붕괴(병목 지점 특정해 보고).
//   모드:
//     ab  <labPath> [seed=7] [days=900] [nvil=8] — 벌크 빨리감기 1버전·1시드(버전·시드당 개별 프로세스, ##HUT JSON 출력)
//     lon <labPath> [seed=7] [nvil=8]            — 저속(관찰) 프레임으로 마을별 첫 출근(새벽)·퇴근(해질녘) 전이의
//                                                   글로벌 f 실측 → 경도 시차(lonOff=cx/N×L_LON_SPREAD ≈ 65분×Δx/N) 검증.
//                                                   새벽은 개인 오프셋 min(a._dOff) 보정, 해질녘은 비농부 work→(toHome|build) 전이(오프셋 무관·최정밀).
//   ★대상 HTML 무수정(읽기만) — HEAD 사본은 /tmp에 추출해 경로로 넘김. /tmp·in-memory. DB·git 없음.
//   결정론: 시드 Math.random 주입(__mr) — 프로브 자신은 Math.random 미사용.
//   하네스: _siege-probe.js loadLabFull 동형(rAF 단일 슬롯 — frame()이 lifeLoop 1틱).
//   실행: node sim/_hut-probe.js ab /tmp/lab_head.html 3 900
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const _log = console.log;

const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function loadLabFull(labPath, nvil) {
  const H = fs.readFileSync(labPath, 'utf8');
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
  const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '80000', nvil: String(nvil || 8) };
  const els = {};
  G.document = {
    getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {}, onclick: null }),
    querySelector: () => ({ appendChild: () => {} }),
    createElement: () => ({ style: {}, className: '', innerHTML: '', appendChild: () => {} }),
    activeElement: null, addEventListener: () => {},
  };
  G.draw = () => {}; G.V = null; G.TR = null; G.life = null; G.lifeOn = false; G.lifeGM = 0; G.lifeLast = 0; G.lifeSlow = false;
  G.dispatchTrades = G.dispatchTrades || (() => {});   // lon(저속)용 실물은 LIFE 밖 — 스텁 유지(캐러밴 시각 파견만 생략, econ 무영향)
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
    "\nglobal.getVILS=function(){return VILS;};" +
    "\nglobal.getGM=function(){return lifeGM;};" +
    "\nglobal.setGM=function(v){lifeGM=v;};" +
    "\nglobal.getMAXFL=function(){return L_MAXFL;};" +
    "\nglobal.getLON=function(){return (typeof L_LON_SPREAD!=='undefined')?L_LON_SPREAD:null;};" +
    "\nglobal.getCONST=function(){return {DAWN:L_DAWN,DUSK:L_DUSK,MINDAY:L_MINDAY,FLOORCAP:L_FLOORCAP,START:L_START};};" +
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*L_MINDAY;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  // ★집터/증축/실패 계수(전역 함수 래핑 — 대상 파일 무수정): addHouseSite null=부지·증축 둘 다 소진(집터 병목 신호)
  G.__hut = { calls: 0, newSite: 0, upFloor: 0, fail: 0 };
  const _ah0 = G.addHouseSite;
  G.addHouseSite = function (s) { const n0 = s.houses.length; const r = _ah0(s); G.__hut.calls++; if (!r) G.__hut.fail++; else if (s.houses.length > n0) G.__hut.newSite++; else G.__hut.upFloor++; return r; };
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0 };
}

const MODE = String(process.argv[2] || 'ab');
const LAB = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, '전쟁실험실.html');
const SEED = +(process.argv[4] || 7), ARG5 = +(process.argv[5] || (MODE === 'ab' ? 900 : 8)), NVIL = +(process.argv[6] || 8) || 8;
const G = global;
const quiet = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };

if (MODE === 'ab') {
  // ─────────────────────────────── A/B 벌크 실측 ───────────────────────────────
  const DAYS = ARG5;
  const lab = loadLabFull(LAB, NVIL);
  const t0 = Date.now();
  lab.run0(SEED);
  const VS = () => G.getVILS();   // ★동적 게터: 마을 소멸 시 전역 VILS가 filter로 재할당 — 캡처 배열은 스테일
  const NOWAR = process.argv.includes('nowar');   // ★전쟁 봉인 픽스처(_siege 동형 v._warCd) — 전쟁 카오스와 주거 신호 분리용 보조 런
  if (NOWAR) for (const v of VS()) v._warCd = 1e9;
  const C = G.getCONST();
  _log(`═══ [움집 A/B] ${path.basename(LAB)} · L_MAXFL=${G.getMAXFL()} · 시드${SEED} · ${VS().length}마을 · ${DAYS}일 벌크${NOWAR?' · 전쟁봉인':''} ═══`);
  const dayNow = () => (VS().length ? VS()[0].day | 0 : 0);
  const D0 = dayNow(), DEND = D0 + DAYS;
  const maxPop = new Map();   // name → 최대 인구(30일 샘플)
  let nextS = D0, frames = 0;
  let nextP = D0 + 150;
  while (dayNow() < DEND && frames < DAYS * 2 + 400) {
    quiet(lab.frame); frames++;
    if (dayNow() >= nextS) { nextS += 30; for (const v of VS()) { const p = v.econ ? v.econ.npcs.length : v.pop; if (p > (maxPop.get(v.name) || 0)) maxPop.set(v.name, p); } }
    if (dayNow() >= nextP) { nextP += 150; _log(`  … day ${dayNow()} (${Date.now() - t0}ms)`); }
  }
  const rows = [];
  for (const v of VS()) {
    const pop = v.econ ? v.econ.npcs.length : v.pop;
    let fl = 0, sites = 0, topFl = 0; for (const h of v.houses) { fl += (h.builtFloors || 0); if ((h.builtFloors || 0) < (h.floors || 1)) sites++; if ((h.floors || 1) > topFl) topFl = h.floors || 1; }
    const beds = fl * C.FLOORCAP;
    const parcels = v.farmland.length + (v.dryfield ? v.dryfield.length : 0);
    const desig = (v.potFarm ? v.potFarm.length : 0) + (v.potDry ? v.potDry.length : 0);
    rows.push({ name: v.name, role: v.role || '?', pop, maxPop: maxPop.get(v.name) || pop, houses: v.houses.length, sites, topFl, beds, bedWait: Math.max(0, pop - beds), housing: v.econ ? Math.round(v.econ.housing || 0) : 0, terr: v.V.territory.length, parcels, desig, cult: desig ? +(parcels / desig).toFixed(3) : 0 });
  }
  const agg = rows.reduce((a, r) => ({ pop: a.pop + r.pop, houses: a.houses + r.houses, beds: a.beds + r.beds, bedWait: a.bedWait + r.bedWait, terr: a.terr + r.terr, parcels: a.parcels + r.parcels, desig: a.desig + r.desig }), { pop: 0, houses: 0, beds: 0, bedWait: 0, terr: 0, parcels: 0, desig: 0 });
  // econ 체크섬(궤적 동일성 판정용 — B 벌크 무영향 증명): 식량류+인구+영토 합
  let food = 0; for (const v of VS()) if (v.econ) food += (v.econ.storage.food || 0) + (v.econ.storage.fish || 0) + (v.econ.storage.meat || 0);
  const out = { lab: path.basename(LAB), maxfl: G.getMAXFL(), seed: SEED, nowar: NOWAR, day: dayNow(), frames, vils: VS().length, ms: Date.now() - t0, hut: G.__hut, agg, foodSum: +food.toFixed(1), rows };
  _log('마을         역할     인구  최대  집  공사  최고층  침대  대기  수용력  영토      파셀    지정    경작률');
  for (const r of rows) _log(`${r.name.padEnd(10)} ${r.role.padEnd(7)} ${String(r.pop).padStart(4)} ${String(r.maxPop).padStart(5)} ${String(r.houses).padStart(4)} ${String(r.sites).padStart(4)} ${String(r.topFl).padStart(6)} ${String(r.beds).padStart(6)} ${String(r.bedWait).padStart(5)} ${String(r.housing).padStart(6)} ${String(r.terr).padStart(8)} ${String(r.parcels).padStart(7)} ${String(r.desig).padStart(7)} ${String((r.cult * 100).toFixed(1)).padStart(7)}%`);
  _log(`합계: 인구 ${agg.pop} · 집 ${agg.houses} · 침대 ${agg.beds} · 침대대기 ${agg.bedWait} · 영토 ${agg.terr} · 파셀 ${agg.parcels} · 집터콜 ${G.__hut.calls}(신규 ${G.__hut.newSite}/증축 ${G.__hut.upFloor}/실패 ${G.__hut.fail}) · ${out.ms}ms`);
  _log('##HUT ' + JSON.stringify(out));
} else if (MODE === 'lon') {
  // ─────────────────────────── 경도 로컬 시각 실측(저속) ───────────────────────────
  const lab = loadLabFull(LAB, ARG5 || 8);
  lab.run0(SEED);
  const VS = () => G.getVILS();
  const C = G.getCONST(), LSP = G.getLON();
  _log(`═══ [경도 시차] ${path.basename(LAB)} · L_LON_SPREAD=${LSP} · 시드${SEED} · ${VS().length}마을 — 첫 출근·퇴근 전이의 글로벌 f 실측 ═══`);
  if (LSP == null) _log('  (L_LON_SPREAD 없음 = HEAD 기준선 — lonOff 0으로 계측: 전 마을 새벽·해질녘 동시각이어야 정상)');
  const fOf = () => (G.getGM() % C.MINDAY) / C.MINDAY;   // ★lifeGM은 eval 스코프 바인딩 — 전역 사본이 아니라 게터로
  const dayNow = () => (VS().length ? VS()[0].day | 0 : 0);
  // 워밍업: 벌크 40일(인구·직업 분화·공사·plot 배정 후라야 출근·퇴근 전이가 풍부 — 초기 8인 전원 농부·일감 0이면 온종일 취침) → '자정 0.5분 전' 스냅(첫 저속 프레임이 일 경계를 자연 통과 → 7165행 전원 home 리셋이 벌크 잔존 work 상태 회수 — 밤 유령 노동 방지)
  const D1 = dayNow() + 40;
  let frames = 0; while (dayNow() < D1 && frames < 300) { quiet(lab.frame); frames++; }
  G.setGM(Math.ceil(G.getGM() / C.MINDAY) * C.MINDAY - 0.5);
  G.document.getElementById('simSpeed').value = '60';   // dGM=0.96분/프레임(<6 → slow) — 전이 분해능 ±1분
  const st = new Map();   // name → {dawnF, duskF, minOff, cx}
  for (const v of VS()) st.set(v.name, { cx: v.center.cx, lon: null, dawnF: null, duskF: null, duskW: null, duskB: null, minOff: null });
  const prevState = new Map(), prevAct = new Map();   // agent → state/action(전이 감지)
  let guard = 0;
  while (guard++ < 2200) {   // ~1.4일(0.96분×2200≈2112분)
    quiet(lab.frame);
    const f = fOf();
    for (const v of VS()) { const e = st.get(v.name); if (!e) continue;
      if (e.lon == null && v._lonOff !== undefined) e.lon = v._lonOff;
      for (const a of v.agents) {
        if (e.dawnF == null && a.action === '출근') { e.dawnF = f; let mo = 1; for (const b of v.agents) if (b._dOff !== undefined && b._dOff < mo) mo = b._dOff; e.minOff = mo === 1 ? 0 : mo; }
        const ps = prevState.get(a), pa = prevAct.get(a);
        // 해질녘 1차 신호: 집에서 쉬던 이의 휴식→취침 플립 — home 분기 else가 fv=L_DUSK 정확히 그 프레임에 발화(개인 오프셋 무관·최정밀)
        if (e.duskF == null && f > 0.6 && f < 0.97 && a.state === 'home' && pa === '휴식' && a.action === '취침') e.duskF = f;
        // 2차 신호: 비농부 퇴근 전이(work→귀가/건축) — 농부는 일감 소진 조기 귀가가 있어 제외
        if (e.duskW == null && f > 0.65 && f < 0.95 && ps === 'work' && (a.state === 'toHome' || a.state === 'build') && a.job !== 'farmer' && !(a._half && a._hd === v.day)) e.duskW = f;
        // 3차 신호: 건축 현장 퇴근(build→toHome) — 7146행 fv≥L_DUSK 발화(전 직업 오후=건축이라 실측상 가장 흔한 해질녘 전이. 완공 조기 귀가가 드물게 섞일 수 있어 기대열과 대조)
        if (e.duskB == null && f > 0.65 && f < 0.95 && ps === 'build' && a.state === 'toHome') e.duskB = f;
        prevState.set(a, a.state); prevAct.set(a, a.action);
      } }
    if (process.env.HUTDBG && ((f*1440>1130&&f*1440<1210&&guard%8===0)||guard%400===0)) { const v = VS().find(x => x.name === process.env.HUTDBG); if (v) { const h = {}; for (const a of v.agents) { const k = a.state + '/' + (a.action || ''); h[k] = (h[k] || 0) + 1; } _log('  dbg f=' + (f * 1440).toFixed(0) + '분 ' + v.name + ' ' + JSON.stringify(h)); } }
    if ([...st.values()].every(e => e.dawnF != null && (e.duskF != null || e.duskW != null || e.duskB != null))) break;
  }
  const min = x => (x * 1440).toFixed(1);
  const es = [...st.entries()].map(([n, e]) => ({ n, ...e })).sort((a, b) => a.cx - b.cx);
  _log('마을         cx    lonOff(분)  첫출근f(분)  보정새벽(분)  기대새벽(분)=DAWN-lon  취침f(분)  퇴근f(분)  기대해질녘(분)=DUSK-lon');
  for (const e of es) {
    const expD = (C.DAWN - (e.lon || 0)) * 1440, expK = (C.DUSK - (e.lon || 0)) * 1440;
    _log(`${e.n.padEnd(10)} ${String(e.cx).padStart(5)} ${((e.lon || 0) * 1440).toFixed(1).padStart(9)} ${e.dawnF != null ? min(e.dawnF).padStart(10) : '     -'} ${e.dawnF != null ? ((e.dawnF - (e.minOff || 0)) * 1440).toFixed(1).padStart(12) : '     -'} ${expD.toFixed(1).padStart(18)} ${e.duskF != null ? min(e.duskF).padStart(12) : '     -'} ${(e.duskW != null || e.duskB != null) ? min(e.duskW != null ? e.duskW : e.duskB).padStart(12) : '     -'} ${expK.toFixed(1).padStart(16)}`);
  }
  for (const e of es) if (e.duskF == null) e.duskF = (e.duskW != null ? e.duskW : e.duskB);   // 1차(취침 플립) 없으면 2차(비농부 퇴근)·3차(건축 퇴근)로
  const ok = es.filter(e => e.dawnF != null && e.duskF != null);
  if (ok.length >= 2) {
    const w = ok[0], eE = ok[ok.length - 1];   // cx 최소(서) · 최대(동)
    const dLon = (eE.lon - w.lon) * 1440, dxN = (eE.cx - w.cx) / 1600;
    const dDawn = ((w.dawnF - (w.minOff || 0)) - (eE.dawnF - (eE.minOff || 0))) * 1440;   // 동쪽이 먼저(작은 f) → 서-동
    const dDusk = (w.duskF - eE.duskF) * 1440;
    _log(`극단쌍(서 ${w.n} cx${w.cx} ↔ 동 ${eE.n} cx${eE.cx}): Δx/N=${dxN.toFixed(3)} → 기대 시차 ${dLon.toFixed(1)}분(=64.8×${dxN.toFixed(3)})`);
    _log(`  실측 새벽 시차 ${dDawn.toFixed(1)}분 · 해질녘 시차 ${dDusk.toFixed(1)}분 (프레임 분해능 ±1분)`);
    _log('##LON ' + JSON.stringify({ seed: SEED, spread: LSP, west: w.n, east: eE.n, dxN: +dxN.toFixed(4), expMin: +dLon.toFixed(2), dawnMin: +dDawn.toFixed(2), duskMin: +dDusk.toFixed(2), rows: es.map(e => ({ n: e.n, cx: e.cx, lonMin: +((e.lon || 0) * 1440).toFixed(2), dawn: e.dawnF != null ? +min(e.dawnF) : null, dusk: e.duskF != null ? +min(e.duskF) : null })) }));
  } else _log('##LON {"err":"전이 미검출"}');
} else { _log('사용법: node sim/_hut-probe.js ab|lon <labPath> [seed] [days|nvil]'); process.exit(1); }
