#!/usr/bin/env node
// === scripts/t1396-hunt-lab.js — 사냥실험실 머리 없는 자: 사냥 한 번이 어떻게 흘러가나 (T1396 · T1393 의 과녁) ==========
//
// ⚠계측기다. 하네스가 아니다(`@regress` 없음) — 결정성 · 12 불변은 `scripts/test-t1396-hunt-lab.js` 가 지킨다.
//
// 사냥실험실(`lab/사냥실험실.html` = `sim/rebuild-huntlab.py` 가 지금 마을실험실 동물 블록으로 구운 것)을
// 브라우저 없이 node `vm` 에서 돌린다 — 판마다 새 맥락 · 씨 뿌린 `Math.random`(mulberry32 · `sim/hunt-check.js` 와 같은 식) ⇒ 같은 씨 = 같은 표.
// 랩 코드는 한 글자도 안 바꾼다. 자가 만지는 것은 셋뿐(전부 랩 전역 손잡이 · 블록 수 무접촉):
//   ① `MOB_DENS` 글자 하나 — 몸 밀도 = `L_GAMEMAX ÷ 환율`(환율 5,000 → 0.02 = 랩 기본 · T1331 `T1331_BEAST_SCALE` 와 같은 식)
//   ② `HUNT_CAP` = 끝없음 — 랩 기본 24(슬라이더)는 밀도보다 먼저 걸린다(지도 숲 44,970칸 × 0.02 = 899 ≫ 24) ⇒ 밀도를 재려면 풀어야 한다
//   ③ 무리터 크기 — 숲을 캠프 기대 자리(`findCamp` 의 가운데) 둘레 K칸만 남긴다(`forest0` · 바깥 숲 = 풀밭).
//      K = 마을 평균 무리터 숲 넓이(몸 2,981 ÷ 51 × 환율 ÷ L_GAMEMAX ≈ 2,923칸 — 환율과 무관) · 몸이 랩 바닥 5 밑(고증)이면 지도 전체.
//      까닭: 랩 블록의 떼 가르기(무리 안 밀어내기)가 모든 쌍을 본다(O(n²)) — 지도 전체에 환율 5,000 이면 899마리 · 하루 59초,
//      500 이면 9,000마리라 못 돈다. 밀도(마리 ÷ 숲 칸)는 그대로 두고 땅을 마을 무리터 넓이로 둔다. 고증 밀도는 지도 전체(37마리).
//
// 재는 것(사냥꾼 하나하나 · 1게임분마다):
//   표적 = `_tgt`(다친 놈 핏자국 고정) 아니면 `_cm`(커밋) — `hunt-check` · 랩 그림의 표적선과 같은 정의.
//   한 판(에피소드) = 같은 표적을 쥔 동안. 끝 = 표적이 죽음(잡음) / 놓음(놓침).
//   분 갈래: 찾기(표적 없음 · 수색) · 다가가기(표적 쥠 · 표적 방심) · 경계(표적 alert) · 도주(표적 flee/fcd) · 추격(핏자국 `추적`) ·
//            손질(회수 · 도살 · 수확) · 치료(후퇴 · 응급처치).
//   한 마리 분 = 사냥꾼 분 합 ÷ 수확 마리 · 하루 마리 = 수확 ÷ (사냥꾼 × 날) — ⚠랩 사냥꾼은 집 · 잠 없이 24시간 사냥한다.
//   무리 흩어짐: 무리(gid)에 도주 · 돌진 몸이 생긴 때 → 다 가라앉고 퍼짐이 처음의 1.5배 + 3 m 안으로 돌아온 때(분) · 무게중심이 옮긴 거리.
//   버티는 사냥: 잰 하루 마리(밀도 셋 · 로그-로그 잇기)로 무리터 몸 수를 날마다 — 로지스틱 r = `L_GAMER` 0.002(하루 상한 rK/4 = 0.0005 × K).
//
// 실행: node scripts/t1396-hunt-lab.js [--seed 7] [--dens 122070,5000,500] [--sp 🦌,🐗,🐇,🐺,🐯] [--hunters 1,3]
//         [--days 3] [--days500 1] [--win 5000:2923,500:0(0 = 지도 전체)] [--json <파일>] [--lab <html>] [--hb <무리터 몸(환율 5,000)>]
//       --quick = 🦌 · 5,000 · 사냥꾼 1 · 0.25날(하네스 결정성 판)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const QUICK = argv.includes('--quick');
const LAB = path.resolve(opt('lab', path.join(__dirname, '..', 'lab', '사냥실험실.html')));
const SEED = +opt('seed', 7);
const L_GAMEMAX = 100, L_GAMER = 0.002;   // 랩 `L_GAMEMAX`(셀 K) · 마을실험실 `L_GAMER`(로지스틱 r/일) — 손 사본(아래 `labConst` 가 랩 글자와 대조)
const DENS = (QUICK ? '5000' : opt('dens', '122070,5000,500')).split(',').map(Number);
const SPS = (QUICK ? '🦌' : opt('sp', '🦌,🐗,🐇,🐺,🐯')).split(',');
const HUNT = (QUICK ? '1' : opt('hunters', '1,3,17')).split(',').map(Number);   // 17 = 마을 사냥꾼 평균(t17 1020 날 800 · 51마을 counts.hunter 평균 16.9 — 보고 T1396 §2)
const DAYS = QUICK ? 0.25 : +opt('days', 3), DAYS500 = QUICK ? 0.25 : +opt('days500', 1);
const HB5000 = +opt('hb', 2981 / 51);   // 무리터 몸(환율 5,000) — 한반도 몸 2,981(T1362 · T1331) ÷ 51마을. 다른 환율은 5,000 ÷ 환율 배
// 무리터 숲 칸 = 몸 × 환율 ÷ L_GAMEMAX = HB5000 × 50 ≈ 2,923(환율과 무관 — 같은 땅에 몸만 짙고 성기다) · 그 몸이 랩 바닥 5(블록 `max(5, …)`) 밑이면 지도 전체
const WIN_USER = opt('win', null) ? Object.fromEntries(opt('win').split(',').map((s) => s.split(':').map(Number))) : {};
const winOf = (exch) => (WIN_USER[exch] != null ? WIN_USER[exch] : (HB5000 * 5000 / exch >= 5 ? Math.round(HB5000 * 5000 / L_GAMEMAX) : 0));
const SRC = fs.readFileSync(LAB, 'utf8');

