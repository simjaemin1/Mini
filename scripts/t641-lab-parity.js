#!/usr/bin/env node
// === scripts/t641-lab-parity.js — 랩 대조 2차(T641) 계수: 이식 전 랩 ↔ 지금 랩 · 끔 ↔ 켬 ==================================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(판정 0 · 표만 낸다).
//
// T641 이 랩에 옮긴 것 둘:
//   ① **작물 철 월동 셈**(T594 거울 `cropGrowAt`) — 서버 T99 춘화 그 셈(달력 정본 `EconEngine.Calendar`)으로. 옛 줄은 랩 1월 기점 달력이라
//      켬 판 보리·밀·마늘이 서버보다 61일 일찍 익었다.
//   ② **서버 env 손잡이 문**(`▼T641-ENV-DOOR`) — URL 대문자 칸을 같은 이름 그대로 번들 `process.env` 로(T602 `T602_NEW_FISH` 등).
// 같은 시드·같은 난수열(`Math.random` → mulberry32(시드) — `t599-lab-parity.js`·`lab-trees.js` 와 같은 처방)로 헤드리스 N일:
//   ⓐ base          — 이식 전 랩(`git show <ref>:lab/<파일>` · 기본 ref = origin/main) · URL 칸 없음
//   ⓑ head          — 지금 랩 · URL 칸 없음                 ⇒ ⓐ 와 세계 지문이 **같아야**(문은 대문자 칸이 없으면 아무것도 안 한다 · 거울은 끔)
//   ⓒ head ?<on>    — 기본 `T602_NEW_FISH=1`                  ⇒ 번들이 실제로 켰나(econ 이 부팅 때 찍는 특산 종 수 · TRADABLE 수) · 세계는?
//   ⓓ head ?<decoy> — 기본 `PEACE_W=0.3`(서버 econ 이 env 로 읽는 진짜 손잡이 · 평시 전사 몫 0.03 → 0.3)
//                                                              ⇒ [자명 통과 금지] 문이 살아 있으면 세계가 **갈린다**
//   ⓔ base ?cropcal=1 · ⓕ head ?cropcal=1 — 작물 철 켬(옛 거울 ↔ 새 거울): 심은 월동 작물마다 익는 날(심은 날 + `g`) ·
//                                                              그 달 분포 · 서버 `crops.readyDay`(T594_CROP_CAL=1) 와 같은 날인가
//   ⓖ head ?T594_CROP_CAL=1 — 서버 이름으로 켠 판(문 → `LAB_ENV` → 별칭 줄)                 ⇒ ⓕ 와 세계 지문이 같아야
// 세계 지문 = 날마다 마을별 (econ 인구 · econ 창고(0 아닌 칸) · 생활층 몸 수 · 생활층 곳간 `food`) 를 FNV-1a 로 잇는다.
//
// ⓗ `--slow` — 관찰 속도(119 · 실제 도보) 판을 **rAF 를 손으로 돌려** 결정론으로(`test-lab-psite` 그 꼴 · 마을 2 · 인구 40 · 시드 7 ·
//   A = 집터 없음 · B = 2일째 첫 프레임에 플레이어 집터) — 이식 전 ↔ 지금 세계 지문이 프레임 500마다 같은가.
//   (`test-lab-psite` 는 실시간 400ms 표본으로 지정 시각·하루 표본을 정해 같은 파일도 판마다 갈린다 — 그 하네스 대신 결정론 판으로 잰다)
//
// 실행: node scripts/t641-lab-parity.js [--lab war|village|both] [--days 500] [--seeds 7,42,1020] [--nvil 8]
//                                       [--on T602_NEW_FISH=1] [--decoy PEACE_W=0.3] [--ref origin/main] [--json out.json]
//       node scripts/t641-lab-parity.js --slow [--lab war] [--days 20] [--ref origin/main]
'use strict';
process.env.T594_CROP_CAL = '1';   // 아래 서버 대조(`crops.readyDay`)는 켬 판의 답이다 — 모듈을 싣기 전에 심는다
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const Crops = require(path.join(ROOT, 'server/crops'));
const CropCal = require(path.join(ROOT, 'server/crop-cal'));
const Cal = require(path.join(ROOT, 'server/calendar'));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const LABS = { war: '전쟁실험실.html', village: '마을실험실.html' };
const LABK = opt('lab', 'both');
const DAYS = parseInt(opt('days', '500'), 10);
const SEEDS = opt('seeds', '7,42,1020').split(',').map(Number);
const NVIL = opt('nvil', '8');
const ON = opt('on', 'T602_NEW_FISH=1');
const DECOY = opt('decoy', 'PEACE_W=0.3');
const REF = opt('ref', 'origin/main');
const JSON_OUT = opt('json', '');
const L_START = 120;   // 랩 날 − econ 날(두 랩 `L_START` — 아래 페이지에서 다시 읽어 맞댄다)
const WINTER = ['보리', '밀', '마늘'];

