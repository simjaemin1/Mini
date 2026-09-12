#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`)을 만지는 카드는 이 표를 전수로 돌려라 —
//              `bash scripts/run-regress.sh --list pixel`. 이름으로는 못 찾는다(T98: `e2e-nature` 는
//              하늘 때문에 셋이 빨갰는데 그 파일엔 `weather` 라는 낱말이 없어 `grep -l` 에 안 걸렸다).
// =============================================================================
// e2e-nature — 자연물 실장(물가 술 · 나무 재렌더 · 들꽃 산포) 실클라 픽셀 E2E [배치 21]
//
// ★자명 통과 금지 — 판정마다 "없으면 실패하는 반례"를 같이 잰다:
//   ⓐ 은폐  : 술이 **물 위로** 넘어온다      ↔ 반례: 초원(물 없는 곳)엔 그런 픽셀이 0
//   ⓑ 군락  : 물가 밀도가 **과분산**이다     ↔ 반례: 균일 산포(포아송)의 CV 기대값과 대조 + 빈 구간 존재
//   ⓒ 나무  : 12종이 실제로 **그려진다**     ↔ 반례: 로드 수가 아니라 draw 호출수·그린 크기를 잰다
//   ⓓ 회피  : 길·사유지·영토 위 소품 0       ↔ 반례: `propNoAvoid` 로 끄면 위반이 **나온다**
//   ⓔ 결정론: 시각 고정하면 두 프레임 동일
//
// ★A/B 는 손잡이로 같은 프레임·같은 시계에서 얻는다(에셋을 되돌린 "before"는 다른 세계다):
//   `__terrain19.fringeOff` 물가 술만 off · `propOff` 초원 소품만 off · `natOff` 둘 다 off.
// ★★회피 판정을 하네스가 다시 짜면 그게 사본이고 자명 통과다(배치 7 오진의 형태).
//   `window.__natProbe()` 가 **원자료**(길 셀·사유지 사각·마을 원·경작지)를 그대로 내보내고
//   하네스는 거기서 **독립 재계산**한다.
//
// 사용: ZDB=/tmp/e2e-nature.db node scripts/e2e-nature.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SPDm = require(path.join(__dirname, '..', 'public', 'move-model.js'));   // ★[T194] 걸음 문턱은 정본에서 유도한다(하네스가 수를 안 적는다)
const SHOTS = process.env.SHOTS || '/tmp/e2e-nature-shots';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-nature.db';
fs.mkdirSync(SHOTS, { recursive: true });

// 촬영 지점 — e2e-terrain 과 같은 정본 프로브 셀(`scripts/probe-terrain-sites.js` 선정).
const SITES = {
  river: { cx: 1490, cy: 2477, why: '한여울강 하류 · 물 127 / 뭍 162 — 물가 술의 무대' },
  field: { cx: 965, cy: 1919, why: '농촌22 광장 — 물 0(반례) · 마을 영토·길이 시야 안(회피 판정)' },
};

