#!/usr/bin/env node
// ⓒ **뚫은 통로 안** — 시야 가림 투명화가 통로에서 어떻게 나오는지 그림으로 증명한다.
//   앞 벽(내 z보다 큰 띠)은 흐려지고, 뒤 벽(작은 띠)은 불투명하게 남고, 통로 속 플레이어가 보인다.
//
// ★통로는 **정본 부수기**(__mtDestroy)로 실제로 판다. 텔레포트로 기존 빈틈에 서지 않는다.
// ★"가장자리에서만 판다" 규칙은 **정본 술어**(__mtIsRock)로 매 삽마다 검사하고,
//   어기면 조용히 거르지 않고 **개수로 보고**한다(전례: 봉우리 3×3 채석 사건).
//
// 왜 −i 로 파는가
//   z = (wx+wy)/2 이고 z 가 큰 띠가 나중에(=앞에) 그려진다. 통로를 −i 로 파면
//   남쪽 옆벽 (i,j+1) 은 i+j 가 나보다 크므로 **앞 벽**, 북쪽 옆벽 (i,j−1) 은 **뒤 벽**이 된다.
//   즉 한 자리에서 앞·뒤가 동시에 보인다.
const path = require('path'), fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/corr'; fs.mkdirSync(OUT, { recursive: true });
const DEPTH = +(process.env.DEPTH || 6);
const sleep = (m) => new Promise(r => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

// ── 통로 자리 고르기 (정본 술어로) ────────────────────────────────────────
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZID = 'hanbando';
const rock = (i, j) => T.isRockCellLocal(ZID, i * 32 + 16, j * 32 + 16);
const water = (i, j) => T.isWaterCellLocal(ZID, i * 32 + 16, j * 32 + 16);
function pickSite() {
  // ★★[MT3_PAD 라운드 실측 2026-08-22] PAD 추정은 **기각됐다**(scripts/probe-mtpad.js):
  //   산괴 최심부 h = 40.5m, 격자의 28.9%가 30m 초과, 청크 경계 단차도 없다(비 0.85배).
  //   앞선 통로가 3~7m 였던 건 창 잘림이 아니라 **얇은 자락에 팠기 때문**이었다.
  //   ⇒ 자리를 '가장자리에서 가까운 곳'이 아니라 **가장자리에서 가장 먼 곳**으로 고른다.
  //     삽질이 길어지지만(수십 칸) 그건 프로그램이 하면 된다.
  const I0 = 1740, J0 = 0, W = 520, H = 720;
  const R = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) R[j * W + i] = rock(I0 + i, J0 + j) ? 1 : 0;
  const INF = 1e6, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = R[k] ? INF : 0;
  // ★★[계측기 수리] 창 밖을 INF(=미해결 바위)로 봤다. 그러면 창 **가장자리 셀**의 거리가
  //   바깥 땅에 안 잘려 부풀고, "최심부"로 뽑힌다. 실제로 j=719(창 맨 아랫줄)가 dE 47.4 로
  //   뽑혔고 가 보니 맨땅이었다. ⇒ 창 밖은 **땅(0)** 으로 본다(깊이의 하한이 된다).
  //   그리고 테두리에서 60셀 안쪽 셀만 후보로 삼는다 — 창에 잘린 값을 최댓값으로 못 쓰게.
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : d[j * W + i];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i-1,j)+1, at(i,j-1)+1, at(i-1,j-1)+1.414, at(i+1,j-1)+1.414); }
  for (let j = H-1; j >= 0; j--) for (let i = W-1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i+1,j)+1, at(i,j+1)+1, at(i+1,j+1)+1.414, at(i-1,j+1)+1.414); }
  let best = 0, bi = 0, bj = 0;
  const MG = 60;
  for (let j = MG; j < H - MG; j++) for (let i = MG; i < W - MG; i++) {
    const v = d[j * W + i];
    if (v < 1e5 && v > best) { best = v; bi = I0 + i; bj = J0 + j; }
  }
  let wd = 0; while (wd < 120 && rock(bi - wd - 1, bj)) wd++;   // 서쪽 가장자리까지
  return { i: bi, j: bj, wd, dE: +best.toFixed(1) };
}

