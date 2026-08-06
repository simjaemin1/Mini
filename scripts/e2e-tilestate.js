#!/usr/bin/env node
// =============================================================================
// e2e-tilestate — 타일 상태계 실클라 픽셀 E2E [배치 20 B]
//   재민 확정: *"비옥도에 따라 모든 타일이 디자인이 바뀌어야… 번영도·경작·길·채굴에 따라서도"*
//              *"경계마다 딱딱 나누지 말고 연속적으로"*  *"돌만 놓으면 그게 산터냐"*
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다:
//   ⓐ 기준선이 지형에서 나온다  ↔ 반례: 바위 셀 기준선은 뭍보다 **훨씬 낮다**
//   ⓑ 바뀐 청크만 다시 굽는다  ↔ 반례: **멀리 있는 대조 상자**는 안 변한다
//   ⓒ 전이가 연속이다          ↔ 반례: 500↔520 은 작고 500↔900 은 **크다**(문턱 점프 없음)
//   ⓓ 산터는 풀밭이 안 된다     ↔ 반례: 같은 토양치 1000 이라도 **일반 지질은 초록**이다
//   ⓔ 답압이 그림에 남는다      ↔ 반례: 길을 안 넣은 대조 상자는 안 변한다
//   ⓕ 손잡이로 끄면 사라진다    ↔ stateOff 로 되돌아온다
//   ⓖ 결정론                   ↔ 같은 상태 두 프레임이 동일
//
// ★상태 주입은 서버 방송과 **같은 입구**(_tsIngest/_rdIngest)로만 한다 — 우회로를 시험하면
//   시험이 거짓말을 한다. 투영 수학도 하네스가 다시 쓰지 않는다(__cellScreen 이 정본을 부른다).
//
// 사용: ZDB=/tmp/ts.db node scripts/e2e-tilestate.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-tilestate';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-tilestate.db';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { } await sleep(1000); }
  return false;
}
fs.writeFileSync('/tmp/zone-wrap-ts.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

const lum = (r, g, b) => r * 0.30 + g * 0.59 + b * 0.11;
const isGreenPx = (r, g, b) => g - b > 18 && g > r + 4 && g > 40;
function meanAbsDiff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return n ? s / n / 3 : 0;
}
function greenPct(p, box) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * p.width + x) * 4; t++;
    if (isGreenPx(p.data[i], p.data[i + 1], p.data[i + 2])) n++;
  }
  return t ? n / t * 100 : 0;
}
function meanLum(p, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * p.width + x) * 4; s += lum(p.data[i], p.data[i + 1], p.data[i + 2]); n++;
  }
  return n ? s / n : 0;
}

