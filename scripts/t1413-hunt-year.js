#!/usr/bin/env node
// === scripts/t1413-hunt-year.js — 사냥실험실 한 해: 버티는 사냥은 어느 칸인가 (T1413 · T1396 회부 1 · 2 · 6) ==========
//
// ⚠계측기다. 하네스가 아니다(`@regress` 없음) — 꼴 · 미끼는 `scripts/test-t1413-hunt-year.js` 가 지킨다.
//
// 사냥실험실(`lab/사냥실험실.html`)을 node `vm` 에서 365날 돌린다 — 판마다 새 맥락 · 씨 뿌린 `Math.random`(hunt-check 와 같은 식) ·
// 상자 무관 수학(`sim/det-math.js`) ⇒ 같은 씨 = 같은 표(어느 상자에서나). 랩 블록 글자 · 수 손 0. 자가 하는 것(전부 판의 인자 · 랩 전역 손잡이):
//   ① 무리터 장부 N(몸 수 · 실수) — 첫 몸 K = 무리터 몸(한반도 2,981 ÷ 51 × 5,000 ÷ 환율 = T1396 과 같은 식) · 날마다 로지스틱
//      N += r·N·(1 − N/K)·dt/1440(r = 마을실험실 `L_GAMER` 0.002 · 판의 인자 `--r`) · 사냥꾼이 죽인 먹잇감 하나마다 N −1.
//   ② 랩이 그리는 몸 = 장부: 틱마다 `HUNT_CAP` = 끝수 버린 N(상한 켬이면 min(24, ·) = 랩 기본 슬라이더) ·
//      랩의 무리 낳기가 한 무리를 통째로 내 장부를 넘으면 넘은 만큼 뺀다(랩 '초과분 이탈' 의 몸짓 · 문턱 +4 대신 0 · 사냥꾼이 쥔 몸 · 굴 속은 안 뺀다).
//      ⚠`MOB_CAP`(50)은 랩 블록에서 정의만 있고 부르는 곳이 없다 — 걸리는 상한은 `HUNT_CAP` 하나.
//   ③ 사냥에 쓰는 몫 — 하루 07:12 부터 몫 × 1,440분만 사냥꾼이 숲에 있다(100% · 25% · 10%) · 닷새에 하루 = 다섯 날에 한 날 통째(1,440분).
//      쉬는 동안 사냥꾼은 집(랩 `s.agents` 밖 — 짐승 눈에 없다) · 돌아올 땐 캠프에서 · 몸 성함(집에서 쉬었다) · 쥐던 표적 · 사체는 놓음.
//      쉬는 동안 짐승은 8분 걸음(랩 `updateMobs` 의 dt 상한 8 그대로 — 사람 없는 숲을 빨리 감기).
//   ④ 죽은 사냥꾼 — 랩은 죽은 몸을 배열에 남겨 "사망 보충"(driveHunters 첫 줄)이 안 돈다 → 날 경계(07:12)에 죽은 몸을 빼 랩 보충 줄이 돌게 한다.
//   무리터 = T1396 과 같은 땅(캠프 기대 자리 둘레 숲 2,923칸만 · 바깥 숲 = 풀밭) · 밀도 손잡이 `MOB_DENS` = 100 ÷ 환율.
//
// 재는 것: ⓐ 무리터가 빈 날(N < 1 · 안 비면 365) ⓑ 한 해 잡은(손질해 가져온 = `_mobKills`) 마리 · kg(서버 정본 `animals.dropsOf(종, 'hanbando')` 고기 칸 ·
//          사슴 33 · 멧돼지 4 · 토끼 1) ⓒ 사냥꾼-날당 kg(÷ 사냥꾼 × 365) ⓓ 끝 몸 ÷ 첫 몸(N/K) · 덤: 죽인 마리(장부에서 뺀 수) · 짐승이 죽인 사냥꾼 · 맹수가 잡은 먹잇감.
//
// 실행: node scripts/t1413-hunt-year.js [--sp 🦌,🐗,🐇] [--share 1,0.25,0.1,5d] [--hunters 1,3,17] [--exch 500,5000,50000,187000]
//         [--seeds 7,1020] [--days 365] [--cap lab|free] [--r 0.002] [--out <jsonl>](이미 있는 칸은 건너뜀 — 이어 돌리기) [--lab <html>]
//       --sum <jsonl>... = 표 · 경계(③ · ④) 만 찍는다(판 0)
//       --quick = 🦌 · 5,000 · 사냥꾼 1 · 몫 100% · 씨 7 · 2날(하네스 꼴 판)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const QUICK = argv.includes('--quick');
const LAB = path.resolve(opt('lab', path.join(__dirname, '..', 'lab', '사냥실험실.html')));
const L_GAMEMAX = 100, LAB_CAP = 24, NPC_START = 432;   // 랩 `L_GAMEMAX` · `HUNT_CAP` 기본(슬라이더) · 07:12(hunt-check 와 같은 시작) — 손 사본(아래 labConst 가 랩 글자와 대조)
const HB5000 = 2981 / 51;   // 무리터 몸(환율 5,000) — T1396 과 같은 수(한반도 몸 2,981 · T1362/T1331 ÷ 51마을)
const WIN = Math.round(HB5000 * 5000 / L_GAMEMAX);   // 무리터 숲 칸 2,923(환율과 무관)
const KG = { '🦌': 33, '🐗': 4, '🐇': 1 };   // 서버 정본 `server/animals.js dropsOf(id, 'hanbando').meat_game`(T636 kg 판 기본 켬) — 아래 kgCheck 가 서버 글자와 대조
const KCAL_KG = 1200, DAY_KCAL = 2450;   // `server/kcal.js` meat_game 줄(USDA FDC 173855) · 하루 사람 열량(카드)
const list = (k, d) => (QUICK ? d.q : opt(k, d.full)).split(',');
const SPS = list('sp', { full: '🦌,🐗,🐇', q: '🦌' });
const SHARES = list('share', { full: '1,0.25,0.1,5d', q: '1' });
const HUNT = list('hunters', { full: '1,3,17', q: '1' }).map(Number);
const EXCH = list('exch', { full: '500,5000,50000,187000', q: '5000' }).map(Number);
const SEEDS = list('seeds', { full: '7,1020', q: '7' }).map(Number);
const DAYS = QUICK ? 2 : +opt('days', 365);
const CAP = opt('cap', 'lab'); if (CAP !== 'lab' && CAP !== 'free') throw new Error('--cap lab|free');
const R = +opt('r', 0.002);
const OUT = opt('out', null);

