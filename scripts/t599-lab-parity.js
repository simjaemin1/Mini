#!/usr/bin/env node
// === scripts/t599-lab-parity.js — 랩 끔 판(이식 전) ↔ 켬 판(이식 후) 계수 표 (T599) ======================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(판정 0 · 표만 낸다).
//
// T599 는 서버에만 있던 여섯(T569·T570·T577 추신·T578·T579 추신·T590)을 랩으로 옮겼다(손잡이 없음 — 랩도 같은 값).
// 이 계측기는 **이식 전 랩**(`git show <ref>:lab/<파일>` — 기본 ref = origin/main)과 **지금 랩**(작업 트리)을
// 같은 시드·같은 난수열(`Math.random` → mulberry32(시드) — `lab-trees.js` 와 같은 처방)로 헤드리스 N일 돌려
// 카드가 묻는 셋을 잰다:
//   ① 영토 겹침   — 두 마을 이상의 영토에 든 칸(끝 · 50일마다 본 최대) · 남의 소유(`_claimedAll`)인 제 영토 칸 ·
//                    남의 집 부지에 닿는 집(부지 원판 차집합 — 서버 `_t569LotsTouch` 와 같은 정의를 여기서 한 번 만든다) · 남의 영토에 닿는 집
//   ② 죽음 몸     — 어제 마을에 있던 몸이 오늘 어디로 갔나(신원 추적): 그 자리 죽음 · 걸어 나감 · **순간 소멸**(몸 없이 지워짐) ·
//                    전장(전쟁 층 `_bdead`) · 맹수(`_dead`) · 이름표만 바꾼 몸(`_bxStat.relabel`)
//   ③ 캐러밴 직선 비율 — 살아 있는 마을쌍의 교역 다리(회관 상자 절단 + 병합 — `dispatchTrades` 그 줄)가 서버 캐러밴 걸음의
//                    직선 검사(1/16칸 보폭)로 막힌 칸을 밟는 길이 비율 — **0일(길 없는 맨 교역로)** · 끝날 둘 ·
//                    교역로 겹침(쌍마다 판 길이 서로 붙었나: 1 − 합집합 칸 ÷ 길이 합 — 0일 길 vs 끝 캐시를 **같은 끝 세계**에서) ·
//                    교역로 칸 중 길 칸(같은 두 길 묶음 · 끝 세계 답압)
// 덤: 도적 보호기 끝(마을별 econ 날 — T577) · 첫 해체 결성 · 화면 날짜 글자(T570) · 끝 인구·생존 마을(부작용 보기).
//
// ①′ 합성 판(`--synth`) — 빨리감기 판에선 끔 판도 겹침이 0 이라(랩 프론티어가 넣을 때 이미 남의 칸을 거른다) 규칙이 실제로 무는지
//     따로 본다: `lifeInit` 뒤 이웃 B 가 마을 A 영토 둘레 6칸 띠(빈 뭍 칸)를 이미 가졌다고 치고 A 에 자랄 몫(땅 두 배 · 상한 비킴)을 준 뒤
//     (grow) `growTerritory(A)` — 줄 세워 둔 프론티어 칸 · (relayout) `relayoutVillage(A)` — 관찰 모드 마을 꼴 다시 그리기 를 한 번 부르고
//     A 영토가 B 띠를 몇 칸 먹었나(`into`) · 소유 표(`_claimedAll`)에서 몇 칸을 빼앗았나(`stolen`)를 센다.
//
// 실행: node scripts/t599-lab-parity.js [--lab war|village] [--days 500] [--seeds 7,42,1020] [--nvil 8] [--pop <랩 초기 인구 막대>]
//                                       [--ref origin/main] [--json out.json] [--synth]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const LABK = opt('lab', 'war');
const FILE = LABK === 'village' ? '마을실험실.html' : '전쟁실험실.html';
const DAYS = parseInt(opt('days', '500'), 10);
const SEEDS = opt('seeds', '7,42,1020').split(',').map(Number);
const NVIL = opt('nvil', '8');
const POP = opt('pop', '');
const REF = opt('ref', 'origin/main');
const JSON_OUT = opt('json', '');
const ROOT = path.join(__dirname, '..');

