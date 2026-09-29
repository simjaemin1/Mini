#!/usr/bin/env node
// === scripts/t515-clothes.js — 옷 티어 넷 한 장(재민 눈) [T515 2026-09-29] ==================
//
// ★카드 ③ "헤드리스 넷(맨몸·삼베·가죽·모피 · 겨울 낮) → `~/Mini/산그림/T515_옷.png`"
//   하네스가 아니다(판정 0 · 이름이 `test-`·`e2e-` 가 아니라 러너·린트가 안 줍는다) — **그림을 만드는 자**다.
//   판정은 `scripts/test-clothes-tiers.js` 가 한다(같은 시트 · 화면 합성 자).
//
// ★세계를 바꾸지 않는다. 세우는 것은 테스트 전용 문과 진단 훅뿐이다(`t500-winter.js` 와 같은 문법):
//   `__e2e_clock`(날짜·밤낮) · 하늘 위상(래퍼) · `__rainForce({precip:0})`·`windOff`(고요 — 옷만 보이게) ·
//   `__e2e_give equip`(정본 착용 경로 `craftItem` + `doEquipItem` · e2e-charsprite 가 쓰는 그 길) · `unequip_item`(제품 메시지).
//   손잡이 = `CHAR_SPRITE=on`(라이브 env) + `T487_SNOW=1`·`T500_WINTER_FX=1`(T500 그림과 같은 겨울 한 벌).
//   그리기만 둘 걷는다(이 페이지 · 세계 무변): 이름표(몸통을 덮는다) · 바라보는 쪽(행 2 — 판별 자가 재는 그 판).
//
// 날 = 한겨울 가운데(`anchorDays().winter` — econ 곡선의 최한 · 리터럴 0) · 낮 = 정오 위상(`weather.PH.noon` · 새 수 0).
// 차림 넷 = 맨몸(옷 없음 — ★클라 규약상 **삼베 그림**이다: `clothLayerOf` "알몸 금지") · 삼베 · 가죽 · 모피(카드 순서).
// 한 장 = 2줄 × 4칸: 윗줄 ×4 확대(최근접 · 화소 그대로 · 다시 그리지 않는다) · 아랫줄 같은 자리 1:1(게임에서 보는 크기).
//
// 실행: node scripts/t515-clothes.js <out.png>      (NODE_PATH 에 playwright · pngjs 는 저장소 것)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const OUT = process.argv[2] || '/tmp/T515_옷.png';
const TMP = path.join(path.dirname(OUT), 't515-clothes-shots');
fs.mkdirSync(TMP, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t515-clothes-${process.pid}.db`, CDB = `/tmp/t515-clothes-c-${process.pid}.db`;
const PHF = `/tmp/t515-clothes-phase-${process.pid}.txt`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
// 하늘 위상 — 래퍼가 세계 시계의 기점을 옮긴다(`t500-winter.js` 와 같은 래퍼 · 하루 = 실시간 하루라 그 자리에 선다).
const WRAP = `/tmp/zone-wrap-t515-${process.pid}.js`;
const PHASE = Wx.PH.noon;                                  // 정오 = 낮의 한가운데(`dayPhaseRatio/2`)
fs.writeFileSync(PHF, String(PHASE));
fs.writeFileSync(WRAP, `const path=require('path');const fs=require('fs');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d;
const setPh=(p)=>{ cfg.WORLD.worldEpoch=Date.now()-Math.round(d*p); };
setPh(parseFloat(fs.readFileSync(${JSON.stringify(PHF)},'utf8'))||0.35);
require(path.join(ROOT,'server','zone.js'));`);

const A = FX.anchorDays();
const DAY = A.winter;
const LOOKS = [
  { key: 'bare', ko: '맨몸', mat: null },
  { key: 'hemp', ko: '삼베', mat: 'hemp' },
  { key: 'leather', ko: '가죽', mat: 'leather' },
  { key: 'fur', ko: '모피', mat: 'fur' },
];
console.log(JSON.stringify({ day: DAY, night: false, phase: PHASE, looks: LOOKS.map((l) => l.ko) }));

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T487_SNOW: '1', T500_WINTER_FX: '1',
    CHAR_SPRITE: 'on' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  console.log('central', cu.ok, '· zone', zu.ok);
  if (!cu.ok || !zu.ok) process.exit(2);
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  console.log('마을', V && `${V.name}(${V.cx},${V.cy})`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const VW = 1400, VH = 900;
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  if (!(await FX.waitInWorld(page)).ok) { console.log('입장 실패'); process.exit(3); }
  const fx = await FX.setClock(page, { day: DAY, night: false });
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__rainForce({ precip: 0 }));
  // 자리 = 마을 한복판에서 들판 쪽(T487·T500 그림과 같은 자리 규칙)
  const SPOT = [V.cx * 32 + 16 + (+process.env.T515_SPOT_DX || 350), V.cy * 32 + 16 + (+process.env.T515_SPOT_DY || 350)];
  await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), SPOT);
  await sleep(9000);                                        // 카메라 트윈 · 타일 굽기 · 철 판 그림 받기
  // 그림을 가리는 둘을 걷는다(세계 무변 · 이 페이지의 그리기만): ⓐ 이름표 — 발밑 위 22px 에 그려져 **몸통(옷)을 덮는다**(1판 실측) ·
  //   ⓑ 바라보는 쪽 — 넷이 같은 판으로 서게 `test-clothes-tiers ③`·`e2e-charsprite ⓗ` 의 그 방향(행 2 = 월드 +y · 앞섶이 보이는 3/4 앞)으로 둔다.
  await page.evaluate(() => { try { drawNameTag = function () {}; } catch (e) { } });
  const face = () => page.evaluate(() => { try { myFacingVx = 0; myFacingVy = 1; } catch (e) { } });
  const meDbg = () => page.evaluate(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) return d[k]; return null; });
  const wear = async (mat) => {
    if (!mat) {
      await page.evaluate(() => window.__sendPrimary({ type: 'unequip_item', slot: 'clothes' }));
      for (let k = 0; k < 40; k++) { const st = await page.evaluate(() => window.__equipState()); if (!(st && st.slots && st.slots.clothes)) return true; await sleep(200); }
      return false;
    }
    await page.evaluate((m) => window.__sendPrimary({ type: '__e2e_give', equip: [{ type: 'clothes', material: m, lvl: 5 }] }), mat);
    for (let k = 0; k < 40; k++) {
      const st = await page.evaluate(() => window.__equipState());
      const id = st && st.slots && st.slots.clothes;
      const inst = id ? (st.equipment || []).find((e) => e.id === id) : null;
      if (inst && inst.mat === mat) return true;
      await sleep(200);
    }
    return false;
  };
  const done = [];
  for (const L of LOOKS) {
    const worn = await wear(L.mat);
    const want = L.mat ? 'clothes_' + L.mat : 'clothes_hemp';   // 맨몸 = 삼베 그림(클라 `clothLayerOf` 규약)
    await face();
    let d = null;
    for (let k = 0; k < 120; k++) {                         // 층이 바뀌고 · idle 첫 판 · 방향 2 에 섰을 때 찍는다(넷이 같은 자세)
      d = await meDbg();
      if (d && d.layers && d.layers.indexOf(want) >= 0 && d.clip === 'idle' && d.frame === 0 && d.row === 2) break;
      await sleep(100);
    }
    const p = path.join(TMP, `${L.key}.png`);
    await page.screenshot({ path: p });
    const info = await page.evaluate(() => ({ wx: window.__wx ? window.__wx() : null, eq: window.__equipState ? window.__equipState() : null }));
    const inst = info.eq && info.eq.slots && info.eq.slots.clothes ? (info.eq.equipment || []).find((e) => e.id === info.eq.slots.clothes) : null;
    done.push({ ...L, p, d });
    console.log(JSON.stringify({ look: L.ko, worn, layers: d && d.layers, clip: d && d.clip, frame: d && d.frame, row: d && d.row,
      clothes: inst ? { mat: inst.mat, warmth: inst.attrs && inst.attrs.warmth } : null,
      tempC: info.wx && info.wx.tempC, snow: info.wx && info.wx.snow, fx: fx.ok }));
  }
  await browser.close();
  // ── 2줄 × 4칸 — 윗줄 ×4(발밑 기준 프레임 상자 둘레) · 아랫줄 1:1(같은 크기의 둘레) ──
  const { PNG } = require('pngjs');
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'char_meta.json'), 'utf8'));
  const Z = 4, PAD = 6;
  const cw = M.frameW + 2 * PAD, ch = M.frameH + 2 * PAD;      // 프레임 상자 + 여백(메타에서 · 새 수 0)
  const fx0 = Math.round(VW / 2 - M.anchorX) - PAD, fy0 = Math.round(VH / 2 - M.anchorY) - PAD;   // 발밑 = 화면 가운데(카메라 = 내 몸)
  const PW = cw * Z, PH = ch * Z, G = 8;
  const out = new PNG({ width: PW * 4 + G * 3, height: PH * 2 + G });
  out.data.fill(255);
  done.forEach((s, k) => {
    const im = PNG.sync.read(fs.readFileSync(s.p));
    const ox = k * (PW + G);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {        // 윗줄 ×4 최근접
      const si = ((fy0 + Math.floor(y / Z)) * im.width + (fx0 + Math.floor(x / Z))) * 4, di = (y * out.width + ox + x) * 4;
      im.data.copy(out.data, di, si, si + 4);
    }
    const cx0 = Math.round(VW / 2 - PW / 2), cy0 = Math.round(VH / 2 - M.anchorY / 2 - PH / 2);   // 아랫줄 1:1 — 같은 칸 크기의 둘레
    for (let y = 0; y < PH; y++) {
      const si = ((cy0 + y) * im.width + cx0) * 4, di = ((PH + G + y) * out.width + ox) * 4;
      im.data.copy(out.data, di, si, si + PW * 4);
    }
  });
  fs.writeFileSync(OUT, PNG.sync.write(out));
  console.log('→', OUT, `${out.width}x${out.height}`, errs.length ? `pageerror ${errs.length}: ${errs[0]}` : 'pageerror 0');
  shutdown(); for (const f of [WRAP, PHF]) { try { fs.unlinkSync(f); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
