// (@regress 없음 — 러너 밖 · T571 랩 개울 자 · 제품 무변 · 랩 `lab/마을실험실.html` 을 떼어 쓰거나(Node) 띄워서(Playwright) 잰다)
// === scripts/t571-lab-streams.js — 랩 개울 층: 물길 점검 자 · 인구 슬라이더 판 · 산그림 ============================
//   쓰임:
//     node scripts/t571-lab-streams.js audit [out.json]   — 랩 지형(시드×지형) 위 개울 세 판(land = PM 미리보기 · foot = 기슭 · gorge = 계곡)의 점검 자(브라우저 없음)
//     node scripts/t571-lab-streams.js sweep [out.json]   — 랩을 띄워 인구 슬라이더를 4→200 한 칸씩: 개울 위 집·논·밭·마당 · 거부 집터 · 개울 건너 집 · 개울 없는 판 표
//         (판 고르기: `T571_SWEEP=7:lake:dispersed,11:river:nucleated` · `T571_SWEEP_MODES=gorge,foot` — 기본은 시드 7 강·호수·해안 집촌 + 강 산촌 × 계곡·기슭)
//     node scripts/t571-lab-streams.js pics  [outDir]     — 산그림 `T571_랩_개울.png`(인구 30·100·200 × 개울 끔·켬 두 판) · `T571_계곡_기슭.png`(산 바위 구간 세 판)
//     T568_DIR=… node scripts/t571-lab-streams.js xval    — 교차 검증(라이브 사본): ① 랩 streamFlow = `t568-flow.js` 출력(acc·down 전 칸) ② 랩 streamAudit = `t568-streams.py` audit(판 셋)
//         (먼저: t568-live-map.py → t571-live-cost.py → t568-flow.js … acc.u32 down.i32 → T571_MODES=land,foot,gorge python3 scripts/t568-streams.py 1500)
//     node scripts/t571-lab-streams.js guard [out.json]   — ★T584 개울 완충 셋(off · guard · guard+tax) × 아홉 판(시드 7 · 강·호수·해안 · 집촌·산촌 · 계곡 + 집촌 기슭) · 인구 4→200 한 칸씩
//         집 수 · 거부 집터(사유 '개울'·'개울 완충') · 못 앉힌 사람 · 집 반경 · 논밭 셀 · 개울-집 사이 칸 분포(나눠 돌리기: `T584_SHARD=0/2` · 판 고르기 `T584_BOARDS=auto:nucleated:gorge,…`)
//     node scripts/t571-lab-streams.js guardpic [outDir]  — ★T584 산그림 `T584_개울완충.png`(같은 마을 · 인구 100 · 완충 셋 나란히 + 나란한 두 개울 한 칸)
//   ★T571 의 sweep·pics 는 `streamGuard=off`(T571 판 — 그때는 완충이 없었다)로 고정해 그 보고 숫자를 다시 낸다.
//   ★자(산법·점검)는 랩 HTML 의 `STREAM-CORE-START … STREAM-CORE-END` 를 **그대로 떼어** 돈다(사본 0) — 지형도 랩의 `buildTerrain` 을 떼어 쓴다.
//   ★sweep·pics 는 랩 페이지를 그대로 띄운다(URL 손잡이 `?stream=…&seed=…&terr=…&pop=…`) — 재민이 보는 판과 같은 코드.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LAB = path.join(ROOT, 'lab', '마을실험실.html');
const H = fs.readFileSync(LAB, 'utf8');