// ── 랩 한 판 — 새 vm 맥락 · 씨 뿌린 난수 · 그리기 0 ──
function load(seed, exch, nh, sp, win) {
  let js = /<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';", '');
  const rep = (a, b) => { const n = js.split(a).length - 1; if (n !== 1) throw new Error('앵커 ' + n + '곳: ' + a.slice(0, 50)); js = js.replace(a, b); };
  rep("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
    "const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});");
  rep('bakeBG();resetAll();requestAnimationFrame(loop);', '');
  rep('MOB_DENS=0.02,', 'MOB_DENS=' + (L_GAMEMAX / exch) + ',');
  const els = {};
  const C = { console, performance: { now: () => 0 }, requestAnimationFrame: () => {}, addEventListener: () => {} };
  C.document = { getElementById: (id) => els[id] || (els[id] = { value: { nh: String(nh), cap: '24', spd: '36', terr: '초원' }[id] || '0', textContent: '', innerHTML: '' }), querySelectorAll: () => [] };
  C.window = C; vm.createContext(C);
  vm.runInContext(`{let _s0=(${seed | 0})*2654435761>>>0;Math.random=function(){_s0=_s0+0x6D2B79F5|0;let t=Math.imul(_s0^_s0>>>15,1|_s0);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}`, C);
  vm.runInContext(js + `
;globalThis.__api={get s(){return s;},get lifeGM(){return lifeGM;},set lifeGM(v){lifeGM=v;},resetAll,driveHunters,updateMobs,
  MOB_DEF,N,L_GAMEMAX,MOB_DENS,setSp(x){HUNT_SPECIES=x;},setCap(x){HUNT_CAP=x;},
  win(K){const cx=Math.round(N*0.18)+5,cy=Math.round(N*0.5);const L=[];for(let i=0;i<N*N;i++)if(forest0[i])L.push([Math.hypot(i%N-cx,((i/N)|0)-cy),i]);
    if(!(K>0)||K>=L.length)return {K:L.length,R:null};L.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const keep=new Uint8Array(N*N);for(let k=0;k<K;k++)keep[L[k][1]]=1;
    for(let i=0;i<N*N;i++)if(!keep[i])forest0[i]=0;return {K,R:+L[K-1][0].toFixed(1)};}};`, C);
  const A = C.__api;
  A.setSp(sp); A.setCap(1e9);
  const w = A.win(win);
  A.resetAll(); A.lifeGM = 432;   // 07:12 — hunt-check 와 같은 시작
  return { A, w };
}