// 이식 전 랩 — 그 ref 의 파일을 임시 디렉터리에 그대로(랩은 한 파일이다 — 외부 참조 0)
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 't599-base-'));
const BASE = path.join(baseDir, FILE);
fs.writeFileSync(BASE, execFileSync('git', ['show', `${REF}:lab/${FILE}`], { cwd: ROOT, maxBuffer: 256 << 20 }));
const HEAD = path.join(ROOT, 'lab', FILE);

const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

async function runOne(browser, file, seed) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(seed));
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(({ days, seed, nvil, pop }) => {
    const out = { err: null };
    try {
      document.getElementById('seed').value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
      if (pop) { const pe = document.getElementById('pop'); if (pe) pe.value = String(pop); }
      reseed(); lifeInit();
      out.v0 = VILS.length;
      const VL = VillageLayout;
      // ── ③ 캐러밴 — 한 함수로 0일·끝날 둘 다 잰다(같은 자)
      const blk = (x, y) => TR.terrain.isBlocked(x, y) && !(TR.bridge && TR.bridge[idx(x, y)]);
      const smooth = (typeof _smoothCaravan === 'function') ? _smoothCaravan : _smoothWalk;
      const carv = () => {
        const C = { pairs: 0, nullPairs: 0, walkLen: 0, badLen: 0, badSegs: 0, segs: 0 };
        const _oV = V, _oL = life;
        for (let i = 0; i < VILS.length; i++) for (let j = i + 1; j < VILS.length; j++) {
          const A = VILS[i], Bv = VILS[j]; if (!A.econ || !Bv.econ || !A.center || !Bv.center) continue;
          V = A.V; life = A;
          const hall = A.center, oh = Bv.center, tp = getTradePath(hall, oh);
          if (!(tp && tp.length > 1)) { C.nullPairs++; continue; }
          C.pairs++;
          let rt = (tp[0].x === hall.cx && tp[0].y === hall.cy) ? tp.slice() : tp.slice().reverse();
          const inH8 = (h, p) => p.x >= h.cx - 4.5 && p.x <= h.cx + 3.5 && p.y >= h.cy - 4.5 && p.y <= h.cy + 3.5;
          while (rt.length > 1 && inH8(hall, rt[0])) rt = rt.slice(1);
          while (rt.length > 1 && inH8(oh, rt[rt.length - 1])) rt = rt.slice(0, -1);
          const sm = smooth(rt);
          for (let k = 1; k < sm.length; k++) {
            const a = sm[k - 1], b = sm[k], L = Math.hypot(b.x - a.x, b.y - a.y); C.walkLen += L; C.segs++;
            const n = Math.max(1, Math.ceil(L * 16)); let hit = false;
            for (let q = 0; q <= n && !hit; q++) { const x = a.x + (b.x - a.x) * q / n, y = a.y + (b.y - a.y) * q / n; if (blk(Math.floor(x + 0.5), Math.floor(y + 0.5))) hit = true; }
            if (hit) { C.badSegs++; C.badLen += L; }
          }
        }
        V = _oV; life = _oL;
        C.ratio = C.walkLen ? +(C.badLen / C.walkLen).toFixed(4) : 0;
        C.walkLen = Math.round(C.walkLen); C.badLen = Math.round(C.badLen);
        return C;
      };
      out.caravan0 = carv();
      const route0 = {}; for (const k in _tradePaths) if (_tradePaths[k]) route0[k] = _tradePaths[k].slice();   // 0일 교역로(끝 세계에서 견줄 몫)
      // ── ② 몸 — 신원 추적(어제 마을에 있던 몸이 오늘 어디로 갔나)
      const B = { died: 0, walk: 0, other: 0, vanish: 0, war: 0, wild: 0, born: 0 };
      const openDays = (typeof _bdtOpenDay === 'function') ? VILS.map((v) => _bdtOpenDay(v)) : VILS.map(() => BDT_MIN_DAY);
      const gangs = []; const seenG = new Set(BANDITS.map((g) => g.id));
      // ── ① 영토 겹침 — 끝 · 50일마다 본 최대
      const overlapNow = () => {
        const cnt = new Map();
        for (const v of VILS) { if (!v.V || !v.V.territory) continue; const own = new Set(); for (const c of v.V.territory) { const k = c[0] + ',' + c[1]; if (own.has(k)) continue; own.add(k); cnt.set(k, (cnt.get(k) || 0) + 1); } }
        let overlap = 0, terr = 0; for (const n of cnt.values()) { terr++; if (n >= 2) overlap++; }
        return { overlap, terr };
      };
      let ovMax = 0, ovMaxDay = 0;
      const t0 = performance.now();
      for (let d = 0; d < days; d++) {
        const prev = new Set(); for (const v of VILS) for (const a of (v.agents || [])) prev.add(a);
        lifeDayAll(true);
        const cur = new Set(); for (const v of VILS) for (const a of (v.agents || [])) cur.add(a);
        for (const a of prev) if (!cur.has(a)) {
          if (a._bx) B[a._bx.cat] = (B[a._bx.cat] || 0) + 1;
          else if (a._bdead) B.war++;
          else if (a._dead) B.wild++;
          else B.vanish++;
        }
        for (const a of cur) if (!prev.has(a)) B.born++;
        for (const g of BANDITS) if (!seenG.has(g.id)) { seenG.add(g.id); if (/^해체/.test(g.why || '')) gangs.push([ECON_WORLD.day, g.home, g.n]); }
        if ((d + 1) % 50 === 0) { const o = overlapNow(); if (o.overlap > ovMax) { ovMax = o.overlap; ovMaxDay = ECON_WORLD.day; } }
      }
      out.ms = Math.round(performance.now() - t0);
      out.body = B;
      out.relabel = (typeof _bxStat !== 'undefined' && _bxStat) ? _bxStat.relabel : null;
      out.bxStat = (typeof _bxStat !== 'undefined' && _bxStat) ? _bxStat : null;
      out.openDays = openDays; out.gangs = gangs;
      const ov = overlapNow();
      let foreignOwned = 0;
      for (const v of VILS) { if (!v.V || !v.V.territory) continue; for (const c of v.V.territory) { const o = _claimedAll.get(c[0] + ',' + c[1]); if (o && o !== v) foreignOwned++; } }
      const D = new Set(); for (const a of VL.LOT_CELLS) for (const b of VL.LOT_CELLS) D.add((a[0] - b[0]) + ',' + (a[1] - b[1]));
      let houses = 0, touchHouse = 0, touchTerr = 0;
      for (const s of VILS) for (const h of (s.houses || [])) {
        if (h.player) continue; houses++;
        const x = Math.round(h.cx), y = Math.round(h.cy);
        let th = false; for (const v of VILS) { if (v === s || !v.houses) continue; for (const g of v.houses) if (D.has((Math.round(g.cx) - x) + ',' + (Math.round(g.cy) - y))) { th = true; break; } if (th) break; }
        let tt = false; for (const [dx, dy] of VL.LOT_CELLS) { const o = _claimedAll.get((x + dx) + ',' + (y + dy)); if (o && o !== s) { tt = true; break; } }
        if (th) touchHouse++; if (tt) touchTerr++;
      }
      out.terr = { cells: ov.terr, overlap: ov.overlap, ovMax, ovMaxDay, foreignOwned, houses, touchHouse, touchTerr };
      // ── ③ 끝 — 캐러밴 직선 · 교역로 겹침 · 길 칸(0일 길 vs 끝 캐시 — 같은 끝 세계 답압)
      out.caravan = carv();
      const rstat = (paths) => {
        let sum = 0, road = 0; const U = new Set();
        for (const p of paths) for (const q of p) { sum++; U.add(q.x * 65536 + q.y); if (typeof roadLevel === 'function' && roadLevel(q.x, q.y) > 0) road++; }
        return { pairs: paths.length, cells: sum, union: U.size, merge: sum ? +(1 - U.size / sum).toFixed(4) : 0, roadShare: sum ? +(road / sum).toFixed(4) : 0 };
      };
      const keys = Object.keys(route0).filter((k) => _tradePaths[k]);
      out.route0 = rstat(keys.map((k) => route0[k]));
      out.routeEnd = rstat(keys.map((k) => _tradePaths[k]));
      out.routeChanged = keys.filter((k) => { const a = route0[k], b = _tradePaths[k]; return a.length !== b.length || a.some((q, i) => q.x !== b[i].x || q.y !== b[i].y); }).length;
      out.redig = (typeof _tpStat !== 'undefined') ? Object.assign({ gen: _roadGen }, _tpStat) : null;
      // 덤 — 화면 날짜 · 끝 인구
      lifeStats();
      const hud = ((document.getElementById('gstat') || {}).innerText || '').split('\n');
      { const m = hud.join(' ').match(/\d+년 \d+월 \d+일\s*(\([^)]*\)|\S+)/); out.dateLabel = m ? m[0] : ''; }   // 날짜 글자(끔: 랩 손 달력 · 켬: 달력 정본 `labelOf`)
      out.v1 = VILS.length; out.pop = VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0);
      out.eday = ECON_WORLD.day;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
    return out;
  }, { days: DAYS, seed, nvil: NVIL, pop: POP });
  r.pageErrors = errs.length; r.pageErr0 = errs[0] || null;
  await page.close();
  return r;
}