function grab(re, what) { const m = H.match(re); if (!m) throw new Error('랩에서 못 찾음: ' + what); return m[0]; }
function loadLab() {   // 랩 지형 + 개울 산법(떼어 쓰기)
  const parts = [
    grab(/function hash2\(ix,iy,s\)\{[^\n]*/, 'hash2'), grab(/function smt\(t\)\{[^\n]*/, 'smt'), grab(/function vn\(x,y,s\)\{[^\n]*/, 'vn'), grab(/function fbm\(x,y,s\)\{[^\n]*/, 'fbm'),
    grab(/const N=1600, CELL=760\/N;/, 'N'), grab(/const idx=\(x,y\)=>y\*N\+x, inG=[^\n]*/, 'idx'),
    grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/, 'buildTerrain'),
  ];
  const s = H.indexOf('STREAM-CORE-START'), e = H.indexOf('// ===================== STREAM-CORE-END');
  if (s < 0 || e < 0) throw new Error('랩에 STREAM-CORE 표지가 없다');
  parts.push(H.slice(H.lastIndexOf('\n', s) + 1, e));
  return new Function(parts.join('\n') + '\nreturn {N,idx,inG,buildTerrain,streamFlow,streamMask,streamAudit};')();
}

// ── audit ────────────────────────────────────────────────────────────────
function audit(out) {
  const L = loadLab(), N = L.N, A = 1500;   // 문턱 = 랩 기본(재민 10-03 확정 1,500 · 족보 513)
  const runs = [];
  const CASES = [[7, 'auto'], [7, 'lake'], [7, 'coast'], [11, 'river'], [23, 'river'], [42, 'lake'], [99, 'coast']];
  for (const [seed, tm] of CASES) {
    let t0 = Date.now();
    const TR = L.buildTerrain(seed, tm); const tT = Date.now() - t0;
    t0 = Date.now(); const F = L.streamFlow(N, N, (i) => TR.water[i] === 1, TR.elev); const tF = Date.now() - t0;
    let land = 0; for (let i = 0; i < N * N; i++) if (!TR.water[i] && !TR.rock[i]) land++;
    for (const mode of ['land', 'foot', 'gorge']) {
      const M = L.streamMask(N, N, F, TR.water, TR.rock, A, mode);
      const au = L.streamAudit(N, N, M.mask, TR.water, F);
      let onLand = 0; for (let i = 0; i < N * N; i++) if (M.mask[i] && !TR.rock[i]) onLand++;
      const r = { seed, terr: tm, mode, A, n1: M.n1, n2: M.n2, carve: M.nc, pctLand: +(100 * onLand / land).toFixed(2), ...au };
      runs.push(r);
      console.log(`${seed}/${tm}/${mode}: 셀 ${au.cells} (뭍 ${r.pctLand}%) · 물성분 ${au.waterComps} · 개울성분 ${au.comps} · 두물 ${au.two} · 끊긴 ${au.frag}(${au.fragCells}셀) · 기슭따라 ${au.bankPct}% · 나란 ≥5 ${au.parallel[5]} ≥10 ${au.parallel[10]} ≥20 ${au.parallel[20]} · 가로지름 ${au.onWater + au.through} · 깎음 ${M.nc}`);
    }
    console.log(`   (지형 ${tT}ms · 흐름 ${tF}ms)`);
  }
  if (out) fs.writeFileSync(out, JSON.stringify(runs, null, 1));
  return runs;
}

// ── xval ─────────────────────────────────────────────────────────────────
function xval() {
  const D = process.env.T568_DIR || '/tmp/out/live';
  const s = H.indexOf('STREAM-CORE-START'), e = H.indexOf('// ===================== STREAM-CORE-END');
  const C = new Function(H.slice(H.lastIndexOf('\n', s) + 1, e) + '\nreturn {streamFlow,streamMask,streamAudit};')();
  const J = JSON.parse(fs.readFileSync(path.join(D, 'streams.json'), 'utf8'));
  const kind = new Uint8Array(fs.readFileSync(path.join(D, 'kind.u8')));
  const G = JSON.parse(fs.readFileSync(path.join(D, 't524', 'hanbando.json'), 'utf8')), NX = G.NX, NY = G.NY, N = NX * NY;   // T524 격자(t568-live-map.py 와 같은 곳)
  const cb = fs.readFileSync(path.join(D, 'cost.f32')), cost = new Float32Array(cb.buffer, cb.byteOffset, N);
  const ab = fs.readFileSync(path.join(D, 'acc.u32')), acc0 = new Uint32Array(ab.buffer, ab.byteOffset, N);
  const db = fs.readFileSync(path.join(D, 'down.i32')), down0 = new Int32Array(db.buffer, db.byteOffset, N);
  const F = C.streamFlow(NX, NY, (i) => kind[i] === 2 || kind[i] === 3 || kind[i] === 0, cost);   // t568-flow.js 의 끝(kind 0·2·3) 그대로
  let dA = 0, dD = 0; for (let i = 0; i < N; i++) { if (F.acc[i] !== acc0[i]) dA++; if (F.down[i] !== down0[i]) dD++; }
  console.log(`① 랩 streamFlow vs t568-flow.js — acc 다른 칸 ${dA} · down 다른 칸 ${dD} (전 ${N.toLocaleString()}칸)`);
  const water = new Uint8Array(N), rock = new Uint8Array(N); for (let i = 0; i < N; i++) { water[i] = (kind[i] === 2 || kind[i] === 3) ? 1 : 0; rock[i] = kind[i] === 4 ? 1 : 0; }
  let bad = dA + dD;
  for (const A of Object.keys(J.runs).map(Number)) for (const mode of ['land', 'foot', 'gorge']) {
    const py = mode === 'land' ? (J.runs[A] || {}).audit : ((J.variants || {})[mode] || {})[A];
    if (!py) { console.log(`② ${A}/${mode}: 파이썬 쪽 없음(T571_MODES?)`); continue; }
    const M = C.streamMask(NX, NY, F, water, rock, A, mode), js = C.streamAudit(NX, NY, M.mask, water, F);
    const keys = ['waterComps', 'comps', 'cells', 'two', 'frag', 'fragCells', 'trunk', 'bankAlong', 'links', 'onWater', 'through'];
    const diff = keys.filter((k) => js[k] !== py[k]).concat([5, 10, 20].filter((n) => js.parallel[n] !== py.parallel[String(n)]).map((n) => 'par' + n));
    if (mode === 'gorge' && py.carve !== M.nc) diff.push('carve');
    bad += diff.length;
    console.log(`② ${A}/${mode}: ${diff.length ? '다름 ' + diff.join(',') : '같다'} — 두물 ${js.two} · 끊긴 ${js.frag} · 기슭따라 ${js.bankPct}% · 나란 ${js.parallel[5]}/${js.parallel[10]}/${js.parallel[20]} · 가로지름 ${js.onWater + js.through}`);
  }
  console.log(bad ? `✗ 교차 검증 어긋남 ${bad}` : '✓ 교차 검증 — 한 정의 · 두 언어 같은 답');
  if (bad) process.exitCode = 1;
}

// ── 브라우저(랩 그대로) ──────────────────────────────────────────────────────
async function openLab(q) {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { const g = require('child_process').execSync('npm root -g').toString().trim(); ({ chromium } = require(path.join(g, 'playwright'))); }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + LAB.split('/').map(encodeURIComponent).join('/').replace(/%3A/g, ':') + q, { waitUntil: 'load', timeout: 240000 });
  return { b, p, errs };
}

async function sweep(out) {
  const CONF = process.env.T571_SWEEP   // 예: T571_SWEEP=7:lake:dispersed,11:river:nucleated
    ? process.env.T571_SWEEP.split(',').map((t) => { const [seed, terr, sett] = t.split(':'); return { seed: +seed, terr, sett }; })
    : [{ seed: 7, terr: 'auto', sett: 'nucleated' }, { seed: 7, terr: 'lake', sett: 'nucleated' }, { seed: 7, terr: 'coast', sett: 'nucleated' },
      { seed: 7, terr: 'auto', sett: 'dispersed' }];
  const res = [];
  for (const c of CONF) for (const mode of (process.env.T571_SWEEP_MODES || 'gorge,foot').split(',')) {
    const { b, p, errs } = await openLab(`?stream=${mode}&seed=${c.seed}&terr=${c.terr}&pop=4&streamGuard=off`);
    const r = await p.evaluate((sett) => {
      const el = document.getElementById('settType'); el.value = sett;
      const rows = [], keep = [4, 10, 20, 30, 50, 75, 100, 125, 150, 175, 200];
      let worst = { houseSt: 0, nongSt: 0, batSt: 0, lotSt: 0, yardSt: 0 };
      for (let pop = 4; pop <= 200; pop++) {
        document.getElementById('pop').value = pop; gen();
        const m1 = _stM1, m0 = _stM0;
        for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], m1[k]);
        if (keep.includes(pop)) rows.push({ pop, houses: m1.houses, houses0: m0.houses, rej: _stRejAcc.size, across: m1.across, adj: m1.adj, nong: m1.nong, nong0: m0.nong, bat: m1.bat, bat0: m0.bat, yard: m1.lot + m1.yard, yard0: m0.lot + m0.yard, terr: m1.terr, terr0: m0.terr, terrSt: m1.terrSt, houseSt: m1.houseSt, fieldSt: m1.nongSt + m1.batSt, yardSt: m1.lotSt + m1.yardSt, c1: m1.cx + ',' + m1.cy, c0: m0.cx + ',' + m0.cy });
      }
      return { rows, worst, info: TR.streamInfo, audit: TR.streamAudit };
    }, c.sett);
    res.push({ ...c, mode, ...r, errors: errs.slice() });
    const r200 = r.rows[r.rows.length - 1];
    console.log(`${c.seed}/${c.terr}/${c.sett}/${mode}: 4→200 내내 개울 위 집 ${r.worst.houseSt} · 논 ${r.worst.nongSt} · 밭 ${r.worst.batSt} · 마당 ${r.worst.lotSt + r.worst.yardSt} | 인구200 집 ${r200.houses}(없음 ${r200.houses0}) · 거부 ${r200.rej} · 개울 건너 ${r200.across} · 맞닿음 ${r200.adj} | 오류 ${errs.length}`);
    await b.close();
  }
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  return res;
}

