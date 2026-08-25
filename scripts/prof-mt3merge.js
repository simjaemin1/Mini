#!/usr/bin/env node
// =============================================================================
// prof-mt3merge — ④ 띠 병합 시제품(__mt3merge, 기본 끔) 판정.
//   ⑴ 무통로 산괴에서 켬/끔 **화소 동일**   ⑵ 통로가 생기면 그 청크가 병합에서 빠지는가
//   ⑶ 성능 짝(라이브 rAF 중앙값, 교대 5회)   ⑷ fade(그룹 알파)와의 상호작용
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/merge'; fs.mkdirSync(OUT, { recursive: true });
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const rock = (i, j) => T.isRockCellLocal('hanbando', i * 32 + 16, j * 32 + 16);
function deepSite() {
  const I0 = 1740, J0 = 0, W = 520, H = 720, R = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) R[j*W+i] = rock(I0+i, J0+j) ? 1 : 0;
  const d = new Float32Array(W*H); for (let k = 0; k < W*H; k++) d[k] = R[k] ? 1e6 : 0;
  const at = (i,j) => (i<0||j<0||i>=W||j>=H) ? 0 : d[j*W+i];
  for (let j=0;j<H;j++) for (let i=0;i<W;i++){const k=j*W+i; if(!d[k])continue;
    d[k]=Math.min(d[k],at(i-1,j)+1,at(i,j-1)+1,at(i-1,j-1)+1.414,at(i+1,j-1)+1.414);}
  for (let j=H-1;j>=0;j--) for (let i=W-1;i>=0;i--){const k=j*W+i; if(!d[k])continue;
    d[k]=Math.min(d[k],at(i+1,j)+1,at(i,j+1)+1,at(i+1,j+1)+1.414,at(i-1,j+1)+1.414);}
  let best=0,bi=0,bj=0; for(let j=60;j<H-60;j++)for(let i=60;i<W-60;i++){const v=d[j*W+i];
    if(v<1e5&&v>best){best=v;bi=I0+i;bj=J0+j;}}
  let wd=0; while(wd<120&&rock(bi-wd-1,bj))wd++;
  return { i: bi, j: bj, wd, dE: +best.toFixed(1) };
}
// ★HUD(핑·시각·체력·미니맵·채팅)는 프레임마다 바뀐다 — **세계만** 센다.
//   HUD 를 안 빼면 재현 바닥이 1788화소로 부풀어 판정이 그 밑에 묻힌다(실측).
const inHUD = (x, y, W, H) => (y < 150 && x < 420) || (x > 1000 && y < 290) || (y > H - 40);
const diffPx = (a, b) => { let n = 0, s = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (inHUD(x, y, a.width, a.height)) continue;
    const k = (y * a.width + x) * 4;
    const d = Math.abs(a.data[k]-b.data[k]) + Math.abs(a.data[k+1]-b.data[k+1]) + Math.abs(a.data[k+2]-b.data[k+2]);
    if (d > 3) { n++; s += d; } }
  return { n, s, pct: +(n / (a.width*a.height) * 100).toFixed(3) }; };