const M = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
  const step=()=>{const n=performance.now();t.push(n-last);last=n;
    if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);
      res({med:+s[s.length>>1].toFixed(2)});}};requestAnimationFrame(step);})`;

(async () => {
  const site = pickSite();
  if (!site) { console.error('통로 자리를 못 찾았다'); process.exit(1); }
  const tgt = { i: site.i, j: site.j };                       // 플레이어가 설 통로 끝(안쪽)
  const digCells = [];
  for (let k = site.wd; k >= 0; k--) digCells.push([site.i - k, site.j]);   // 가장자리 → 안쪽
  console.log('플레이어 자리', tgt, '· 가장자리 거리 dE', site.dE, '· 서쪽까지', site.wd, '셀 · 삽질', digCells.length, '칸');

  fs.writeFileSync('/tmp/zw-corr.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-corr.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/corr.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: tgt.i * 32 + 16, y: tgt.j * 32 + 16, name: '통로' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);

  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windForce = 0;
    window.__terrain19.natOff = true; window.__terrain19.propOff = true; window.__terrain19.decoOff = true; });
  await sleep(2500);
  await pg.screenshot({ path: path.join(OUT, 'A_부수기전.png') });

  // ── 삽질 — 입구부터 한 셀씩. 매 삽마다 정본 술어로 '가장자리인가'를 확인한다 ──
  const dig = await pg.evaluate((cells) => {
    const out = { dug: 0, illegal: 0, steps: [] };
    for (const [i, j] of cells) {
      const isRock = window.__mtIsRock(i, j);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => window.__mtIsRock(i + dx, j + dy) === false);
      if (!isRock || !edge) { out.illegal++; out.steps.push({ i, j, isRock, edge, ok: false }); continue; }
      window.__mtDestroy([[i, j]]); out.dug++; out.steps.push({ i, j, ok: true });
    }
    return out;
  }, digCells);
  console.log('삽질:', JSON.stringify(dig).slice(0, 400));
  await sleep(4000);
  await pg.screenshot({ path: path.join(OUT, 'B_통로_투명화켬.png') });
  const on = await pg.evaluate(() => window.__mtOccDbg);

  // ── ⑶ 마스크 이원화 짝 — 같은 통로에서 옛 판(도랑) vs 새 판(협곡) ──
  for (const [tag, dual] of (process.env.FAST ? [] : [['D_옛판_도랑', 0], ['D_새판_협곡', 1]])) {
    await pg.evaluate((v) => window.__mtDual(v), dual);
    await sleep(5000);
    await pg.screenshot({ path: path.join(OUT, tag + '.png') });
    console.log('  이원화', dual, '→', tag);
  }
  // 통로 옆벽이 실제로 몇 m 로 서는지 — 정본 높이장에서 직접 읽는다
  const wall = await pg.evaluate((a) => {
    const out = {};
    for (const d of [0, 1]) {
      window.__mtDual(d);
      out[d] = window.__mtHeightAt ? [window.__mtHeightAt(a.i, a.j - 1), window.__mtHeightAt(a.i, a.j + 1)] : null;
    }
    window.__mtDual(1);
    return out;
  }, { i: tgt.i, j: tgt.j });
  console.log('  통로 옆벽 높이(m) 옛판/새판 =', JSON.stringify(wall));

  // ── 편향 스윕 — 가림 판정의 플레이어 z 편향을 줄이며 그림·발동률을 함께 잰다 ──
  //   z 32 = 한 축 2셀. 500 = 현행(31셀).
  const sweep = [];
  for (const zb of (process.env.FAST ? [] : (process.env.ZBS || '500,96,48,0').split(',').map(Number))) {
    await pg.evaluate((v) => window.__mtZOcc(v), zb);
    await sleep(1600);
    const d = await pg.evaluate(() => window.__mtOccDbg);
    // 이 자리에서 fade 가 켜지나 + 주변 961자리 발동률
    const rate = await pg.evaluate(() => {
      const me = window.__getMyAbs(); let hit = 0, tot = 0;
      for (let dx = -30; dx <= 30; dx += 2) for (let dy = -30; dy <= 30; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r) continue; tot++; if (r.n > 0) hit++;
      }
      return { hit, tot, pct: tot ? +(hit / tot * 100).toFixed(1) : 0 };
    });
    await pg.screenshot({ path: path.join(OUT, `Z_${zb}.png`) });
    sweep.push({ zb, n: d.n, fade: d.fade, front: d.front, rate: rate.pct });
    console.log(`  편향 ${String(zb).padStart(3)} → 가림 ${d.n}장 · 알파진행 ${d.fade} · 앞 띠 ${d.front} · 주변 발동률 ${rate.pct}%`);
  }
  await pg.evaluate(() => window.__mtZOcc(500)); await sleep(800);

  await pg.evaluate(() => { window.__terrain19.occOff = true; }); await sleep(1500);
  await pg.screenshot({ path: path.join(OUT, 'C_통로_투명화끔.png') });
  const off = await pg.evaluate(() => window.__mtOccDbg);
  await pg.evaluate(() => { window.__terrain19.occOff = false; }); await sleep(1500);

  // 띠별 앞/뒤 흐림 표시 — 정본 그리기 경로에서
  await pg.evaluate(() => window.__mt3Rects(true)); await sleep(700);
  const rects = await pg.evaluate(() => {
    const me = window.__getMyAbs(); const mz = (me.x + me.y) * 0.5 + 500;
    const r = window.__mt3RectsGet() || [];
    const f = r.filter(x => x.z > mz), b = r.filter(x => x.z <= mz);
    return { front: f.length, frontFaded: f.filter(x => x.faded).length,
             back: b.length, backFaded: b.filter(x => x.faded).length };
  });
  await pg.evaluate(() => window.__mt3Rects(false));

  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(() => window.__mtDbg)));
  // 갈색 자리를 덮는 띠가 있나 — 정본 그리기 경로가 남긴 사각형으로 직접 묻는다
  await pg.evaluate(() => window.__mt3Rects(true)); await sleep(700);
  const cover = await pg.evaluate(() => {
    const r = window.__mt3RectsGet() || [];
    const pts = [[700,700],[900,600],[500,750],[700,436]];
    return pts.map(([x,y]) => ({ x, y, n: r.filter(q => x>=q.x && x<q.x+q.w && y>=q.y && y<q.y+q.h).length }));
  });
  await pg.evaluate(() => window.__mt3Rects(false));
  console.log('띠가 덮는가 =', JSON.stringify(cover));
  await pg.screenshot({ path: path.join(OUT, 'P_probe.png') });   // 프로브와 **같은 순간**의 그림
  const paint = await pg.evaluate(() => [[700,700],[900,600],[500,750],[700,436],[700,300]]
    .map(([x,y]) => ({ x, y, r: window.__mtPaintAt(x, y) })));
  for (const q of paint) console.log(`  (${q.x},${q.y}) 덮음 ${q.r.cover} · **칠함 ${q.r.paint}** · 예: ${JSON.stringify(q.r.hits.slice(0,2))}`);
  // ── 단계별 화소 — **같은 프레임 안**에서 어느 패스가 그 점을 바꾸는가 ──────────
  //   스크린샷 대조는 프레임이 어긋난다. 정본 ctx 를 A~F 여섯 단계에서 같은 점으로 읽는다.
  //   ★자명 통과 금지 — 대조군 둘을 같이 잰다:
  //     ⓐ 산 끄기(mtOff): C→D 가 **모든 점에서 변하지 않아야** 한다(변하면 계측기가 산을 못 보는 것).
  //     ⓑ 산 켜기: 산이 분명히 칠하는 점에서는 C→D 가 **반드시 변해야** 한다.
  const PTS = [[700, 700], [900, 600], [500, 750], [700, 436], [700, 300], [700, 450]];
  const stageRun = async (tag) => {
    await pg.evaluate((pts) => window.__mtStage(pts), PTS);
    await sleep(1400);
    const lg = await pg.evaluate(() => window.__mtStageGet());
    await pg.evaluate(() => window.__mtStage(null));
    console.log(`── 단계별 화소 [${tag}]`);
    if (!lg) { console.log('  (로그 없음)'); return null; }
    for (let k = 0; k < PTS.length; k++) {
      const row = lg.map(r => `${r.s}=${(r.px[k] || []).slice(0, 3).join(',')}`).join('  ');
      console.log(`  (${PTS[k][0]},${PTS[k][1]})  ${row}`);
    }
    return lg;
  };
  const stgOn = await stageRun('산 켬');
  await pg.evaluate(() => { window.__terrain19.mtOff = true; }); await sleep(2500);
  const stgOff = await stageRun('산 끔(대조군)');
  await pg.evaluate(() => { window.__terrain19.mtOff = false; }); await sleep(2500);
  // 판정: C→D 가 바뀐 점 수 (산 켬 > 0, 산 끔 == 0 이어야 계측기가 옳다)
  const dCD = (lg) => { if (!lg) return null; const C = lg.find(r => r.s.startsWith('C_')), D = lg.find(r => r.s.startsWith('D_'));
    if (!C || !D) return null; let n = 0; for (let k = 0; k < PTS.length; k++) {
      const a = C.px[k] || [], b = D.px[k] || []; if (a.join() !== b.join()) n++; } return n; };
  console.log(`판정 C→D 변한 점: 산 켬 ${dCD(stgOn)}/${PTS.length} · 산 끔(대조) ${dCD(stgOff)}/${PTS.length}`);

  // ── 구멍 자리 추적 — **흐림을 끈 상태**에서 지면색으로 남은 점을 찾아 "어느 셀이 덮었어야 하나"를 묻는다
  //   ★대조군 필수: 같은 계측기를 **산이 분명히 칠한 초록 점**에도 돌린다. 거기서 hit=0 이 나오면
  //     계측기가 틀린 것이지 구멍이 있는 게 아니다.
  await pg.evaluate(() => { window.__terrain19.occOff = true; }); await sleep(2500);
  const gap = await pg.evaluate(() => {
    const cv = document.querySelector('canvas'); const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const d = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };
    const okZone = (x, y) => x > 60 && y > 150 && y < H - 60 && !(x > 1000 && y < 280) && !(x > 1240 && y > 780);
    const brown = [], green = [];
    for (let y = 160; y < H - 60; y += 7) for (let x = 60; x < W - 20; x += 7) {
      if (!okZone(x, y)) continue;
      const [r, gg, b] = at(x, y);
      if (r > gg + 6 && r > 90 && b < r - 12) { if (brown.length < 400) brown.push([x, y, [r, gg, b]]); }
      else if (gg > r + 12 && gg > 35) { if (green.length < 400) green.push([x, y, [r, gg, b]]); }
    }
    const pick = (a, n) => { const o = []; for (let k = 0; k < n && a.length; k++) o.push(a[Math.floor(k * (a.length - 1) / Math.max(1, n - 1))]); return o; };
    const res = { brownN: brown.length, greenN: green.length, q: [] };
    for (const [x, y, c] of pick(brown, 4)) res.q.push({ kind: '갈색', x, y, c, w: window.__mtWhoCovers(x, y), p: window.__mtPaintAt(x, y) });
    for (const [x, y, c] of pick(green, 2)) res.q.push({ kind: '초록(대조)', x, y, c, w: window.__mtWhoCovers(x, y), p: window.__mtPaintAt(x, y) });
    return res;
  });
  console.log(`── 구멍 추적 (흐림 끔) · 갈색 화소 ${gap.brownN} · 초록 ${gap.greenN}`);
  for (const q of gap.q) {
    const hs = (q.w && q.w.hit || []).slice(0, 3).map(h => `(${h.i},${h.j}) h=${h.h}${h.cut ? ' 파냄' : ''}`).join(' ');
    console.log(`  ${q.kind} (${q.x},${q.y}) rgb=${q.c}  덮어야 할 셀 ${q.w ? q.w.hit.length : '?'}장 [${hs}] · 실제 칠함 ${q.p ? q.p.paint : '?'}/${q.p ? q.p.cover : '?'}`);
  }
  // 청크 굽기가 끝날 때까지 기다린다 — 예산이 프레임당 1청크라 몇 초로는 화면이 안 찬다.
  //   (안 기다리면 **굽기 지연을 결과로** 읽는다 — 앞선 A/B 가 그래서 "차이 0"이 나왔다.)
  const settle = async (maxMs = 90000) => {
    let last = -1, same = 0, t = 0;
    while (t < maxMs) {
      await sleep(2000); t += 2000;
      const d = await pg.evaluate(() => { const q = window.__mtDbg; return [q.mt3chunks, q.segs]; });
      const k = d.join(',');
      // ★0 에서 멈춘 걸 '안정'으로 읽으면 안 된다 — 굽기가 아직 시작도 안 한 것이다(실측 사고).
      if (k === last && d[1] > 0) { if (++same >= 3) return { ms: t, chunks: d[0], segs: d[1] }; }
      else { same = 0; last = k; }
    }
    return { ms: t, timeout: true };
  };
  // ── 덤프 — 정본 높이장·바위 마스크·카메라를 내보내 **오프라인에서 덮개를 래스터화**한다.
  //   화면 어디가 "표면이 아예 안 닿는 자리"인지 그림으로 봐야 기하를 옳게 얹는다.
  if (process.env.DUMP) {
    const st0 = await settle();
    const dump = await pg.evaluate((t) => {
      const R = 130, i0 = t.i - R, j0 = t.j - R, W = R * 2 + 1;
      const hg = window.__mtHeightGrid(i0, j0, W, W);
      const rk = []; for (let j = 0; j < W; j++) { const row = [];
        for (let i = 0; i < W; i++) row.push(window.__mtIsRock(i0 + i, j0 + j) ? 1 : 0); rk.push(row.join('')); }
      const cv = document.querySelector('canvas');
      return { i0, j0, W, h: Array.from(hg), rock: rk, me: window.__getMyAbs(),
               pl: { x: t.i * 32 + 16, y: t.j * 32 + 16 }, cw: cv.width, ch: cv.height, dbg: window.__mtDbg };
    }, tgt);
    fs.writeFileSync(path.join(OUT, 'dump.json'), JSON.stringify(dump));
    await pg.screenshot({ path: path.join(OUT, 'DUMP.png') });
    console.log(`덤프 저장 (굽기 안정 ${st0.ms}ms · 청크 ${st0.chunks} · 띠 ${st0.segs}) · 격자 ${dump.W}`);
  }
  // ── 띠 여백 A/B — "덮개는 100%인데 지면색이 13.6%" 를 가른다 ────────────────
  //   ★가설: 띠 상자를 **꼭짓점 4개(F.cor)** 로만 잡는데, 실제로 그리는 건 6×6 세분된
  //     조각을 **corS(Catmull-Rom)** 로 밀어 올린 것이다. 9m 시절 ±13px 여유(MPAD 18)로
  //     충분했지만 35m 에서는 밀림이 ~4배다. 상자 밖으로 나간 조각이 잘려 **구멍**이 된다.
  //   ★판정: 지면색(106,95,82) **정확 일치** 화소의 비율. 여백을 키워 이 값이 떨어지면 가설이 맞다.
  //     ─ 반례: 여백을 키워도 안 변하면 상자 잘림이 아니다(그 자리에서 가설을 버린다).
  const groundPct = async () => pg.evaluate(() => {
    const cv = document.querySelector('canvas'); const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
    let ex = 0, tot = 0;
    for (let y = 160; y < H - 60; y += 2) for (let x = 60; x < W - 20; x += 2) {
      if ((x > 1000 && y < 280) || (x > 1240 && y > 780)) continue;
      const k = (y * W + x) * 4; tot++;
      if (Math.abs(d[k] - 106) < 4 && Math.abs(d[k+1] - 95) < 4 && Math.abs(d[k+2] - 82) < 4) ex++;
    }
    return { ex, tot, pct: +(ex / tot * 100).toFixed(2) };
  });
  // ── 치마 A/B — 안정될 때까지 기다린 뒤 **지면색 정확 일치** 비율로 판정한다 ──────
  const skirtAB = [];
  for (const v of (process.env.SKIRTS || '0,0.30').split(',').map(Number)) {
    await pg.evaluate((q) => window.__mt3skirt(q), v);
    const st = await settle();
    const r = await groundPct();
    const nq = await pg.evaluate(() => window.__mt3skirtN());
    await pg.screenshot({ path: path.join(OUT, `S_치마_${v}.png`) });
    skirtAB.push({ v, ...r, ...nq, settle: st.ms, segs: st.segs });
    console.log(`  치마 ${v} → 지면색 ${r.ex}/${r.tot} = ${r.pct}% · 쿼드 ${nq.quads}/${nq.blanket} (절감 ${nq.save}%) (굽기 ${st.ms}ms · 띠 ${st.segs})`);
  }
  await pg.evaluate(() => window.__mt3skirt(0));
  // ── GPU 판 vs 캔버스 폴리곤 판 — **래스터라이저를 통째로 갈아 끼우는** 반례 장치.
  //   같은 셀 집합을 전혀 다른 방식으로 그린다. 리본이 사라지면 원인은 GL 경로에 있고,
  //   남으면 원인은 '그리는 방법'이 아니라 '그릴 셀 집합'에 있다.
  // ── 거리장 여유(MT3_PAD) A/B — 청크마다 dE 를 자기 창에서만 푼다. 산 깊은 곳은
  //   창 안에 비바위가 없어 dE=INF(=마루 높이)가 되고, 창에 비바위가 걸리는 이웃 청크는
  //   같은 자리를 **낮게** 푼다. 그 단차가 리본이라는 가설의 반례 장치.
  const padAB = [];
  for (const pd of (process.env.PADS || '12,28,48').split(',').map(Number)) {
    await pg.evaluate((v) => window.__mt3pad(v), pd);
    const st = await settle(120000);
    const r = await groundPct();
    await pg.screenshot({ path: path.join(OUT, `P_여유_${pd}.png`) });
    padAB.push({ pd, ...r, settle: st.ms, segs: st.segs });
    console.log(`  거리장여유 ${pd} → 지면색 ${r.ex}/${r.tot} = ${r.pct}% (굽기 ${st.ms}ms · 띠 ${st.segs})`);
  }
  await pg.evaluate(() => window.__mt3pad(12));
  const glAB = [];
  for (const g of (process.env.SKIPGL ? [] : [1, 0, 1])) {
    await pg.evaluate((v) => window.__mt3gl(v), g);
    const st = await settle();
    const r = await groundPct();
    await pg.screenshot({ path: path.join(OUT, `G_gl_${g}_${glAB.length}.png`) });
    glAB.push({ g, ...r, settle: st.ms, segs: st.segs });
    console.log(`  GL ${g} → 지면색 ${r.ex}/${r.tot} = ${r.pct}% (굽기 ${st.ms}ms · 띠 ${st.segs})`);
  }
  // ── 수집 창 A/B — 리본이 **수집 범위** 탓인지 가른다(반례 장치) ──────────────
  const viewAB = [];
  for (const [vw, ht] of [[2400, 54.25], [6000, 120], [12000, 240]]) {
    await pg.evaluate((a) => { window.__mt3view(a[0]); window.__mt3htop(a[1]); }, [vw, ht]);
    const st = await settle();
    const r = await groundPct();
    const db = await pg.evaluate(() => window.__mtDbg);
    await pg.screenshot({ path: path.join(OUT, `V_창_${vw}.png`) });
    viewAB.push({ vw, ht, ...r, chunks: db.mt3chunks, segs: db.segs, settle: st.ms });
    console.log(`  창 ${vw}/${ht} → 지면색 ${r.pct}% · 청크 ${db.mt3chunks} · 띠 ${db.segs} (굽기 ${st.ms}ms)`);
  }
  await pg.evaluate(() => { window.__mt3view(2400); window.__mt3htop(35 * 1.55); });
  const mpadAB = [];
  for (const mp of (process.env.MPADS || '').split(',').filter(Boolean).map(Number)) {
    await pg.evaluate((v) => window.__mt3mpad(v), mp);
    const st = await settle();
    const r = await groundPct();
    await pg.screenshot({ path: path.join(OUT, `M_여백_${mp}.png`) });
    mpadAB.push({ mp, ...r, settle: st.ms, segs: st.segs });
    console.log(`  여백 ${String(mp).padStart(3)} → 지면색 ${r.ex}/${r.tot} = ${r.pct}% (굽기 ${st.ms}ms · 띠 ${st.segs})`);
  }
  await pg.evaluate(() => window.__mt3mpad(18));
  // ── 리본 추적 — 안정된 화면에서 **지면색 리본**을 뽑아, 정본 그리기 경로가 남긴
  //   사각형(__mt3Rects)이 그 자리를 덮는지 묻는다. 덮는데 안 칠하면 '칠하기' 문제,
  //   아예 안 덮으면 '수집/굽기' 문제다. 둘은 고쳐야 할 곳이 다르다.
  //   ★대조군: 같은 방식으로 뽑은 **초록(산) 점**도 같이 묻는다.
  {
    await settle();
    await pg.evaluate(() => window.__mt3Rects(true)); await sleep(900);
    const rib = await pg.evaluate(() => {
      const cv = document.querySelector('canvas'); const g = cv.getContext('2d');
      const W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
      const at = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };
      const isG = (c) => Math.abs(c[0]-106) < 4 && Math.abs(c[1]-95) < 4 && Math.abs(c[2]-82) < 4;
      const gp = [], mp = [];
      for (let y = 170; y < H - 70; y += 11) for (let x = 70; x < W - 30; x += 11) {
        if ((x > 1000 && y < 280) || (x > 1240 && y > 780)) continue;
        const c = at(x, y);
        if (isG(c)) gp.push([x, y]); else if (c[1] > c[0] + 12) mp.push([x, y]);
      }
      const R = window.__mt3RectsGet() || [];
      const cover = (x, y) => R.filter(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h).length;
      const take = (a, n) => { const o = []; for (let k = 0; k < n && a.length; k++) o.push(a[Math.floor(k * (a.length - 1) / Math.max(1, n - 1))]); return o; };
      const row = (kind, a) => take(a, 6).map(([x, y]) => {
        const pa = window.__mtPaintAt(x, y);
        return { kind, x, y, rect: cover(x, y), paint: pa ? pa.paint : -1, cov: pa ? pa.cover : -1 };
      });
      return { nG: gp.length, nM: mp.length, rects: R.length, q: row('지면색', gp).concat(row('산색(대조)', mp)) };
    });
    await pg.evaluate(() => window.__mt3Rects(false));
    console.log(`── 리본 추적 · 지면색 표본 ${rib.nG} · 산색 ${rib.nM} · 그린 사각형 ${rib.rects}`);
    for (const q of rib.q) console.log(`  ${q.kind} (${q.x},${q.y}) 그린사각형 ${q.rect}장 · 띠덮음 ${q.cov} · **칠함 ${q.paint}**`);
  }
  await pg.evaluate(() => { window.__terrain19.occOff = false; }); await sleep(1500);

  console.log('가림 상태 켬 =', JSON.stringify(on));
  console.log('가림 상태 끔 =', JSON.stringify(off));
  console.log('띠 흐림 =', JSON.stringify(rects));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ site, tgt, dig, on, off, rects, sweep, gap, mpadAB, skirtAB, viewAB, glAB, padAB }, null, 1));
  console.log('저장:', OUT);
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0);
})().catch(e => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) {} } process.exit(1); });