// 랩 id → 서버 id(생성기 `t594-lab-cropcal.js` 와 같은 고름 — 카탈로그 `ko`)
function serverIdOf(lid) {
  for (const id of CropCal.ids()) {
    const ko = String(Crops.koOf(id) || ''); const inner = (/\(([^)]*)\)/.exec(ko) || [])[1];
    if ([ko, ko.replace(/\(.*\)/, ''), inner].filter(Boolean).includes(lid)) return id;
  }
  return null;
}

const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

async function runOne(browser, file, query, seed) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(seed));
  const errs = [], spec = [], door = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errs.push('CONSOLE ' + t.slice(0, 160));
    if (/specialty\.js 통합/.test(t)) spec.push(t);
    if (/^\[T641\]/.test(t)) door.push(t);
  });
  await page.goto('file://' + file + (query ? '?' + query : ''), { waitUntil: 'load', timeout: 600000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(({ days, seed, nvil, WINTER }) => {
    const out = { err: null };
    try {
      out.proc = (typeof window.process === 'undefined') ? '없음' : JSON.stringify(window.process.env || null);
      out.badge = !!document.getElementById('labEnv');
      out.cropcal = (typeof L_CROPCAL !== 'undefined') ? !!L_CROPCAL : null;
      out.lstart = (typeof L_START !== 'undefined') ? L_START : null;
      document.getElementById('seed').value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
      reseed(); lifeInit();
      out.v0 = VILS.length;
      // FNV-1a 32 — 날마다 마을별 econ 인구 · econ 창고(0 아닌 칸) · 몸 수 · 생활층 곳간
      let h = 0x811c9dc5 >>> 0;
      const mix = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
      const snap = () => {
        const parts = [String(ECON_WORLD.day), String(VILS.length)];
        for (const v of VILS) {
          const e = v.econ; if (!e) { parts.push('x'); continue; }
          const st = e.storage || {};
          const ks = Object.keys(st).sort().filter((k) => (+st[k] || 0) !== 0);   // 0 인 칸은 뺀다(품목표가 늘면 빈 칸이 같이 는다 — 세계가 아니라 표)
          parts.push(e.npcs.length + ':' + (v.agents ? v.agents.length : -1) + ':' + (+v.food || 0).toFixed(4) + ':' + ks.map((k) => k + '=' + (+st[k]).toFixed(6)).join(','));
        }
        return parts.join('|');
      };
      const W = new Set(WINTER), seen = new WeakSet(), plant = [];
      const t0 = performance.now();
      const traj = [];
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        mix(snap());
        for (const v of VILS) if (v.crop) for (const e of v.crop.values()) if (e && e.crop && W.has(e.crop.id) && !seen.has(e)) { seen.add(e); plant.push([e.crop.id, e.planted, e.g || e.crop.grow]); }
        if ((d + 1) % 50 === 0) traj.push(VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0));
      }
      out.ms = Math.round(performance.now() - t0);
      out.fp = (h >>> 0).toString(16).padStart(8, '0');
      out.traj = traj;
      out.plant = plant;
      out.v1 = VILS.length;
      out.alive = VILS.filter((v) => v.econ && v.econ.npcs.length > 0).length;
      out.pop = VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0);
      out.eday = ECON_WORLD.day;
      const NEW = ['red_seabream', 'sea_bass', 'mullet', 'black_porgy', 'rockfish', 'horse_mackerel', 'mackerel'];   // T602 새 해안 어종 일곱
      let held = 0; for (const v of VILS) { const st = (v.econ && v.econ.storage) || {}; for (const k of NEW) if ((+st[k] || 0) > 0) held++; }
      out.newHeld = held;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
    return out;
  }, { days: DAYS, seed, nvil: NVIL, WINTER });
  r.spec = spec[0] || null; r.door = door[0] || null; r.pageErrors = errs.length; r.pageErr0 = errs[0] || null;
  await page.close();
  return r;
}