(async () => {
  const site = deepSite();
  say(`\n=== ④ 띠 병합 시제품 — 자리 (${site.i},${site.j}) dE ${site.dE} ===`);
  fs.writeFileSync('/tmp/zw-mg.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'), { PORT:''+CPORT, PUBLIC_HOST:'localhost', ENABLED_ZONES:'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-mg.js', { PORT:''+ZPORT, ZONE_ID:'hanbando', DB_PATH:'/tmp/mg.db', CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0', ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.i*32+16, y: site.j*32+16, name: '병합' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport:{width:1400,height:900} })).newPage();
  pg.on('pageerror', (e) => say('  [err] ' + String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; window.__terrain19.occOff = true; });
  await sleep(2000);
  const settle = async (max=150000) => { let last='',same=0,t=0;
    while (t<max) { await sleep(2000); t+=2000;
      const d = await pg.evaluate(() => { const q=window.__mtDbg; return [q.mt3chunks,q.segs].join(','); });
      if (d===last && !d.endsWith(',0')) { if (++same>=3) return t; } else { same=0; last=d; } }
    return t; };
  const grab = async (n) => { const p = path.join(OUT, n+'.png'); await pg.screenshot({ path: p }); return PNG.sync.read(fs.readFileSync(p)); };
  const MED = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
    const step=()=>{const n=performance.now();t.push(n-last);last=n;
      if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);res(+s[s.length>>1].toFixed(2));}};requestAnimationFrame(step);})`;
  const setM = async (v) => { await pg.evaluate((x) => window.__mt3merge(x), v); await settle(); };

  // ⑴ 무통로 산괴 — 켬/끔 화소 동일
  say('\n[⑴ 무통로 산괴 — 병합 켬/끔 화소 비교]');
  await setM(0); const off1 = await grab('A-병합끔');
  const nOff = await pg.evaluate(() => window.__mt3mergeN());
  await setM(1); const on1 = await grab('B-병합켬');
  const nOn = await pg.evaluate(() => window.__mt3mergeN());
  await setM(0); const off2 = await grab('C-병합끔재현');
  const dSelf = diffPx(off1, off2), dMerge = diffPx(off1, on1);
  say(`    병합 청크 — 끔 ${nOff.mergedChunks} · 켬 ${nOn.mergedChunks} · 띠 수 끔 ${nOff.bands} → 켬 ${nOn.bands}`);
  say(`    화소 — 끔↔끔(재현 바닥) ${dSelf.n} (${dSelf.pct}%) · 끔↔켬 ${dMerge.n} (${dMerge.pct}%)`);
  ok(nOn.mergedChunks > 0, `★자명 통과 금지 — 병합이 실제로 일어났다 (청크 ${nOn.mergedChunks}개)`);
  ok(nOn.bands < nOff.bands, `★띠 수가 줄었다 (${nOff.bands} → ${nOn.bands})`);
  // ★★판정은 **재현 바닥**과 비교한다(장면 상수 금지). HUD 를 뺀 바닥은 실측 0 이다.
  //   현재 실측: 바닥 0 · 병합 1537화소(0.12%) — 화면 한 곳에 뭉쳐 있고 돌출목 한 그루 크기다.
  //   원인 추정: 띠마다 굽던 판은 '띠k 표면 → 띠k 나무 → 띠k+1 표면' 순인데,
  //   병합 판은 '전 띠 표면 → 전 나무' 순이라 **나무가 뒤 띠에 안 가린다**. 기본 끔이라 라이브 무영향.
  ok(dMerge.n <= dSelf.n + 20, `★★병합 켬/끔 그림이 같다 (다른 화소 ${dMerge.n}, 재현 바닥 ${dSelf.n})`);

  // ⑴b **원인 확증** — 돌출목을 끄고 같은 비교를 한다. 차이가 0 이 되면 원인은 나무다.
  //   ★한 손잡이만 돌린다(정본 `__mt3trees`). 추정을 실측으로 바꾸는 자리다.
  say('\n[⑴b 원인 확증 — 돌출목을 끄고 같은 비교]');
  await pg.evaluate(() => window.__mt3trees(0));
  await setM(0); const offT = await grab('A2-나무끔_병합끔');
  await setM(1); const onT = await grab('B2-나무끔_병합켬');
  await setM(0); const offT2 = await grab('C2-나무끔_병합끔재현');
  const dSelfT = diffPx(offT, offT2), dMergeT = diffPx(offT, onT);
  say(`    나무 끔 — 재현 바닥 ${dSelfT.n} · 병합 켬/끔 차이 ${dMergeT.n} (나무 켬일 때 ${dMerge.n})`);
  ok(dMergeT.n <= dSelfT.n + 20, `★★★원인 확증 — **돌출목을 끄면 병합 차이가 사라진다** (${dMerge.n} → ${dMergeT.n})`);
  await pg.evaluate(() => window.__mt3trees(0.020));
  await setM(0);

  // ⑶ 성능 짝
  say('\n[⑶ 성능 짝 — 병합 끔/켬 교대 5회]');
  const prof = { 0: [], 1: [] };
  for (let k = 0; k < 5; k++) for (const v of [0, 1]) { await setM(v); prof[v].push(await pg.evaluate('(' + MED + ')(2200)')); }
  const st = (a) => { const n=a.length, m=a.reduce((x,y)=>x+y,0)/n;
    const sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,n-1)); return {m,sd,se:sd/Math.sqrt(n),n}; };
  const A = st(prof[0]), B = st(prof[1]), dse = Math.hypot(A.se,B.se), diff = B.m - A.m;
  say(`    끔 ${A.m.toFixed(2)}±${A.sd.toFixed(2)}ms (SE ${A.se.toFixed(2)}) · 켬 ${B.m.toFixed(2)}±${B.sd.toFixed(2)}ms (SE ${B.se.toFixed(2)})`);
  say(`    차 ${diff>=0?'+':''}${diff.toFixed(2)}ms (${(diff/A.m*100).toFixed(1)}%) · 2σ ${(2*dse).toFixed(2)} → ${Math.abs(diff)>2*dse?'유의':'잡음'}`);

  // ⑷ fade 상호작용
  say('\n[⑷ fade(그룹 알파)와의 상호작용]');
  await pg.evaluate(() => { window.__terrain19.occOff = false; }); await sleep(2500);
  const fadeOf = async (v) => { await setM(v); await pg.evaluate(() => window.__mt3Rects(true)); await sleep(900);
    const r = await pg.evaluate(() => { const me = window.__getMyAbs(); const mz = (me.x+me.y)*0.5+500;
      const q = window.__mt3RectsGet() || []; const f = q.filter(x=>x.z>mz);
      return { total: q.length, front: f.length, frontFaded: f.filter(x=>x.faded).length }; });
    await pg.evaluate(() => window.__mt3Rects(false)); return r; };
  const f0 = await fadeOf(0), f1 = await fadeOf(1);
  say(`    끔 — 그린 사각형 ${f0.total} · 앞 ${f0.front} · 그중 흐림 ${f0.frontFaded}`);
  say(`    켬 — 그린 사각형 ${f1.total} · 앞 ${f1.front} · 그중 흐림 ${f1.frontFaded}`);
  ok(f0.front > 0 && f0.frontFaded === f0.front, `★대조군 — 병합 끔에서 앞 띠는 전부 흐려진다 (${f0.frontFaded}/${f0.front})`);
  ok(f1.front > 0 && f1.frontFaded === f1.front, `★★병합 켬에서도 앞 판이 **통째로** 흐려진다 (${f1.frontFaded}/${f1.front})`);
  // ★통로 판정은 **맨 뒤**로 옮겼다 — 뚫고 나면 병합 청크가 줄어 성능·fade 판정이 오염된다
  //   (실측: 통로를 먼저 뚫었더니 병합 청크가 0 이 돼 성능 짝이 16.66 vs 16.66 으로 나왔다).
  // ⑵ 통로가 생기면 그 청크는 병합에서 빠진다
  say('\n[⑵ 통로가 생기면 그 청크는 병합에서 빠진다]');
  // ★fade 를 다시 꺼 놓고 잰다 — ⑷ 에서 켰던 상태로 두면 알파가 프레임마다 달라
  //   두 그림이 통째로 어긋난다(실측 205572화소 = 16.3%. 통로 탓이 아니라 fade 탓이었다).
  await pg.evaluate(() => { window.__terrain19.occOff = true; }); await sleep(2500);
  const digCells = []; for (let k = site.wd; k >= 0; k--) digCells.push([site.i - k, site.j]);
  await pg.evaluate((cs) => { for (const [i,j] of cs) {
    const isR = window.__mtIsRock(i,j);
    const edge = [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b]) => window.__mtIsRock(i+a,j+b) === false);
    if (isR && edge) window.__mtDestroy([[i,j]]); } }, digCells);
  await setM(1); const onDug = await grab('D-병합켬_통로');
  const nDug = await pg.evaluate(() => window.__mt3mergeN());
  await setM(0); const offDug = await grab('E-병합끔_통로');
  const dDug = diffPx(offDug, onDug);
  say(`    통로 뚫은 뒤 병합 청크 ${nDug.mergedChunks} (통로 전 ${nOn.mergedChunks}) · 끔↔켬 다른 화소 ${dDug.n} (${dDug.pct}%)`);
  ok(nDug.mergedChunks < nOn.mergedChunks, `★★통로가 지나는 청크가 병합에서 빠졌다 (${nOn.mergedChunks} → ${nDug.mergedChunks})`);
  ok(dDug.n <= dSelf.n + 20, `★★통로가 있어도 병합 켬/끔 그림이 같다 (다른 화소 ${dDug.n})`);

  await setM(0);
  say(`\n=== ④ 병합 시제품: 통과 ${pass} · 실패 ${fail} ===`);
  fs.writeFileSync(path.join(OUT,'merge.json'), JSON.stringify({site,nOff,nOn,nDug,dSelf,dMerge,dDug,A,B,diff,f0,f1},null,1));
  await br.close(); die(fail?1:0);
})().catch((e) => { console.error(e); die(1); });