const shareOn = (share, gm) => {   // 그 게임분에 사냥꾼이 숲에 있나
  const t = gm - NPC_START, d = Math.floor(t / 1440), m = t - d * 1440;
  if (share === '5d') return d % 5 === 0;
  return m < Math.round(+share * 1440);
};
const effort = (share) => (share === '5d' ? 0.2 : +share);

let SRC = null, DETMATH = null;
function load(seed, exch, nh, sp) {
  if (!SRC) { SRC = fs.readFileSync(LAB, 'utf8'); DETMATH = require(path.join(path.dirname(LAB), '..', 'sim', 'det-math.js')).SRC; }
  let js = /<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';", '');
  const rep = (a, b) => { const n = js.split(a).length - 1; if (n !== 1) throw new Error('앵커 ' + n + '곳: ' + a.slice(0, 50)); js = js.replace(a, b); };
  rep("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
    "const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});");
  rep('bakeBG();resetAll();requestAnimationFrame(loop);', '');
  rep('MOB_DENS=0.02,', 'MOB_DENS=' + (L_GAMEMAX / exch) + ',');
  const els = {};
  const C = { console, performance: { now: () => 0 }, requestAnimationFrame: () => {}, addEventListener: () => {} };
  C.document = { getElementById: (id) => els[id] || (els[id] = { value: { nh: String(nh), cap: String(LAB_CAP), spd: '36', terr: '초원' }[id] || '0', textContent: '', innerHTML: '' }), querySelectorAll: () => [] };
  C.window = C; vm.createContext(C);
  vm.runInContext(`{let _s0=(${seed | 0})*2654435761>>>0;Math.random=function(){_s0=_s0+0x6D2B79F5|0;let t=Math.imul(_s0^_s0>>>15,1|_s0);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}`, C);
  vm.runInContext(DETMATH + '(Math)', C);
  vm.runInContext(js + `
;globalThis.__api={get s(){return s;},get lifeGM(){return lifeGM;},set lifeGM(v){lifeGM=v;},resetAll,driveHunters,updateMobs,
  MOB_DEF,N,NPC_MAXHP,get camp(){return camp;},setSp(x){HUNT_SPECIES=x;},setCap(x){HUNT_CAP=x;},getCap(){return HUNT_CAP;},
  win(K){const cx=Math.round(N*0.18)+5,cy=Math.round(N*0.5);const L=[];for(let i=0;i<N*N;i++)if(forest0[i])L.push([Math.hypot(i%N-cx,((i/N)|0)-cy),i]);
    if(!(K>0)||K>=L.length)return {K:L.length,R:null};L.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const keep=new Uint8Array(N*N);for(let k=0;k<K;k++)keep[L[k][1]]=1;
    for(let i=0;i<N*N;i++)if(!keep[i])forest0[i]=0;return {K,R:+L[K-1][0].toFixed(1)};}};`, C);
  const A = C.__api;
  A.setSp(sp); A.setCap(LAB_CAP);
  const w = A.win(WIN);
  A.resetAll(); A.lifeGM = NPC_START;
  return { A, w };
}

