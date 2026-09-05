#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
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
//   P6 결정론 — 같은 마스크면 같은 그림. **가라앉힌 뒤** 두 프레임 동일.
//               (굽기 예산이 프레임당 1장이라 부수기 직후엔 아직 안 구운 청크가 남는다.
//                가라앉히지 않고 재면 "결정론"이 아니라 "가라앉았나"를 재게 된다 — 아래 P6 주석)
//   P6b 가라앉히기가 실제로 일을 했다 — 위 수리가 자명 통과로 굳지 않게 수로 남긴다.
//   P6c 반례 — 가라앉기 전에 재면 정말 다르다. 계측기가 여전히 날카롭다는 증거.
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
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await pg.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await pg.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(24000);

  // ★[환경 방어] 롤백된 옛 코드로 재고 통과시키면 안 된다
  const fresh = await pg.evaluate(() => ({ fit: window.__terrain19 && window.__terrain19.fitOff !== undefined, spill: typeof window.__mtSpillAt === 'function' }));
  if (!fresh.fit || !fresh.spill) { console.log(`\n★★낡은 코드다 ${JSON.stringify(fresh)} — git checkout -B main origin/main 후 다시.`); await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(2); }

  // ★바람을 끈다 — 배치 21 의 바람 흔들림이 매 프레임 화면 전체를 움직여서
  //   P3(국소성)·P6(결정론)이 **산과 무관하게** 깨진다. 재는 대상만 남긴다.
  //   ⚠이건 판정 완화가 아니라 **변인 분리**다: 바람을 끈 상태에서 P6 이 통과해야
  //     "남은 차이는 전부 산 때문"이라고 말할 수 있다.
  await pg.evaluate(() => { window.__terrain19.windOff = true; });
  // ★[T98 2026-09-05] **하늘도 끈다** — 바람을 끈 것과 같은 자리다. T98 이 `weatherFor` 에
  //   `precip` 을 실으면서 세계가 실제로 비를 보낸다. 비는 매 프레임 다시 그려지고 **안개 합성 뒤**에
  //   그려지므로, 두 프레임 동일·안개 위 밝은 픽셀 같은 판정이 하늘 때문에 빨개진다.
  //   이 하네스가 재는 건 하늘이 아니다 ⇒ 끄는 문은 T93 이 남긴 진단 훅 하나(안 켜져 있으면 무해).
  await pg.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
  await sleep(1200);
  const shot = async () => { const p2 = '/tmp/fz.png'; await pg.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const cam = await pg.evaluate(() => window.__camCellLocal());
  const dead = new Set();

  // 화면 안 그림 상태 — 봉우리 배율 · 세그먼트 · 두 수치
  const snap = async () => pg.evaluate((o) => {
    const dd = new Set(o.dead);
    const segs = (window.__mtProbe() || []).filter((g) => Math.abs(g.lcx - o.a) <= 20 && Math.abs(g.lcy - o.b) <= 20);
    const sc = segs.map((g) => g.sc).sort((p, q) => q - p);
    // ★★[계측기 수리 2026-08-26] `__mtSpillAt` 은 **스프라이트 판 전용**이라 높이장 띠(sg.mt3)를
    //   한 장도 못 본다(sg.name 이 없다). 그래서 라이브 기본값에서 ①이 **늘 100%**, ②가 늘 0% 였다 —
    //   P4 는 항상 실패, P5 는 자명 통과. origin/main(c9b9667) worktree 에서도 같은 값이 나왔다.
    //   ⇒ 높이장 판은 **정본 메시 판정**(`__mt3MeshAt`)으로 잰다:
    //     · 남은 바위 = 표면으로 그려져야 한다 ⟺ mesh && !cut
    //     · 부순 셀   = 갱(바닥+옆면)으로 그려져야 한다 ⟺ cut
    let rock = 0, bareCand = 0, spill = 0, land = 0, dug = 0, dugBad = 0, skipped = 0, mode3 = 0;
    for (let dx = -18; dx <= 18; dx++) for (let dy = -18; dy <= 18; dy++) {
      const a = o.a + dx, b = o.b + dy, k = window.__tileStateAt(a, b).kind;
      if (k === 'water') continue;
      const isDug = dd.has(a + '_' + b);
      const isRock = k === 'rock' && !isDug;
      const sp = window.__mtSpillAt(a, b);
      if (sp && sp.mt3Skipped) { skipped = Math.max(skipped, sp.mt3Skipped); mode3 = 1; }
      const M = (typeof window.__mt3MeshAt === 'function') ? window.__mt3MeshAt(a, b) : null;
      const cov3 = M ? (M.mesh && !M.cut) : null;
      if (isDug) { dug++; if (M && !M.cut) dugBad++; }
      if (isRock) { rock++;
        if (!(mode3 && M ? cov3 : !!(sp && sp.cov))) bareCand++; }
      else { land++;
        if (mode3 && M ? (cov3 && !M.adj) : !!(sp && sp.cov > 0)) spill++; }
    }
    return { n: segs.length, max: sc.length ? +sc[0].toFixed(2) : 0,
      bare: rock ? +(bareCand / rock * 100).toFixed(1) : 0,
      spill: land ? +(spill / land * 100).toFixed(1) : 0, rock, land,
      dug, dugBad, skipped, mode3,
      // 세그먼트 지문 — 자리·이름·배율·높이. 국소성 판정이 이걸 비교한다.
      fp: segs.map((g) => [g.lcx, g.lcy, g.nm, +g.sc.toFixed(2), +g.vy.toFixed(2)]) };
  }, { a: cam[0], b: cam[1], dead: [...dead] });

  // ★★부수는 모양 [재민 "정말 다양한 모양으로 검증해본 거 맞아?" — 아니었다]
  //   1차 판은 이름만 다양했다. 실제 로그를 보니 `line` 이 1~2셀, `bite` 가 5셀이었고
  //   `spot` 은 14단계 동안 한 번도 안 나왔다. 겉면 셀 중에서만 고르니 모든 모양이
  //   "몇 셀 갉아먹기"로 **퇴화**한 것이다. 게다가 **극단 상황을 하나도 안 봤다** —
  //   산을 둘로 자르기 · 1셀만 남기기 · 통째로 없애기.
  //   ⇒ 모양을 실제로 다르게 만들고, **무엇을 잘랐는지 매 단계 출력**한다(주장 말고 기록).
  //   ⇒ 극단 상황은 무작위에 맡기지 않고 **각본으로 반드시 돈다**.
  const cutShape = async (mode, arg) => pg.evaluate((o) => {
    const dd = new Set(o.dead);
    const isRock = (a, b) => window.__tileStateAt(a, b).kind === 'rock' && !dd.has(a + '_' + b);
    const isFace = (a, b) => isRock(a, b) &&
      !(isRock(a + 1, b) && isRock(a - 1, b) && isRock(a, b + 1) && isRock(a, b - 1));
    const all = [], faces = [];
    for (let dx = -20; dx <= 20; dx++) for (let dy = -20; dy <= 20; dy++) {
      const a = o.a + dx, b = o.b + dy;
      if (!isRock(a, b)) continue;
      all.push([a, b]); if (isFace(a, b)) faces.push([a, b]);
    }
    if (!all.length) return [];
    const pick = (arr) => arr[o.pick % arr.length];

    if (o.mode === 'through') {
      // ★관통 — 한 줄을 **끝에서 끝까지** 자른다. 덩어리가 둘로 갈라진다.
      //   겉면에서 시작해 반대편 겉면까지, 매 칸이 다음 칸의 겉면이 되므로 규칙에 맞는다.
      const c = pick(faces.length ? faces : all);
      const out = [];
      for (const [a, b] of all) if (b === c[1]) out.push([a, b]);
      return out;
    }
    if (o.mode === 'neck') {
      // ★좁은 목 — 관통하되 한 칸만 남긴다. 1셀 다리가 어떻게 그려지나.
      const c = pick(faces.length ? faces : all);
      const row = all.filter((v) => v[1] === c[1]).sort((p, q) => p[0] - q[0]);
      return row.filter((_, i) => i !== (row.length >> 1));
    }
    if (o.mode === 'wipe') return all;                       // ★통째로 제거
    if (o.mode === 'lone') {                                  // ★1셀만 남기기
      const c = pick(all);
      return all.filter((v) => v[0] !== c[0] || v[1] !== c[1]);
    }
    if (o.mode === 'bite') {                                  // 큰 한 입 — 겉면 한 점 둘레를 뭉텅이로
      const c = pick(faces.length ? faces : all);
      return all.filter((v) => Math.hypot(v[0] - c[0], v[1] - c[1]) <= o.arg);
    }
    if (o.mode === 'saw') {                                   // 톱니 — 겉면을 한 칸 걸러
      return faces.filter((_, i) => i % 2 === o.pick % 2).slice(0, o.arg);
    }
    if (o.mode === 'spot') {                                  // 반점 — 겉면에 흩뿌리기
      const out = [];
      for (let i = 0; i < o.arg && faces.length; i++) out.push(faces[(o.pick * 7 + i * 17) % faces.length]);
      return out;
    }
    return faces.slice(0, o.arg);                             // creep — 겉면 잠식
  }, { a: cam[0], b: cam[1], dead: [...dead], mode, arg, pick: Math.floor(rnd() * 9973) });

  // 자른 모양을 **기록**한다 — 크기·가로세로·연결 여부. 다양성을 주장이 아니라 수로 남긴다.
  const shapeOf = (cells) => {
    if (!cells.length) return { n: 0, w: 0, h: 0, cc: 0 };
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [a, b] of cells) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    const set = new Set(cells.map(([a, b]) => a + '_' + b)); let cc = 0;
    const seen = new Set();
    for (const [a, b] of cells) {
      const k = a + '_' + b; if (seen.has(k)) continue;
      cc++; const st = [[a, b]]; seen.add(k);
      while (st.length) { const [p, q] = st.pop();
        for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = (p + i) + '_' + (q + j);
          if (set.has(kk) && !seen.has(kk)) { seen.add(kk); st.push([p + i, q + j]); } } }
    }
    return { n: cells.length, w: x1 - x0 + 1, h: y1 - y0 + 1, cc };
  };

  // ★각본(반드시 돈다) + 무작위. 극단은 운에 맡기지 않는다.
  const SCRIPT = ['creep', 'bite', 'saw', 'spot', 'through', 'neck', 'creep', 'bite', 'lone', 'wipe'];
  const RANDOM = ['creep', 'bite', 'saw', 'spot', 'through'];
  let prev = await snap(), prevImg = await shot();
  console.log(`\n시작 — 세그먼트 ${prev.n} · 최대 배율 ${prev.max} · 바위 ${prev.rock}셀 · ①${prev.bare}% ②${prev.spill}%`);
  console.log(`씨앗 ${SEED} · ${STEPS}단계\n단계  모양      자른모양          세그  최대배율  Δ배율   ①     ②`);

  const shapes = [];
  let popN = 0, growN = 0, farN = 0, bareN = 0, spillN = 0, farMax = 0, narrowN = 0, spillMax = 0;
  let dugBadN = 0, dugTot = 0, mode3N = 0, skipMax = 0;
  for (let st = 1; st <= STEPS; st++) {
    const mode = st <= SCRIPT.length ? SCRIPT[st - 1] : RANDOM[Math.floor(rnd() * RANDOM.length)];
    const arg = mode === 'bite' ? 2 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 12);
    const cells = await cutShape(mode, arg);
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
    const sh = shapeOf(cells); shapes.push(sh);
    console.log(`  ${String(st).padStart(2)}  ${mode.padEnd(7)} ${String(sh.n).padStart(4)}셀 ${String(sh.w)}×${String(sh.h)} 덩이${sh.cc}  ${String(cur.n).padStart(4)}   ${String(cur.max).padStart(6)}  ${String(dSc).padStart(6)}  ${String(cur.bare).padStart(4)}%  ${String(cur.spill).padStart(4)}%`);

    // ★P1 은 **자른 양에 견줘** 재야 한다. 717셀을 한 번에 없애면 산이 무너지는 게 당연하다.
    //   팝이란 "**조금** 잘랐는데 봉우리가 반토막"이다. 자른 양을 안 보면 정상 붕괴를 팝으로 센다.
    //   (1차 판이 그 덫에 빠져 `lone`(717셀 제거) 단계를 팝으로 셌다.)
    if (cells.length <= 20 && prev.max >= 1.2 && cur.max < prev.max * 0.55) popN++;
    if (dSc > 0.25) growN++;                                        // P2 갑자기 커짐
    if (far > 26) farN++;                                           // P3 청크 여백(22셀)+격자 지터 밖이 바뀌면 위반
    if (cur.bare > 2) bareN++;                                      // P4 덮개
    if (cur.dugBad > 0) dugBadN++;                                  // P4b 부순 셀은 갱으로
    dugTot += cur.dug; if (cur.mode3) mode3N++; skipMax = Math.max(skipMax, cur.skipped);
    if (cur.spill > spillMax) spillMax = cur.spill;
    // ★P5 한계 16% 의 근거: 고치기 전 18.1% 는 여전히 잡되, **좁은 통로**는 통과시킨다.
    //   실측에서 관통·좁은목으로 1셀 통로를 내면 ② 가 12.3% 까지 오른다 —
    //   통로 양옆 산이 통로를 덮기 때문이고, 벽을 납작하게 하지 않는 한 기하적으로 불가피하다.
    //   이건 회귀가 아니라 **알려진 한계**다. 아래 요약에 따로 찍는다.
    if (cur.spill > 16) spillN++;
    if (cur.spill > 10) narrowN++;
    prev = cur; prevImg = curImg;
  }

  // ══ P6 결정론 ═════════════════════════════════════════════════════════════
  // ★★[계측기 수리 2026-08-26] 옛 P6 은 **가라앉기 전에** 쟀다 — 경주였다.
  //   청크 굽기 예산은 **프레임당 1장**이다(MT3_BUDGET=1). 부수기 직후에는 아직 안 구운
  //   청크가 남아 있다(실측: 절단 켬 4장 · 끔 6장). 그 상태로 찍은 첫 장은 **반쯤 구운 그림**이고,
  //   900ms 뒤 두 번째 장은 다 구운 그림이다. 둘을 비교하면 "결정론"이 아니라
  //   **"가라앉았나"** 를 재게 된다. 실측 |Δ| 2.691 · 다른 화소 183,582 (상자 0,260~482,859).
  //   ⇒ 첫 장 하나만 튀고 그 뒤 프레임끼리는 전부 0.000 이었다(16장 연속 확인).
  //   ⚠절단을 끄면 통과했던 건 고쳐져서가 아니라 **경주에서 이겨서**다 —
  //     끈 쪽 굽기 잔량이 오히려 더 많았다(6 > 4). 즉 옛 P6 은 요행으로 통과하고 있었다.
  //   ⇒ 판정을 완화하지 않는다. **가라앉힌 뒤** 같은 엄격도(0.05)로 잰다.
  //     그리고 아래 P6b·P6c 로 "가라앉히기가 실제로 일을 했다"와
  //     "가라앉기 전에 재면 정말 다르다"를 **수로** 남긴다(자명 통과 금지).
  const BOX = [0, 260, 1400, 860];
  const mtdbg = () => pg.evaluate(() => ({ bn: window.__mtDbg.mt3bakeN, ch: window.__mtDbg.mt3chunks }));
  // 굽기 잔량이 **연속 3회 그대로**일 때까지 기다린다. 기다린 동안 구운 장수를 돌려준다.
  const settle = async (capMs = 6000) => {
    let prev = await mtdbg(); const t0 = Date.now(); let same = 0, baked = 0;
    while (Date.now() - t0 < capMs) {
      await sleep(70);
      const cur = await mtdbg();
      baked += cur.bn - prev.bn;
      same = (cur.bn === prev.bn && cur.ch === prev.ch) ? same + 1 : 0;
      prev = cur;
      if (same >= 3) break;
    }
    return baked;
  };
  const baked1 = await settle();
  const d1 = await shot(); await sleep(900); const d2 = await shot();
  const det = diff(d1, d2, BOX);
  // 반례 — 청크 캐시만 비워 **같은 잔량 상태**를 일부러 다시 만든다(설정값은 그대로 넣는다).
  await pg.evaluate(() => window.__mt3pad(window.__mtDbg.mt3pad));
  const u1 = await shot();
  const baked2 = await settle();
  const u2 = await shot();
  const unset = diff(u1, u2, BOX);

  console.log('');
  ok('P1 ★팝 없음 — 봉우리가 한 번에 반토막 나지 않는다', popN === 0, `팝 ${popN}회`);
  ok('P2 ★단조 — 부술수록 커지지 않는다', growN === 0, `갑자기 커진 단계 ${growN}회 (허용 +0.25)`);
  ok('P3 ★국소 — 부순 자리에서 먼 봉우리는 그대로다', farN === 0,
    `바뀐 봉우리 중 부순 자리에서 가장 먼 것 ${farMax.toFixed(1)}셀 (한계 26셀 = 청크 여백 22 + 격자 지터)`);
  ok('P4 ★덮개 — 남은 바위는 여전히 산 아래', bareN === 0, `① 2% 초과 ${bareN}회`);
  ok('P4b ★★부순 셀은 **갱으로** 그려진다(표면으로 남지 않는다)', dugBadN === 0 && dugTot > 0,
    `부순 셀 누계 ${dugTot} · 표면으로 남은 단계 ${dugBadN}회`);
  ok('P4c ★계측기 눈멂 고정 — `__mtSpillAt` 은 높이장 띠를 못 본다(그래서 메시 판정으로 잰다)',
    mode3N === 0 || skipMax > 0, `못 본 띠 최대 ${skipMax}장 · 높이장 단계 ${mode3N}회`);
  ok('P5 ★정합 — 부순 자리에 산이 안 남는다', spillN === 0,
    `② 최대 ${spillMax}% (한계 16% · 고치기 전 18.1%) · 10% 넘은 단계 ${narrowN}회는 좁은 통로`);
  ok('P6 ★결정론 — 가라앉은 뒤 두 프레임이 같다', det < 0.05, `|Δ| ${det.toFixed(3)} (가라앉히며 구운 청크 ${baked1}장)`);
  ok('P6b ★가라앉히기가 실제로 일을 했다(옛 P6 이 경주였다는 증거)', baked1 > 0,
    `부수기 직후 남은 굽기 ${baked1}장 — 0 이면 이 수리가 무의미해진 것이니 다시 봐야 한다`);
  ok('P6c ★★반례 — 가라앉기 **전에** 재면 정말 다르다(계측기가 여전히 날카롭다)',
    unset > 0.05 && baked2 > 0, `|Δ| ${unset.toFixed(3)} · 되구운 청크 ${baked2}장`);
  // ★다양성을 **수로** 남긴다 — "다양하게 했다"는 주장은 검증이 아니다
  const sz = shapes.map((v) => v.n).sort((a, b) => a - b);
  const multi = shapes.filter((v) => v.cc > 1).length;
  console.log(`\n[모양 다양성] ${shapes.length}단계 · 한 번에 자른 셀 ${sz[0]}~${sz[sz.length - 1]}개(중앙 ${sz[sz.length >> 1]})`);
  console.log(`   조각난 자르기(덩이 2개 이상) ${multi}회 · 가로폭 ${Math.min(...shapes.map((v) => v.w))}~${Math.max(...shapes.map((v) => v.w))}셀`);
  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail + ' (씨앗 ' + SEED + ' 으로 재현된다)' : ''}`);
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
