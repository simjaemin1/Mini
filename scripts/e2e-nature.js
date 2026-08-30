#!/usr/bin/env node
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
const SHOTS = process.env.SHOTS || '/tmp/e2e-nature-shots';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-nature.db';
fs.mkdirSync(SHOTS, { recursive: true });

// 촬영 지점 — e2e-terrain 과 같은 정본 프로브 셀(`scripts/probe-terrain-sites.js` 선정).
const SITES = {
  river: { cx: 1490, cy: 2477, why: '한여울강 하류 · 물 127 / 뭍 162 — 물가 술의 무대' },
  field: { cx: 965, cy: 1919, why: '농촌22 광장 — 물 0(반례) · 마을 영토·길이 시야 안(회피 판정)' },
};

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
  for (const k of Object.keys(anch)) {
    const a = anch[k];
    const dir = a.kind === 'tree' ? 'trees' : 'nature';
    const f = path.join(ROOT, 'public/assets', dir, k + '.png');
    if (!fs.existsSync(f)) { badFile.push(k); continue; }
    const im = PNG.sync.read(fs.readFileSync(f));
    if (im.width !== a.w || im.height !== a.h) badFile.push(k + '(치수불일치)');
    if (a.kind === 'tree') {
      treeN++;
      if (!(a.m >= 3.0 && a.m <= 8.0)) badSize.push(`${k}=${a.m}m`);
    }
  }
  ok(treeN === 12, `나무 12종 앵커 등록 (${treeN})`);
  ok(badFile.length === 0, `모든 스프라이트 파일 존재·치수 일치 ${badFile.length ? JSON.stringify(badFile) : ''}`);
  ok(badSize.length === 0, `★성목 높이 3~8m 규격 ${badSize.length ? JSON.stringify(badSize) : '(전부 통과)'}`);
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
    for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
      try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) {}
    }
    await sleep(20000);
    const knob = async (o) => { await page.evaluate((k) => { Object.assign(window.__terrain19, k); }, o); await sleep(1500); };
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

    S[tag] = { dDefault, d0, fOn, fOn2, entPx, fNoFr, fNoPr, fNoNat, probe, probeNA, cerr, bad: [...new Set(bad)], fogOn, fogOff, gate, gateOff, simvilOn, simvilOff,
               wOn100, wOn101, wCalm100, wCalm101, wBase100, wBase101, windFn, shWidths, shWidths0, fMarginOn, fMarginOff,
               cpCalm, cpLegacy, cpW0, cpW1, cpC0, cpC1, cpDbgOn, cpDbgOff };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }
  const R = S.river, F = S.field;

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