const SYNTH = argv.includes('--synth');
async function synthOne(browser, file, seed, mode) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(seed));
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 600000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(([seed, mode, nvil]) => {
    document.getElementById('seed').value = String(seed);
    const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
    reseed(); lifeInit();
    const A = VILS[0], B = VILS[1];
    const own = new Set(A.V.territory.map((c) => c[0] + ',' + c[1]));
    const ring = new Set();   // 이웃 B 가 이미 가진 칸 — A 영토 둘레 6칸 띠의 빈 뭍 칸
    for (const c of A.V.territory) for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
      const x = c[0] + dx, y = c[1] + dy, k = x + ',' + y;
      if (own.has(k) || !inG(x, y) || TR.water[idx(x, y)] || TR.rock[idx(x, y)] || _claimedAll.get(k)) continue; ring.add(k); }
    for (const k of ring) { _claimedAll.set(k, B); const q = k.split(','); B.V.territory.push([+q[0], +q[1]]); if (B._ownSet) B._ownSet.add(k); }
    A.econ.land.size *= 2; if (typeof _terrCapOf === 'function') window._terrCapOf = () => 1e9;   // 자랄 몫 — 상한은 이 판에서 비킨다(겨냥은 겹침 규칙 하나)
    const n0 = A.V.territory.length;
    if (mode === 'grow') growTerritory(A, 300); else relayoutVillage(A, Math.max(2, Math.round(A.pop)));
    let into = 0, stolen = 0;
    for (const c of A.V.territory) if (ring.has(c[0] + ',' + c[1])) into++;
    for (const k of ring) if (_claimedAll.get(k) === A) stolen++;
    return { ring: ring.size, n0, n1: A.V.territory.length, into, stolen };
  }, [seed, mode, NVIL]);
  r.pageErrors = errs.length;
  await page.close();
  return r;
}
async function synthMain() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const res = {};
  for (const seed of SEEDS) for (const mode of ['grow', 'relayout']) res[seed + ' ' + mode] = { off: await synthOne(browser, BASE, seed, mode), on: await synthOne(browser, HEAD, seed, mode) };
  await browser.close();
  try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch (e) {}
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 1));
  console.log(`\n### ${FILE} · 합성 판(①′) · 이웃 띠 = A 영토 둘레 6칸 빈 뭍 칸 · 칸 = 끔 → 켬\n`);
  console.log('| 시드 · 문 | 이웃 띠 칸 | A 영토 칸(전 → 후) | A 가 먹은 이웃 칸 | 빼앗은 소유 칸 | 페이지 오류 |');
  console.log('|---|---|---|---|---|---|');
  for (const k in res) { const a = res[k].off, b = res[k].on;
    console.log(`| ${k} | ${a.ring} | ${a.n0}→${a.n1} → ${b.n0}→${b.n1} | ${a.into} → ${b.into} | ${a.stolen} → ${b.stolen} | ${a.pageErrors} → ${b.pageErrors} |`); }
}