// ⓗ 결정론 관찰 판 — rAF·performance.now 를 손에 쥐고 lifeLoop 를 프레임마다 직접 부른다(마을 2 · 인구 40 · 시드 7 · 속도 119)
const SLOW_INIT = `(() => {
  let s = 0x9e3779b9;
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0; window.__adv = (d) => { vt += d; return vt; };
  performance.now = () => vt;
  window.__rafQ = []; window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return window.__rafQ.length; };
})();`;
async function runSlow(browser, file, withSite, days) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.addInitScript(SLOW_INIT);
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 600000 });
  const r = await page.evaluate(({ days, withSite }) => {
    document.getElementById('nvil').value = '2'; document.getElementById('pop').value = '40'; document.getElementById('seed').value = '7';
    const sel = document.getElementById('simSpeed'); if (![...sel.options].some((o) => o.value === '119')) sel.add(new Option('119', '119')); sel.value = '119';
    window.__rafQ.length = 0;
    lifeToggle();
    let h = 0x811c9dc5 >>> 0; const mix = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
    const day0 = VILS[0].day; let placed = null, frames = 0; const marks = [];
    while (VILS[0].day < day0 + days && frames < 400000) {
      const q = window.__rafQ.splice(0); const now = window.__adv(16.667);
      for (const cb of q) cb(now);
      frames++;
      if (withSite && !placed && VILS[0].day >= day0 + 2) {   // test-lab-psite 와 같은 후보 고름(영토 짝수 칸 · 회관 가까운 순)
        const v = VILS[0], c = v.center;
        const cand = (v.V.territory || []).map((t) => ({ x: t[0], y: t[1], d: Math.hypot(t[0] - c.cx, t[1] - c.cy) })).filter((t) => !(t.x & 1) && !(t.y & 1)).sort((a, b) => a.d - b.d);
        for (const t of cand) { const r2 = placePlayerSite(v, t.x, t.y); if (!r2.err) { placed = { x: r2.site.cx, y: r2.site.cy, frame: frames }; break; } }
      }
      if (frames % 500 === 0) {
        const v = VILS[0];
        mix([v.day, Math.round(v.pop), v.houses.map((x) => (x.builtFloors || 0) + ':' + (+(x.built || 0)).toFixed(4)).join(','),
          v.agents.map((a) => (+a.px).toFixed(3) + ',' + (+a.py).toFixed(3) + ',' + a.state).join(';'), JSON.stringify((v.econ && v.econ.storage) || {})].join('|'));
        if (frames % 5000 === 0) marks.push(v.day + ':' + (h >>> 0).toString(16));
      }
    }
    const v = VILS[0];
    return { frames, placed, fp: (h >>> 0).toString(16), marks, day: v.day, mapBeds: (v.econ && v.econ._mapBeds) || 0 };
  }, { days, withSite });
  r.errs = errs.length; await page.close();
  return r;
}

