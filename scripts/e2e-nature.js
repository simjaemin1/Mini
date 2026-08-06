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
function diffCount(a, b) {            // 두 프레임에서 달라진 픽셀 수
  let n = 0;
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    const i = (y * a.width + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return n;
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
    const grab = async (n) => { const p2 = `${SHOTS}/${tag}-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
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
      const seen1 = (cx, cy) => { const st = sc && sc.get((cx >> 4) + '_' + (cy >> 4)); return !!st && st.has(cx * 65536 + cy); };
      let bad = 0; const badKinds = {};
      for (const [wx, wy, kind] of drawn) {
        const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
        let okc = seen1(cx, cy);
        const r = R[kind];
        if (!okc && r) for (let k = 0; k < 8 && !okc; k++) {
          okc = seen1(cx + [1,-1,0,0,1,1,-1,-1][k] * r, cy + [0,0,1,-1,1,-1,1,-1][k] * r);
        }
        if (!okc) { bad++; badKinds[kind] = (badKinds[kind] || 0) + 1; }
      }
      let seenCells = 0; if (sc) for (const v of sc.values()) seenCells += v.size;
      return { drawn: drawn.length, bad, badKinds, seenCells, dbg: window.__fogGateDbg };
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

    await knob({ legacy: false, freezeT: 100, natOff: false, fringeOff: false, propOff: false, propNoAvoid: false });
    const d0 = await dbg();
    const fOn = await grab('on'), fOn2 = await grab('on2');
    const probe = await page.evaluate(() => window.__natProbe());
    const fogOn = await fogLit();
    const gate = await gateCheck();
    await knob({ fogGateOff: true });
    const gateOff = await gateCheck();
    await knob({ fogGateOff: false });
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
    S[tag] = { d0, fOn, fOn2, fNoFr, fNoPr, fNoNat, probe, probeNA, cerr, bad: [...new Set(bad)], fogOn, fogOff, gate, gateOff };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }
  const R = S.river, F = S.field;

  say('\n[1] 계약 — __natDbg');
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
  const dSame = diffCount(R.fOn, R.fOn2);
  say(`    시각 고정 두 프레임 차이 픽셀 = ${dSame}`);
  ok(dSame === 0, '★시각을 고정하면 두 프레임이 동일 — 자리 해시가 순수 함수다(Math.random 없음)');
  const dFr = diffCount(R.fOn, R.fNoFr), dPr = diffCount(F.fOn, F.fNoPr), dPrR = diffCount(R.fOn, R.fNoNat);
  say(`    강가 술 on/off 차이 ${dFr}px · 초원 소품 on/off 차이 ${dPr}px · 강가 자연물 전체 ${dPrR}px`);
  ok(dFr > 3000, `★손잡이가 실제로 무언가를 끈다 — 강가 술 ${dFr}px`);
  ok(dPr > 500, `★초원 소품 손잡이도 실제로 그린다 ${dPr}px`);

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

  say(`\n스크린샷: ${SHOTS}/`);
  say(`\n=== 자연물 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (e2) {} } process.exit(1); });