(async () => {
  say('=== 타일 상태계 실클라 E2E (배치 20 B) ===');
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  const z = boot('zone', '/tmp/zone-wrap-ts.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say('  [클라 오류] ' + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(20000);

  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1200); };
  const grab = async (n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const feed = async (flat) => { const n = await page.evaluate((f) => window.__tileStateFeed(f), flat); await sleep(1200); return n; };
  const feedRoad = async (flat) => { const n = await page.evaluate((f) => window.__roadFeed(f), flat); await sleep(1200); return n; };
  const at = (lcx, lcy) => page.evaluate(([a, b]) => window.__tileStateAt(a, b), [lcx, lcy]);
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(120); };

  // ── ⓐ 계약 ────────────────────────────────────────────────────────────────
  say('\n[ⓐ 계약 — 상태계가 실제로 붙었나]');
  const tdbg = await page.evaluate(() => window.__tileStateDbg);
  say(`    ${JSON.stringify(tdbg)}`);
  ok(tdbg && tdbg.sb === true, '기준 토양치 공용 1부(SoilBase)가 클라에 실려 있다');
  ok(tdbg && tdbg.off === false, '상태 레이어가 켜져 있다');
  ok(tdbg && tdbg.roadCells >= 0, `§16 답압 길 미러가 붙어 있다 (${tdbg.roadCells}셀)`);
  ok(tdbg && tdbg.farmCells > 0, `★경작 축에 **실제 원천**이 있다 — NPC 마을 농지 ${tdbg.farmCells}셀`);

  const boxOf = async (cells) => {
    const pts = await page.evaluate((cs) => cs.map(([a, b]) => window.__cellScreen(a, b)), cells);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return [Math.round(Math.min(...xs) - 30), Math.round(Math.min(...ys) - 14), Math.round(Math.max(...xs) + 30), Math.round(Math.max(...ys) + 14)];
  };
  // ★★시험 상자는 **맨 지면**이어야 한다. 1패스에서 상자가 마을 지붕·마당 타일 위에 얹혀
  //   모든 측정이 |Δ| 0.5 로 죽었다 — 지면 레이어가 아예 안 보이는 자리였다.
  //   걸어 다니며 찾는 건 불안정했다(6번 걸어도 못 찾은 판이 있었다). 대신 **한 장의 화면에서**
  //   카메라 둘레 여러 후보 뙈기의 속살을 재서 제일 초원인 둘을 고른다 — 결정론적이고 빠르다.
  const innerOf = (bx) => { const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2;
    return [Math.round(cx - 70), Math.round(cy - 34), Math.round(cx + 70), Math.round(cy + 34)]; };
  const patchAt = (c, ox, oy) => { const a = []; for (let d1 = 0; d1 < 5; d1++) for (let d2 = 0; d2 < 5; d2++) a.push([c[0] + ox + d1, c[1] + oy + d2]); return a; };
  // 후보 offset 은 화면 안에 들어오는 것만 — iso x=(dx-dy)·32, y=(dx+dy)·16 이라
  //   |dx-dy| ≲ 17, |dx+dy| ≲ 12 여야 UI 를 피해 화면 중앙 띠에 들어온다.
  const OFFS = [[5, -9], [-9, 5], [8, -6], [-6, 8], [11, -3], [-3, 11], [7, 1], [1, 7], [10, -10], [-10, 10], [4, -12], [-12, 4]];
  let cam = null, PATCH = null, CTRL = null, BOX = null, BOXC = null, openG = 0, INBOX = null, INBOXC = null;
  // ★스폰이 NPC 마을 한복판이다(영토 3,450셀 ≈ 반경 30셀). 마당 타일·지붕이 지면을 덮어
  //   거기서 재면 전부 0 이 나온다 — 먼저 **마을 밖으로 걸어 나간다**.
  say('    마을 밖으로 이동 중…');
  for (let i = 0; i < 22; i++) await pulse('s', 1700);
  for (let i = 0; i < 10; i++) await pulse('a', 1700);
  for (let round = 0; round < 6; round++) {
    cam = await page.evaluate(() => window.__camCellLocal());
    const shot = await grab('00-scout' + round);
    const cands = [];
    for (const [ox, oy] of OFFS) {
      const cells = patchAt(cam, ox, oy);
      const bx = await boxOf(cells);
      if (bx[0] < 70 || bx[2] > 1330 || bx[1] < 260 || bx[3] > 850) continue;      // UI·화면 밖
      const ib = innerOf(bx);
      const kinds = await page.evaluate((cs) => cs.map(([a, b]) => window.__tileStateAt(a, b).kind), cells);
      if (!kinds.every((k) => k === 'land')) continue;                             // 물·바위 위에선 비옥도 시험 불가
      cands.push({ ox, oy, cells, bx, ib, g: greenPct(shot, ib) });
    }
    cands.sort((a, b) => b.g - a.g);
    say(`    ${round}차 카메라 셀 ${cam} · 후보 ${cands.length}  최고 초록 ${cands.length ? cands[0].g.toFixed(1) : '-'}%`);
    if (cands.length >= 2 && cands[0].g > 22) {
      // 대조는 시험 뙈기에서 **충분히 떨어진** 후보(타일이 겹치면 국소성 판정이 무의미해진다)
      const far = cands.slice(1).find((c) => Math.abs(c.ox - cands[0].ox) + Math.abs(c.oy - cands[0].oy) >= 14 && c.g > 12);
      if (far) {
        PATCH = cands[0].cells; BOX = cands[0].bx; INBOX = cands[0].ib; openG = cands[0].g;
        CTRL = far.cells; BOXC = far.bx; INBOXC = far.ib;
        say(`    → 시험 뙈기 offset ${[cands[0].ox, cands[0].oy]} (초록 ${cands[0].g.toFixed(1)}%) · 대조 offset ${[far.ox, far.oy]} (초록 ${far.g.toFixed(1)}%)`);
        break;
      }
    }
    for (let i = 0; i < 8; i++) await pulse(round % 2 ? 'a' : 's', 1700);   // 더 멀리
  }
  ok(PATCH !== null, '맨 초원에 시험/대조 뙈기를 잡았다');
  if (!PATCH) { await browser.close(); try { z.kill(); } catch (e) {} for (const p2 of procs) { try { p2.kill(); } catch (e) {} } say(`\n=== 타일 상태계: 통과 ${pass} · 실패 ${fail} ===`); process.exit(1); }
  // ★카메라는 보간(트윈)이라 걷기 직후에도 미끄러진다. 그 상태로 재면 **대조 상자까지 변한다**
  //   (1패스에서 대조 |Δ| 8.88 로 잡혔다 — 국소성 판정이 거짓으로 떨어졌다).
  //   두 프레임이 완전히 같아질 때까지 기다린 뒤, 그 시점 카메라로 상자를 다시 잡는다.
  let still = false;
  for (let i = 0; i < 20; i++) {
    await sleep(700);
    const q1 = await grab('0z-still-a'), q2 = await grab('0z-still-b');
    if (meanAbsDiff(q1, q2, [40, 260, 1360, 860]) < 0.02) { still = true; break; }
  }
  ok(still, '★화면이 완전히 정지했다 — 카메라가 미끄러지는 중에 재면 대조 상자까지 변한다');
  BOX = await boxOf(PATCH); INBOX = innerOf(BOX);
  BOXC = await boxOf(CTRL); INBOXC = innerOf(BOXC);
  say(`    시험 상자 ${JSON.stringify(BOX)} (속살 ${JSON.stringify(INBOX)}) · 대조 상자 ${JSON.stringify(BOXC)}`);
  ok(BOX[0] > 60 && BOX[2] < 1340 && BOX[1] > 250 && BOX[3] < 860, '시험 상자가 화면 안(UI 밖)에 있다');
  ok(openG > 22, `★★자명 통과 금지 — 시험 뙈기가 **맨 초원**이다 (속살 초록 ${openG.toFixed(1)}%). 지붕 위에서 재면 전부 0 이 나온다`);

  // ── ⓑ 기준선이 정적 지형에서 나온다 ────────────────────────────────────────
  say('\n[ⓑ 기준 토양치 — 정적 지형 파생 · 결정론]');
  const a0 = await at(PATCH[0][0], PATCH[0][1]);
  say(`    시험 셀: ${JSON.stringify(a0)}`);
  ok(a0 && a0.dyn === false, '손 안 댄 셀은 **동적 레코드가 없다**(서버 행 0 — 희소 유지)');
  ok(a0 && a0.base > 550 && a0.base <= 1000, `뭍 기준선이 높다 (${a0.base.toFixed(0)}) — 손 안 댄 세계가 메마르지 않는다`);
  // 반례: 바위 셀의 기준선은 훨씬 낮아야 한다(지형에서 나온다는 증거)
  const rockBase = await page.evaluate(() => (typeof SoilBase !== 'undefined' ? SoilBase.baseAt('rock', 100, 100) : null));
  const landBase = await page.evaluate(() => (typeof SoilBase !== 'undefined' ? SoilBase.baseAt('land', 100, 100) : null));
  const watBase = await page.evaluate(() => (typeof SoilBase !== 'undefined' ? SoilBase.baseAt('water', 100, 100) : null));
  say(`    같은 셀 좌표에서 land ${landBase.toFixed(0)} · rock ${rockBase.toFixed(0)} · water ${watBase}`);
  ok(rockBase < landBase / 2 && watBase === 0, '★반례 — 지형 종류가 다르면 기준선이 다르다(좌표만의 함수가 아니다)');

  // ── ⓒ 국소 재베이크 ───────────────────────────────────────────────────────
  say('\n[ⓒ 바뀐 셀이 걸친 타일만 다시 굽는다]');
  const base0 = await grab('01-base');
  const flatLow = [];
  for (const [cx, cy] of PATCH) flatLow.push(cx, cy, Math.round(60 / 16), 0, 15);   // 토양치 60 = 척박
  say(`    주입: 시험 뙈기 ${await feed(flatLow)}셀 → 토양치 60`);
  const lowS = await grab('02-soil60');
  const dIn = meanAbsDiff(base0, lowS, INBOX), dOut = meanAbsDiff(base0, lowS, INBOXC);
  say(`    변화량  시험 상자 ${dIn.toFixed(2)}  ·  대조 상자 ${dOut.toFixed(2)}`);
  ok(dIn > 4, `★토양치를 내리니 그 자리가 실제로 바뀌었다 (|Δ| ${dIn.toFixed(2)})`);
  ok(dOut < dIn / 5, `★★반례 — 멀리 있는 대조 상자는 그대로다 (${dOut.toFixed(2)} < ${(dIn / 5).toFixed(2)}) — 전체 재베이크가 아니다`);
  const L0 = meanLum(base0, INBOX), L1 = meanLum(lowS, INBOX);
  say(`    속살 평균 휘도 ${L0.toFixed(1)} → ${L1.toFixed(1)}`);
  ok(L1 > L0 + 3, `★풀이 벗겨져 **밝은 맨흙**이 드러난다 (휘도 ${L0.toFixed(1)} → ${L1.toFixed(1)}) — 이 팔레트에서 마른 흙은 풀보다 밝다`);
  const gLow = greenPct(lowS, INBOX), gBase = greenPct(base0, INBOX);
  ok(gLow < gBase * 0.6, `★★풀이 확실히 줄었다 (속살 초록 ${gBase.toFixed(1)}% → ${gLow.toFixed(1)}%)`);

  // ── ⓓ 연속성 ─────────────────────────────────────────────────────────────
  say('\n[ⓓ 연속 전이 — 문턱에서 점프하지 않는다]');
  const mk = (v, geo) => { const f = []; for (const [cx, cy] of PATCH) f.push(cx, cy, Math.round(v / 16), geo || 0, 15); return f; };
  await feed(mk(500)); const s500 = await grab('03-soil500');
  await feed(mk(520)); const s520 = await grab('04-soil520');
  await feed(mk(900)); const s900 = await grab('05-soil900');
  const dNear = meanAbsDiff(s500, s520, INBOX), dFar = meanAbsDiff(s500, s900, INBOX);
  say(`    500↔520 |Δ| ${dNear.toFixed(2)}   ·   500↔900 |Δ| ${dFar.toFixed(2)}`);
  ok(dFar > 4, `★반례 — 400 벌어지면 그림이 확실히 다르다 (${dFar.toFixed(2)}) · 축이 살아 있다`);
  ok(dNear < dFar / 4, `★★20 차이는 400 차이의 1/4 미만이다 (${dNear.toFixed(2)} vs ${dFar.toFixed(2)}) — 문턱 계단이 없다`);

  // ── ⓔ 산터 램프 ──────────────────────────────────────────────────────────
  say('\n[ⓔ 산터 램프 — "돌만 놓으면 그게 산터냐" · 풀밭이 되지 않는다]');
  await feed(mk(1000, 0)); const normal1000 = await grab('06-normal1000');
  await feed(mk(1000, 1)); const ruin1000 = await grab('07-ruin1000');
  const gN = greenPct(normal1000, INBOX), gR = greenPct(ruin1000, INBOX);
  say(`    토양치 1000 에서 초록 비율  일반 지질 ${gN.toFixed(1)}%  ·  산터 ${gR.toFixed(1)}%`);
  ok(gN > 25, `★반례 — 같은 토양치 1000 이라도 일반 지질은 초록이다 (${gN.toFixed(1)}%)`);
  ok(gR < gN / 2, `★★산터는 토양치 1000 에서도 풀밭이 아니다 (${gR.toFixed(1)}% < ${(gN / 2).toFixed(1)}%)`);
  await feed(mk(200, 1)); const ruin200 = await grab('08-ruin200');
  const gR2 = greenPct(ruin200, INBOX);
  say(`    산터 토양치 200 초록 ${gR2.toFixed(1)}%  →  1000 초록 ${gR.toFixed(1)}%`);
  ok(gR > gR2, `★산터도 비옥해지면 이끼·틈새 풀이 는다 (${gR2.toFixed(1)}% → ${gR.toFixed(1)}%) — 상한이 있을 뿐 죽은 축이 아니다`);

  // ── ⓕ 답압(길) ───────────────────────────────────────────────────────────
  say('\n[ⓕ 답압 축 — §16 길 값이 그림에 남는다]');
  await feed(mk(900, 0)); const preRoad = await grab('09-preroad');
  const rf = []; for (const [cx, cy] of PATCH) rf.push(cx, cy, 2);
  say(`    주입: 길 등급 2 를 ${await feedRoad(rf)}셀`);
  const withRoad = await grab('10-road2');
  const dRoadIn = meanAbsDiff(preRoad, withRoad, INBOX), dRoadOut = meanAbsDiff(preRoad, withRoad, INBOXC);
  say(`    변화량  시험 ${dRoadIn.toFixed(2)}  ·  대조 ${dRoadOut.toFixed(2)}`);
  ok(dRoadIn > 4, `★다져진 길이 그림에 나타난다 (|Δ| ${dRoadIn.toFixed(2)})`);
  ok(dRoadOut < dRoadIn / 5, `★반례 — 길을 안 넣은 대조 상자는 그대로다 (${dRoadOut.toFixed(2)})`);
  ok(greenPct(withRoad, INBOX) < greenPct(preRoad, INBOX) * 0.7, `길 위의 풀이 깎였다 (속살 초록 ${greenPct(preRoad, INBOX).toFixed(1)}% → ${greenPct(withRoad, INBOX).toFixed(1)}%)`);

  // ── ⓖ 손잡이 · 결정론 ────────────────────────────────────────────────────
  say('\n[ⓖ 손잡이로 끄면 사라진다 · 결정론]');
  const onA = await grab('11-on-a'), onB = await grab('12-on-b');
  ok(meanAbsDiff(onA, onB, INBOX) < 0.5, `★결정론 — 같은 상태 두 프레임이 동일 (|Δ| ${meanAbsDiff(onA, onB, INBOX).toFixed(3)})`);
  await knob({ stateOff: true });   // 손잡이가 바뀌면 클라가 알아서 구워 둔 타일을 버린다
  await sleep(1800);
  const offS = await grab('13-stateoff');
  const dOff = meanAbsDiff(onA, offS, INBOX);
  say(`    stateOff 로 끈 뒤 |Δ| = ${dOff.toFixed(2)}`);
  ok(dOff > 4, `★★손잡이로 끄면 상태 레이어가 사라진다 (|Δ| ${dOff.toFixed(2)}) — A/B 대조군이 실재한다`);

  await browser.close(); try { z.kill(); } catch (e) { }
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  say(`\n=== 타일 상태계: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