const CALM = new Set(['graze', 'sleep', 'feed', 'rest', 'prowl']);
function runOne(seed, exch, nh, sp, days) {
  const { A, w } = load(seed, exch, nh, sp, winOf(exch));
  const s = A.s, MD = A.MOB_DEF;
  const st = new Map();   // 사냥꾼 → {ep, srch}
  const mins = { 찾기: 0, 다가가기: 0, 경계: 0, 도주: 0, 추격: 0, 손질: 0, 치료: 0 };
  const eps = [];   // {out:'kill'|'lost', dur, srch, toAlert, toFlee, toShot, a, f, c}
  const herd = new Map(); const scat = [];   // gid → {t0, cx, cy, sp0} · 끝난 흩어짐 {min, disp}
  const T = Math.round(days * 1440);
  let mobSum = 0, mobN = 0;
  const live = (m) => m && m.hp > 0 && m.st !== 'dead';
  for (let t = 0; t < T; t++) {
    A.lifeGM = A.lifeGM + 1; s.day = Math.floor(A.lifeGM / 1440);
    const shots0 = s._shots || 0;
    A.driveHunters(1); A.updateMobs(s, 1);
    const shotNow = (s._shots || 0) > shots0;
    for (const a of s.agents) {
      if (a.job !== 'hunter' || a._dead) continue;
      let h = st.get(a); if (!h) { h = { ep: null, srch: 0 }; st.set(a, h); }
      const tg = live(a._tgt) ? a._tgt : ((live(a._cm) && a._cm.st !== 'hide') ? a._cm : null);
      if (h.ep && h.ep.m !== tg) {   // 판 끝
        const e = h.ep; e.out = (e.m.hp <= 0 || e.m.st === 'dead') ? 'kill' : 'lost'; e.dur = t - e.t0; delete e.m; eps.push(e); h.ep = null;
      }
      if (!h.ep && tg) { h.ep = { m: tg, t0: t, srch: h.srch, toAlert: null, toFlee: null, toShot: null, a: 0, f: 0, c: 0 }; h.srch = 0; }
      const act = a.action || '';
      if (act === '🏃후퇴' || act === '🩹치료' || a.rest) { mins.치료++; continue; }
      if (act === '회수' || act === '도살' || act === '수확') { mins.손질++; continue; }
      if (!h.ep) { mins.찾기++; h.srch++; continue; }
      const e = h.ep, m = e.m, dt = t - e.t0;
      if (shotNow && act === '저격' && e.toShot == null) e.toShot = dt;
      if (act === '추적') { mins.추격++; e.c++; }
      else if (m.st === 'flee' || m.fcd > 0) { mins.도주++; e.f++; if (e.toFlee == null) e.toFlee = dt; }
      else if (m.st === 'alert') { mins.경계++; e.a++; if (e.toAlert == null) e.toAlert = dt; }
      else mins.다가가기++;
    }
    // 무리 흩어짐
    if (t % 5 === 0) {
      const G = new Map();
      for (const m of s.mobs) { if (!live(m)) continue; let g = G.get(m.gid); if (!g) G.set(m.gid, g = { n: 0, x: 0, y: 0, pan: 0, ms: [] }); g.n++; g.x += m.px; g.y += m.py; g.ms.push(m); if (m.st === 'flee' || m.st === 'charge' || m.fcd > 0) g.pan++; }
      let alive = 0;
      for (const [gid, g] of G) {
        alive += g.n; const cx = g.x / g.n, cy = g.y / g.n; let spd = 0; for (const m of g.ms) spd = Math.max(spd, Math.hypot(m.px - cx, m.py - cy));
        let H = herd.get(gid);
        if (!H) { herd.set(gid, H = { t0: null, cx, cy, sp0: spd }); }
        if (H.t0 == null) { if (g.pan > 0) { H.t0 = t; H.x0 = H.cx; H.y0 = H.cy; H.s0 = H.sp0; } else { H.cx = cx; H.cy = cy; H.sp0 = spd; } }
        else if (g.pan === 0 && g.ms.every((m) => CALM.has(m.st)) && spd <= H.s0 * 1.5 + 3) { scat.push({ min: t - H.t0, disp: Math.hypot(cx - H.x0, cy - H.y0) }); H.t0 = null; H.cx = cx; H.cy = cy; H.sp0 = spd; }
      }
      for (const gid of [...herd.keys()]) if (!G.has(gid)) { const H = herd.get(gid); if (H.t0 != null) scat.push({ min: null, gone: 1 }); herd.delete(gid); }
      mobSum += alive; mobN++;
    }
  }
  for (const H of herd.values()) if (H.t0 != null) scat.push({ min: null, open: 1 });
  const kills = eps.filter((e) => e.out === 'kill'), shotEps = eps.filter((e) => e.toShot != null);
  const med = (xs) => { const v = xs.filter((x) => x != null).sort((p, q) => p - q); return v.length ? v[(v.length - 1) >> 1] : null; };
  const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? +(v.reduce((p, q) => p + q, 0) / v.length).toFixed(1) : null; };
  const harv = s._mobKills || 0, hDays = nh * days;
  const sc = scat.filter((x) => x.min != null);
  return {
    sp, exch, nh, days, seed, win: w, mobs: mobN ? +(mobSum / mobN).toFixed(1) : 0,
    harv, perDay: +(harv / hDays).toFixed(2), minPerKill: harv ? Math.round(1440 * hDays / harv) : null,
    eps: eps.length, kills: kills.length, succ: eps.length ? +(kills.length / eps.length).toFixed(3) : null,
    shotEps: shotEps.length, succShot: shotEps.length ? +(shotEps.filter((e) => e.out === 'kill').length / shotEps.length).toFixed(3) : null,
    kill: { srch: med(kills.map((e) => e.srch)), toAlert: med(kills.map((e) => e.toAlert)), toFlee: med(kills.map((e) => e.toFlee)), toShot: med(kills.map((e) => e.toShot)),
      dur: med(kills.map((e) => e.dur)), a: avg(kills.map((e) => e.a)), f: avg(kills.map((e) => e.f)), c: avg(kills.map((e) => e.c)) },
    lost: { dur: med(eps.filter((e) => e.out === 'lost').map((e) => e.dur)) },
    share: Object.fromEntries(Object.entries(mins).map(([k, v]) => [k, +(v / Math.max(1, Object.values(mins).reduce((p, q) => p + q, 0))).toFixed(3)])),
    shots: s._shots || 0, hits: s._hitsN || 0, lostCarc: s._lostK || 0, inj: s._inj || 0, dead: s._hDeadN || 0,
    scatter: { n: scat.length, done: sc.length, minMed: med(sc.map((x) => x.min)), minMax: sc.length ? Math.max(...sc.map((x) => x.min)) : null, dispMed: sc.length ? +med(sc.map((x) => x.disp)).toFixed(1) : null, open: scat.filter((x) => x.open).length, gone: scat.filter((x) => x.gone).length },
  };
}

