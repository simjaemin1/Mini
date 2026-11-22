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
//      몫이 끝나면 사냥꾼마다: 잡은 몸(`_carc`)을 손질하는 사람만 마칠 때까지 남고 나머지는 곧장 집으로(넘긴 사냥꾼-분 = `over` · 표 덤 ·
//      그동안 랩 '사망 보충' 문턱 = 남은 사람 수 — 빈자리를 새 사냥꾼으로 안 채운다).
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
  // 지름길(같은 답 · 빠르게) — 랩 losRk · losFT 는 선분을 1 · 2 m 마다 걸어 바위 · 숲 칸을 센다. 선분이 지나는 칸은 늘 두 끝의 상자(끝수 버림) 안이므로
  //   그 상자에 바위(숲)가 하나도 없으면 걸음 없이 거짓(0)이 답이다 — 누적합으로 O(1)에 본다 · 있으면 랩 걸음 그대로. 초원 판은 바위 0 이라 losRk 가 늘 거짓인데
  //   사슴 무리가 지도 끝으로 흘러가면 사냥꾼 × 몸 × 300 걸음이 틱마다 돈다(17명 판 하루 0.17초 → 4초). `T1413_NOFAST=1` = 지름길 끔(같은 표인지 견주는 판).
  if (!process.env.T1413_NOFAST) {
    // Keep scans over vm-owned animal objects in that same realm. The reference
    // host-side loops below remain available through NOFAST for byte comparison.
    js = `function __ledgerDead(){let n=0;for(const m of s.mobs)if(m.st==='dead'&&!m.__d){m.__d=1;if(!MOB_DEF[m.type].pred)n++;}return n;}
    function __ledgerTrim(c){let live=0;for(const m of s.mobs)if(m.st!=='dead'&&!MOB_DEF[m.type].pred)live++;if(live<=c)return 0;
      const H=new Set();for(const a of s.agents){if(a._tgt)H.add(a._tgt);if(a._cm)H.add(a._cm);if(a._carc)H.add(a._carc);if(a._bm)H.add(a._bm);}
      let removed=0;for(let j=s.mobs.length-1;j>=0&&live>c;j--){const m=s.mobs[j];if(m.st==='dead'||m.st==='hide'||MOB_DEF[m.type].pred||H.has(m))continue;m.rot=-1;s.mobs.splice(j,1);live--;removed++;}return removed;
    }\n` + js;
    // Exact separation broad phase. The reference sums neighbours in s.mobs
    // order and sees positions updated earlier in this same tick. Keep both:
    // query locally, sort by the original index, and move the index in finally.
    // Cell width is twice the existing separation radius; exceptional/outside
    // coordinates fall back to the original scan. No physics parameter changes.
    rep("for(const m of s.mobs){ if(m.st==='dead')continue;",
      "const __sep=__sepGrid(s.mobs,MOB_SEP_R);for(let __mi=0;__mi<s.mobs.length;__mi++){const m=s.mobs[__mi];if(m.st==='dead')continue;try{");
    rep("for(const o of s.mobs){if(o===m||o.st==='dead')continue;const dx=m.px-o.px,dy=m.py-o.py,d2=dx*dx+dy*dy;",
      "for(const __oi of __sep.query(__mi)){const o=s.mobs[__oi];if(o===m||o.st==='dead')continue;const dx=m.px-o.px,dy=m.py-o.py,d2=dx*dx+dy*dy;");
    rep('\n  }\n  const mgrid=', '\n  }finally{__sep.move(__mi);}}\n  const mgrid=');
    js = `let __sepStore=null;
    function __sepGrid(mobs,r){
      const width=r*2,edge=Math.ceil(N/width)+1,stride=edge*2+1,count=mobs.length;
      if(!__sepStore||__sepStore.head.length!==stride*stride||__sepStore.next.length<count){
        const capacity=Math.max(count,__sepStore?__sepStore.next.length*2:count);
        __sepStore={head:new Int32Array(stride*stride),next:new Int32Array(capacity),prev:new Int32Array(capacity),where:new Int32Array(capacity),out:[]};
      }
      const {head,next,prev,where,out}=__sepStore;head.fill(0);let bad=false;
      const valid=m=>Number.isFinite(m.px)&&Number.isFinite(m.py)&&Math.abs(m.px)<=N&&Math.abs(m.py)<=N;
      const key=m=>(Math.floor(m.px/width)+edge)*stride+Math.floor(m.py/width)+edge;
      function put(i,k){const first=head[k];next[i]=first;prev[i]=0;if(first)prev[first-1]=i+1;head[k]=i+1;where[i]=k;}
      for(let i=0;i<count;i++){if(!valid(mobs[i]))bad=true;else put(i,key(mobs[i]));}
      return {
        query(i){out.length=0;const m=mobs[i];if(bad||mobs.length!==count||!valid(m)){bad=true;for(let j=0;j<mobs.length;j++)out.push(j);return out;}
          const x=Math.floor(m.px/width),y=Math.floor(m.py/width);
          for(let a=x-1;a<=x+1;a++)for(let b=y-1;b<=y+1;b++)for(let at=head[(a+edge)*stride+b+edge];at;at=next[at-1]){
            const j=at-1,o=mobs[j];if(i===j||o.st==='dead')continue;const dx=m.px-o.px,dy=m.py-o.py,d2=dx*dx+dy*dy;
            if(d2<r*r&&d2>1e-4)out.push(j);
          }
          if(out.length>1)out.sort((a,b)=>a-b);return out;
        },
        move(i){if(bad)return;const m=mobs[i];if(i>=count||!valid(m)){bad=true;return;}const k=key(m),old=where[i];if(k===old)return;
          const before=prev[i],after=next[i];if(before)next[before-1]=after;else head[old]=after;if(after)prev[after-1]=before;put(i,k);
        }
      };
    }\n` + js;
    rep('const losRk=(x1,y1,x2,y2)=>{if(!TR.rock)return false;', 'const losRk=(x1,y1,x2,y2)=>{if(!TR.rock)return false;if(__none(__PR,x1,y1,x2,y2))return false;');
    rep('const losFT=(x1,y1,x2,y2)=>{if(!TR.forest)return 0;', 'const losFT=(x1,y1,x2,y2)=>{if(!TR.forest)return 0;if(__PF)return __ft(x1,y1,x2,y2);');
    js = 'let __PR=null,__PF=null;const __ps=(g)=>{const M=N+1,P=new Int32Array(M*M);for(let y=0;y<N;y++){let r=0;for(let x=0;x<N;x++){r+=g[y*N+x]?1:0;P[(y+1)*M+x+1]=P[y*M+x+1]+r;}}return P;};'
      + 'const __none=(P,x1,y1,x2,y2)=>{if(!P||!(isFinite(x1)&&isFinite(y1)&&isFinite(x2)&&isFinite(y2)))return false;const M=N+1;'
      + 'let a=Math.max(0,Math.floor(Math.min(x1,x2))),b=Math.min(N-1,Math.floor(Math.max(x1,x2))),c=Math.max(0,Math.floor(Math.min(y1,y2))),d=Math.min(N-1,Math.floor(Math.max(y1,y2)));'
      + 'if(a>b||c>d)return true;return P[(d+1)*M+b+1]-P[c*M+b+1]-P[(d+1)*M+a]+P[c*M+a]===0;};'
      // losFT 같은 셈: 표본 i = 1 … n9−1 의 칸(랩 식 x1+(x2−x1)·(i/n9) 그대로) 가운데 숲 칸 수 × 2 — 표본 줄을 반씩 갈라 두 끝 상자에 숲이 없으면 그 토막 0(좌표가 i 에 단조라 토막 표본은 상자 안)
      + 'const __ft=(x1,y1,x2,y2)=>{const d9=Math.hypot(x2-x1,y2-y1),n9=Math.ceil(d9/2);if(!(n9>1))return 0;'
      + 'const X=(i)=>x1+(x2-x1)*(i/n9),Y=(i)=>y1+(y2-y1)*(i/n9);'
      + 'const rec=(lo,hi)=>{if(__none(__PF,X(lo),Y(lo),X(hi),Y(hi)))return 0;if(hi-lo<12){let f=0;for(let i9=lo;i9<=hi;i9++){const t9=i9/n9,xx=Math.floor(x1+(x2-x1)*t9),yy=Math.floor(y1+(y2-y1)*t9);if(inG(xx,yy)&&TR.forest[idx(xx,yy)])f++;}return f;}'
      + 'const m=(lo+hi)>>1;return rec(lo,m)+rec(m+1,hi);};return rec(1,n9-1)*2;};' + js;
  }
  const els = {};
  const C = { console, performance: { now: () => 0 }, requestAnimationFrame: () => {}, addEventListener: () => {} };
  C.document = { getElementById: (id) => els[id] || (els[id] = { value: { nh: String(nh), cap: String(LAB_CAP), spd: '36', terr: '초원' }[id] || '0', textContent: '', innerHTML: '' }), querySelectorAll: () => [] };
  C.window = C; vm.createContext(C);
  // vm's contextified global lookup is expensive inside the animal loop.
  // These are aliases to the same objects/functions, not replacements.
  if (!process.env.T1413_NOFAST) vm.runInContext('const Math=globalThis.Math,Number=globalThis.Number,Map=globalThis.Map,Set=globalThis.Set,Array=globalThis.Array,Int32Array=globalThis.Int32Array,isFinite=globalThis.isFinite;',C);
  vm.runInContext(`{let _s0=(${seed | 0})*2654435761>>>0;Math.random=function(){_s0=_s0+0x6D2B79F5|0;let t=Math.imul(_s0^_s0>>>15,1|_s0);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}`, C);
  vm.runInContext(DETMATH + '(Math)', C);
  // Pure-function shortcuts: preserve the reference operation order and bits.
  // Two-argument hypot avoids allocating an array on every animal separation;
  // pow memoizes repeated species/forest attenuation inputs. NOFAST keeps the oracle.
  if (!process.env.T1413_NOFAST) vm.runInContext(`{
    const H=Math.hypot,P=Math.pow,cache=new Map();
    Math.hypot=function(x,y){
      if(arguments.length!==2||!Number.isFinite(x)||!Number.isFinite(y))return H.apply(Math,arguments);
      const a=x<0?-x:x,b=y<0?-y:y,max=Math.max(a,b);if(max===0)return 0;
      let q=a/max,summand=q*q,sum=0+summand,comp=(sum-0)-summand;
      q=b/max;summand=q*q-comp;const pre=sum+summand;
      return Math.sqrt(pre)*max;
    };
    Math.pow=function(x,y){
      if(typeof x!=='number'||typeof y!=='number'||!(x>0)||!Number.isFinite(x)||!Number.isFinite(y))return P(x,y);
      let row=cache.get(x);if(row&&row.has(y))return row.get(y);
      const value=P(x,y);if(!row)cache.set(x,row=new Map());row.set(y,value);return value;
    };
  }`, C);
  vm.runInContext(js + `
;globalThis.__api={get s(){return s;},get lifeGM(){return lifeGM;},set lifeGM(v){lifeGM=v;},resetAll,driveHunters,updateMobs,
  MOB_DEF,N,NPC_MAXHP,get camp(){return camp;},rnd:()=>Math.random(),setSp(x){HUNT_SPECIES=x;},setCap(x){HUNT_CAP=x;},getCap(){return HUNT_CAP;},inForest(x,y){const X=Math.floor(x),Y=Math.floor(y);return X>=0&&Y>=0&&X<N&&Y<N&&!!forest[Y*N+X];},fast(){if(typeof __ps==='function'){__PR=__ps(TR.rock);__PF=__ps(TR.forest);}},
  takeDeaths:typeof __ledgerDead==='function'?__ledgerDead:null,trimLedger:typeof __ledgerTrim==='function'?__ledgerTrim:null,
  win(K){const cx=Math.round(N*0.18)+5,cy=Math.round(N*0.5);const L=[];for(let i=0;i<N*N;i++)if(forest0[i])L.push([Math.hypot(i%N-cx,((i/N)|0)-cy),i]);
    if(!(K>0)||K>=L.length)return {K:L.length,R:null};L.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const keep=new Uint8Array(N*N);for(let k=0;k<K;k++)keep[L[k][1]]=1;
    for(let i=0;i<N*N;i++)if(!keep[i])forest0[i]=0;return {K,R:+L[K-1][0].toFixed(1)};}};`, C);
  const A = C.__api;
  A.setSp(sp); A.setCap(LAB_CAP);
  const w = A.win(WIN);
  A.resetAll(); A.lifeGM = NPC_START; A.fast();   // 누적합은 resetAll(buildRock · 무리터 자르기) 뒤 — 사냥실험실은 그 뒤 바위 · 숲을 안 바꾼다
  const setWant = (n) => { C.document.getElementById('nh').value = String(n); };   // 랩 driveHunters 가 읽는 사냥꾼 수(사망 보충의 문턱)
  return { A: Object.assign(A, { setWant }), w };
}