// 캔버스를 한 마을에 맞춰 찍는다(view 를 마을 중심에 · 한 변 W 셀)
const SNAP = `(function(){
  window.__snap=function(which,cx,cy,W){const z=1600/W;view={z,ox:380-cx*CELL*z,oy:380-cy*CELL*z};draw();
    const c=which==='side'?document.getElementById('cv0'):document.getElementById('cv');return c.toDataURL('image/png');};
})();`;

async function pics(outDir) {
  outDir = outDir || '/tmp';
  fs.mkdirSync(outDir, { recursive: true });
  const W = 260, POPS = [30, 100, 200];
  const shots = {};   // key → dataURL
  for (const mode of ['gorge', 'foot']) {
    const { b, p, errs } = await openLab(`?stream=${mode}&seed=7&terr=auto&pop=4&board=1&streamGuard=off`);
    await p.addScriptTag({ content: SNAP });
    for (let pop = 4; pop <= 200; pop++) {
      const want = POPS.includes(pop);
      const r = await p.evaluate(([pop, want, W]) => {
        document.getElementById('pop').value = pop; gen(); if (!want) return null;
        const m1 = _stM1, m0 = _stM0;
        return { on: __snap('main', m1.cx, m1.cy, W), off: __snap('side', m0.cx, m0.cy, W), m1, m0, rej: _stRejAcc.size };
      }, [pop, want, W]);
      if (r) { shots[mode + '_' + pop] = r; if (mode === 'gorge') shots['off_' + pop] = { on: r.off, m1: r.m0 }; }
    }
    if (errs.length) console.log('오류', errs);
    await b.close();
  }
  // 한 장으로 — 열: 개울 없음 · 켬·계곡 · 켬·기슭 / 줄: 인구 30·100·200
  const { b, p } = await openLab('?stream=off&pop=4');
  const png = await p.evaluate(([shots, POPS]) => new Promise((done) => {
    const S = 500, PAD = 14, TOP = 100, LEFT = 90, COLS = [['off', '개울 없음(같은 시드)'], ['gorge', '개울 켬 · 계곡'], ['foot', '개울 켬 · 기슭']];
    const cv = document.createElement('canvas'); cv.width = LEFT + COLS.length * (S + PAD); cv.height = TOP + POPS.length * (S + PAD + 26) + 30;
    const g = cv.getContext('2d'); g.fillStyle = '#15181d'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#e8eef5'; g.font = 'bold 22px sans-serif'; g.fillText('T571 랩 개울 — 마을실험실 인구 슬라이더 4→200(한 칸씩) · 시드 7 · 강 · 집촌 · 집수 문턱 1,500 · 빨강 점선 = 개울 때문에 거부된 집터', LEFT, 34);
    g.font = '15px sans-serif'; g.fillStyle = '#9aa4b2'; g.fillText('각 칸 = 그 판의 큰집을 가운데 둔 260×260셀(1셀 = 1m). 개울 = 연한 파랑(1~2셀 · 걸어서 건넘) · 집·마당·논밭은 개울 셀에 못 선다(옆은 된다) · 노랑 고리 = 1셀 틈으로 10셀 넘게 나란한 두 개울.', LEFT, 60);
    let pending = 0;
    COLS.forEach(([k, name], ci) => { g.fillStyle = '#cfd6e0'; g.font = 'bold 18px sans-serif'; g.fillText(name, LEFT + ci * (S + PAD), TOP - 4); });
    POPS.forEach((pop, ri) => {
      const y0 = TOP + 8 + ri * (S + PAD + 26);
      g.fillStyle = '#e0c674'; g.font = 'bold 20px sans-serif'; g.fillText('인구 ' + pop, 8, y0 + S / 2);
      COLS.forEach(([k], ci) => {
        const s = shots[k + '_' + pop]; if (!s) return; pending++;
        const im = new Image(); im.onload = () => {
          const x0 = LEFT + ci * (S + PAD); g.drawImage(im, x0, y0, S, S);
          const m = s.m1; g.fillStyle = '#cfd6e0'; g.font = '14px sans-serif';
          const t = k === 'off' ? `집 ${m.houses}채 · 논 ${m.nong} · 밭 ${m.bat} · 마당 ${m.lot + m.yard}` : `집 ${m.houses}채 · 거부 집터 ${s.rej} · 개울 위 집 ${m.houseSt}·논밭 ${m.nongSt + m.batSt}·마당 ${m.lotSt + m.yardSt} · 개울 건너 ${m.across}`;
          g.fillText(t, x0, y0 + S + 18);
          if (--pending === 0) done(cv.toDataURL('image/png'));
        }; im.src = s.on;
      });
    });
  }), [shots, POPS]);
  await b.close();
  const f1 = path.join(outDir, 'T571_랩_개울.png');
  fs.writeFileSync(f1, Buffer.from(png.split(',')[1], 'base64'));
  console.log('그림', f1);
  // 산 바위 구간 세 판 — land(PM 미리보기: 뭍에만 · 끊김) · foot(기슭에서 시작) · gorge(계곡으로 잇기)
  {
    const { b, p, errs } = await openLab('?stream=gorge&seed=7&terr=auto&pop=4&streamGuard=off');
    await p.addScriptTag({ content: SNAP });
    const r = await p.evaluate(() => {
      // 자리 고르기 — PM 판(land)에서 물에 안 닿는 조각 셀이 가장 많은 300×300 창(바위 구간 끊김이 잘 보이는 곳)
      const F = TR._stF, W = TR.water, R0 = TR.rockOrig, A = TR.streamA;
      const ML = streamMask(N, N, F, W, R0, A, 'land').mask;
      const lab = new Int32Array(N * N).fill(-1), frag = new Uint8Array(N * N), st = [];
      for (let i0 = 0; i0 < N * N; i0++) { if (!ML[i0] || lab[i0] >= 0) continue; lab[i0] = i0; st.length = 0; st.push(i0); const cells = []; let wet = false;
        while (st.length) { const j = st.pop(), x = j % N, y = (j / N) | 0; cells.push(j);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const k = yy * N + xx; if (W[k]) wet = true; else if (ML[k] && lab[k] < 0) { lab[k] = i0; st.push(k); } } }
        if (!wet) for (const j of cells) frag[j] = 1; }
      let best = null, bs = -1; const S = 300;
      for (let y = 150; y < N - 150; y += 50) for (let x = 150; x < N - 150; x += 50) { let c = 0; for (let yy = y - 150; yy < y + 150; yy += 2) for (let xx = x - 150; xx < x + 150; xx += 2) if (frag[yy * N + xx]) c++; if (c > bs) { bs = c; best = { x, y }; } }
      // 가까이 볼 자리 — 창 안에서 계곡 깎음이 가장 빽빽한 칸(바위 띠를 개울이 건너는 곳)
      const MG = streamMask(N, N, F, W, R0, A, 'gorge'); let cp = { x: best.x, y: best.y }, cs = -1;
      for (let y = best.y - 140; y < best.y + 140; y += 3) for (let x = best.x - 140; x < best.x + 140; x += 3) { if (!MG.carve[y * N + x]) continue; let c = 0; for (let yy = y - 10; yy <= y + 10; yy++) for (let xx = x - 10; xx <= x + 10; xx++) if (MG.carve[yy * N + xx]) c++; if (c > cs) { cs = c; cp = { x, y }; } }
      const shots = {};
      const show = (mode) => {   // 판을 바꿔 그린다(하네스 전용 — 랩 손잡이엔 land 가 없다)
        TR.rock.set(R0); const M = streamMask(N, N, F, W, R0, A, mode);
        if (mode === 'gorge') for (let i = 0; i < N * N; i++) if (M.carve[i]) TR.rock[i] = 0;
        TR.stream = M.mask; TR.carve = mode === 'gorge' ? M.carve : null; renderTerrain();
        const au = streamAudit(N, N, M.mask, W, F, {}); TR.streamAudit = au; _stM1 = null; _stRejAcc = new Set();   // 이 판의 점검 자 · 마을 계수기는 이 그림에서 뺀다
        shots[mode] = { img: __snap('main', best.x, best.y, S), near: __snap('main', cp.x, cp.y, 90), frag: au.frag, comps: au.comps, carve: M.nc };
      };
      for (const m of ['land', 'foot', 'gorge']) show(m);
      _stApply(); renderTerrain(); gen();
      return { best, cp, shots };
    });
    await b.close();
    const { b: b2, p: p2 } = await openLab('?stream=off&pop=4');
    const png2 = await p2.evaluate((r) => new Promise((done) => {
      const S = 600, PAD = 14, TOP = 74, L0 = 14, COLS = [['land', 'PM 미리보기 판 — 뭍에만(바위 구간 빠짐 → 끊긴 조각)'], ['foot', '기슭 — 물까지 바위 없는 개울만(산에서 시작)'], ['gorge', '계곡 — 바위 위도 잇고 둘레 한 칸 깎음(폭 + 2)']];
      const cv = document.createElement('canvas'); cv.width = L0 + COLS.length * (S + PAD); cv.height = TOP + 2 * S + 110;
      const g = cv.getContext('2d'); g.fillStyle = '#15181d'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#e8eef5'; g.font = 'bold 22px sans-serif'; g.fillText(`T571 산 바위 셀 구간 — 세 판(시드 7 · 강 · 300×300셀 · 가운데 ${r.best.x},${r.best.y} = PM 판 끊긴 조각이 가장 많은 창)`, L0, 32);
      let pending = 0;
      COLS.forEach(([k, name], ci) => {
        const s = r.shots[k]; pending++;
        const x0 = L0 + ci * (S + PAD);
        g.fillStyle = '#cfd6e0'; g.font = 'bold 15px sans-serif'; g.fillText(name, x0, TOP - 12);
        const im = new Image(); im.onload = () => { g.drawImage(im, x0, TOP, S, S); g.fillStyle = '#cfd6e0'; g.font = '14px sans-serif';
          g.fillText(`전 지도: 개울 성분 ${s.comps} · 물에 안 닿고 끊긴 조각 ${s.frag}` + (k === 'gorge' ? ` · 깎은 바위 ${s.carve}셀` : ''), x0, TOP + S + 22);
          if (--pending === 0) done(cv.toDataURL('image/png')); }; im.src = s.img;
        pending++; const im2 = new Image(); im2.onload = () => { const y2 = TOP + S + 60; g.drawImage(im2, x0, y2, S, S); g.fillStyle = '#9aa4b2'; g.font = '14px sans-serif';
          g.fillText(`가까이(90×90셀 · 가운데 ${r.cp.x},${r.cp.y} — 바위 띠를 개울이 건너는 곳)`, x0, y2 - 8);
          if (--pending === 0) done(cv.toDataURL('image/png')); }; im2.src = s.near;
      });
    }), r);
    await b2.close();
    const f2 = path.join(outDir, 'T571_계곡_기슭.png');
    fs.writeFileSync(f2, Buffer.from(png2.split(',')[1], 'base64'));
    console.log('그림', f2, '창', r.best);
    if (errs.length) console.log('오류', errs);
  }
}