if (SYNTH) synthMain().catch((e) => { console.error(e); process.exit(1); });
else (async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const res = { lab: FILE, days: DAYS, nvil: NVIL, pop: POP || null, ref: REF, refHash: execFileSync('git', ['rev-parse', '--short=8', REF], { cwd: ROOT }).toString().trim(), seeds: {} };
  for (const seed of SEEDS) {
    const off = await runOne(browser, BASE, seed);
    const on = await runOne(browser, HEAD, seed);
    res.seeds[seed] = { off, on };
    console.log(`seed ${seed} 끔 ${off.ms}ms(오류 ${off.pageErrors}${off.err ? ' · ' + off.err.slice(0, 80) : ''}) · 켬 ${on.ms}ms(오류 ${on.pageErrors}${on.err ? ' · ' + on.err.slice(0, 80) : ''})`);
  }
  await browser.close();
  try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch (e) {}
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 1));
  // ── 표
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const row = (name, f) => {
    const cells = SEEDS.map((s) => { const x = res.seeds[s]; return `${f(x.off)} → ${f(x.on)}`; });
    console.log(`| ${name} | ${cells.join(' | ')} |`);
  };
  console.log(`\n### ${FILE} · ${DAYS}일 · 마을 ${NVIL}${POP ? ' · 초기 인구 막대 ' + POP : ''} · 끔 = ${REF}(${res.refHash}) 랩 · 켬 = 작업 트리 랩 · 칸 = 끔 → 켬\n`);
  console.log(`| 계수 | ${SEEDS.map((s) => '시드 ' + s).join(' | ')} |`);
  console.log(`|---|${SEEDS.map(() => '---').join('|')}|`);
  row('① 영토 겹침 칸(끝 · 50일마다 본 최대)', (r) => r.terr ? `${r.terr.overlap} · ${r.terr.ovMax}` : '—');
  row('① 남의 소유인 제 영토 칸', (r) => r.terr ? r.terr.foreignOwned : '—');
  row('① 남의 집 부지에 닿는 집 / 집', (r) => r.terr ? `${r.terr.touchHouse}/${r.terr.houses}` : '—');
  row('① 남의 영토에 닿는 집', (r) => r.terr ? r.terr.touchTerr : '—');
  row('① 영토 칸(끝 · 전 마을)', (r) => r.terr ? r.terr.cells : '—');
  row('② 순간 소멸(몸 없이)', (r) => r.body ? r.body.vanish : '—');
  row('② 그 자리 죽음(누운 몸)', (r) => r.body ? (r.body.died || 0) : '—');
  row('② 걸어 나감(은거지·마을 밖)', (r) => r.body ? (r.body.walk || 0) + (r.body.other || 0) : '—');
  row('② 이름표만 바꾼 몸', (r) => r.relabel == null ? 0 : r.relabel);
  row('② 새로 선 몸(출생·직업 바뀜 새 몸)', (r) => r.body ? r.body.born : '—');
  row('② 전장 · 맹수', (r) => r.body ? `${r.body.war} · ${r.body.wild}` : '—');
  row('③ 캐러밴 직선 비율 0일(맨 교역로)', (r) => r.caravan0 ? `${pct(r.caravan0.ratio)}(${r.caravan0.badSegs}/${r.caravan0.segs})` : '—');
  row('③ 캐러밴 직선 비율 끝날', (r) => r.caravan ? `${pct(r.caravan.ratio)}(${r.caravan.badSegs}/${r.caravan.segs})` : '—');
  row('③ 교역로 겹침 0일 길 → 끝 캐시(끝 세계)', (r) => r.route0 ? `${pct(r.route0.merge)}→${pct(r.routeEnd.merge)}` : '—');
  row('③ 교역로 칸 중 길 칸 0일 길 → 끝 캐시', (r) => r.route0 ? `${pct(r.route0.roadShare)}→${pct(r.routeEnd.roadShare)}` : '—');
  row('③ 다시 판 쌍(바뀐 쌍 / 캐시 쌍) · 바퀴', (r) => r.redig ? `${r.routeChanged}/${r.route0.pairs} · ${r.redig.pass}` : `${r.routeChanged}/${r.route0 ? r.route0.pairs : 0}`);
  row('덤 도적 보호기 끝(econ 날 · 최소~최대)', (r) => r.openDays ? `${Math.min(...r.openDays)}~${Math.max(...r.openDays)}` : '—');
  row('덤 해체 결성(건 · 첫 econ 날)', (r) => r.gangs && r.gangs.length ? `${r.gangs.length} · ${r.gangs[0][0]}` : '0');
  row('덤 화면 날짜(끝)', (r) => r.dateLabel || '—');
  row('덤 끝 인구 · 마을', (r) => `${r.pop} · ${r.v1}/${r.v0}`);
  row('덤 페이지 오류', (r) => r.pageErrors + (r.err ? '(예외)' : ''));
})().catch((e) => { console.error(e); process.exit(1); });