function runOne(seed, exch, nh, sp, share, cap, r, days) {
  const { A, w } = load(seed, exch, nh, sp);
  const s = A.s, MD = A.MOB_DEF;
  const K = HB5000 * 5000 / exch;
  const kb = []; let N = K, empty = null, over = 0, killed = 0, predKill = 0, trimmed = 0, home = [];
  let refills=0,activeHunterMinutes=0;
  const seenHunters=new WeakSet(s.agents);
  const capOf = () => { const n = Math.floor(N + 1e-9); return cap === 'lab' ? Math.min(LAB_CAP, n) : n; };
  const isPrey = (m) => !MD[m.type].pred;
  const held = () => { const H = new Set(); for (const a of s.agents) { if (a._tgt) H.add(a._tgt); if (a._cm) H.add(a._cm); if (a._carc) H.add(a._carc); if (a._bm) H.add(a._bm); } return H; };
  const trim = () => {   // 랩이 그린 산 먹잇감 > 장부면 넘은 만큼 뺀다(뒤에서부터 · 쥔 몸 · 굴 속 · 사체 제외)
    const c = capOf();if(A.trimLedger){trimmed+=A.trimLedger(c);return;}
    let live = 0; for (const m of s.mobs) if (m.st !== 'dead' && isPrey(m)) live++;
    if (live <= c) return;
    const H = held();
    for (let j = s.mobs.length - 1; j >= 0 && live > c; j--) { const m = s.mobs[j]; if (m.st === 'dead' || m.st === 'hide' || !isPrey(m) || H.has(m)) continue; m.rot = -1; s.mobs.splice(j, 1); live--; trimmed++; }
  };
  const dayEnd = NPC_START + Math.round(days * 1440);
  let kA0 = 0, lastDay = -1;
  // ③ 사냥 몫 — 사냥꾼마다: 몫이 끝나면 사체를 쥐지 않은 사람은 곧장 집으로 · 손질하는 사람은 마치고 집으로(그동안 새 판을 안 연다 = 다음 틱에 사체가 없으면 간다)
  const sendHome = (a) => { home.push(a); for (const m of s.mobs) if (m.tgt === a) m.tgt = null; };
  const comeBack = () => {
    const camp = A.camp;
    for (const a of home) { a._tgt = null; a._cm = null; a._carc = null; a._bm = null; a._lbx = undefined; a.rest = 0; a.state = 'work'; a.action = ''; a.hp = A.NPC_MAXHP;
      a.px = camp.cx + A.rnd() * 2 - 1; a.py = camp.cy + A.rnd() * 2 - 1; s.agents.push(a); }   // 랩 맥락의 씨 뿌린 난수(바깥 Math.random 은 씨가 없다)
    home = [];
  };
  while (A.lifeGM < dayEnd) {
    const gm = A.lifeGM, sched = shareOn(share, gm + 1);
    const dayI = Math.floor((gm + 1 - NPC_START) / 1440);
    if (dayI !== lastDay && process.env.T1413_DEBUG) { let lv = 0, dd = 0, pr = 0; for (const m of s.mobs) { if (m.st === 'dead') dd++; else if (isPrey(m)) lv++; else pr++; } const cp = A.camp, LP = s.mobs.filter((q) => q.st !== 'dead' && isPrey(q)), dm = LP.length ? LP.reduce((p, q) => p + Math.hypot(q.px - cp.cx, q.py - cp.cy), 0) / LP.length : 0, inF = LP.filter((q) => A.inForest(q.px, q.py)).length; console.error(`day ${dayI} 캠프거리 ${dm.toFixed(0)} 숲안 ${inF}/${LP.length} N ${N.toFixed(1)} 산 ${lv} 사체 ${dd} 맹수 ${pr} 사냥꾼 ${s.agents.length}+집${home.length} 피 ${(s._blood || []).length} 좌표최대 사람 ${Math.max(0, ...home.concat(s.agents).map((q) => Math.max(Math.abs(q.px), Math.abs(q.py)))).toFixed(0)} 짐승 ${Math.max(0, ...s.mobs.map((q) => Math.max(Math.abs(q.px), Math.abs(q.py)))).toFixed(0)}`); }
    if (dayI !== lastDay) { lastDay = dayI; s.agents = s.agents.filter((a) => !a._dead); home = home.filter((a) => !a._dead); }   // ④
    if (sched) { if (home.length) comeBack(); A.setWant(nh); }
    else {
      const stay = [];
      for (const a of s.agents) { if (a._dead) continue; if (a._carc && a._carc.rot > 0) stay.push(a); else sendHome(a); }
      s.agents = stay; over += stay.length; A.setWant(stay.length);   // 남은 손질꾼 수만큼만 — 랩 "사망 보충" 이 빈자리를 새 사냥꾼으로 채우지 않게
    }
    const on = s.agents.length > 0;
    let dt = 1;
    if (!sched && !on) { while (dt < 8 && gm + dt + 1 <= dayEnd - 1 && !shareOn(share, gm + dt + 1)) dt++; }
    A.lifeGM = gm + dt; s.day = Math.floor(A.lifeGM / 1440);
    A.setCap(capOf());
    // The driver's existing replacement branch must also run when the last
    // hunter died. Testing only `on` stranded an empty roster for the whole year.
    if (sched || on) A.driveHunters(1);
    for(const a of s.agents){if(!seenHunters.has(a)){seenHunters.add(a);refills++;}if(!a._dead)activeHunterMinutes++;}
    A.updateMobs(s, dt);
    // 죽음 셈 — 이번 틱에 새로 죽은 먹잇감 가운데 사냥꾼 몫(_kA + _kM 늘어난 만큼)만 장부에서
    const kNow = (s._kA || 0) + (s._kM || 0), dK = kNow - kA0; kA0 = kNow;
    let nd = 0;if(A.takeDeaths)nd=A.takeDeaths();else for (const m of s.mobs) if (m.st === 'dead' && !m.__d) { m.__d = 1; if (isPrey(m)) nd++; }
    const hk = Math.min(nd, dK); killed += hk; predKill += nd - hk;
    if (hk) { const b = Math.floor((A.lifeGM - NPC_START) / 1440 / 30); while (kb.length <= b) kb.push(0); kb[b] += hk; }   // 30날 칸별 죽인 수(멈춤 · 교착 찾기)
    if (N < K) N += r * N * (1 - N / K) * dt / 1440;
    N -= hk;
    if (N < 1 && empty == null) empty = Math.min(days, Math.floor((A.lifeGM - NPC_START) / 1440) + 1);   // 빈 날 — 판은 끝까지 간다(이미 죽인 몸의 손질 · 가져오기를 센다 · 장부 0 = 그 뒤 몸 0)
    if (N < 1) N = 0;
    trim();
  }
  const harv = s._mobKills || 0;
  return { sp, exch, nh, share, seed, cap, r, days, win: w.K, K: +K.toFixed(3),
    empty: empty == null ? days : empty, emptied: empty != null, harv, kg: harv * KG[sp], kgHD: +(harv * KG[sp] / (nh * days)).toFixed(3),
    end: +(N / K).toFixed(4),initialBodies:K,endBodies:N,holds:N>=K*0.9,
    killed, predKill, trimmed, hDead: s._hDeadN || 0, inj: s._inj || 0, shots: s._shots || 0, over, kb,refills,activeHunterMinutes };
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
const holds = r => typeof r.holds==='boolean' ? r.holds : r.end>=0.9;
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
      const hold = xs.every(holds);
      out.push(`| ${x.sp} | ${x.exch.toLocaleString('en')} | ${x.K} | ${shName(x.share)} | ${x.nh} | ${xs.map((y) => y.empty + (y.emptied ? '' : '+')).join(' / ')} | ${xs.map((y) => y.harv + ' · ' + y.kg).join(' / ')} | ${xs.map((y) => y.kgHD).join(' / ')} | ${xs.map((y) => y.end).join(' / ')} | ${hold ? '○' : '✗'} |`);
    }
    // ③ 경계 — 종 × 환율마다 버티는(씨 둘 다 끝 ≥ 0.9) 가장 센 사냥(몫 × 사냥꾼)
    out.push(`\n### 버티는 경계 — 상한 ${cap} · r ${r} (버팀 = 씨 모두 끝 몸 ≥ 첫 몸 × 0.9 · 세기 = 몫 × 사냥꾼 · 닷새에 하루 = 0.2)\n`);
    out.push('| 종 | 환율 | 버티는 칸 / 칸 | 버티는 가장 센 사냥(몫 × 사냥꾼 = 세기) | 그때 사냥꾼 하나 한 해 kg | = 사람 날치(1,200 kcal/kg ÷ 2,450) | 안 버티는 가장 약한 사냥 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const sp of SPS) for (const ex of EXCH) {
      const cs = [...cells.values()].filter((xs) => xs[0].sp === sp && xs[0].exch === ex);
      if (!cs.length) continue;
      const H = cs.filter((xs) => xs.every(holds)), B = cs.filter((xs) => !xs.every(holds));
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
  const rows = []; for (const fl of files) for (const l of fs.readFileSync(fl, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); if (!r.skip) rows.push(r); }   // skip = 미리 채운 건너뛸 칸(판 0 · 이어 돌리기 표지)
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