// ── 버티는 사냥 — 하루 마리 k(밀도)를 잰 밀도 셋에서 로그-로그로 잇고, 무리터 몸 N 을 날마다 ──
function sustain(rows) {
  const out = [];
  for (const sp of SPS) for (const nh of HUNT) {
    const pts = rows.filter((r) => r.sp === sp && r.nh === nh).map((r) => ({ d: L_GAMEMAX / r.exch, k: r.perDay * nh })).sort((p, q) => p.d - q.d);
    if (!pts.length) continue;
    const kOf = (d) => {   // 마을 하루 마리(사냥꾼 nh 합) — 0 인 점은 바닥(0)으로
      if (d <= 0) return 0;
      const P = pts.filter((p) => p.k > 0);
      if (!P.length) return 0;
      if (P.length === 1 || d <= P[0].d) return P[0].k * Math.min(1, d / P[0].d);   // 가장 성긴 점 아래 = 밀도 비례(만남이 준다)
      for (let i = 1; i < P.length; i++) if (d <= P[i].d) { const a = P[i - 1], b = P[i], u = Math.log(d / a.d) / Math.log(b.d / a.d); return Math.exp(Math.log(a.k) + u * (Math.log(b.k) - Math.log(a.k))); }
      return P[P.length - 1].k;   // 가장 짙은 점 위 = 그 값(손 · 다루기 시간 포화)
    };
    for (const r of rows.filter((x) => x.sp === sp && x.nh === nh)) {
      const K = HB5000 * 5000 / r.exch, d0 = L_GAMEMAX / r.exch; let N = K, day = 0, empty = null, acc = 0;
      for (day = 1; day <= 3650; day++) { N += L_GAMER * N * (1 - N / K); const k = kOf(d0 * N / K); acc += k; N -= k; if (N < 1) { empty = day; N = 0; break; } }
      out.push({ sp, nh, exch: r.exch, K: +K.toFixed(1), msy: +(0.0005 * K).toFixed(3), kill0: +kOf(d0).toFixed(3), ratio: +(kOf(d0) / (0.0005 * K)).toFixed(1), empty, end: empty ? 0 : +(N / K).toFixed(3) });
    }
  }
  return out;
}