// ★★[T75 2026-09-03] **논밭이 화면에 실재하는 세 번째 자리 — 고르지 않고 잰다(족보 73).**
//   T57 이 [7c] 를 "이 자리엔 대상이 0곳 — 못 잰다"로 유보해 두고 회부한 그 자리다.
//   위 두 자리는 `probe-terrain-sites.js` 가 **지형**으로 골랐다. 논밭은 지형이 아니라 **마을**이
//   깔므로 같은 자리에 없다(실측 cand 0). ⇒ 시딩된 마을에서 **기계가** 하나 고른다.
//   ★자리 하드코딩 금지: 좌표는 존 DB(`village_buildings`)에서 나오고, 카메라 오프셋도
//     **클라 상수에서 유도**한다(하네스가 숫자를 베끼면 그게 사본 계측기다):
//       · `CLOSE_RADIUS`(근접 원 — 무조건 '본 셀')  → 셀 단위 근접 반경
//       · `_GATE_R.building`(옛 동작의 구조물 후광) → 대조군이 위반을 낼 수 있는 여유
//     ⇒ 노리는 띠 = 체비셰프 거리 (근접, 근접+후광] — 그 안의 논밭은 **안 본 셀인데
//       옛 동작이라면 후광으로 그려진다**. 그 띠에 논밭이 가장 많은 영토 셀을 고른다.
function pickFarmSite(zdb) {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
  const mC = src.match(/const CLOSE_RADIUS = (\d+)/);
  const mG = src.match(/const _GATE_R = \{[^}]*?building:\s*(\d+)/);
  if (!mC || !mG) return { err: '클라 상수(CLOSE_RADIUS · _GATE_R.building)를 못 읽었다 — 이름이 바뀌었나' };
  const CLOSE = Math.round(parseInt(mC[1], 10) / 32), HALO = parseInt(mG[1], 10);
  let db; try { db = new (require('node:sqlite').DatabaseSync)(zdb); } catch (e) { return { err: 'DB 못 엶: ' + e.message }; }
  let farms = [], terr = [];
  try {
    // 클라가 `type:'farmland'` 로 받는 것 = 논(farmland) + 밭(dryfield) (server/villages.js farmTilesInRect)
    farms = db.prepare("SELECT cx,cy FROM village_buildings WHERE type IN ('farmland','dryfield')").all();
    terr = db.prepare("SELECT village_id,cx,cy FROM village_buildings WHERE type IN ('terr','yard','plaza')").all();
  } catch (e) { try { db.close(); } catch (x) {} return { err: '마을 표가 없다: ' + e.message }; }
  try { db.close(); } catch (e) {}
  if (!farms.length) return { err: `논밭 셀이 DB 에 0곳(마을 시딩 전인가)`, close: CLOSE, halo: HALO, farms: 0 };
  const fset = new Set(farms.map((f) => f.cx + ',' + f.cy));
  const grid = new Map();
  for (const f of farms) { const k = (f.cx >> 4) + '_' + (f.cy >> 4); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(f); }
  let best = null;
  for (const t of terr) {
    if (fset.has(t.cx + ',' + t.cy)) continue;   // 밭 한가운데 서면 그 칸은 '본 셀'이 된다 — 밭 밖에 선다
    let band = 0;
    for (let gx = (t.cx - 20) >> 4; gx <= (t.cx + 20) >> 4; gx++) for (let gy = (t.cy - 20) >> 4; gy <= (t.cy + 20) >> 4; gy++) {
      for (const f of (grid.get(gx + '_' + gy) || [])) {
        const d = Math.max(Math.abs(f.cx - t.cx), Math.abs(f.cy - t.cy));
        if (d > CLOSE && d <= CLOSE + HALO) band++;
      }
    }
    if (!best || band > best.band) best = { cx: t.cx, cy: t.cy, band };
  }
  if (!best || best.band === 0) return { err: '근접 원 밖 후광 띠에 논밭이 있는 영토 셀이 없다', close: CLOSE, halo: HALO, farms: farms.length };
  return { cx: best.cx, cy: best.cy, band: best.band, close: CLOSE, halo: HALO, farms: farms.length,
           why: `기계 선정 — 논밭 ${farms.length}칸 중 체비셰프 ${CLOSE + 1}~${CLOSE + HALO}셀 띠에 ${best.band}칸(근접원 ${CLOSE}셀=CLOSE_RADIUS/32 · 후광 ${HALO}셀=_GATE_R.building)` };
}

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/Warning/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 120)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
fs.writeFileSync('/tmp/zone-wrap.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

// ── 픽셀 도구 (e2e-terrain 과 같은 계측기 — 하네스 고유 술어) ─────────────────
const isWaterPx = (r, g, b) => b > r + 18 && b + g > r * 2 + 20;
const isGreenPx = (r, g, b) => g - b > 18 && g > 40 && g < 225 && r < g + 20;
const BOX = [40, 200, 1360, 880];
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; }
// ★[2026-08-07] 풀 카펫 항등식 검증용 — **문턱을 준** 차이. 8비트 반올림 때문에 '완전 동일'은
//   구조를 쪼갠 뒤에는 성립하지 않는다. 성립해야 하는 건 "눈에 안 보일 만큼 같다"이다.
function meanAbsDiff(a, b, box) {
  let s2 = 0, n = 0;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
    const i = (y * a.width + x) * 4;
    s2 += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n += 3;
  }
  return s2 / n;
}
function diffOver(a, b, box, thr) {
  let n = 0;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
    const i = (y * a.width + x) * 4;
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > thr) n++;
  }
  return n;
}
function diffCount(a, b) {            // 두 프레임에서 달라진 픽셀 수
  let n = 0;
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    const i = (y * a.width + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return n;
}
// ★★[2026-08-26] **생물을 가린 차이** — 결정론 판정 전용.
//   "시각을 고정하면 두 프레임이 동일"의 뜻은 *자연물 자리 해시가 순수 함수*다.
//   그런데 종전엔 화면 전체를 견줬고, **사슴 한 마리가 걸어 들어오면** 1007화소가 달라져
//   같은 코드가 한 판은 73/0, 다음 판은 72/1 로 갈렸다(실측 · 두 프레임을 눈으로 대조해 확인).
//   짐승이 걷는 건 결함이 아니다. 그래서 **생물이 그려진 자리만** 판정에서 뺀다 —
//   자리는 클라가 자기 변환으로 내준다(`window.__entBoxes()`), 하네스가 화면 변환을 베끼지 않는다.
//   ⚠가린 넓이를 **같이 보고**한다. 다 가려 놓고 "0" 이라 말하는 자명 통과를 막기 위해서다.
const ENT_DX = 80, ENT_UP = 120, ENT_DN = 48;
//  두 프레임 비교의 **정본 술어** — 각 프레임이 들고 온 생물 자리의 합집합을 가린다.
const D = (a, b) => diffCountNoEnts(a, b, [...(a._ents || []), ...(b._ents || [])]).n;
function diffCountNoEnts(a, b, ents) {
  const W = a.width;
  const mask = new Uint8Array(W * a.height);
  let masked = 0;
  for (const [, sx, sy] of (ents || [])) {
    const x0 = Math.max(BOX[0], sx - ENT_DX), x1 = Math.min(BOX[2], sx + ENT_DX);
    const y0 = Math.max(BOX[1], sy - ENT_UP), y1 = Math.min(BOX[3], sy + ENT_DN);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (!mask[y * W + x]) { mask[y * W + x] = 1; masked++; } }
  }
  let n = 0;
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    if (mask[y * W + x]) continue;
    const i = (y * W + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  const area = (BOX[2] - BOX[0]) * (BOX[3] - BOX[1]);
  return { n, masked, area, ents: (ents || []).length };
}

(async () => {
  say('=== 자연물 실장 실클라 E2E (배치 21) ===');
  // ── 0) 자산 규격 — 파일이 실제로 배포 경로에 있고 앵커와 치수가 맞나 ──────────
  const anch = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/nature/nature_anchors.json'), 'utf8'));
  say('\n[0] 자산 규격 — 1셀=1m 규약');
  let treeN = 0, badSize = [], badFile = [];
  // ★[T129] 어느 그림이 성목/묘목/그루터기인가 — **종 표가 말한다**(여기 목록을 안 적는다).
  const TSTAGE = {}; const TSTAGE_N = { adult: 0, sapling: 0, stump: 0 };
  {
    const sp = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/trees/tree_species.json'), 'utf8')).species || {};
    for (const id of Object.keys(sp)) {
      // ★[T169] 열매판 칸이 둘이 됐다(`summer`·`autumn`) — 철 이름 칸이다. 여기 이름을 적지 않고
      //   **종 표가 부르는 칸을 전부** 훑는다: 칸이 또 늘어도 이 줄은 안 고친다.
      const PLATES = ['sprites', 'summer', 'autumn'];
      for (const k of PLATES.flatMap((c) => sp[id][c] || [])) TSTAGE[k] = 'adult';
      if (sp[id].sapling) TSTAGE[sp[id].sapling] = 'sapling';
    }
    TSTAGE['stump01'] = 'stump';
    for (const v of Object.values(TSTAGE)) TSTAGE_N[v]++;
  }
  const TREE_EXPECT = Object.keys(TSTAGE).length;
  for (const k of Object.keys(anch)) {
    const a = anch[k];
    const dir = a.kind === 'tree' ? 'trees' : 'nature';
    const f = path.join(ROOT, 'public/assets', dir, k + '.png');
    if (!fs.existsSync(f)) { badFile.push(k); continue; }
    const im = PNG.sync.read(fs.readFileSync(f));
    if (im.width !== a.w || im.height !== a.h) badFile.push(k + '(치수불일치)');
    if (a.kind === 'tree') {
      treeN++;
      // ★★[T129] 높이 규격은 **성목에만** 건다. `kind=tree` 안에 이제 세 종류가 산다:
      //   성목(3~8m) · 묘목(0.4~1.6m) · 그루터기(0.3~1.2m). 셋에 한 자를 대면
      //   묘목이 "규격 미달 나무"로 빨개진다 — 자가 틀린 것이지 그림이 틀린 게 아니다.
      const st = TSTAGE[k] || 'adult';
      const band = { adult: [3.0, 8.0], sapling: [0.4, 1.6], stump: [0.3, 1.2] }[st];
      if (!(a.m >= band[0] && a.m <= band[1])) badSize.push(`${k}=${a.m}m(${st} ${band[0]}~${band[1]})`);
    }
  }
  // ★[T129] 그루터기·묘목이 늘면서 12 가 아니게 됐다. **수를 여기 적지 않는다** —
  //   종 표(`tree_species.json`)가 정본이고, 거기에 그루터기 하나를 더한 것이 전부여야 한다.
  ok(treeN === TREE_EXPECT,
     `나무 그림 ${treeN}장 = 종 표가 부르는 ${TREE_EXPECT}장(성목 ${TSTAGE_N.adult} · 묘목 ${TSTAGE_N.sapling} · 그루터기 ${TSTAGE_N.stump})`);
  ok(badFile.length === 0, `모든 스프라이트 파일 존재·치수 일치 ${badFile.length ? JSON.stringify(badFile) : ''}`);
  ok(badSize.length === 0, `★단계별 높이 규격(성목 3~8m · 묘목 0.4~1.6m · 그루터기 0.3~1.2m) ${badSize.length ? JSON.stringify(badSize) : '(전부 통과)'}`);
  const fringeKeys = Object.keys(anch).filter((k) => /^(grass|reed|cattail)/.test(k));
  ok(fringeKeys.length === 10, `물가 술 10종(풀포기4·갈대3·부들3) = ${fringeKeys.length}`);
  const reeds = Object.keys(anch).filter((k) => /^(reed|cattail)/.test(k)).map((k) => anch[k].m);
  ok(reeds.every((m) => m > 1.3), `★갈대·부들은 실제로 크다(전부 >1.3m: ${reeds.map((m) => m.toFixed(1)).join(',')}) — 풀대로 때우지 않았다`);

  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  const { chromium } = require('playwright');
  const S = {};
  for (const [tag, site] of Object.entries(SITES)) {
    say(`\n── ${tag} 셀(${site.cx},${site.cy}) — ${site.why}`);
    const z = boot('zone', '/tmp/zone-wrap.js', {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
      WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.cx * 32 + 16, y: site.cy * 32 + 16, name: '자연물 ' + tag } }),
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), `zone 기동 (${tag})`);
    await sleep(4000);
    const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    const cerr = [];
    page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 100) + ' @' + JSON.stringify(m.location()).slice(0, 140)); });
    page.on('pageerror', (e) => cerr.push('PAGEERROR ' + String(e).slice(0, 160)));
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
    await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
    //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
    //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
    //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
    //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
    //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
    try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
    await sleep(20000);
    const knob = async (o) => { await page.evaluate((k) => { Object.assign(window.__terrain19, k); }, o); await sleep(1500); };
    // ★[T98 2026-09-05] **하늘도 끈다** — 바람을 끈 것과 같은 자리다. T98 이 `weatherFor` 에
    //   `precip` 을 실으면서 세계가 실제로 비를 보낸다. 비는 매 프레임 다시 그려지고 **안개 합성 뒤**에
    //   그려지므로, 두 프레임 동일·안개 위 밝은 픽셀 같은 판정이 하늘 때문에 빨개진다.
    //   이 하네스가 재는 건 하늘이 아니다 ⇒ 끄는 문은 T93 이 남긴 진단 훅 하나(안 켜져 있으면 무해).
    await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
    // ★★[2026-08-26] 프레임마다 **그 순간 생물이 그려진 화면 자리**를 같이 들고 다닌다.
    //   이 하네스의 픽셀 판정은 전부 *지형·자연물·바람*이 대상이지 **짐승이 아니다**.
    //   그런데 사슴 한 마리가 걸어 들어오면 결정론 판정(1007px)도, 무풍 잡음 바닥 판정(202 > 153)도
    //   같이 무너진다 — 같은 코드가 판마다 73/0 과 72/1 을 오갔다.
    //   자리는 클라가 **자기 변환으로** 내준다(`__entBoxes()`). 하네스가 화면 변환을 베끼지 않는다.
    //   스크린샷과 훅 읽기 사이에도 프레임이 더 그려지므로 **전·후 두 번** 읽어 합집합을 쓴다.
    const ents = () => page.evaluate(() => (window.__entBoxes ? window.__entBoxes() : [])).catch(() => []);
    const grab = async (n) => {
      const p2 = `${SHOTS}/${tag}-${n}.png`;
      const e0 = await ents();
      await page.screenshot({ path: p2 });
      const e1 = await ents();
      const img = PNG.sync.read(fs.readFileSync(p2));
      img._ents = [...e0, ...e1];
      return img;
    };
    const dbg = () => page.evaluate(() => ({ nat: window.__natDbg, water: window.__waterDbg })).catch(() => null);
    // ★안개 위로 뜨는 픽셀 계측 — 판정 정본은 `window._shadowMask` 의 **알파**다(하네스가 시야를
    //   다시 계산하면 그게 사본이다). 알파 248↑ = 한 번도 못 본 셀. 그 자리에 밝은 픽셀이 있으면
    //   무언가가 안개 위로 떠 있다는 뜻이다.
    // ★개체 단위 안개 게이트 계측 — 그려진 개체의 자리를 받아 하네스가 `_seenChunks`(정본)로 직접 대조한다.
    const gateCheck = () => page.evaluate(() => {
      const sc = window._seenChunks;
      const drawn = window.__fogGateProbe ? window.__fogGateProbe() : [];
      //  구조물은 '발자국 어느 한 칸이라도 봤으면' 보인다 — 클라와 같은 규약을 하네스가
      //  **원자료(_seenChunks)로 독립 재계산**한다(클라 판정 함수를 부르면 사본이다).
      const R = { building: 4, hutroof: 4, simvil: 10, claim: 4, banditcamp: 4, stair_cell: 1 };
      //  ★★의도적 **면제** 목록 — 산은 지형이라 게이트를 안 건다(근거는 client.js `_GATE_FREE` 주석).
      //    하네스는 이 목록을 **자기가 들고** 클라가 내보낸 목록과 대조한다 — 나중에 누가
      //    말없이 하나 더 빼면 여기서 깨진다(조용한 면제 금지).
      const EXEMPT = ['mtseg'];
      const seen1 = (cx, cy) => { const st = sc && sc.get((cx >> 4) + '_' + (cy >> 4)); return !!st && st.has(cx * 65536 + cy); };
      let bad = 0; const badKinds = {};
      for (const [wx, wy, kind] of drawn) {
        if (EXEMPT.indexOf(kind) >= 0) continue;
        const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
        let okc = seen1(cx, cy);
        const r = R[kind];
        if (!okc && r) for (let k = 0; k < 8 && !okc; k++) {
          okc = seen1(cx + [1,-1,0,0,1,1,-1,-1][k] * r, cy + [0,0,1,-1,1,-1,1,-1][k] * r);
        }
        if (!okc) { bad++; badKinds[kind] = (badKinds[kind] || 0) + 1; }
      }
      let seenCells = 0; if (sc) for (const v of sc.values()) seenCells += v.size;
      const cf = (window.__fogGateDbg && window.__fogGateDbg.freeKinds) || [];
      return { drawn: drawn.length, bad, badKinds, seenCells, dbg: window.__fogGateDbg,
               exemptOk: cf.length === EXEMPT.length && cf.every((k, i) => k === EXEMPT.slice().sort()[i]), clientExempt: cf };
    }).catch(() => ({ drawn: 0, bad: 0, badKinds: {}, seenCells: 0, dbg: null }));
    const fogLit = () => page.evaluate(() => {
      const cv = document.querySelector('canvas'), mc = window._shadowMask;
      if (!mc) return { unseen: 0, lit: 0 };
      const M = 64, W = cv.width, H = cv.height;
      const md = mc.getContext('2d').getImageData(0, 0, mc.width, mc.height).data;
      const sd = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let unseen = 0, lit = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (md[((y + M) * mc.width + (x + M)) * 4 + 3] < 248) continue;
        unseen++;
        const si = (y * W + x) * 4;
        if (sd[si] + sd[si + 1] + sd[si + 2] > 60) lit++;
      }
      return { unseen, lit };
    }).catch(() => ({ unseen: 0, lit: 0 }));

    // ★[재민 2026-08-07] 물가 술은 **반려**됐다 — 손잡이를 하나도 안 건드린 상태에서 0 이어야 한다.
    //   (아래 절들은 그 뒤에 `fringeOff:false` 로 **일부러 켜서** 잠든 코드가 살아 있는지 본다.)
    const dDefault = await dbg();
    await knob({ legacy: false, freezeT: 100, natOff: false, fringeOff: false, propOff: false, propNoAvoid: false, entBoxes: true });
    const d0 = await dbg();
    const fOn = await grab('on'), fOn2 = await grab('on2');
    const entPx = [...(fOn._ents || []), ...(fOn2._ents || [])];
    const probe = await page.evaluate(() => window.__natProbe());
    const fogOn = await fogLit();
    const gate = await gateCheck();
    await knob({ fogGateOff: true });
    const gateOff = await gateCheck();
    await knob({ fogGateOff: false });
    // ★★[안개 위 논밭 2026-08-30] 영토 경계 셀의 안개 판정 — 수리본과 대조군을 나란히 잰다.
    //   계측 정본은 클라가 프레임마다 세는 `__simvilProbe`(그 안이 `_seenChunks` 로 판정한다).
    const svProbe = () => page.evaluate(() => (window.__simvilProbe ? window.__simvilProbe() : null)).catch(() => null);
    const simvilOn = await svProbe();
    await knob({ simvilCellGateOff: true });
    const simvilOff = await svProbe();
    await knob({ simvilCellGateOff: false });
    // ★★[T57 2026-09-03] 사유지 셀도 같은 문법으로 잰다 — 안개 게이트의 **세 번째 층**.
    //   훅은 클라가 프레임마다 채운다(`window.__claimCells`). 하네스는 스냅샷만 뜬다.
    const clProbe = () => page.evaluate(() => (window.__claimCells ? JSON.parse(JSON.stringify(window.__claimCells)) : null)).catch(() => null);
    const claimOn = await clProbe();
    await knob({ claimCellGateOff: true });
    const claimOff = await clProbe();
    await knob({ claimCellGateOff: false });
    await knob({ natOff: true });
    const fogOff = await fogLit();
    await knob({ natOff: false, fringeOff: true });
    const fNoFr = await grab('nofringe');
    await knob({ fringeOff: false, propOff: true });
    const fNoPr = await grab('noprop');
    await knob({ propOff: false, natOff: true });
    const fNoNat = await grab('nonat');
    // 반례 — 회피를 끄면 위반이 나와야 한다
    await knob({ natOff: false, propNoAvoid: true });
    const probeNA = await page.evaluate(() => window.__natProbe());
    await knob({ propNoAvoid: false });

    // ── ⓖ 바람 [2026-08-06c 신설] ─────────────────────────────────────────
    //   시간은 **게임 시계**다. 같은 freezeT 면 그림이 같아야 하고(ⓔ 가 이미 봄),
    //   시각을 옮기면 **움직여야** 한다. 그리고 `windForce` 를 주면 그 값이 **정본**이 돼야
    //   한다 — 그 자리가 곧 날씨 시스템이 붙을 자리다(지금 게임엔 날씨 상태가 없다).
    //   ★물을 끄고 잰다 — `freezeT` 는 **물 셰이더도** 굴린다. 안 끄면 수면이 흐른 픽셀을
    //     "풀이 흔들렸다"로 오독한다(계측기 격리, §5-a 와 같은 계보).
    await knob({ windOff: false, waterOff: true, windForce: 0.85, freezeT: 100 });
    const wOn100 = await grab('wind-t100');
    await knob({ freezeT: 100.9 });
    const wOn101 = await grab('wind-t101');
    //   반례 — 무풍(force 0)이면 시각을 옮겨도 자연물은 **안 움직인다**
    await knob({ freezeT: 100, windForce: 0 });
    const wCalm100 = await grab('wind-calm100');
    await knob({ freezeT: 100.9 });
    const wCalm101 = await grab('wind-calm101');
    //   대조군 — 자연물 자체를 끈 두 프레임. NPC·동물·HUD 시계가 만드는 **잡음 바닥**이다.
    await knob({ freezeT: 100, natOff: true });
    const wBase100 = await grab('wind-base100');
    await knob({ freezeT: 100.9 });
    const wBase101 = await grab('wind-base101');
    await knob({ natOff: false, waterOff: false });
    const windFn = await page.evaluate(() => {
      const T = window.__terrain19, keep = T.windForce, keepT = T.freezeT;
      T.windForce = null; const out = [];
      for (let t = 0; t < 120; t += 3) { T.freezeT = t; out.push(window.__windProbe().w); }
      T.freezeT = 0.5; const forced = (T.windForce = 0.37, window.__windProbe().w);
      T.windForce = keep; T.freezeT = keepT;
      return { out, forced };
    }).catch(() => ({ out: [], forced: null }));
    await knob({ windForce: null, freezeT: 100 });

    // ── ⓗ 물가 여백 [2026-08-06c 신설] ────────────────────────────────────
    //   폭의 정본은 클라의 `_shoreMargin` 이다(하네스가 다시 짜면 사본 = 자명 통과).
    //   판정(빈 구간 비율·변동계수)만 여기서 한다.
    const shWidths = await page.evaluate(() => window.__shoreProbe(900)).catch(() => []);
    // ── ⓘ 풀 카펫 흔들림 [2026-08-07 신설] ────────────────────────────────
    //   ★재민 정정: 흔들려야 하는 건 흩뿌린 포기가 아니라 **초원에 깔린 지면 풀 텍스처**다.
    //   구조: 바탕(평탄색) + 잎((tex−평탄색)×투과율)을 가로 띠로 어긋나게 가산 blit.
    //   ⇒ 이 절의 핵심은 **항등식**이다 — 무풍이면 옛 그림과 픽셀이 같아야 한다.
    //     (같지 않으면 "구조만 쪼갰다"가 아니라 그림을 바꾼 것이다.)
    //   ★자연물·물을 꺼서 **카펫만** 남긴다 — 안 그러면 술과 수면이 움직인 픽셀을 카펫으로 오독한다.
    await knob({ natOff: true, waterOff: true, windGrassOff: false, windForce: 0, freezeT: 100 });
    const cpCalm = await grab('carpet-calm');
    await knob({ windGrassOff: true });
    const cpLegacy = await grab('carpet-legacy');
    const cpDbgOff = await page.evaluate(() => window.__groundDbg).catch(() => null);
    await knob({ windGrassOff: false, windForce: 0.9, freezeT: 100 });
    //   ★띠 수는 **바람이 불 때** 재야 한다 — 무풍이면 어긋남이 0 이라 통짜 blit 로 떨어진다.
    const cpDbgOn = await page.evaluate(() => window.__groundDbg).catch(() => null);
    const cpW0 = await grab('carpet-w100');
    await knob({ freezeT: 101.4 });
    const cpW1 = await grab('carpet-w1014');
    await knob({ windForce: 0, freezeT: 100 });
    const cpC0 = await grab('carpet-c100');
    await knob({ freezeT: 101.4 });
    const cpC1 = await grab('carpet-c1014');
    await knob({ natOff: false, waterOff: false, windForce: null, freezeT: 100 });

    const fMarginOn = await grab('margin-on');
    await knob({ shMargin: 0 });
    const shWidths0 = await page.evaluate(() => window.__shoreProbe(900)).catch(() => []);
    const fMarginOff = await grab('margin-off');
    await knob({ shMargin: 1 });

    S[tag] = { dDefault, d0, fOn, fOn2, entPx, fNoFr, fNoPr, fNoNat, probe, probeNA, cerr, bad: [...new Set(bad)], fogOn, fogOff, gate, gateOff, simvilOn, simvilOff, claimOn, claimOff,
               wOn100, wOn101, wCalm100, wCalm101, wBase100, wBase101, windFn, shWidths, shWidths0, fMarginOn, fMarginOff,
               cpCalm, cpLegacy, cpW0, cpW1, cpC0, cpC1, cpDbgOn, cpDbgOff };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }
  const R = S.river, F = S.field;

  // ═══ [T75 2026-09-03] **세 번째 자리 — 논밭이 화면에 실재하는 곳** ═════════════════
  //   왜 한 판 더 띄우나: 위 두 자리는 지형 프로브라 논밭이 **한 칸도 없다**(T57 실측 cand 0).
  //   자리는 위 `pickFarmSite` 가 **존 DB + 클라 상수**로 고른다 — 좌표 하드코딩 0(족보 73).
  //   ★마을 시딩은 위 두 판이 이미 같은 ZDB 에 해 뒀다 — 여기선 다시 안 심는다(부팅 몇 초).
  //   ★★못 고르면 **유보**다(자명 통과 금지): 아래 [7c] 가 "못 쟀다"를 찍고 rc 는 안 올린다.
  let FARM = null;
  const farmSite = pickFarmSite(ZDB);
  if (farmSite.err) {
    say(`\n── 논밭 자리 — **못 골랐다**: ${farmSite.err}`);
  } else {
    say(`\n── 논밭 셀(${farmSite.cx},${farmSite.cy}) — ${farmSite.why}`);
    const z = boot('zone', '/tmp/zone-wrap.js', {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
      WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: farmSite.cx * 32 + 16, y: farmSite.cy * 32 + 16, name: '논밭 프로브' } }),
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동 (논밭)');
    await sleep(4000);
    const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
    // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
    //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
    //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
    //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
    //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
    //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
    //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
    try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
    await sleep(20000);
    const knob = async (o) => { await page.evaluate((k) => { Object.assign(window.__terrain19, k); }, o); await sleep(1500); };
    // ★[T98 2026-09-05] **하늘도 끈다** — 바람을 끈 것과 같은 자리다. T98 이 `weatherFor` 에
    //   `precip` 을 실으면서 세계가 실제로 비를 보낸다. 비는 매 프레임 다시 그려지고 **안개 합성 뒤**에
    //   그려지므로, 두 프레임 동일·안개 위 밝은 픽셀 같은 판정이 하늘 때문에 빨개진다.
    //   이 하네스가 재는 건 하늘이 아니다 ⇒ 끄는 문은 T93 이 남긴 진단 훅 하나(안 켜져 있으면 무해).
    await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });

    // ═══ ★★[T148-B 2026-09-07] 나무는 **제 종으로** 선다 ═════════════════════════
    //   재민 캐논: *"열매는 보이고, 가서 딴다."* 그 앞 절반 — **밤나무는 밤나무로 보인다.**
    //   ★소스를 읽지 않는다. **화면에게 묻는다**(`__treeSpriteFor` 는 실제로 그리는 그 함수를 탄다).
    //   ★기대값은 손으로 안 적는다 — `tree_species.json` **표**를 그대로 대조한다(사본 0).
    {
      const TBL = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/trees/tree_species.json'), 'utf8')).species;
      const names = await page.evaluate(() => (window.__treeSpeciesTable ? window.__treeSpeciesTable() : null));
      ok(!!names && names.length === Object.keys(TBL).length,
        `★★나무① 클라가 **표를 읽었다** — 종 ${names ? names.length : 'null'}개 (표 ${Object.keys(TBL).length}개 · 클라에 종 목록 0)`);
      // ⓐ 종이 다르면 판도 다르다 — 같은 자리에서 종만 바꿔 묻는다(자리 해시는 고정 ⇒ 갈린 건 종뿐)
      const at = (sp, f) => page.evaluate((a2) => (window.__treeSpriteFor ? window.__treeSpriteFor(a2[0], 1000, 1000, a2[1]) : null), [sp, !!f]);
      const pine = await at('pine'), chest = await at('chestnut');
      ok(pine && chest && pine !== chest,
        `★★나무ⓐ 종이 다르면 **다른 판**을 쓴다 — 소나무 ${pine} ≠ 밤나무 ${chest}`);
      ok(TBL.pine.sprites.includes(pine) && TBL.chestnut.sprites.includes(chest),
        `★★나무ⓐ 그리고 그 둘은 **표가 그 종에 적어 둔 판**이다(사본 0)`);
      // ⓑ 같은 자리 두 번 = 같은 판(주사위 0)
      ok((await at('pine')) === pine, `★나무ⓑ 같은 자리·같은 종은 **몇 번을 물어도 같은 판**이다(주사위 0)`);
      // ⓒ 자리가 다르면 같은 종 안에서 판이 갈린다(판이 여럿인 종으로만 — 소나무 3장)
      const p2 = await page.evaluate(() => window.__treeSpriteFor('pine', 1064, 2312, false));
      ok(TBL.pine.sprites.includes(p2), `★나무ⓒ 다른 자리도 **소나무 판 셋 중 하나**다 (${p2})`);
      // ⓓ 열매철엔 열매판 — 표의 열매 목록(지금은 `autumn` · T169 이 `summer` 를 더해도 클라 무변)
      const fkey = TBL.chestnut.autumn ? 'autumn' : 'summer';
      const cf = await at('chestnut', true);
      ok(TBL.chestnut[fkey].includes(cf) && cf !== chest,
        `★★나무ⓓ 열매가 달리면 **열매판**으로 갈린다 — ${chest} → ${cf} (표의 \`${fkey}\`)`);
      // ⓔ 열매판이 **없는** 종은 열매철이어도 성목판 그대로(소나무엔 열매 그림이 없다)
      ok((await at('pine', true)) === pine, `★★나무ⓔ 열매판이 없는 종은 그대로다 — 소나무 ${pine}(없는 그림을 지어내지 않는다)`);
      // ⓕ 되돌림 — `sp` 가 없으면(옛 저장 · T135_TREES=0) 종전 열두 장 해시로 떨어진다
      ok((await at(null)) === null && (await at('nosuchtree')) === null,
        `★★나무ⓕ \`sp\` 가 없거나 표에 없는 종이면 **표 경로를 안 탄다** — 종전 그림으로 떨어진다(되돌림)`);
      // ⓖ 자명 통과 금지 — 표에 없는 이름을 물으면 null 이어야 하고, 위 ⓐ가 그걸 통과로 세지 않는다
      ok(pine !== null && (await at('nosuchtree')) === null,
        `★나무ⓖ 자명 통과 금지 — 아는 종엔 답이 있고 모르는 종엔 없다`);
      // ⓗ 세계가 실제로 종을 실어 보낸다 — **시더 정본에게 직접 묻는다**(새 클라 훅 0).
      //   클라에 `resources` 를 내주는 훅이 없고, 그걸 만들면 최상위 전역이 는다(T0-b 표).
      //   ⇒ 화면이 받는 그 행을 만드는 **그 함수**(`chunk.js`)를 그대로 불러 센다 — 사본 0.
      {
        const CH = require(path.join(ROOT, 'server', 'chunk.js'));
        const TR = require(path.join(ROOT, 'server', 'terrain.js'));
        let rows = [];
        for (let k = 0; k < 6 && !rows.length; k++) {
          try { rows = CH.generateChunkResources('hanbando', 'forest', 300 + k, 300 + k, CH.CHUNK_SIZE, new Set(), 100) || []; } catch (e) { rows = []; }
        }
        const trees = rows.filter((r) => r.type === 'tree');
        const withSp = trees.filter((r) => r.sp);
        const kinds = Array.from(new Set(withSp.map((r) => r.sp)));
        ok(trees.length > 0 && withSp.length === trees.length,
          `★★나무ⓗ 시더가 내는 나무가 **전부 종을 들고 있다** — ${withSp.length}/${trees.length} (종 ${kinds.join(',')})`);
        ok(kinds.every((k2) => !!TBL[k2]),
          `★★나무ⓗ 그리고 그 종 이름이 **전부 표에 있다** — 서버가 내는 이름과 그림 표가 같은 낱말을 쓴다`);
        void TR;
      }
    }

    await knob({ legacy: false, freezeT: 100, natOff: false, fringeOff: false, propOff: false, propNoAvoid: false });
    const clProbe = () => page.evaluate(() => (window.__claimCells ? JSON.parse(JSON.stringify(window.__claimCells)) : null)).catch(() => null);
    const claimOn = await clProbe();
    await knob({ claimCellGateOff: true });
    const claimOff = await clProbe();
    await knob({ claimCellGateOff: false });
    const farmN = await page.evaluate(() => (window.__getAllBuildings ? window.__getAllBuildings().filter((b) => b.type === 'farmland').length : -1)).catch(() => -1);
    say(`    화면 안 논밭 개체 ${farmN}칸`);
    await page.screenshot({ path: `${SHOTS}/farm-site.png` }).catch(() => {});
    FARM = { claimOn, claimOff, site: farmSite, farmN };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }

  // ═══ ★★[T170 2026-09-11 재민 확정] **가을에 밤이 보인다** — `fruitNow` 한 비트 ════════════
  //   재민 캐논: *"열매는 보이고, 가서 딴다."* T148-B 가 앞 절반(밤나무는 밤나무로 보인다)을 했고,
  //   여기는 뒤 절반이다 — **지금 이 나무에 열매가 달렸나**가 선을 타고 화면까지 온다.
  //
  //   ★소스를 안 읽는다. **세계에게 묻는다** — 실클라가 쓰는 그 웹소켓으로 붙어, 서버가 실제로
  //     보낸 개체 행의 `fruitNow` 를 읽는다(하네스가 서버 함수를 다시 부르면 그게 사본 계측기다).
  //   ★자리·날짜·기대값을 손으로 안 적는다: 자리는 시더 정본(`chunk.js` · `CHUNK_SIZE` 도 정본에서)이
  //     고르고, 철은 `Trees.fruitSeasonOf`(서버 종 표)가 말하고, 판 이름은 `tree_species.json` 이 말한다.
  //   ★픽스처 규약(공통 §2 ⑩): 정해진 초를 안 잔다 — **세계가 그 시계를 말할 때까지** 기다리고
  //     (증인 ① 서버가 되돌려 주는 `시계 세움` 알림), 그 다음 **세계가 그 철을 살 때까지** 기다린다
  //     (증인 ② 개체 행의 비트). 증인이 하나면 T140 이 잡은 그 구멍이 다시 열린다.
  {
    const WebSocket = require('ws');
    const TR = require(path.join(ROOT, 'server', 'trees.js'));
    const CH2 = require(path.join(ROOT, 'server', 'chunk.js'));
    const TBL2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/trees/tree_species.json'), 'utf8')).species;
    const YD = TR.yearDays(), CS = CH2.CHUNK_SIZE;

    // ── 자리 — **기계가 고른다**(하드코딩 0). 밤나무와 소나무가 같은 화면에 서는 숲 청크 하나.
    //    시더 정본을 **존과 같은 청크 크기로** 불러 세우므로 화면이 받을 그 행과 같은 답이다(사본 0).
    let FSITE = null;
    outer:
    for (let cx = 50; cx <= 350 && !FSITE; cx += 3) for (let cy = 50; cy <= 350; cy += 3) {
      let rws = []; try { rws = CH2.generateChunkResources('hanbando', 'forest', cx, cy, CS, new Set(), 100) || []; } catch (e) { continue; }
      const tr = rws.filter((r) => r.type === 'tree');
      if (tr.length < 40) continue;
      const chn = tr.filter((r) => r.sp === 'chestnut'), pns = tr.filter((r) => r.sp === 'pine');
      if (chn.length >= 8 && pns.length >= 4) {
        // 가장 가운데 있는 밤나무의 **셀 중심**에 광장을 놓는다(스폰은 셀 중심에 스냅된다 —
        // zone.js `sx = floor(sx/32)*32+16`) ⇒ 그 나무는 반드시 `GATHER_RANGE` 안이다.
        const c0 = cx * CS + CS / 2, c1 = cy * CS + CS / 2;
        chn.sort((a, b) => (Math.hypot(a.x - c0, a.y - c1) - Math.hypot(b.x - c0, b.y - c1)));
        FSITE = { cx, cy, n: tr.length, ch: chn.length, pn: pns.length, tree: chn[0] };
        break outer;
      }
    }
    if (!FSITE) {
      ok(false, '★★열매① 밤나무·소나무가 같이 선 숲 청크를 못 찾았다 — 못 쟀다');
    } else {
      const SQ = { x: Math.floor(FSITE.tree.x / 32) * 32 + 16, y: Math.floor(FSITE.tree.y / 32) * 32 + 16 };
      say(`\n── 열매 자리: 청크(${FSITE.cx},${FSITE.cy})·${CS}px 나무 ${FSITE.n}그루 · 밤나무 ${FSITE.ch} · 소나무 ${FSITE.pn} — 광장 (${SQ.x},${SQ.y})`);
      const z3 = boot('zone', '/tmp/zone-wrap.js', {
        PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
        ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1',
        ZONE_TEST_INV: 'acorn:3,chestnut:3',   // ★[T178·T187] 심기 절 — 있는 테스트 손잡이 하나(운영엔 분기 0)
        WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SQ.x, y: SQ.y, name: '열매 프로브' } }),
      });
      ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동 (열매)');

      // ── 실클라가 쓰는 그 선 — 붙어서 **서버가 보낸 행**을 그대로 모은다 ────────────────
      const rows = new Map();       // id → 행(서버가 마지막으로 보낸 것)
      const feed = { spawn1: 0, spawnN: 0, update: 0 };
      const notices = [];
      let WELCOME = null;
      const soak = (m) => {
        if (m.type === 'welcome') { WELCOME = m; for (const r of (m.resources || [])) rows.set(r.id, r); }
        else if (m.type === 'resources_spawn') { feed.spawnN++; for (const r of (m.resources || [])) rows.set(r.id, r); }
        else if (m.type === 'resource_spawn') { feed.spawn1++; if (m.resource) rows.set(m.resource.id, m.resource); }
        else if (m.type === 'resource_update') { feed.update++; const r = rows.get(m.id); if (r) r.hp = m.hp; }
        else if (m.type === 'resources_removed') for (const id of (m.ids || [])) rows.delete(id);
        else if (m.type === 'resource_removed') rows.delete(m.id);
      };
      const connect = () => new Promise((res, rej) => {
        const ws = new WebSocket(`ws://localhost:${ZPORT}/?name=%EC%97%B4%EB%A7%A4`);
        const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
        ws.on('message', (raw) => {
          let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
          soak(m);
          if (m.type === 'notice') notices.push(m.text);
          if (m.type === 'welcome') { clearTimeout(t); res(ws); }
        });
        ws.on('error', (e) => { clearTimeout(t); rej(e); });
      });
      let W = await connect().catch((e) => { ok(false, `★★열매① 존에 못 붙었다 — ${e.message}`); return null; });

      if (W) {
        const sendW = (m) => { try { W.send(JSON.stringify(m)); } catch (e) {} };
        // ★숨쉬기 — 30초 입력이 없으면 존이 좀비로 보고 선을 끊는다(zone.js `STALE_WS_MS`).
        //   실측으로 그걸 밟았다: 끊긴 뒤엔 시계도 안 서고 방송도 안 와 판정이 전부 거짓 빨강이 됐다.
        let _seq = 0; const HB = setInterval(() => sendW({ type: 'input', seq: ++_seq, vx: 0, vy: 0 }), 5000);
        const treesOf = (sp) => [...rows.values()].filter((r) => r.type === 'tree' && r.sp === sp);
        const until = async (fn, ms, every) => {
          const t0 = Date.now();
          while (Date.now() - t0 < (ms || 60000)) { if (fn()) return true; await sleep(200); if (every) every(); }
          return fn();
        };
        await until(() => treesOf('chestnut').length > 0, 60000);
        const nCh = treesOf('chestnut').length, nPn = treesOf('pine').length, nMu = treesOf('mulberry').length;
        ok(nCh > 0 && nPn > 0, `★★열매① 세계가 밤나무 ${nCh}그루·소나무 ${nPn}그루·산뽕 ${nMu}그루를 **선으로** 실어 보냈다`);
        ok(treesOf('chestnut').every((r) => typeof r.fruitNow === 'boolean'),
          `★★열매① 그 행에 **\`fruitNow\` 한 비트**가 실려 있다(열매 종 ${nCh}그루 전부 boolean)`);

        // ── 철 세우기 — 증인 둘(시계 알림 · 개체 비트). 날짜는 달력 정본이 고른다(손으로 안 적는다).
        const midOf = (se, yr) => { const ds = []; for (let d = 0; d < YD; d++) if (TR.seasonOfDay(d) === se) ds.push(d); return yr * YD + ds[Math.floor(ds.length / 2)]; };
        const setSeason = async (se, yr, cond) => {
          const day = midOf(se, yr), n0 = notices.length; let last = 0;
          const seen = await until(() => notices.slice(n0).some((t) => t.includes('시계 세움') && t.includes('"day":' + day)), 30000,
            () => { if (Date.now() - last > 2000) { last = Date.now(); sendW({ type: '__e2e_clock', day, night: false }); } });
          const okk = seen && await until(cond, 30000);
          return { day, seen, ok: okk, se: TR.seasonOfDay(day) };
        };
        const allF = (sp) => () => treesOf(sp).every((r) => !r.fruitNow);
        const allT = (sp) => () => { const a = treesOf(sp); return a.length > 0 && a.every((r) => r.fruitNow === true); };
        const onN = (sp) => treesOf(sp).filter((r) => r.fruitNow).length;

        // ⓐ 겨울 — 아무것도 안 달렸다(겨울 소멸이 여기서 일어나 다음 해가 깨끗한 판이 된다)
        const w0 = await setSeason('winter', 0, () => allF('chestnut')() && allF('mulberry')());
        ok(w0.ok, `★★열매ⓐ **겨울엔 안 달렸다** — day ${w0.day}(${w0.se}) · 밤나무 ${onN('chestnut')}/${nCh} · 산뽕 ${onN('mulberry')}/${nMu}`);
        // ⓑ 봄 — 아직이다
        const s1 = await setSeason('spring', 1, () => allF('chestnut')() && allF('mulberry')());
        ok(s1.ok, `★★열매ⓑ **봄에도 아직이다** — day ${s1.day}(${s1.se}) · 밤나무 ${onN('chestnut')}/${nCh}`);
        // ⓒ 여름 — 밤은 아직, **산뽕은 익는다**. 철은 서버 종 표가 정본이다(비트가 철을 다시 안 말한다)
        const u1 = await setSeason('summer', 1, () => allF('chestnut')() && (nMu === 0 || allT('mulberry')()));
        ok(u1.ok && onN('chestnut') === 0,
          `★★★열매ⓒ **여름엔 오디가 익고 밤은 아직이다** — day ${u1.day}(${u1.se}) · 산뽕 ${onN('mulberry')}/${nMu}(표 \`${TR.fruitSeasonOf('mulberry')}\`) · 밤나무 ${onN('chestnut')}/${nCh}(표 \`${TR.fruitSeasonOf('chestnut')}\`)`);
        // ⓓ 가을 — **밤이 보인다**. 그 순간 개체 방송이 **실제로 나간다**(ⓕ 의 대조군)
        const fb = { ...feed };
        const a1 = await setSeason('autumn', 1, allT('chestnut'));
        const burst = (feed.spawnN - fb.spawnN) + (feed.spawn1 - fb.spawn1);
        ok(a1.ok, `★★★열매ⓓ **가을에 밤이 보인다** — day ${a1.day}(${a1.se}) · 밤나무 ${onN('chestnut')}/${nCh} 전부 \`fruitNow=true\``);
        ok(burst > 0, `★★열매ⓓ 그리고 그 **뒤집히는 순간에만** 방송이 나갔다 — 철이 바뀌며 개체 방송 ${burst}건`);
        ok(treesOf('pine').every((r) => r.fruitNow === undefined),
          `★★열매ⓔ **소나무엔 비트가 아예 없다** — 열매가 안 여는 종은 이 물음의 대상이 아니다(소나무 ${nPn}그루)`);

        // ⓕ 매 틱 0 — 철을 고정해 둔 동안 개체 방송이 **한 건도 안 온다**(대조군은 위 ⓓ 의 ${burst}건)
        const f0 = { ...feed };
        await sleep(6000);
        const dN = (feed.spawnN - f0.spawnN) + (feed.spawn1 - f0.spawn1);
        ok(dN === 0, `★★★열매ⓕ **매 틱 안 온다** — 철을 고정한 6초 동안 개체 방송 ${dN}건 (뒤집힐 땐 ${burst}건이 나갔다)`);

        // ⓖ 따감 — 그 나무만 꺼진다 · 나머지는 그대로 · `hp` 무접촉
        const target = treesOf('chestnut').sort((a, b) => Math.hypot(a.x - SQ.x, a.y - SQ.y) - Math.hypot(b.x - SQ.x, b.y - SQ.y))[0];
        const dist = Math.hypot(target.x - SQ.x, target.y - SQ.y);
        const hp0 = target.hp, nOn0 = onN('chestnut'), nt0 = notices.length;
        sendW({ type: 'pick_fruit', resId: target.id });
        await until(() => notices.length > nt0, 15000);
        const got = notices.slice(nt0).join(' | ');
        await until(() => { const r = rows.get(target.id); return r && r.fruitNow === false; }, 15000);
        const after = rows.get(target.id);
        ok(got.includes(TR.koOf('chestnut')), `★열매ⓖ 자명 통과 금지 — 실제로 **땄다**(${dist.toFixed(1)}px · 알림 「${got.slice(0, 40)}」)`);
        ok(!!after && after.fruitNow === false,
          `★★★열매ⓖ **따면 그 순간 꺼진다** — ${target.id} \`fruitNow\` true → ${after ? after.fruitNow : 'null'}`);
        ok(!!after && after.hp === hp0, `★★열매ⓖ 그런데 **나무는 안 줄었다** — hp ${hp0} → ${after ? after.hp : 'null'}(\`hp\` 무접촉 — T135 규약)`);
        ok(onN('chestnut') === nOn0 - 1, `★★열매ⓖ 그리고 **딴 그 한 그루만** 꺼졌다 — ${nOn0} → ${onN('chestnut')}그루`);
        // ⓗ 이듬해 그 철엔 다시 — 세계의 규약(연 1회)이 그렇게 말한다
        const a2 = await setSeason('autumn', 2, allT('chestnut'));
        ok(a2.ok, `★★열매ⓗ **이듬해 가을엔 다시 달린다** — day ${a2.day}(${a2.se}) · 밤나무 ${onN('chestnut')}/${nCh}`);
        // ⓘ 자명 통과 금지 — 같은 나무·같은 판정이 철에 따라 답을 바꿨다(둘 다 통과한 게 아니다)
        ok(w0.ok && u1.ok && a1.ok && w0.day !== a1.day,
          `★열매ⓘ 자명 통과 금지 — 같은 판정이 겨울·봄·여름엔 false, 가을엔 true 였다`);

        // ══ ★★[T187 2026-09-12 재민 확정] **심은 나무 둘째 판** — 종별 햇수 · 씨앗은 표에서 ══
        //   T178 이 심은 나무에 종(`sp`)을 실었다. 이 절은 그 다음 둘을 잰다:
        //     ① 씨앗 표를 **손으로 안 적는다** — 열매 품목이 있는 종이 곧 심을 수 있는 종이다.
        //     ② 심은 것도 **제 종의 햇수**로 자란다 — 벤 자리(시더)는 진작 그랬고 심은 자리만 안 그랬다.
        //   ★★돌연변이 손잡이가 여기 안에 있다: **같은 날 심은 밤나무와 참나무는 다른 날 성목이 된다.**
        //     종을 안 넘기던 종전 코드라면 둘 다 같은 날(공통 30년)이라 ③-2 가 빨개진다.
        let PLANTED = null, PLANTED_CH = null;
        {
          // ⓪ 씨앗 표 — **세계가 내주는 목록**(`welcome.plantSeeds`)과 종 표에서 유도한 것이 같은가
          const DERIVED = {};
          for (const id of TR.fruitIds()) { const it = TR.fruitOf(id); if (it) DERIVED[it] = id; }
          const served = (WELCOME && WELCOME.plantSeeds) ? WELCOME.plantSeeds.slice().sort() : null;
          const want = Object.keys(DERIVED).sort();
          ok(!!served && served.join(',') === want.join(','),
            `★★★심기⓪ **씨앗 표가 종 표에서 유도된다** — 세계가 내준 목록 [${served ? served.join(',') : 'null'}] = 열매 품목이 있는 종 [${want.join(',')}] (손편집 0)`);
          ok(want.length > 1, `★심기⓪ 자명 통과 금지 — 심을 수 있는 씨앗이 실제로 여럿이다(${want.length}종 · 종전엔 도토리 하나였다)`);
          const noFruit = TR.ids().filter((id) => !TR.fruitOf(id));
          ok(noFruit.length > 0 && noFruit.every((id) => !Object.values(DERIVED).includes(id)),
            `★★심기⓪ **열매가 없는 종은 못 심는다** — ${noFruit.map((i) => TR.koOf(i)).join('·')} (없는 품목을 지어내지 않는다)`);
          {   // 표에 없는 씨앗은 거절한다 — 소나무 씨앗 같은 건 애초에 없다
            const n0 = notices.length;
            sendW({ type: 'plant_tree', x: SQ.x + 64, y: SQ.y + 64, item: 'pine_seed' });
            await until(() => notices.length > n0, 8000);
            ok(/심을 수 있는 씨앗이 아니다/.test(notices.slice(n0).join(' | ')),
              `★★심기⓪ 그리고 표에 없는 씨앗은 **거절한다** — 「${notices.slice(n0).join(' | ').slice(0, 24)}」`);
          }

          // ① 심는다 — 밤과 도토리를 **같은 날** 이웃 칸에(성숙일 비교의 대조군)
          const plantOne = async (item) => {
            for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32], [32, 32], [-32, -32], [64, 0], [0, 64]]) {
              const before = new Set([...rows.keys()]);
              const n0 = notices.length;
              sendW({ type: 'plant_tree', x: SQ.x + dx, y: SQ.y + dy, item });
              await until(() => notices.length > n0, 8000);
              if (!/심었다/.test(notices.slice(n0).join(' | '))) continue;
              await until(() => [...rows.values()].some((r) => r.isSeed === false && !before.has(r.id)), 8000);
              const got = [...rows.values()].find((r) => r.isSeed === false && !before.has(r.id));
              if (got) return got;
            }
            return null;
          };
          const pCh = await plantOne('chestnut');
          const pOak = await plantOne('acorn');
          ok(!!pCh && !!pOak, `★★심기① **밤과 도토리를 같은 날 심었다** — 밤 ${pCh ? pCh.id : '✗'} · 도토리 ${pOak ? pOak.id : '✗'}`);
          if (pCh && pOak) {
            ok(pCh.sp === 'chestnut' && pOak.sp === 'oak',
              `★★★심기② **씨앗이 종을 정한다** — \`chestnut\`→\`${pCh.sp}\`(${TR.koOf('chestnut')}) · \`acorn\`→\`${pOak.sp}\`(${TR.koOf('oak')})`);
            ok(pCh.plantedDay === pOak.plantedDay, `★심기② 둘은 **같은 날** 심겼다 — day ${pCh.plantedDay}`);

            // ② 성숙 실일 — **정본이 정한다**(하네스가 수를 안 적는다)
            const RG = require(path.join(ROOT, 'server', 'chunk.js')).REGROW;
            const needOf = (sp) => { const g = TR.stageYearsOf(sp, RG.TREE_STUMP_Y(), RG.TREE_FULL_Y()); return (g[1] - g[0]) * YD; };
            const nCh2 = needOf('chestnut'), nOak2 = needOf('oak');
            const D0 = pCh.plantedDay;
            // 관전자의 시선이 "볼 때"를 만든다(T178 §2 — 걸음도 재접속도 안 통한다)
            const obs = new WebSocket(`ws://localhost:${ZPORT}/?observer=1`);
            await new Promise((r) => { obs.on('open', r); obs.on('error', r); setTimeout(r, 8000); });
            let look = 0;
            const relook = () => { look++; const far = (look % 2) ? CS * 3 : -CS * 3;
              try { obs.send(JSON.stringify({ type: 'viewport_update', x: SQ.x + far, y: SQ.y + far, w: 1400, h: 900 })); } catch (e) {} };
            const setDay = async (day) => {
              const n0 = notices.length; let last = 0;
              return until(() => notices.slice(n0).some((t) => t.includes('시계 세움') && t.includes('"day":' + day)), 30000,
                () => { if (Date.now() - last > 2000) { last = Date.now(); sendW({ type: '__e2e_clock', day, night: false }); } });
            };
            const settle = async (want) => { await until(want, 25000, relook); };
            const nudge = async (n) => { for (let i = 0; i < n; i++) { relook(); await sleep(400); } };
            const typeOf = (r0) => { const r = rows.get(r0.id); return r ? r.type : null; };

            // ③-1 문턱 **바로 앞** — 아직 묘목이다(자명 통과 금지: 이 검사는 빨개질 줄 안다)
            await setDay(D0 + Math.floor(nCh2) - 5);
            await nudge(6);   // 시선을 몇 번 옮겨 정산을 시킨다(멱등 · 여기선 "안 바뀌는 것"이 판정이라 기다릴 게 없다)
            ok(typeOf(pCh) === 'sapling' && typeOf(pOak) === 'sapling',
              `★★심기③ 문턱 **5일 전** — 둘 다 아직 묘목이다 (day ${D0 + Math.floor(nCh2) - 5} · 밤 \`${typeOf(pCh)}\` · 참 \`${typeOf(pOak)}\`)`);
            // ③-2 밤나무 문턱을 넘는다 — ★밤은 서고 참나무는 아직이다(= 종별 햇수가 실재한다)
            await setDay(D0 + Math.ceil(nCh2) + 5);
            await settle(() => typeOf(pCh) === 'tree');
            ok(typeOf(pCh) === 'tree',
              `★★★심기③ **밤나무가 먼저 선다** — 심은 지 ${Math.round(nCh2)}일(${TR.matureYearsOf('chestnut')}년 · 표) · day ${D0 + Math.ceil(nCh2) + 5}`);
            ok(typeOf(pOak) === 'sapling',
              `★★★심기③ 그런데 **참나무는 아직 묘목이다** — 같은 날 심었는데 ${Math.round(nOak2)}일이 필요하다(${TR.matureYearsOf('oak')}년) ⇒ 종별 햇수가 실재한다(종을 안 넘기면 둘 다 성목이라 이 줄이 빨개진다)`);
            // ③-3 참나무 문턱도 넘긴다 — 그리고 그 해 가을로 맞춘다(열매판 확인용)
            const yr3 = Math.floor((D0 + nOak2) / YD) + 1;
            const dAut = yr3 * YD + (midOf('autumn', 0) % YD);
            await setDay(dAut);
            await settle(() => typeOf(pOak) === 'tree');
            ok(typeOf(pOak) === 'tree', `★★심기③ **참나무도 제 날에 선다** — day ${dAut}`);
            try { obs.close(); } catch (e) {}

            const aCh = rows.get(pCh.id), aOak = rows.get(pOak.id);
            ok(!!aCh && aCh.sp === 'chestnut' && !!aOak && aOak.sp === 'oak',
              `★★심기④ 자란 뒤에도 **종이 그대로다** — \`${aCh ? aCh.sp : null}\` · \`${aOak ? aOak.sp : null}\``);
            ok(!!aCh && aCh.fruitNow === true && !!aOak && aOak.fruitNow === true,
              `★★★심기④ 그리고 **심은 나무 둘 다 열매 비트를 받는다** — 가을 · 밤 \`${aCh ? aCh.fruitNow : null}\` · 참 \`${aOak ? aOak.fruitNow : null}\``);
            PLANTED = aOak; PLANTED_CH = aCh;
          }
        }

        // ── 화면 — 그 비트를 **그리는 함수**에 그대로 먹인다(T148-B 의 `__treeSpriteFor`) ──
        const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
        const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
        const GOT = new Set();   // ★[T178] 화면이 실제로 받아 간 것 — 소스 문자열이 아니라 네트워크가 증인
        page.on('request', (rq) => { try { GOT.add(rq.url()); } catch (e) {} });
        await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
        await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
        try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
        await page.waitForFunction(() => typeof window.__treeSpriteFor === 'function', { timeout: 60000 }).catch(() => {});
        await page.waitForFunction(() => !!(window.__treeSpeciesTable && window.__treeSpeciesTable()), { timeout: 60000 }).catch(() => {});
        await sleep(6000);
        await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
        const live = treesOf('chestnut').filter((r) => r.fruitNow)[0] || treesOf('chestnut')[0];
        const plate = await page.evaluate((a) => (window.__treeSpriteFor ? window.__treeSpriteFor(a[0], a[1], a[2], a[3]) : null),
          [live.sp, live.x, live.y, !!live.fruitNow]);
        const plateOff = await page.evaluate((a) => (window.__treeSpriteFor ? window.__treeSpriteFor(a[0], a[1], a[2], false) : null),
          [live.sp, live.x, live.y]);
        ok(!!plate && TBL2.chestnut.autumn.includes(plate),
          `★★★열매ⓙ **세계가 실은 그 비트로 화면이 열매판을 고른다** — ${live.id} fruitNow=${live.fruitNow} → \`${plate}\` (표의 \`autumn\`)`);
        ok(!!plateOff && TBL2.chestnut.sprites.includes(plateOff) && plateOff !== plate,
          `★★열매ⓙ 비트가 false 면 **성목판**이다 — \`${plateOff}\`(표의 \`sprites\`) ≠ \`${plate}\``);
        const pineLive = treesOf('pine')[0];
        if (pineLive) {
          const pp = await page.evaluate((a) => window.__treeSpriteFor(a[0], a[1], a[2], true), [pineLive.sp, pineLive.x, pineLive.y]);
          const pq = await page.evaluate((a) => window.__treeSpriteFor(a[0], a[1], a[2], false), [pineLive.sp, pineLive.x, pineLive.y]);
          ok(pp === pq && TBL2.pine.sprites.includes(pp),
            `★★열매ⓚ 소나무는 **비트가 와도 그림이 안 바뀐다** — \`${pp}\`(없는 그림을 지어내지 않는다)`);
        }
        // ── ★[T178] 심은 나무의 판 — 화면에게 묻는다(T148-B ⓐ 문법) ────────────────
        {
          const sapWant = Object.values(TBL2).map((e) => e && e.sapling).filter(Boolean);
          const sapGot = sapWant.filter((n) => [...GOT].some((u) => u.endsWith('/assets/trees/' + n + '.png')));
          ok(sapGot.length === sapWant.length,
            `★★심기⑤ 화면이 **표가 댄 묘목 그림을 전부 받아 갔다** — ${sapGot.length}/${sapWant.length}장`
            + ` (소스 문자열이 아니라 네트워크가 증인 · \`sap_oak\` ${sapGot.includes('sap_oak') ? '○' : '✗'})`);
          for (const T3 of [PLANTED_CH, PLANTED]) {
            if (!T3) continue;
            const op = await page.evaluate((a) => (window.__treeSpriteFor ? window.__treeSpriteFor(a[0], a[1], a[2], a[3]) : null),
              [T3.sp, T3.x, T3.y, !!T3.fruitNow]);
            const opOff = await page.evaluate((a) => (window.__treeSpriteFor ? window.__treeSpriteFor(a[0], a[1], a[2], false) : null),
              [T3.sp, T3.x, T3.y]);
            ok(!!op && (TBL2[T3.sp].autumn || []).includes(op),
              `★★★심기⑥ **심은 ${TR.koOf(T3.sp)}가 종이 맞는 열매판으로 선다** — \`${op}\` (표 \`${T3.sp}.autumn\`)`);
            ok(!!opOff && TBL2[T3.sp].sprites.includes(opOff) && opOff !== op,
              `★★심기⑥ 열매가 없으면 **${TR.koOf(T3.sp)} 성목판**이다 — \`${opOff}\` (표 \`${T3.sp}.sprites\`) ≠ \`${op}\``);
          }
        }
        // ── ★★[T194] **되감기 0** — 숲에서 실클라가 직접 걷는다(서버-클라 미러 검사) ────────
        //   미러가 어긋나면 리컨실리에이션이 매 틱 위치를 되감는다(러버밴딩). 그 되감김의 크기가
        //   `__moveDbg().corrLast`(서버 권위 위치 − 내 예측 위치, px)다 — 진단 훅 그대로(새 훅 0).
        {
          const d0 = await page.evaluate(() => window.__moveDbg());
          ok(!!(d0.cfg && d0.cfg.slide === true),
            `★★걸음① **손잡이가 클라까지 내려왔다** — \`welcome.moveCfg.slide=${d0.cfg ? d0.cfg.slide : 'null'}\` (두 곳에 따로 안 적는다)`);
          await page.evaluate(() => { window.__corrN = 0; window.__corrLast = 0; });
          await page.keyboard.down('KeyD');
          const corr = [];
          for (let i = 0; i < 40; i++) { await sleep(200); const d = await page.evaluate(() => window.__moveDbg()); corr.push(d.corrLast | 0); }
          await page.keyboard.up('KeyD');
          await sleep(600);
          const d1 = await page.evaluate(() => window.__moveDbg());
          const moved = Math.hypot(d1.pos.x - d0.pos.x, d1.pos.y - d0.pos.y);
          const cMax = corr.length ? Math.max(...corr) : -1;
          // ★문턱을 손으로 안 적는다 — **비행 중 입력**의 상한에서 유도한다.
          //   리컨실리에이션은 매 틱 서버 권위 위치에 앵커하고 **아직 ack 안 된 입력을 replay** 한다
          //   (`33-m-conn.js`). 그러니 `corrLast` 는 미러가 완벽해도 0 이 아니다 — 그 순간 날아가고 있던
          //   입력 몇 개만큼이다. 서버가 한 틱에 최대 여덟 개를 흡수하므로(`consumed < 8`) 상한은 그 여덟 걸음.
          //   ⇒ 미러가 **어긋났다면** 클라는 "나무에 붙어 섰다"로 예측하고 서버는 계속 가므로
          //     이 값이 수십~수백 px 로 **벌어진다**(그게 러버밴딩이다). 그래서 이 한 줄이 미러 검사다.
          const _st1 = SPDm.maxSpeedOf(SPDm.paramsFrom({}), false, 1, false) / 30;   // 한 걸음(px) — 정본 유도
          const _budget = 8 * _st1;
          ok(moved > 100,
            `★★걸음② **실클라가 숲에서 실제로 걸었다** — 8초에 ${moved.toFixed(0)}px(오른쪽 키만 눌렀다 · 자명 통과 금지: 안 걸으면 아래 되감기가 0 이어도 뜻이 없다)`);
          ok(cMax >= 0 && cMax <= _budget,
            `★★★걸음③ **되감기 0** — 걷는 내내 서버 권위와 내 예측의 차가 최대 ${cMax}px = 비행 중 입력 ${(cMax / _st1).toFixed(1)}개분(상한 ${_budget.toFixed(1)}px = 틱당 흡수 8걸음) · 걸은 거리의 ${(cMax / moved * 100).toFixed(1)}% · 표본 ${corr.length} · 보정 ${d1.corrN}회`);
        }

        // ── 대조 스크린샷 한 장 (재민 ④) ─────────────────────────────────────────────
        await sleep(2500);
        await page.screenshot({ path: `${SHOTS}/나무_종별_가을.png` }).catch(() => {});
        say(`    대조 스크린샷 → ${SHOTS}/나무_종별_가을.png (가을 · 밤나무 ${onN('chestnut')}/${nCh} 열매판`
          + `${PLANTED ? ` · 심은 참나무 ${PLANTED.id} 도 열매판` : ''})`);
        await browser.close();
        clearInterval(HB);
        try { W.close(); } catch (e) {}
      }
      try { z3.kill(); } catch (e) {}
      await sleep(2500);
    }
  }

  // ═══ ★★★[T194 2026-09-12 재민 확정] **숲에서 걷는다** — 접선 슬라이드 표 ══════════════
  //   T187 §0-ⓒ 가 잰 것: 같은 입력 300개로 **빈터 60.2px/s ↔ 숲 0.8px/s**(숲 표본 49개 전부 ≈0).
  //   느린 게 아니라 **선** 것이었다 — 한 축만 밀면 축별 차단에서 미끄러질 성분이 0 이다.
  //   이 절은 그 표를 하네스로 굳힌다: **두 자리 × 손잡이 켬/끔 네 칸**.
  //   ★소스를 안 읽는다 — 실클라가 쓰는 그 선으로 걷고, 관전자의 눈으로 **세계가 말하는 내 좌표**를 읽는다.
  //   ★자리는 기계가 고른다: 숲은 시더 정본이 나무를 가장 많이 놓는 청크, 빈터는 동쪽 700px 에
  //     막을 것이 하나도 없는 청크(둘 다 하드코딩 0).
  {
    const WebSocket = require('ws');
    const CH3 = require(path.join(ROOT, 'server', 'chunk.js'));
    const TRN = require(path.join(ROOT, 'server', 'terrain.js'));
    const CS3 = CH3.CHUNK_SIZE;
    const SPD = require(path.join(ROOT, 'public', 'move-model.js'));
    let FOREST = null, OPEN = null;
    for (let cx = 50; cx <= 350 && !(FOREST && OPEN); cx += 3) for (let cy = 50; cy <= 350; cy++) {
      if (FOREST && OPEN) break;
      let rws = []; try { rws = CH3.generateChunkResources('hanbando', 'forest', cx, cy, CS3, new Set(), 100) || []; } catch (e) { continue; }
      const c0 = cx * CS3 + CS3 / 2, c1 = cy * CS3 + CS3 / 2;
      if (TRN.isWaterCellLocal('hanbando', c0, c1)) continue;
      if (TRN.isRockCellLocal && TRN.isRockCellLocal('hanbando', c0, c1)) continue;
      const tr = rws.filter((r) => r.type === 'tree');
      const near = rws.filter((r) => (r.type === 'tree' || r.type === 'rock' || r.type === 'ore')
        && Math.abs(r.x - c0) < 700 && Math.abs(r.y - c1) < 200);
      if (!FOREST && tr.length >= 40 && near.length >= 8) FOREST = { x: c0, y: c1, trees: tr.length, near: near.length };
      if (!OPEN && near.length === 0 && tr.length < 3) {
        let clear = true;
        for (let d = 0; d < 700 && clear; d += 16) {
          if (TRN.isWaterCellLocal('hanbando', c0 + d, c1)) clear = false;
          if (TRN.isRockCellLocal && TRN.isRockCellLocal('hanbando', c0 + d, c1)) clear = false;
        }
        if (clear) OPEN = { x: c0, y: c1, trees: tr.length, near: 0 };
      }
    }
    ok(!!FOREST && !!OPEN, `★걸음⓪ 자리를 **기계가 골랐다** — 숲(나무 ${FOREST ? FOREST.trees : '?'}그루 · 앞길에 ${FOREST ? FOREST.near : '?'}개) · 빈터(앞길 700px 무장애)`);
    if (FOREST && OPEN) {
      // 한 스텝의 이론값 — **정본에서 유도한다**(하네스가 수를 안 적는다)
      const STEP6 = 6 * SPD.maxSpeedOf(SPD.paramsFrom({}), false, 1, false) / 30;   // 200ms = 입력 6개 × (MOVE_SPEED/TICK_HZ)
      const walkAt = async (tag, site, slideOn) => {
        const env = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
          ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1',
          WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.x, y: site.y, name: '걸음 ' + tag } }) };
        if (!slideOn) env.T194_SLIDE = '0';       // ★되돌림 손잡이 — 두 쪽 다 종전 비트
        const zz = boot('zone', '/tmp/zone-wrap.js', env);
        if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { try { zz.kill(); } catch (e) {} return null; }
        let ack = 0, wel = null;
        const ws = await new Promise((res, rej) => {
          const w = new WebSocket(`ws://localhost:${ZPORT}/?name=%EA%B1%B8%EC%9D%8C`);
          const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
          w.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
            if (m.type === 'tick' && m.ackSeq !== undefined) ack = m.ackSeq;
            if (m.type === 'welcome') { wel = m; clearTimeout(t); res(w); } });
          w.on('error', (e) => { clearTimeout(t); rej(e); });
        }).catch(() => null);
        if (!ws) { try { zz.kill(); } catch (e) {} return null; }
        let pos = null;
        const obs = new WebSocket(`ws://localhost:${ZPORT}/?observer=1`);
        await new Promise((r) => { obs.on('open', r); obs.on('error', r); setTimeout(r, 8000); });
        obs.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
          if (m.type === 'tick' && Array.isArray(m.players)) { const me = m.players.find((q) => q.pid === 'p1'); if (me) pos = { x: me.x, y: me.y }; } });
        const look = () => { try { obs.send(JSON.stringify({ type: 'viewport_update', x: site.x, y: site.y, w: 8000, h: 8000 })); } catch (e) {} };
        look(); await sleep(4000);
        const p0 = pos ? { ...pos } : { x: site.x, y: site.y };
        const seg = []; let seq = 0; const t0 = Date.now();
        for (let i = 0; i < 50; i++) {
          for (let k = 0; k < 6; k++) { try { ws.send(JSON.stringify({ type: 'input', seq: ++seq, vx: 1, vy: 0 })); } catch (e) {} }
          await sleep(200); look();
          if (pos) seg.push({ x: pos.x, y: pos.y });
        }
        await sleep(600);
        const p1 = pos ? { ...pos } : p0, secs = (Date.now() - t0) / 1000;
        const d = []; for (let i = 1; i < seg.length; i++) d.push(Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y));
        const rate = Math.hypot(p1.x - p0.x, p1.y - p0.y) / secs;
        const full = d.filter((v) => Math.abs(v - STEP6) < 0.05).length, zero = d.filter((v) => v < 0.5).length;
        try { ws.close(); } catch (e) {} try { obs.close(); } catch (e) {}
        try { zz.kill(); } catch (e) {} await sleep(2500);
        return { tag, rate, full, zero, n: d.length, ack, seq, slide: wel && wel.moveCfg ? wel.moveCfg.slide : null };
      };
      const W = {};
      for (const [tag, site, on] of [['숲켬', FOREST, true], ['숲끔', FOREST, false], ['빈터켬', OPEN, true], ['빈터끔', OPEN, false]]) {
        W[tag] = await walkAt(tag, site, on);
        const w = W[tag];
        say(`    [${tag}] ${w ? `${w.rate.toFixed(1)}px/s · 표본 ${w.n} 중 ${STEP6.toFixed(1)}px 정확히 ${w.full} · ≈0 ${w.zero} · 입력 ${w.seq}/ack ${w.ack} · moveCfg.slide=${w.slide}` : '못 쟀다'}`);
      }
      const ok4 = W['숲켬'] && W['숲끔'] && W['빈터켬'] && W['빈터끔'];
      ok(!!ok4, '★걸음⓪ 네 칸을 전부 쟀다(숲·빈터 × 켬·끔)');
      if (ok4) {
        ok(W['빈터끔'].full === W['빈터끔'].n && W['빈터켬'].full === W['빈터켬'].n,
          `★★걸음④ **빈터에선 비트 동일** — 켬/끔 둘 다 표본 전부 ${STEP6.toFixed(1)}px(= 입력 6개 × MOVE_SPEED/TICK_HZ · 정본 유도) · ${W['빈터켬'].full}/${W['빈터켬'].n} · ${W['빈터끔'].full}/${W['빈터끔'].n}`);
        ok(W['숲끔'].rate < 5 && W['숲끔'].zero > W['숲끔'].n * 0.8,
          `★★걸음⑤ **손잡이를 끄면 숲 0.8px/s 가 재현된다** — ${W['숲끔'].rate.toFixed(1)}px/s · 표본 ${W['숲끔'].zero}/${W['숲끔'].n} 이 ≈0 (되돌림이 종전 비트다)`);
        ok(W['숲켬'].rate > W['빈터켬'].rate * 0.5,
          `★★★걸음⑥ **숲에서 나무를 돌아 나간다** — 켬 ${W['숲켬'].rate.toFixed(1)}px/s (끔 ${W['숲끔'].rate.toFixed(1)} · 빈터 ${W['빈터켬'].rate.toFixed(1)}) = 빈터의 ${(W['숲켬'].rate / W['빈터켬'].rate * 100).toFixed(0)}%`);
        ok(W['숲켬'].full > 0,
          `★★걸음⑥ 그리고 **속도가 보존된다** — 숲(켬) 표본 ${W['숲켬'].full}/${W['숲켬'].n} 이 빈터와 **같은 ${STEP6.toFixed(1)}px** (접선은 방향만 돌린다 · 길이는 그대로)`);
        ok(W['숲켬'].ack === W['숲켬'].seq && W['빈터켬'].ack === W['빈터켬'].seq,
          `★걸음⑥ 자명 통과 금지 — 서버가 입력을 **다 먹었다**(숲 ${W['숲켬'].ack}/${W['숲켬'].seq} · 빈터 ${W['빈터켬'].ack}/${W['빈터켬'].seq}) ⇒ 차이의 출처는 입력이 아니다`);
        ok(W['숲켬'].slide === true && W['숲끔'].slide === false,
          `★★걸음⑥ 손잡이가 **세계에 실제로 걸렸다** — 켬 \`moveCfg.slide=${W['숲켬'].slide}\` · 끔 \`${W['숲끔'].slide}\``);
      }
    }
  }

  say('\n[1] 계약 — __natDbg');
  //  ★재민 확정(2026-08-07): "물가 근처에 추가적으로 배치하는 풀은 없애줘" ⇒ 기본값 OFF.
  //    절단선은 이제 **지면 베이크 안의 물가 여백**이 직접 푼다 — 가리개가 필요 없어졌다.
  for (const [tag, s2] of [['강가', R], ['초원', F]]) {
    const df = s2.dDefault && s2.dDefault.nat;
    say(`    ${tag} 기본값 — 물가 술 ${df ? df.fringe : 'n/a'} · 초원 소품 ${df ? df.props : 'n/a'}`);
    ok(df && df.fringe === 0, `★★${tag} — 손잡이를 안 건드리면 물가 술이 **0** 이다 (${df ? df.fringe : 'n/a'}) [재민 반려]`);
  }
  ok(F.dDefault && F.dDefault.nat && F.dDefault.nat.props > 0, `★★반례 — 초원 소품은 **그대로 산다** (${F.dDefault && F.dDefault.nat ? F.dDefault.nat.props : 'n/a'}) — 없앤 건 '물가 근처'뿐이다`);
  say(`    강가: ${JSON.stringify(R.d0.nat)}`);
  say(`    초원: ${JSON.stringify(F.d0.nat)}`);
  if (R.cerr.length || F.cerr.length) say(`    ⚠콘솔: ${R.cerr.concat(F.cerr).slice(0, 4).join(' | ')}`);
  //  ★1패스 실사고 재발 가드 — `__natDbg` 자체가 없으면 렌더 함수가 죽은 것이다.
  //    (VIEW_RADIUS 가 렌더 함수 지역 상수인 걸 모르고 참조 → ReferenceError → 엔티티 패스 전멸.)
  ok(!!(R.d0 && R.d0.nat) && !!(F.d0 && F.d0.nat), '★__natDbg 존재 = 엔티티 렌더 패스가 살아 있다');
  if (!(R.d0 && R.d0.nat) || !(F.d0 && F.d0.nat)) {
    say(`\n=== 자연물 E2E: ${pass} 통과 / ${fail + 1} 실패 ❌ (렌더 패스 사망 — 이후 판정 무의미) ===`);
    for (const p2 of procs) { try { p2.kill(); } catch (e) {} }
    process.exit(1);
  }
  ok(R.d0.nat && R.d0.nat.sprites === '14/14', `물가 술·들꽃 스프라이트 14종 로드 (${R.d0.nat.sprites})`);
  ok(R.d0.nat.fringe > 60, `★강가에 물가 술이 선다 (${R.d0.nat.fringe} 포기)`);
  //  ★초원 셀(965,1919) 시야에도 **작은 웅덩이**가 하나 있다(수면 픽셀 337개 실측). 그래서 0 이 아니라
  //    '거의 0' 이 정답이다 — 0 을 요구하면 하네스가 없는 결함을 보고한다(1패스에서 실제로 그랬다).
  const frRatio = F.d0.nat.fringe / Math.max(1, R.d0.nat.fringe);
  ok(frRatio < 0.03, `★초원엔 술이 거의 없다 (${F.d0.nat.fringe} vs 강가 ${R.d0.nat.fringe} = ${(frRatio * 100).toFixed(1)}%) — 아무 데나 서는 게 아니다`);
  ok(F.d0.nat.props > 0, `초원에 들꽃·풀숲이 선다 (${F.d0.nat.props})`);
  const badAll = R.bad.concat(F.bad);
  const badAsset = badAll.filter((b) => b.includes('/assets/'));
  if (badAll.length) say(`    ⚠4xx: ${[...new Set(badAll)].slice(0, 6).join(' | ')}`);
  ok(badAsset.length === 0, `★자산 요청 404 없음 ${badAsset.length ? JSON.stringify(badAsset.slice(0, 4)) : ''}`);
  ok(R.cerr.filter((e) => /PAGEERROR/.test(e)).length + F.cerr.filter((e) => /PAGEERROR/.test(e)).length === 0,
     `스크립트 예외 0 ${R.cerr.concat(F.cerr).filter((e) => /PAGEERROR/.test(e)).slice(0, 2).join(' | ')}`);

  say('\n[2] ⓐ 은폐 — 술이 물 위로 넘어오는가');
  // fringeOff 에서 '물'이던 픽셀이 fringe 켜면 '초록'이 된다 = 술이 수면을 덮었다.
  const overWater = (on, off) => {
    let n = 0, w = 0;
    for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
      const b = px(off, x, y); if (!isWaterPx(b[0], b[1], b[2])) continue;
      w++;
      const a = px(on, x, y);
      if (isGreenPx(a[0], a[1], a[2])) n++;
    }
    return { n, w };
  };
  const ovR = overWater(R.fOn, R.fNoFr), ovF = overWater(F.fOn, F.fNoFr);
  say(`    강가: 수면 픽셀 ${ovR.w} 중 ${ovR.n} 이 술로 덮였다 (${(ovR.n / Math.max(1, ovR.w) * 100).toFixed(2)}%)`);
  say(`    초원(반례): 수면 픽셀 ${ovF.w} 중 ${ovF.n}`);
  ok(ovR.w > 20000, `★자명 통과 금지 — 강가 화면에 물이 실제로 많다 (${ovR.w}px)`);
  ok(ovR.n > 400, `★★술이 절단선을 넘어 물 위에 그려진다 (${ovR.n}px > 400)`);
  ok(ovF.n < 60, `★반례 — 초원엔 물 위 술이 없다 (${ovF.n})`);

  say('\n[3] ⓑ 군락 — "일부러 심은 느낌"의 정량화');
  // 술 픽셀 = fringeOff 대비 달라진 픽셀. 24×24 블록으로 세어 분포를 본다.
  const BS = 24;
  const bw = Math.ceil((BOX[2] - BOX[0]) / BS), bh = Math.ceil((BOX[3] - BOX[1]) / BS);
  const cnt = new Int32Array(bw * bh), hasWater = new Uint8Array(bw * bh), hasLand = new Uint8Array(bw * bh);
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    const bi = Math.floor((y - BOX[1]) / BS) * bw + Math.floor((x - BOX[0]) / BS);
    const i = (y * R.fOn.width + x) * 4;
    const o = R.fNoFr;
    if (R.fOn.data[i] !== o.data[i] || R.fOn.data[i + 1] !== o.data[i + 1] || R.fOn.data[i + 2] !== o.data[i + 2]) cnt[bi]++;
    const b = px(o, x, y);
    if (isWaterPx(b[0], b[1], b[2])) hasWater[bi] = 1; else if (isGreenPx(b[0], b[1], b[2])) hasLand[bi] = 1;
  }
  // '물가 회랑' = 같은 블록 안에 물과 뭍이 함께 있는 블록 = 절단선이 지나는 자리
  const corr = [];
  for (let i = 0; i < cnt.length; i++) if (hasWater[i] && hasLand[i]) corr.push(cnt[i]);
  const sum = corr.reduce((a, b) => a + b, 0), lam = sum / Math.max(1, corr.length);
  const varr = corr.reduce((a, b) => a + (b - lam) * (b - lam), 0) / Math.max(1, corr.length);
  const cv = Math.sqrt(varr) / (lam || 1);
  const cvUnif = 1 / Math.sqrt(lam || 1);          // 균일(포아송) 산포가 낼 CV — 대조 기준
  const empty = corr.filter((v) => v === 0).length / Math.max(1, corr.length);
  say(`    물가 회랑 블록 ${corr.length}개 · 평균 술픽셀 ${lam.toFixed(1)} · CV ${cv.toFixed(2)} (균일 기대 ${cvUnif.toFixed(2)}) · 빈 블록 ${(empty * 100).toFixed(0)}%`);
  ok(corr.length >= 25, `★자명 통과 금지 — 물가 회랑 블록이 충분하다 (${corr.length})`);
  ok(cv > cvUnif * 1.6, `★★밀도가 과분산이다 = 군락 (CV ${cv.toFixed(2)} > 균일 ${cvUnif.toFixed(2)}×1.6)`);
  ok(empty >= 0.18, `★★빈 구간이 실제로 있다 (빈 블록 ${(empty * 100).toFixed(0)}% ≥ 18%) — 균일 밀식이 아니다`);

  say('\n[4] ⓒ 나무 — 12종이 실제로 그려지는가');
  const td = F.d0.nat.treeDraw, tdR = R.d0.nat.treeDraw;
  say(`    초원 treeDraw=${JSON.stringify(td)} · 강가 treeDraw=${JSON.stringify(tdR)}`);
  ok(F.d0.nat.trees === 12 && R.d0.nat.trees === 12, `새 나무 12장 디코드 (${F.d0.nat.trees})`);
  ok(td.n + tdR.n > 0, `★스프라이트 경로로 실제 draw 됐다 (${td.n + tdR.n}회) — '로드됨'이 아니라 '그림'`);
  const drawn = td.n > 0 ? td : tdR;
  ok(Math.abs(drawn.px - drawn.h * 1.3) < 0.6, `★그린 높이 = h×1.3 규약 (h ${drawn.h} → ${drawn.px}px)`);
  ok(drawn.aspect > 0.35 && drawn.aspect < 2.2, `가로세로비가 나무답다 (${drawn.aspect.toFixed(2)})`);
  const ms = Object.keys(anch).filter((k) => anch[k].kind === 'tree').map((k) => anch[k].m);
  say(`    12종 실측 높이(m): ${ms.map((m) => m.toFixed(1)).join(' ')}`);
  ok(new Set(ms.map((m) => Math.round(m * 2))).size >= 6, `★종별 개성 — 높이가 한 값으로 뭉치지 않는다 (${new Set(ms.map((m) => Math.round(m * 2))).size}단계)`);

  say('\n[5] ⓓ 회피 — 영토·경작지·길 위 소품 0');
  //  ★독립 재계산: 클라의 판정 함수를 다시 부르지 않고 **원자료**로 직접 대조한다.
  const violate = (p) => {
    const road = new Set(p.roads.map((r) => r[0] + ',' + r[1]));
    let v = 0, cand = 0;
    for (const [x, y] of p.props) {
      cand++;
      if (road.has(Math.floor(x / 32) + ',' + Math.floor(y / 32))) { v++; continue; }
      if (p.claims.some(([cx, cy, w, h]) => x >= cx && x < cx + w && y >= cy && y < cy + h)) { v++; continue; }
      if (p.villages.some(([vx, vy, r]) => (x - vx) * (x - vx) + (y - vy) * (y - vy) < r * r)) { v++; continue; }
      if (p.farms.some(([fx, fy]) => Math.abs(x - fx) < 16 && Math.abs(y - fy) < 16)) { v++; continue; }
    }
    return { v, cand };
  };
  const vOn = violate(F.probe), vOff = violate(F.probeNA);
  say(`    초원 — 회피 ON: 소품 ${vOn.cand}개 중 위반 ${vOn.v} / 회피 OFF(반례): ${vOff.cand}개 중 위반 ${vOff.v}`);
  say(`    (원자료: 길 ${F.probe.roads.length}셀 · 사유지 ${F.probe.claims.length} · 마을 ${F.probe.villages.length} · 경작지 ${F.probe.farms.length})`);
  ok(F.probe.roads.length + F.probe.villages.length + F.probe.farms.length > 0,
     `★자명 통과 금지 — 회피 대상이 실제로 시야에 있다 (길 ${F.probe.roads.length} · 마을 ${F.probe.villages.length} · 경작지 ${F.probe.farms.length})`);
  ok(vOn.cand > 20, `★소품이 실제로 그려지고 있다 (${vOn.cand}개)`);
  ok(vOn.v === 0, `★★영토·경작지·길 위 소품 0 (${vOn.v})`);
  ok(vOff.v > 0, `★★반례 — 회피를 끄면 위반이 나온다 (${vOff.v}) = 판정이 실제로 일하고 있다`);

  say('\n[6] ⓔ 결정론 · 대조군');
  const DS = diffCountNoEnts(R.fOn, R.fOn2, R.entPx);
  const dRaw = diffCount(R.fOn, R.fOn2);
  say(`    시각 고정 두 프레임 차이 픽셀 = ${DS.n} (생물 가리기 전 ${dRaw} · 생물 ${DS.ents}자리 · 가린 넓이 ${DS.masked}/${DS.area}px)`);
  //  ★자명 통과 금지 — 다 가려 놓고 0 이라 말하면 안 된다. 판정 대상이 실제로 남아 있어야 한다.
  ok(DS.masked < DS.area * 0.25, `★가린 넓이가 판정 대상을 삼키지 않았다 (${(DS.masked / DS.area * 100).toFixed(1)}% < 25%)`);
  ok(DS.n === 0, '★시각을 고정하면 두 프레임이 동일 — 자리 해시가 순수 함수다(Math.random 없음)');
  //  ★★반례 장치 — **가리기가 실제로 일하는지**를 증명한다.
  //    안 그러면 이 판정은 "짐승이 안 지나간 판에서만 통과"와 구별되지 않는다(=가리기가 죽어 있어도
  //    통과한다). 사슴이 지나가 주기를 기다리는 대신, **생물 자리에 가짜 얼룩**을 찍어 본다:
  //    가리기 없이는 잡히고, 가리면 안 잡혀야 한다. 자리는 클라가 준 실제 생물 좌표다.
  const _blob = (src, sx, sy) => {
    const o = { width: src.width, height: src.height, data: Buffer.from(src.data) };
    for (let y = sy - 40; y < sy + 20; y++) for (let x = sx - 30; x < sx + 30; x++) {
      if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
      const i = (y * src.width + x) * 4; o.data[i] = 255; o.data[i + 1] = 0; o.data[i + 2] = 255;
    }
    return o;
  };
  const _anchor = (R.entPx || []).find(([, sx, sy]) =>
    sx > BOX[0] + 90 && sx < BOX[2] - 90 && sy > BOX[1] + 130 && sy < BOX[3] - 60);
  ok(!!_anchor, `★반례 전제 — 화면 안에 생물 자리가 실제로 있다 (${(R.entPx || []).length}자리)`,
    JSON.stringify((R.entPx || []).slice(0, 4)));
  if (_anchor) {
    const A2 = _blob(R.fOn2, _anchor[1], _anchor[2]);
    const rawB = diffCount(R.fOn, A2), mskB = diffCountNoEnts(R.fOn, A2, R.entPx).n;
    say(`    반례: 생물 자리(${_anchor[0]} ${_anchor[1]},${_anchor[2]})에 가짜 얼룩 → 가리기 전 ${rawB}px · 가린 뒤 ${mskB}px`);
    ok(rawB > 1000 && mskB === 0,
      `★★반례 — 생물 자리의 변화는 가려지고, 안 가리면 잡힌다 (${rawB} → ${mskB})`);
  }
  const dFr = D(R.fOn, R.fNoFr), dPr = D(F.fOn, F.fNoPr), dPrR = D(R.fOn, R.fNoNat);
  say(`    강가 술 on/off 차이 ${dFr}px · 초원 소품 on/off 차이 ${dPr}px · 강가 자연물 전체 ${dPrR}px`);
  ok(dFr > 3000, `★손잡이가 실제로 무언가를 끈다 — 강가 술 ${dFr}px`);
  ok(dPr > 500, `★초원 소품 손잡이도 실제로 그린다 ${dPr}px`);

  // ═══ [7b] ★★안개 위 논밭·경계선 — 재민 실기로 **재현된** 결함 [2026-08-30] ═════
  //   기전: 마을 영토(`simvil`)는 `renderables` 에 **마을 중심 하나**로 실린다. 개체 게이트는
  //   그 한 점만 보므로, 중심을 한 번 본 마을이면 **반경 1,200px 의 경계 셀 전부가 그려졌다** —
  //   한 번도 안 가본 새까만 땅 위에 논밭 띠와 경계선이 떴다.
  //   (배치 21이 자연물에서 고친 것과 **같은 결함의 다른 층**: 클라가 스스로 넓게 그리는 것은
  //    개체 하나로 게이트하면 반드시 샌다.)
  //   ⇒ 수리: 경계 셀을 **셀마다** `_seenChunks` 로 판정.
  //   ⇒ 자명 통과 금지: `simvilCellGateOff` 대조군에서 위반이 **나와야** 한다.
  say('\n[7b] ⓖ 안개 위 논밭·경계선 — 영토는 **셀마다** 안개를 본다 [재민 실기 재현]');
  //   기전: 마을 영토(`simvil`)는 `renderables` 에 **마을 중심 하나**로 실린다. 개체 게이트는
  //   그 한 점만 보므로, 중심을 한 번 본 마을이면 **반경 1,200px 의 경계 셀 전부가 그려졌다** —
  //   한 번도 안 가본 새까만 땅 위에 논밭 띠와 경계선이 떴다.
  //   (배치 21이 자연물에서 고친 것과 **같은 결함의 다른 층**: 클라가 스스로 넓게 그리는 것은
  //    개체 하나로 게이트하면 반드시 샌다.)
  //   ⇒ 수리: 경계 셀을 **셀마다** `_seenChunks` 로 판정. 자명 통과 금지: 대조군에서 위반이 나와야 한다.
  {
    let anyCand = 0, anyUnseen = 0, viol = 0, ctrl = 0, sample = null;
    for (const [tag, s2] of [['강가', R], ['초원', F]]) {
      const on = s2.simvilOn, off = s2.simvilOff;
      if (!on || !off) { say(`    ${tag}: 계측 없음`); continue; }
      say(`    ${tag}: 수리본 후보 ${on.cand}셀 · 안 본 셀 ${on.unseen} · 안 본 셀에 그림 ${on.drawnUnseen}`
        + `  |  대조군 후보 ${off.cand} · 안 본 셀 ${off.unseen} · 안 본 셀에 그림 ${off.drawnUnseen}`);
      anyCand += on.cand; anyUnseen += off.unseen; viol += on.drawnUnseen; ctrl += off.drawnUnseen;
      if (!sample && off.samples && off.samples.length) sample = off.samples.slice(0, 2);
    }
    ok(anyCand > 0, '(상황) 화면에 영토 경계 셀이 실제로 있다 — 0이면 아래가 자명 통과다', `${anyCand}셀`);
    ok(anyUnseen > 0, '★★(상황) 그중 **안 가본 셀이 실제로 있다** — 없으면 이 검사는 아무것도 안 잰다',
      `${anyUnseen}셀 · 예 ${JSON.stringify(sample)}`);
    ok(viol === 0, '★★★ⓖ 안 가본 셀에는 영토·논밭이 **한 셀도 안 그려진다**', `${viol}셀`);
    ok(ctrl > 0, '★★ⓖ 대조군(셀 게이트 끔)에서는 위반이 **나온다** — 검사가 진짜 재고 있다', `${ctrl}셀`);
  }

  // ═══ [7c] ★★안개 위 논밭 — **사유지 셀** [T57 2026-09-03 재민 실기 재현] ═══════
  //   같은 결함의 **세 번째 층**이다: 배치 21 자연물 → 08-30 마을 영토 띠 → 이번 NPC 사유지.
  //   기전: 사유지(`claim`)도 `renderables` 에 **중심 한 점**으로 실리고, 개체 게이트는
  //   그 점을 `_GATE_R.claim = 4`(4셀 후광)로 본다 ⇒ 안 가본 땅 위에 논밭 격자가 떴다.
  //   ⇒ 수리: 사유지는 건물이 아니라 **땅에 깔린 것**이므로 땅의 규칙(정확히 그 셀)을 쓴다.
  //   ★★귀속을 **실측으로 갈랐다**(추정 금지): 이 배치의 첫 판은 사유지(`claim`)를 범인으로 봤는데
  //     같은 화면의 원자료가 `사유지 0 · 경작지 42` 였다 — **사유지는 한 칸도 없었다.**
  //     진짜 층은 `farmland` **건물**이고, 그건 `kind:'building'` 이라 구조물 후광(R=4)을 받는다.
  //     후광이 있는 이유는 "벽이 시야를 막아 내부 셀이 영영 안 보인다"인데 밭엔 그 사정이 없다.
  say('\n[7c] ⓖ2 안개 위 논밭 — **땅에 깔린 것**(논밭·사유지)은 셀마다 안개를 본다 [T57 재민 실기 재현 · T75 실재 자리]');
  {
    // ★★[T75] 자리가 셋이 됐다. 강가·초원은 **지형** 프로브라 논밭이 0칸이고(T57 이 유보한 이유),
    //   '논밭'은 `pickFarmSite` 가 시딩된 마을에서 **기계로** 고른 자리다. 판정은 셋의 합으로 한다.
    let anyCand = 0, anyUnseen = 0, viol = 0, ctrl = 0, sample = null;
    for (const [tag, s2] of [['강가', R], ['초원', F], ['논밭', FARM]]) {
      if (!s2) { say(`    ${tag}: 판이 없다`); continue; }
      const on = s2.claimOn, off = s2.claimOff;
      if (!on || !off) { say(`    ${tag}: 계측 없음`); continue; }
      say(`    ${tag}: 수리본 후보 ${on.cand}셀 · 안 본 셀 ${on.unseen} · 안 본 셀에 그림 ${on.drawnUnseen}`
        + `  |  대조군 후보 ${off.cand} · 안 본 셀 ${off.unseen} · 안 본 셀에 그림 ${off.drawnUnseen}`);
      anyCand += on.cand; anyUnseen += off.unseen; viol += on.drawnUnseen; ctrl += off.drawnUnseen;
      if (!sample && off.samples && off.samples.length) sample = off.samples.slice(0, 2);
    }
    if (anyCand === 0) {
      // ★★**못 쟀다고 적는다 — "통과"라고 적지 않는다.**
      //   여기 오는 경우는 하나뿐이다: 세 판 어디에도 화면 안에 논밭·사유지가 없다
      //   (마을 시딩 전 DB, 또는 자리 선정 실패 — 위 '논밭 자리 못 골랐다' 줄이 사유를 찍는다).
      //   초록을 찍으면 그건 "안 그렸다"가 아니라 **"그릴 게 없었다"**다. 그건 자명 통과다.
      say('    ★세 판 어디에도 논밭·사유지가 화면에 **한 칸도 없다** — 이 절은 이 판에서 **못 잰다**.');
      say('      "안 그렸다"가 아니라 "그릴 게 없었다"이므로 초록을 찍지 않는다(rc 는 안 올린다).');
      ok(true, 'ⓖ2 [못 잼] 세 판 다 대상이 없다 — 판정 유보(사유를 찍었다)', `후보 ${anyCand}셀`);
    } else {
      ok(anyUnseen > 0, '★★(상황) 그중 **안 가본 셀이 실제로 있다** — 없으면 이 검사는 아무것도 안 잰다',
        `${anyUnseen}셀 · 예 ${JSON.stringify(sample)}`);
      ok(viol === 0, '★★★ⓖ2 안 가본 셀에는 논밭·사유지가 **한 셀도 안 그려진다**', `${viol}셀`);
      ok(ctrl > 0, '★★ⓖ2 대조군(**옛 동작** — 구조물 후광 R=4)에서는 위반이 **나온다** — 검사가 진짜 재고 있다', `${ctrl}셀`);
    }
    // ★★[T75] **자명 통과 금지 — 이 절이 실제로 잰 판이 있었나.** 위 합계는 세 판을 더한 값이라
    //   논밭 판이 통째로 빠져도 강가·초원의 0 이 조용히 섞여 들어간다. 그러니 "논밭이 실재하는
    //   판을 실제로 하나 세웠는지"를 **따로** 말한다. 못 세웠으면 유보다(빨강 아님 — 못 쟀을 뿐).
    if (FARM && FARM.claimOn && FARM.claimOn.cand > 0) {
      ok(FARM.claimOn.cand > 0, '★★ⓖ2 **논밭이 실재하는 자리에서 쟀다**(T57 이 못 쟀던 그 절)',
        `자리(${FARM.site.cx},${FARM.site.cy}) 후보 ${FARM.claimOn.cand}셀 · 안 본 셀 ${FARM.claimOn.unseen} · 대조군 위반 ${FARM.claimOff ? FARM.claimOff.drawnUnseen : 'n/a'}`);
      ok(FARM.claimOff && FARM.claimOff.drawnUnseen > 0,
        '★★ⓖ2 **그 자리에서** 대조군(옛 동작)이 실제로 위반을 낸다 — 자리가 결함을 재현하는 자리다',
        `${FARM.claimOff ? FARM.claimOff.drawnUnseen : 'n/a'}셀`);
    } else if (FARM && FARM.farmN > 0) {
      // ★★**유보로 도망가면 안 되는 자리다.** 화면엔 논밭이 `farmN` 칸 있는데 셀 게이트 훅이
      //   한 번도 안 불렸다(cand 0) = 게이트가 **사라졌다**는 뜻이다(돌연변이가 정확히 이 모양이다:
      //   `34-m-renderloop.js` 의 `item._flat ? _flatCellGate(...) : ...` 를 지우면 여기가 0 이 된다).
      //   '못 쟀다'로 넘기면 돌연변이가 조용히 초록으로 통과한다. ⇒ 빨강이다.
      ok(false, '★★★ⓖ2 화면에 논밭이 있는데 **셀 게이트가 한 번도 안 불렸다** — 게이트가 사라졌다',
        `논밭 ${FARM.farmN}칸 · 훅 후보 ${FARM.claimOn ? FARM.claimOn.cand : 'null'}셀`);
    } else {
      say('    ★논밭 실재 판을 못 세웠다 — 위 판정은 지형 두 자리만 본 것이다(유보).');
      ok(true, 'ⓖ2 [못 잼] 논밭 실재 자리를 못 세웠다 — 판정 유보(사유는 위 줄)',
        FARM ? `화면 논밭 ${FARM.farmN}칸 · 후보 ${FARM.claimOn ? FARM.claimOn.cand : 'n/a'}셀` : `자리 선정 실패`);
    }
  }

  say('\n[7] ⓕ 안개 — ★한 번도 안 가본 곳엔 **그 어떤 것도** 보이면 안 된다 [재민 확정]');
  //  ★두 번 틀렸던 자리다. ①자연물을 renderables 에 태워 안개 위로 떴다.
  //    ②고쳐서 마스크를 월드 렌더 전체 뒤로 옮겼더니 **지붕·산이 자기 뒤 미탐사 셀에 잘렸다**
  //      (e2e-rooms 이엉 29.0%→2.8%). 화면 픽셀이 아니라 **개체의 자리**로 막는 게 규칙의 뜻이다.
  //  ⇒ 판정: 그려진 개체 중 '안 본 셀'에 있는 것이 **0**. 계측 정본은 `_seenChunks` 를 하네스가
  //    직접 읽는다(클라 판정 함수를 다시 부르면 사본이고 자명 통과다).
  //  ⇒ 반례: `fogGateOff` 로 게이트를 끄면 위반이 **나와야** 한다.
  //  ⇒ 지면 데코(자연물)는 마스크 앞에 그리므로 **화면 픽셀**로도 잰다(아래 두 줄).
  for (const [tag, s2] of [['강가', R], ['초원', F]]) {
    const g = s2.gate, go = s2.gateOff;
    say(`    ${tag}: 본 셀 ${g.seenCells} · 그린 개체 ${g.drawn} · 안 본 셀 위 개체 ${g.bad}` +
        ` / 게이트 끄면 ${go.drawn}개 중 ${go.bad} ${JSON.stringify(go.badKinds).slice(0, 90)}`);
    say(`      (지면 데코: 미탐사 ${s2.fogOn.unseen}px 위 밝은 픽셀 자연물ON ${s2.fogOn.lit} / OFF ${s2.fogOff.lit})`);
    ok(g.dbg && g.dbg.missing === 0, `★구멍 없음 — 자리(wx,wy)가 없는 렌더 종류 0 (${g.dbg ? g.dbg.missing : 'n/a'})`);
    ok(g.exemptOk, `★★조용한 면제 금지 — 클라의 게이트 면제 목록이 문서와 일치한다 (${JSON.stringify(g.clientExempt)} · 면제로 그린 장수 ${g.dbg ? g.dbg.free : 'n/a'})`);
    //  ★자명 통과 금지 — '개체가 많다'는 문턱은 틀렸다(1패스 실측: 두 지점 다 황무지라 프레임당
    //    개체가 2~6개뿐이다. 20을 요구했다가 없는 결함을 보고했다). 이 판정의 본뜻은
    //    "게이트가 걸릴 상황이 실제로 있다"이므로 **반례가 나오는가**로 재는 게 맞다.
    ok(g.drawn >= 2, `★${tag} 화면에 개체가 그려지고 있다 (${g.drawn})`);
    ok(go.bad > 0, `★★자명 통과 금지 — ${tag} 는 게이트를 끄면 위반이 나오는 상황이다 (${go.bad}) — 통과가 공짜가 아니다`);
    ok(g.bad === 0, `★★${tag} — 안 본 셀 위에 그려진 개체가 **하나도 없다** (${g.bad})`);
    ok(s2.fogOn.lit - s2.fogOff.lit <= 40, `★${tag} — 지면 데코도 안개 위로 안 뜬다 (ON−OFF ${s2.fogOn.lit - s2.fogOff.lit})`);
  }
  const anyOff = R.gateOff.bad + F.gateOff.bad;
  ok(anyOff > 0, `★★반례 — 게이트를 끄면 위반이 나온다 (강가 ${R.gateOff.bad} + 초원 ${F.gateOff.bad} = ${anyOff}) = 게이트가 실제로 일한다`);

  say('\n[8] ⓖ 바람 — 게임 시계의 순수 함수 · 날씨가 붙을 자리 [재민 질문 2026-08-06c]');
  //  ★게임에 날씨 상태가 없다(전수 grep 0). 그래서 "날씨에 따라"는 지금 못 만든다 —
  //    대신 **바람 세기의 정본 함수**(`_windAt`)를 세우고 `windForce` 주입구를 두었다.
  //    이 절은 그 주입구가 **실제로 정본을 갈아끼우는지**까지 본다(훅이 죽어 있으면 거짓말이 된다).
  for (const [tag, s2] of [['강가', R], ['초원', F]]) {
    const dMove = D(s2.wOn100, s2.wOn101);
    const dCalm = D(s2.wCalm100, s2.wCalm101);
    const dBase = D(s2.wBase100, s2.wBase101);
    const lim = dBase * 3 + 150;
    say(`    ${tag}: 시각 100→100.9(물 끔) — 바람 0.85 ${dMove}px 움직임 / 무풍(0) ${dCalm}px / 대조군(자연물 OFF) ${dBase}px`);
    ok(dMove > 2000, `★★${tag} — 시각이 흐르면 풀이 **실제로 흔들린다** (${dMove}px)`);
    ok(dCalm <= lim, `★★반례 — ${tag} 무풍이면 잡음 바닥 수준이다 (${dCalm} ≤ 대조군×3+150 = ${lim}) = 움직임의 출처가 바람이다`);
  }
  const wv = R.windFn.out;
  const wmin = Math.min(...wv), wmax = Math.max(...wv);
  say(`    바람 세기 곡선(게임시각 0~120s, ${wv.length}표본): 최소 ${wmin.toFixed(3)} · 최대 ${wmax.toFixed(3)} · 평균 ${(wv.reduce((a, b) => a + b, 0) / wv.length).toFixed(3)}`);
  ok(wv.length >= 30, `★바람 세기를 실제로 표본했다 (${wv.length})`);
  ok(wmin >= 0 && wmax <= 1, `★세기가 [0,1] 을 벗어나지 않는다 (${wmin.toFixed(3)}~${wmax.toFixed(3)})`);
  ok(wmax - wmin > 0.25, `★★한 값에 고정돼 있지 않다 — 잔잔↔돌풍이 실제로 오간다 (진폭 ${(wmax - wmin).toFixed(3)})`);
  ok(Math.abs(R.windFn.forced - 0.37) < 1e-9, `★★날씨 훅이 살아 있다 — windForce 0.37 을 주면 정본이 그 값이 된다 (${R.windFn.forced})`);

  say('\n[9] ⓗ 물가 여백 — 풀이 물가에서 칼로 잘리지 않게 [재민 지적 2026-08-06c]');
  //  ★재민이 두 번 반려한 것은 "물 위에 띠를 하나 더 얹는" 길이었다. 그래서 이 판정의 본뜻은
  //    ⓐ여백이 **실제로 생긴다** ⓑ그런데 **폭이 0인 구간이 남아 있다**(안 그러면 그게 띠다)
  //    ⓒ폭이 **균일하지 않다**. 셋을 한꺼번에 만족해야 통과다.
  ok((F.shWidths || []).length === 0, `★대조군 — 초원엔 물가 변이 없다(여백도 없다) = 여백은 물가에서만 생긴다 (${(F.shWidths || []).length})`);
  for (const [tag, s2] of [['강가', R]]) {
    const w = s2.shWidths || [];
    const nz = w.filter((v) => v >= 1.2), zero = w.length - nz.length;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) * (b - mean), 0) / w.length);
    const cv = sd / (mean || 1);
    const d0n = (s2.shWidths0 || []).filter((v) => v >= 1.2).length;
    const dpx = D(s2.fMarginOn, s2.fMarginOff);
    say(`    ${tag}: 물가 변 ${w.length} · 여백 있는 변 ${nz.length}(${(nz.length / w.length * 100).toFixed(0)}%) · **폭 0인 변 ${zero}(${(zero / w.length * 100).toFixed(0)}%)**`);
    say(`      평균 폭 ${mean.toFixed(2)}px · 표준편차 ${sd.toFixed(2)} · 변동계수 ${cv.toFixed(2)} / 손잡이 끄면 여백 변 ${d0n} · 화면 차이 ${dpx}px`);
    ok(w.length >= 60, `★자명 통과 금지 — ${tag} 에 물가 변이 실제로 많다 (${w.length})`);
    ok(nz.length / w.length >= 0.35, `★★${tag} — 여백이 실제로 생긴다 (${(nz.length / w.length * 100).toFixed(0)}% ≥ 35%)`);
    //  ★문턱 20% 의 근거는 **이 하네스가 이미 쓰는 규칙**이다 — ⓑ 물가 술의 '빈 블록 ≥18%'는
    //    재민이 글로 못박은 "빈 구간이 셀 몇 개 단위로 교대"를 옮긴 것이고, 여백도 같은 물가의
    //    같은 규칙을 받는다. 여백이 전 구간에 깔리면 그게 곧 두 번 반려된 '띠'다.
    ok(zero / w.length >= 0.20, `★★${tag} — **폭 0인 구간이 남아 있다** = 띠가 아니다 (${(zero / w.length * 100).toFixed(0)}% ≥ 20%)`);
    ok(cv >= 0.45, `★★${tag} — 폭이 균일하지 않다 (변동계수 ${cv.toFixed(2)} ≥ 0.45)`);
    ok(d0n === 0, `★★반례 — 손잡이를 끄면 여백이 **하나도 안 생긴다** (${d0n}) = 판정이 손잡이를 실제로 본다`);
    ok(dpx > 1500, `★${tag} — 여백이 화면을 실제로 바꾼다 (${dpx}px)`);
  }

  say('\n[10] ⓘ 풀 카펫 흔들림 — ★초원에 깔린 **지면 풀 텍스처** [재민 정정 2026-08-07]');
  //  ★1패스에서 나는 흩뿌린 포기 스프라이트만 흔들고 카펫은 "비싸다"며 회부했다 — 그게 요청 대상이었다.
  //    구조를 바탕+잎으로 쪼개 매 프레임 띠로 어긋나게 가산 blit 한다.
  //    이 절의 제1판정은 **항등식**: 무풍이면 옛 그림과 픽셀이 같아야 한다.
  const BOXC = [80, 260, 1330, 860];
  for (const [tag, s2] of [['강가', R], ['초원', F]]) {
    const mean = meanAbsDiff(s2.cpCalm, s2.cpLegacy, BOXC);
    const over = diffOver(s2.cpCalm, s2.cpLegacy, BOXC, 10);
    const tot = (BOXC[2] - BOXC[0]) * (BOXC[3] - BOXC[1]);
    const mv = diffOver(s2.cpW0, s2.cpW1, BOXC, 10), cm = diffOver(s2.cpC0, s2.cpC1, BOXC, 10);
    say(`    ${tag}: 항등식 평균 |Δ| ${mean.toFixed(3)} · 다른 픽셀 ${over}(${(over / tot * 100).toFixed(2)}%)`);
    say(`      움직임 — 바람 0.9 로 시각 100→101.4 ${mv}px / 무풍 ${cm}px · 띠 ${s2.cpDbgOn ? s2.cpDbgOn.strips : 'n/a'} ↔ 손잡이 끄면 ${s2.cpDbgOff ? s2.cpDbgOff.strips : 'n/a'}`);
    ok(mean < 1.2, `★★${tag} — **항등식**: 무풍이면 옛 그림과 같다 (평균 |Δ| ${mean.toFixed(3)} < 1.2) — 구조만 쪼갰지 그림은 안 바꿨다`);
    ok(over / tot < 0.01, `★${tag} — 눈에 띄게 다른 픽셀이 1% 미만 (${(over / tot * 100).toFixed(2)}%)`);
    ok(mv > 20000, `★★${tag} — **카펫이 실제로 흔들린다** (${mv}px · 자연물·물 끈 상태라 움직인 건 지면뿐이다)`);
    //  ★'0 이어야 한다'로 못 박지 않는다 — 자연물을 껐어도 **동물·NPC**는 실시간으로 움직인다.
    //    이 판정의 뜻은 "움직임의 출처가 바람이다"이므로 **바람 대비 비율**로 재는 게 맞다.
    ok(cm < Math.max(400, mv * 0.02), `★★반례 — ${tag} 무풍이면 거의 안 움직인다 (${cm} < 바람의 2% = ${Math.round(mv * 0.02)}) = 움직임의 출처가 바람이다`);
  }
  ok(R.cpDbgOn && R.cpDbgOn.strips > 0, `★잎 층이 실제로 띠로 그려진다 (띠 ${R.cpDbgOn ? R.cpDbgOn.strips : 'n/a'})`);
  ok(R.cpDbgOff && R.cpDbgOff.strips === 0, `★★반례 — 손잡이를 끄면 띠가 0 이다 (${R.cpDbgOff ? R.cpDbgOff.strips : 'n/a'}) = 옛 경로로 정확히 돌아간다`);

  say(`\n스크린샷: ${SHOTS}/`);
  say(`\n=== 자연물 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (e2) {} } process.exit(1); });