// 월동 작물 심음 → 익는 달 분포 · 서버 readyDay 와 같은 날인가
function ripen(plant) {
  const byMonth = {}; let same = 0, n = 0;
  for (const [lid, planted, g] of plant) {
    const e = planted - L_START, m = Cal.dateOf(e + g).month;
    byMonth[m] = (byMonth[m] || 0) + 1; n++;
    const sid = serverIdOf(lid);
    if (sid && Crops.readyDay(sid, e) - e === g) same++;
  }
  const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b).map((m) => `${m}월 ${byMonth[m]}`).join(' · ');
  return { n, same, months };
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=4096'] });
  if (argv.includes('--slow')) {   // ⓗ 결정론 관찰 판
    const lk = LABK === 'both' ? 'war' : LABK, FILE = LABS[lk], days = parseInt(opt('days', '20'), 10);
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 't641-slow-'));
    const BASE = path.join(baseDir, FILE);
    fs.writeFileSync(BASE, execFileSync('git', ['show', `${REF}:lab/${FILE}`], { cwd: ROOT, maxBuffer: 256 << 20 }));
    for (const ws of [false, true]) {
      const a = await runSlow(browser, BASE, ws, days), b = await runSlow(browser, path.join(ROOT, 'lab', FILE), ws, days);
      const f = (x) => `${x.fp} · 프레임 ${x.frames} · 날 ${x.day} · mapBeds ${x.mapBeds} · 지정 ${x.placed ? x.placed.x + ',' + x.placed.y + '@' + x.placed.frame : '-'} · 오류 ${x.errs}`;
      console.log(`[${lk} 관찰 판 ${ws ? 'B(플레이어 집터)' : 'A(없음)'} · ${days}일]  base(${REF}) ${f(a)}`);
      console.log(`${' '.repeat(lk.length + 12)}${ws ? '        ' : '  '}            head ${f(b)}`);
      console.log(`  ⇒ 세계 지문 같음 ${a.fp === b.fp ? '○' : '✗'} · 표지(5,000 프레임마다) ${a.marks.join(' ')} ${a.marks.join() === b.marks.join() ? '=' : '≠ ' + b.marks.join(' ')}`);
    }
    await browser.close(); process.exit(0);
  }
  const all = {};
  const which = LABK === 'both' ? ['war', 'village'] : [LABK];
  for (const lk of which) {
    const FILE = LABS[lk];
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 't641-base-'));
    const BASE = path.join(baseDir, FILE);
    fs.writeFileSync(BASE, execFileSync('git', ['show', `${REF}:lab/${FILE}`], { cwd: ROOT, maxBuffer: 256 << 20 }));
    const HEAD = path.join(ROOT, 'lab', FILE);
    const rows = [];
    for (const seed of SEEDS) {
      const a = await runOne(browser, BASE, '', seed);
      const b = await runOne(browser, HEAD, '', seed);
      const c = await runOne(browser, HEAD, ON, seed);
      const d = await runOne(browser, HEAD, DECOY, seed);
      const e = await runOne(browser, BASE, 'cropcal=1', seed);
      const f = await runOne(browser, HEAD, 'cropcal=1', seed);
      const g = await runOne(browser, HEAD, 'T594_CROP_CAL=1', seed);   // 서버 이름으로 켠 판 = ⓕ 와 같아야
      const re = ripen(e.plant), rf = ripen(f.plant), rb = ripen(b.plant);
      rows.push({ seed, base: a, head: b, on: c, decoy: d, ccBase: e, ccHead: f, ccName: g, ripen: { off: rb, oldOn: re, newOn: rf } });
      const s = (x) => `${x.fp} · 인구 ${x.pop} · 생존 ${x.alive}/${x.v1} · ${(x.ms / 1000).toFixed(0)}s${x.err ? ' · ERR ' + x.err.slice(0, 120) : ''}${x.pageErrors ? ' · 페이지오류 ' + x.pageErrors + ' ' + x.pageErr0 : ''}`;
      console.log(`[${lk} 시드 ${seed} · ${DAYS}일 · L_START ${b.lstart}]`);
      console.log(`  ⓐ base(${REF})            ${s(a)} · env ${a.proc} · ${a.spec || '-'}`);
      console.log(`  ⓑ head(칸 없음)            ${s(b)} · env ${b.proc} · 표 ${b.badge ? '있음' : '없음'} · 거울 ${b.cropcal ? '켬' : '끔'} · ${b.spec || '-'}`);
      console.log(`  ⓒ head ?${ON}    ${s(c)} · env ${c.proc} · 표 ${c.badge ? '있음' : '없음'} · ${c.spec || '-'} · 새 어종 창고 ${c.newHeld}`);
      console.log(`  ⓓ head ?${DECOY}       ${s(d)} · env ${d.proc}`);
      console.log(`  ⓔ base ?cropcal=1          ${s(e)} · 월동 심음 ${re.n} · 익는 달 ${re.months || '-'} · 서버 readyDay 같음 ${re.same}/${re.n}`);
      console.log(`  ⓕ head ?cropcal=1          ${s(f)} · 월동 심음 ${rf.n} · 익는 달 ${rf.months || '-'} · 서버 readyDay 같음 ${rf.same}/${rf.n}`);
      console.log(`  ⓖ head ?T594_CROP_CAL=1    ${s(g)} · env ${g.proc} · 거울 ${g.cropcal ? '켬' : '끔'} · 서버 이름 = ⓕ ${g.fp === f.fp ? '○' : '✗'}`);
      console.log(`     (끔 판 ⓑ 월동 심음 ${rb.n} · 익는 달 ${rb.months || '-'} — 랩 표 grow 달력일)`);
      console.log(`  ⇒ 기본 같음 ${a.fp === b.fp ? '○' : '✗'} · 손잡이 켬 = 끔 ${b.fp === c.fp ? '○(세계 같음)' : '✗(세계 갈림)'} · 미끼 갈림 ${b.fp !== d.fp ? '○' : '✗(문이 죽었다)'} · 거울 켬 옛 ↔ 새 ${e.fp === f.fp ? '같음' : '갈림'} · 거울 켬 ↔ 끔 ${f.fp === b.fp ? '같음' : '갈림'}`);
    }
    all[lk] = rows;
  }
  await browser.close();
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ days: DAYS, seeds: SEEDS, nvil: NVIL, on: ON, decoy: DECOY, ref: REF, all }, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