const labConst = () => {   // 손 사본 대조 — 랩 글자가 바뀌면 이 자가 멈춘다
  const t = SRC;
  if (!/L_GAMEMAX=100\b/.test(t)) throw new Error('랩 L_GAMEMAX 가 100 이 아니다 — 자의 손 사본을 고쳐라');
  if (!/MOB_DENS=0\.02,/.test(t)) throw new Error('랩 MOB_DENS 가 0.02 가 아니다');
};
labConst();
const rows = [];
for (const exch of DENS) for (const sp of SPS) for (const nh of HUNT) {
  const d = exch <= 500 ? DAYS500 : DAYS;
  const r = runOne(SEED, exch, nh, sp, d); rows.push(r);
  if (!QUICK) console.error(`  ${sp} 환율 ${exch} 사냥꾼 ${nh} · ${d}날 · 몸 ${r.mobs} · 수확 ${r.harv} · 하루 마리 ${r.perDay} · 성공 ${r.succ} · 다침 ${r.inj} · 죽음 ${r.dead}`);
}
const sus = QUICK ? [] : sustain(rows);
const out = { card: 'T1396', seed: SEED, lab: path.relative(path.join(__dirname, '..'), LAB), rows, sustain: sus };
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
if (QUICK) { process.stdout.write(JSON.stringify(out) + '\n'); process.exit(0); }
// ── 표 ──
const f = (x) => (x == null ? '-' : x);
console.log(`\n## 사냥 한 번 — 씨 ${SEED} · ${out.lab}\n`);
console.log('| 종 | 환율 | 사냥꾼 | 날 | 숲 칸(R m) | 몸 평균 | 수확 | 하루 마리/사냥꾼 | 한 마리 분 | 판 · 잡음 · 성공 | 쏜 판 성공 | 잡은 판 중앙(분): 찾기 · 경계까지 · 도주까지 · 첫 발까지 · 판 길이 | 잡은 판 평균(분): 경계 · 도주 · 추격 | 놓친 판 중앙 | 시간 몫: 찾기 · 다가 · 경계 · 도주 · 추격 · 손질 · 치료 | 화살 · 명중 | 사체 잃음 | 다침 · 죽음 | 흩어짐: 판 · 가라앉음 · 중앙 분 · 최장 · 옮긴 m |');
console.log('|' + '---|'.repeat(20));
for (const r of rows) {
  const k = r.kill, S = r.share, X = r.scatter;
  console.log(`| ${r.sp} | ${r.exch.toLocaleString()} | ${r.nh} | ${r.days} | ${r.win.K}${r.win.R != null ? '(' + r.win.R + ')' : '(지도)'} | ${r.mobs} | ${r.harv} | ${r.perDay} | ${f(r.minPerKill)} | ${r.eps} · ${r.kills} · ${f(r.succ)} | ${f(r.succShot)} | ${f(k.srch)} · ${f(k.toAlert)} · ${f(k.toFlee)} · ${f(k.toShot)} · ${f(k.dur)} | ${f(k.a)} · ${f(k.f)} · ${f(k.c)} | ${f(r.lost.dur)} | ${S.찾기} · ${S.다가가기} · ${S.경계} · ${S.도주} · ${S.추격} · ${S.손질} · ${S.치료} | ${r.shots} · ${r.hits} | ${r.lostCarc} | ${r.inj} · ${r.dead} | ${X.n} · ${X.done} · ${f(X.minMed)} · ${f(X.minMax)} · ${f(X.dispMed)} |`);
}
console.log(`\n## 버티는 사냥 — 무리터 몸 K = ${HB5000.toFixed(1)} × 5,000 ÷ 환율 · r = ${L_GAMER}(하루 상한 0.0005 × K) · 3,650날\n`);
console.log('| 종 | 사냥꾼 | 환율 | 무리터 몸 K | 하루 상한 | 첫날 사냥(마리/날) | 사냥 ÷ 상한 | 빈 날 | 10년 뒤 K 몫 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const u of sus) console.log(`| ${u.sp} | ${u.nh} | ${u.exch.toLocaleString()} | ${u.K} | ${u.msy} | ${u.kill0} | ${u.ratio} | ${f(u.empty)} | ${u.end} |`);