function runOne(seed, exch, nh, sp, share, cap, r, days) {
  const { A, w } = load(seed, exch, nh, sp);
  const s = A.s, MD = A.MOB_DEF;
  const K = HB5000 * 5000 / exch;
  let N = K, empty = null, killed = 0, predKill = 0, trimmed = 0, offSaved = null;
  const capOf = () => { const n = Math.floor(N + 1e-9); return cap === 'lab' ? Math.min(LAB_CAP, n) : n; };
  const isPrey = (m) => !MD[m.type].pred;
  const held = () => { const H = new Set(); for (const a of (offSaved || s.agents)) { if (a._tgt) H.add(a._tgt); if (a._cm) H.add(a._cm); if (a._carc) H.add(a._carc); if (a._bm) H.add(a._bm); } return H; };
  const trim = () => {   // 랩이 그린 산 먹잇감 > 장부면 넘은 만큼 뺀다(뒤에서부터 · 쥔 몸 · 굴 속 · 사체 제외)
    const c = capOf(); let live = 0; for (const m of s.mobs) if (m.st !== 'dead' && isPrey(m)) live++;
    if (live <= c) return;
    const H = held();
    for (let j = s.mobs.length - 1; j >= 0 && live > c; j--) { const m = s.mobs[j]; if (m.st === 'dead' || m.st === 'hide' || !isPrey(m) || H.has(m)) continue; m.rot = -1; s.mobs.splice(j, 1); live--; trimmed++; }
  };
  const dayEnd = NPC_START + Math.round(days * 1440);
  let kA0 = 0, lastDay = -1;
  const goOff = () => { offSaved = s.agents; for (const m of s.mobs) m.tgt = null; s.agents = []; };
  const goOn = () => {
    const camp = A.camp;
    for (const a of offSaved) { a._tgt = null; a._cm = null; a._carc = null; a._bm = null; a._lbx = undefined; a.rest = 0; a.state = 'work'; a.action = ''; a.hp = A.NPC_MAXHP;
      a.px = camp.cx + Math.random() * 2 - 1; a.py = camp.cy + Math.random() * 2 - 1; }
    s.agents = offSaved; offSaved = null;
  };
  while (A.lifeGM < dayEnd) {
    const gm = A.lifeGM, on = shareOn(share, gm + 1);
    const dayI = Math.floor((gm + 1 - NPC_START) / 1440);
    if (dayI !== lastDay) { lastDay = dayI; const L = offSaved || s.agents; const alive = L.filter((a) => !a._dead); if (offSaved) offSaved = alive; else s.agents = alive; }   // ④
    if (on && offSaved) goOn();
    if (!on && !offSaved) goOff();
    let dt = 1;
    if (!on) { dt = 1; while (dt < 8 && gm + dt + 1 < dayEnd && !shareOn(share, gm + dt + 1)) dt++; }
    A.lifeGM = gm + dt; s.day = Math.floor(A.lifeGM / 1440);
    A.setCap(capOf());
    if (on) A.driveHunters(1);
    A.updateMobs(s, dt);
    // 죽음 셈 — 이번 틱에 새로 죽은 먹잇감 가운데 사냥꾼 몫(_kA + _kM 늘어난 만큼)만 장부에서
    const kNow = (s._kA || 0) + (s._kM || 0), dK = kNow - kA0; kA0 = kNow;
    let nd = 0; for (const m of s.mobs) if (m.st === 'dead' && !m.__d) { m.__d = 1; if (isPrey(m)) nd++; }
    const hk = Math.min(nd, dK); killed += hk; predKill += nd - hk;
    if (N < K) N += r * N * (1 - N / K) * dt / 1440;
    N -= hk;
    if (N < 1) { empty = Math.min(days, Math.floor((A.lifeGM - NPC_START) / 1440) + 1); N = Math.max(0, N); break; }
    trim();
  }
  const harv = s._mobKills || 0;
  return { sp, exch, nh, share, seed, cap, r, days, win: w.K, K: +K.toFixed(3),
    empty: empty == null ? days : empty, emptied: empty != null, harv, kg: harv * KG[sp], kgHD: +(harv * KG[sp] / (nh * days)).toFixed(3),
    end: +(N / K).toFixed(4), killed, predKill, trimmed, hDead: s._hDeadN || 0, inj: s._inj || 0, shots: s._shots || 0 };
}

