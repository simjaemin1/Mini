#!/usr/bin/env node
// =============================================================================
// 산 부수기 퍼저 — "모든 경우에 자연스러운가" [재민 2026-08-07]
//
// 재민: *"유저가 산을 어떤 모양으로 부수느냐에 따라서도 경우의 수가 엄청 많은데..
//        모든 경우에 자연스러워야 하잖아.. 다 검증할 수 있어?"*
//
// ★정직한 답: **전수는 불가능하다.** 셀이 n 개면 부수는 모양은 2^n 가지다.
//   대신 "자연스럽다"를 **깨질 수 있는 성질 몇 개**로 바꾸면 검증할 수 있다.
//   모양은 무작위로 계속 만들어 두들기고, 매 단계마다 그 성질을 전부 확인한다.
//   성질이 한 번도 안 깨지면 "모든 모양에서 참"은 아니어도 **반례를 열심히 찾았는데 없었다**가 된다.
//   그게 이 종류의 문제에서 낼 수 있는 가장 강한 답이다.
//
// 검사하는 성질 (매 부수기 직후)
//   P1 연속성 — 한 번에 부순 셀 수에 비례하는 만큼만 그림이 바뀐다. **팝 금지.**
//               (봉우리 배율이 0 으로 뚝 떨어지는 것이 팝. 문턱을 없앤 이유가 이것이다.)
//   P2 단조성 — 부술수록 산은 작아지기만 한다. 갑자기 커지지 않는다.
//   P3 국소성 — 부순 자리에서 먼 곳의 그림은 **한 화소도** 안 바뀐다.
//   P4 덮개   — 남은 바위 셀은 여전히 전부 산 아래 (①≈0).
//   P5 정합   — 부순 셀(이제 평지)에 산이 남아 있지 않다 (②가 안 는다).
//   P6 결정론 — 같은 마스크면 같은 그림. 두 프레임 동일.
//
// 부수는 모양 (무작위 씨앗 · 재현 가능)
//   겉면 잠식 · 한 줄 절개 · 톱니 · 반점 · 큰 한 입 · 좁은 목 만들기
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: +(process.env.CX || 1750), cy: +(process.env.CY || 74) };
const STEPS = +(process.env.STEPS || 14);
const SEED = +(process.env.SEED || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}${d ? '  — ' + d : ''}`); } else { fail++; console.log(`  ✗ ${n}${d ? '  — ' + d : ''}`); } };
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zw-fz.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
// 재현 가능한 난수 — Math.random 금지(같은 씨앗이면 같은 실패를 다시 만들 수 있어야 한다)
let _rs = SEED >>> 0;
const rnd = () => { _rs = (Math.imul(_rs ^ (_rs >>> 15), 2246822507) ^ 0x9e3779b9) >>> 0; return _rs / 4294967296; };
function diff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    s += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  }
  return t ? s / t : 0;
}

(async () => {
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('/tmp/zw-fz.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/fz.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.log('zone 기동 실패'); process.exit(1); }
  await sleep(4000);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(24000);

  // ★[환경 방어] 롤백된 옛 코드로 재고 통과시키면 안 된다
  const fresh = await pg.evaluate(() => ({ fit: window.__terrain19 && window.__terrain19.fitOff !== undefined, spill: typeof window.__mtSpillAt === 'function' }));
  if (!fresh.fit || !fresh.spill) { console.log(`\n★★낡은 코드다 ${JSON.stringify(fresh)} — git checkout -B main origin/main 후 다시.`); await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(2); }

  // ★바람을 끈다 — 배치 21 의 바람 흔들림이 매 프레임 화면 전체를 움직여서
  //   P3(국소성)·P6(결정론)이 **산과 무관하게** 깨진다. 재는 대상만 남긴다.
  //   ⚠이건 판정 완화가 아니라 **변인 분리**다: 바람을 끈 상태에서 P6 이 통과해야
  //     "남은 차이는 전부 산 때문"이라고 말할 수 있다.
  await pg.evaluate(() => { window.__terrain19.windOff = true; });
  await sleep(1200);
  const shot = async () => { const p2 = '/tmp/fz.png'; await pg.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const cam = await pg.evaluate(() => window.__camCellLocal());
  const dead = new Set();

  // 화면 안 그림 상태 — 봉우리 배율 · 세그먼트 · 두 수치
  const snap = async () => pg.evaluate((o) => {
    const dd = new Set(o.dead);
    const segs = (window.__mtProbe() || []).filter((g) => Math.abs(g.lcx - o.a) <= 20 && Math.abs(g.lcy - o.b) <= 20);
    const sc = segs.map((g) => g.sc).sort((p, q) => q - p);
    let rock = 0, bareCand = 0, spill = 0, land = 0;
    for (let dx = -18; dx <= 18; dx++) for (let dy = -18; dy <= 18; dy++) {
      const a = o.a + dx, b = o.b + dy, k = window.__tileStateAt(a, b).kind;
      if (k === 'water') continue;
      const isRock = k === 'rock' && !dd.has(a + '_' + b);
      const sp = window.__mtSpillAt(a, b);
      if (isRock) { rock++; if (!sp || !sp.cov) bareCand++; }
      else { land++; if (sp && sp.cov > 0) spill++; }
    }
    return { n: segs.length, max: sc.length ? +sc[0].toFixed(2) : 0,
      bare: rock ? +(bareCand / rock * 100).toFixed(1) : 0,
      spill: land ? +(spill / land * 100).toFixed(1) : 0, rock, land,
      // 세그먼트 지문 — 자리·이름·배율·높이. 국소성 판정이 이걸 비교한다.
      fp: segs.map((g) => [g.lcx, g.lcy, g.nm, +g.sc.toFixed(2), +g.vy.toFixed(2)]) };
  }, { a: cam[0], b: cam[1], dead: [...dead] });

  // 부수는 모양 — 겉면 셀 중에서 고른다(겉면 규칙)
  const face = async (n, mode) => pg.evaluate((o) => {
    const dd = new Set(o.dead);
    const isRock = (a, b) => window.__tileStateAt(a, b).kind === 'rock' && !dd.has(a + '_' + b);
    const out = [];
    for (let dx = -20; dx <= 20; dx++) for (let dy = -20; dy <= 20; dy++) {
      const a = o.a + dx, b = o.b + dy;
      if (!isRock(a, b)) continue;
      if (isRock(a + 1, b) && isRock(a - 1, b) && isRock(a, b + 1) && isRock(a, b - 1)) continue;
      out.push({ a, b, dx, dy });
    }
    if (!out.length) return [];
    if (o.mode === 'bite') {                    // 큰 한 입 — 한 점 주변을 뭉텅이로
      const c = out[o.pick % out.length];
      return out.filter((v) => Math.hypot(v.a - c.a, v.b - c.b) <= o.rr).slice(0, o.n).map((v) => [v.a, v.b]);
    }
    if (o.mode === 'line') {                    // 한 줄 절개
      const c = out[o.pick % out.length];
      return out.filter((v) => v.b === c.b).slice(0, o.n).map((v) => [v.a, v.b]);
    }
    if (o.mode === 'saw') {                     // 톱니 — 걸러서
      return out.filter((_, i) => i % 3 === o.pick % 3).slice(0, o.n).map((v) => [v.a, v.b]);
    }
    if (o.mode === 'spot') {                    // 반점 — 흩뿌리기
      const s = [];
      for (let i = 0; i < o.n && out.length; i++) s.push(out[(o.pick * 7 + i * 13) % out.length]);
      return s.map((v) => [v.a, v.b]);
    }
    return out.slice(0, o.n).map((v) => [v.a, v.b]);   // creep — 겉면 잠식
  }, { a: cam[0], b: cam[1], dead: [...dead], n: n, mode, pick: Math.floor(rnd() * 9973), rr: 3 });

  const MODES = ['creep', 'bite', 'line', 'saw', 'spot'];
  let prev = await snap(), prevImg = await shot();
  console.log(`\n시작 — 세그먼트 ${prev.n} · 최대 배율 ${prev.max} · 바위 ${prev.rock}셀 · ①${prev.bare}% ②${prev.spill}%`);
  console.log(`씨앗 ${SEED} · ${STEPS}단계\n단계  모양   부순셀  세그  최대배율  Δ배율   ①     ②`);

  let popN = 0, growN = 0, farN = 0, bareN = 0, spillN = 0, farMax = 0;
  for (let st = 1; st <= STEPS; st++) {
    const mode = MODES[Math.floor(rnd() * MODES.length)];
    const cells = await face(3 + Math.floor(rnd() * 10), mode);
    if (!cells.length) { console.log(`   ${st}  ${mode} — 겉면 없음, 종료`); break; }
    await pg.evaluate((cs) => window.__mtDestroy(cs), cells);
    for (const [a, b] of cells) dead.add(a + '_' + b);
    await sleep(1700);
    const cur = await snap(), curImg = await shot();

    // ★P3 국소성은 **화소가 아니라 세그먼트**로 잰다.
    //   화소로 재면 거짓 실패가 난다 — 배율 2.18 스프라이트 하나가 화면 위로 2000px 넘게
    //   뻗어서, 그 한 장이 줄어든 것만으로 "먼 상자"가 바뀐다. 그건 국소성 위반이 아니다.
    //   진짜 성질은 이것이다: **부순 자리에서 먼 봉우리는 그대로다.**
    //   (청크 단위로 다시 굽고 격자가 절대 좌표라 구조적으로 성립해야 한다.)
    const key = (v) => v[0] + '_' + v[1];
    const pm = new Map(prev.fp.map((v) => [key(v), v]));
    const cm = new Map(cur.fp.map((v) => [key(v), v]));
    let far = 0;
    const touched = [];
    for (const [k, v] of cm) { const o = pm.get(k); if (!o || o[2] !== v[2] || o[3] !== v[3] || o[4] !== v[4]) touched.push(v); }
    for (const [k, v] of pm) if (!cm.has(k)) touched.push(v);
    for (const t of touched) {
      let d = 1e9;
      for (const [a, b] of cells) { const q = Math.hypot(t[0] - a, t[1] - b); if (q < d) d = q; }
      if (d > far) far = d;
    }
    if (far > farMax) farMax = far;
    const dSc = +(cur.max - prev.max).toFixed(2);
    console.log(`  ${String(st).padStart(2)}  ${mode.padEnd(5)}  ${String(cells.length).padStart(4)}   ${String(cur.n).padStart(4)}   ${String(cur.max).padStart(6)}  ${String(dSc).padStart(6)}  ${String(cur.bare).padStart(4)}%  ${String(cur.spill).padStart(4)}%`);

    if (prev.max >= 1.2 && cur.max < prev.max * 0.55) popN++;      // P1 팝
    if (dSc > 0.25) growN++;                                        // P2 갑자기 커짐
    if (far > 26) farN++;                                           // P3 청크 여백(22셀)+격자 지터 밖이 바뀌면 위반
    if (cur.bare > 2) bareN++;                                      // P4 덮개
    if (cur.spill > 12) spillN++;                                   // P5 정합
    prev = cur; prevImg = curImg;
  }

  // P6 결정론
  const d1 = await shot(); await sleep(900); const d2 = await shot();
  const det = diff(d1, d2, [0, 260, 1400, 860]);

  console.log('');
  ok('P1 ★팝 없음 — 봉우리가 한 번에 반토막 나지 않는다', popN === 0, `팝 ${popN}회`);
  ok('P2 ★단조 — 부술수록 커지지 않는다', growN === 0, `갑자기 커진 단계 ${growN}회 (허용 +0.25)`);
  ok('P3 ★국소 — 부순 자리에서 먼 봉우리는 그대로다', farN === 0,
    `바뀐 봉우리 중 부순 자리에서 가장 먼 것 ${farMax.toFixed(1)}셀 (한계 26셀 = 청크 여백 22 + 격자 지터)`);
  ok('P4 ★덮개 — 남은 바위는 여전히 산 아래', bareN === 0, `① 2% 초과 ${bareN}회`);
  ok('P5 ★정합 — 부순 자리에 산이 안 남는다', spillN === 0, `② 12% 초과 ${spillN}회`);
  ok('P6 ★결정론', det < 0.05, `|Δ| ${det.toFixed(3)}`);
  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail + ' (씨앗 ' + SEED + ' 으로 재현된다)' : ''}`);
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