// ── T584 개울 완충 ─────────────────────────────────────────────────────────
const GUARDS = ['off', 'guard', 'guard+tax'];
async function guardSweep(out) {
  let boards = process.env.T584_BOARDS
    ? process.env.T584_BOARDS.split(',').map((t) => { const [terr, sett, mode] = t.split(':'); return { terr, sett, mode }; })
    : [['auto', 'nucleated', 'gorge'], ['lake', 'nucleated', 'gorge'], ['coast', 'nucleated', 'gorge'], ['auto', 'dispersed', 'gorge'], ['lake', 'dispersed', 'gorge'], ['coast', 'dispersed', 'gorge'],
       ['auto', 'nucleated', 'foot'], ['lake', 'nucleated', 'foot'], ['coast', 'nucleated', 'foot']].map(([terr, sett, mode]) => ({ terr, sett, mode }));
  if (process.env.T584_SHARD) { const [k, n] = process.env.T584_SHARD.split('/').map(Number); boards = boards.filter((_, i) => i % n === k); }
  const res = [];
  for (const bd of boards) {
    const { b, p, errs } = await openLab(`?stream=${bd.mode}&seed=7&terr=${bd.terr}&pop=4`);
    const r = await p.evaluate(([sett, GUARDS]) => {
      document.getElementById('settType').value = sett;
      const out = {}, keep = [30, 100, 200];
      for (const g of GUARDS) {
        document.getElementById('stGuard').value = g; stUI(3);   // 완충 바꿈 → 서명이 바뀌어 래칫 리셋
        const rows = []; const worst = { houseSt: 0, nongSt: 0, batSt: 0, yardSt: 0, lotSt: 0, unseated: 0, unseated0: 0 }; let gapMinPath = 99;
        for (let pop = 4; pop <= 200; pop++) {
          document.getElementById('pop').value = pop; gen();
          const m = _stM1, m0 = _stM0;
          for (const k of ['houseSt', 'nongSt', 'batSt', 'yardSt', 'lotSt', 'unseated']) worst[k] = Math.max(worst[k], m[k]);
          worst.unseated0 = Math.max(worst.unseated0, m0.unseated); if (m.houses) gapMinPath = Math.min(gapMinPath, m.gapMin);
          if (keep.includes(pop)) rows.push({ pop, houses: m.houses, houses0: m0.houses, rej: _stRejAcc.size, rejG: _stRejAccG.size, unseated: m.unseated, unseated0: m0.unseated,
            rMax: m.rMax, rMean: m.rMean, rMax0: m0.rMax, rMean0: m0.rMean, fields: m.nong + m.bat, fields0: m0.nong + m0.bat, gapMin: m.gapMin, gapMed: m.gapMed, gh: m.gh,
            adj: m.adj, across: m.across, terr: m.terr, terrSt: m.terrSt, c1: m.cx + ',' + m.cy, c0: m0.cx + ',' + m0.cy });
        }
        out[g] = { rows, worst, gapMinPath, guardSel: TR.streamGuard };
      }
      return out;
    }, [bd.sett, GUARDS]);
    res.push({ ...bd, seed: 7, byGuard: r, errors: errs.slice() });
    const line = GUARDS.map((g) => { const z = r[g].rows.find((x) => x.pop === 100); return `${g}: 집 ${z.houses} · 거부 ${z.rej}/${z.rejG} · 못앉힘 ${z.unseated} · 반경 ${z.rMax} · 최소칸 ${z.gapMin >= 99 ? '–' : z.gapMin}`; }).join(' | ');
    console.log(`${bd.terr}/${bd.sett}/${bd.mode} 인구100 — ${line} | 오류 ${errs.length}`);
    await b.close();
  }
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  return res;
}
async function guardPic(outDir) {
  outDir = outDir || '/tmp';
  fs.mkdirSync(outDir, { recursive: true });
  const W = 230, POP = 100, shots = {};
  const { b, p, errs } = await openLab('?stream=gorge&seed=7&terr=auto&pop=4');
  await p.addScriptTag({ content: SNAP });
  for (const g of GUARDS) {
    shots[g] = await p.evaluate(([g, POP, W]) => {
      document.getElementById('stGuard').value = g; stUI(3);
      for (let pop = 4; pop <= POP; pop++) { document.getElementById('pop').value = pop; gen(); }
      const m = _stM1; return { img: __snap('main', m.cx, m.cy, W), m, rej: _stRejAcc.size, rejG: _stRejAccG.size };
    }, [g, POP, W]);
  }
  // ⑤ 나란한 두 개울(1셀 틈 ≥10셀) — 가장 긴 쌍 자리 확대
  shots.par = await p.evaluate(() => {
    const ps = (TR.streamAudit.parSites || []).slice().sort((a, b) => b[2] - a[2]); const q = ps[0];
    _stM1 = null; _stRejAcc = new Set(); _stRejAccG = new Set();   // 마을 계수기는 이 칸에서 뺀다
    return { img: __snap('main', q[0], q[1], 70), q, n: ps.length };
  });
  await b.close();
  const { b: b2, p: p2 } = await openLab('?stream=off&pop=4');
  const png = await p2.evaluate(([shots, GUARDS, W, POP]) => new Promise((done) => {
    const S = 520, PAD = 14, TOP = 128, L0 = 14, NAME = { off: '완충 끔 — 부지만 피함(T571)', guard: '완충 2칸 — 큰 물과 같은 원(PM 안 · 기본)', 'guard+tax': '완충 2칸 + 물가세(비교)' };
    const cols = GUARDS.concat(['par']);
    const cv = document.createElement('canvas'); cv.width = L0 + cols.length * (S + PAD); cv.height = TOP + S + 92;
    const g = cv.getContext('2d'); g.fillStyle = '#15181d'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#e8eef5'; g.font = 'bold 22px sans-serif'; g.fillText(`T584 개울 완충 — 같은 마을(시드 7 · 강 · 집촌 · 계곡) · 인구 ${POP}(4→${POP} 한 칸씩) · 칸 = 큰집을 가운데 둔 ${W}×${W}셀`, L0, 34);
    g.font = '15px sans-serif'; g.fillStyle = '#9aa4b2'; g.fillText('빨강 점선 = 부지에 개울이 들어 넘긴 집터(사유 개울) · 주황 점선 = 부지 +2칸 원에 개울이 들어 넘긴 집터(사유 개울 완충) · 개울-집 사이 칸 = 부지 가장자리부터 가장 가까운 개울 칸까지 빈 칸 수', L0, 60);
    g.fillText('넷째 칸 = 나란한 두 개울(1셀 틈으로 10셀 넘게 — T571 회부 8 · 랩 노랑 고리) 가운데 가장 긴 쌍 · 70×70셀', L0, 82);
    let pending = 0;
    cols.forEach((k, ci) => {
      const s = shots[k], x0 = L0 + ci * (S + PAD); pending++;
      g.fillStyle = '#cfd6e0'; g.font = 'bold 16px sans-serif'; g.fillText(k === 'par' ? `나란한 두 개울 — 가장 긴 쌍(${s.q[2]}칸 · ${s.q[0]},${s.q[1]}) · 전 지도 ${s.n}쌍` : NAME[k], x0, TOP - 8);
      const im = new Image(); im.onload = () => {
        g.drawImage(im, x0, TOP, S, S); g.fillStyle = '#cfd6e0'; g.font = '14px sans-serif';
        if (k !== 'par') { const m = s.m, gh = m.gh;
          g.fillText(`집 ${m.houses}채 · 거부 집터 개울 ${s.rej} · 개울 완충 ${s.rejG} · 못 앉힌 사람 ${m.unseated}`, x0, TOP + S + 22);
          g.fillText(`집 반경 최대 ${m.rMax}(평균 ${m.rMean}) · 논밭 ${(m.nong + m.bat).toLocaleString()}셀`, x0, TOP + S + 42);
          g.fillText(`개울-집 사이 칸 최소 ${m.gapMin >= 99 ? '–' : m.gapMin} · 0칸 ${gh.g0} · 1칸 ${gh.g1} · 2칸 ${gh.g2} · 3~5 ${gh.g3_5} · 6~10 ${gh.g6_10} · 그 넘어 ${gh.gFar}`, x0, TOP + S + 62); }
        else g.fillText('두 가지가 합류 직전 1셀 틈으로 붙어 흐른다 — 어색하면 처방(새 규칙 = 재민 판정)', x0, TOP + S + 22);
        if (--pending === 0) done(cv.toDataURL('image/png'));
      }; im.src = s.img;
    });
  }), [shots, GUARDS, W, POP]);
  await b2.close();
  const f = path.join(outDir, 'T584_개울완충.png');
  fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
  console.log('그림', f, '나란한 쌍', shots.par.q, '/', shots.par.n);
  if (errs.length) console.log('오류', errs);
}

const cmd = process.argv[2] || 'audit';
(async () => {
  if (cmd === 'audit') audit(process.argv[3]);
  else if (cmd === 'sweep') await sweep(process.argv[3]);
  else if (cmd === 'pics') await pics(process.argv[3]);
  else if (cmd === 'xval') xval();
  else if (cmd === 'guard') await guardSweep(process.argv[3]);
  else if (cmd === 'guardpic') await guardPic(process.argv[3]);
  else { console.log('쓰임: audit|sweep|pics|xval|guard|guardpic'); process.exit(2); }
})().catch((e) => { console.error(e); process.exit(1); });