const labConst = () => {
  const t = fs.readFileSync(LAB, 'utf8');
  if (!/L_GAMEMAX=100\b/.test(t)) throw new Error('랩 L_GAMEMAX 가 100 이 아니다 — 자의 손 사본을 고쳐라');
  if (!/MOB_DENS=0\.02,/.test(t)) throw new Error('랩 MOB_DENS 가 0.02 가 아니다');
  if (!/HUNT_CAP=24;/.test(t)) throw new Error('랩 HUNT_CAP 기본이 24 가 아니다');
};
const kgCheck = () => {   // 손 사본 대조 — 서버 정본 드롭 kg
  try { const A = require(path.join(__dirname, '..', 'server', 'animals.js')); const id = { '🦌': 'deer', '🐗': 'wild_boar', '🐇': 'arctic_hare' };
    for (const sp of Object.keys(KG)) { const g = (A.dropsOf(id[sp], 'hanbando') || {}).meat_game; if (g !== KG[sp]) throw new Error(`서버 ${id[sp]} 고기 ${g} kg ≠ 자의 손 사본 ${KG[sp]}`); }
  } catch (e) { if (/손 사본/.test(e.message)) throw e; }
};

// ── 표 · 경계 ──
const key = (r) => [r.sp, r.exch, r.nh, r.share, r.seed, r.cap, r.r, r.days].join('|');
function summarize(rows) {
  const f = (x) => (x == null ? '-' : x);
  const groups = new Map();
  for (const r of rows) { const g = [r.cap, r.r].join('|'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const shName = (s) => (s === '5d' ? '닷새에 하루' : Math.round(+s * 100) + '%');
  const out = [];
  for (const [g, R0] of groups) {
    const [cap, r] = g.split('|');
    out.push(`\n## 표 — 몸 상한 ${cap === 'lab' ? '켬(HUNT_CAP 24 · 랩 기본)' : '풂(장부 그대로)'} · 번식 r ${r}/날 · ${R0[0].days}날 · 씨 ${[...new Set(R0.map((x) => x.seed))].join(' · ')}\n`);
    out.push('| 종 | 환율 | 첫 몸 K | 몫 | 사냥꾼 | ⓐ 빈 날(씨별) | ⓑ 잡은 마리 · kg(씨별) | ⓒ 사냥꾼-날당 kg | ⓓ 끝 몸 ÷ 첫 몸 | 버팀 |');
    out.push('|---|---|---|---|---|---|---|---|---|---|');
    const cells = new Map();
    for (const x of R0) { const k = [x.sp, x.exch, x.share, x.nh].join('|'); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(x); }
    const order = (a, b) => SPS.indexOf(a.sp) - SPS.indexOf(b.sp) || a.exch - b.exch || effort(b.share) - effort(a.share) || a.nh - b.nh;
    for (const [, xs] of [...cells].sort((p, q) => order(p[1][0], q[1][0]))) {
      xs.sort((a, b) => a.seed - b.seed); const x = xs[0];
      const hold = xs.every((y) => y.end >= 0.9);
      out.push(`| ${x.sp} | ${x.exch.toLocaleString('en')} | ${x.K} | ${shName(x.share)} | ${x.nh} | ${xs.map((y) => y.empty + (y.emptied ? '' : '+')).join(' / ')} | ${xs.map((y) => y.harv + ' · ' + y.kg).join(' / ')} | ${xs.map((y) => y.kgHD).join(' / ')} | ${xs.map((y) => y.end).join(' / ')} | ${hold ? '○' : '✗'} |`);
    }
    // ③ 경계 — 종 × 환율마다 버티는(씨 둘 다 끝 ≥ 0.9) 가장 센 사냥(몫 × 사냥꾼)
    out.push(`\n### 버티는 경계 — 상한 ${cap} · r ${r} (버팀 = 씨 모두 끝 몸 ≥ 첫 몸 × 0.9 · 세기 = 몫 × 사냥꾼 · 닷새에 하루 = 0.2)\n`);
    out.push('| 종 | 환율 | 버티는 칸 / 칸 | 버티는 가장 센 사냥(몫 × 사냥꾼 = 세기) | 그때 사냥꾼 하나 한 해 kg | = 사람 날치(1,200 kcal/kg ÷ 2,450) | 안 버티는 가장 약한 사냥 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const sp of SPS) for (const ex of EXCH) {
      const cs = [...cells.values()].filter((xs) => xs[0].sp === sp && xs[0].exch === ex);
      if (!cs.length) continue;
      const H = cs.filter((xs) => xs.every((y) => y.end >= 0.9)), B = cs.filter((xs) => !xs.every((y) => y.end >= 0.9));
      const E = (xs) => effort(xs[0].share) * xs[0].nh;
      H.sort((a, b) => E(b) - E(a) || b[0].nh - a[0].nh); B.sort((a, b) => E(a) - E(b) || a[0].nh - b[0].nh);
      const top = H[0], weak = B[0];
      const kgY = top ? top.reduce((p, y) => p + y.kg / y.nh * (365 / y.days), 0) / top.length : null;
      out.push(`| ${sp} | ${ex.toLocaleString('en')} | ${H.length} / ${cs.length} | ${top ? shName(top[0].share) + ' × ' + top[0].nh + ' = ' + +E(top).toFixed(2) : '없음'} | ${top ? +kgY.toFixed(1) : '-'} | ${top ? +(kgY * KCAL_KG / DAY_KCAL).toFixed(1) : '-'} | ${weak ? shName(weak[0].share) + ' × ' + weak[0].nh + ' = ' + +E(weak).toFixed(2) : '없음'} |`);
    }
  }
  return out.join('\n');
}

if (argv.includes('--sum')) {
  const files = argv.slice(argv.indexOf('--sum') + 1).filter((a) => !a.startsWith('--'));
  const rows = []; for (const fl of files) for (const l of fs.readFileSync(fl, 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l));
  console.log(summarize(rows));
  process.exit(0);
}

labConst(); kgCheck();
const done = new Set();
if (OUT && fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) if (l.trim()) done.add(key(JSON.parse(l)));
const rows = [];
for (const sp of SPS) for (const exch of EXCH) for (const share of SHARES) for (const nh of HUNT) for (const seed of SEEDS) {
  const probe = { sp, exch, nh, share, seed, cap: CAP, r: R, days: DAYS };
  if (done.has(key(probe))) continue;
  const res = runOne(seed, exch, nh, sp, share, CAP, R, DAYS); rows.push(res);
  if (OUT) fs.appendFileSync(OUT, JSON.stringify(res) + '\n');
  if (!QUICK) console.error(`  ${sp} 환율 ${exch} 몫 ${share} 사냥꾼 ${nh} 씨 ${seed} 상한 ${CAP} r ${R} · 빈 날 ${res.emptied ? res.empty : '-'} · 잡음 ${res.harv} · 끝 ${res.end} · 죽음 ${res.hDead}`);
}
if (QUICK) { process.stdout.write(JSON.stringify({ card: 'T1413', rows }) + '\n'); process.exit(0); }
if (!OUT) console.log(summarize(rows));
