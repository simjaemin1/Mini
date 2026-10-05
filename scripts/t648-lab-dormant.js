#!/usr/bin/env node
// === scripts/t648-lab-dormant.js — T648 계수: 랩 밭 겨울 휴면 이식 전 ↔ 뒤 · 서버 상태기와 같은 날 같은 밭 ==========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(판정 0 · 표만 낸다).
//
// T648 이 랩에 옮긴 것: 서버 T99 ②(휴면 중 돌봄·품질 정지) · ③(다년생 휴면) — 랩 상태기 세 자리(`cellTask` · `doTask` · 하루 작물 진화)가
//   번들의 서버 정본 `EconEngine.Crops.dormantAt` 을 부르는 문(`cropDormant` — 구운 블록 · `scripts/t594-lab-cropcal.js`) 하나로 들어간다.
//
// ⓐ 랩 세계 판(T641 `t641-lab-parity.js` 와 같은 처방 — 같은 시드 · `Math.random` = mulberry32(시드) · 헤드리스 `lifeDayAll(true)` N일):
//    판 넷 = 이식 전 랩(`git show <ref>:lab/<파일>`) · 지금 랩 × 기본(작물 철 켬) · `?cropcal=0`(끔)
//    잰다 — 월동 밭(보리·밀·마늘)과 다년생 밭(부추·미나리)의 **돌봄 일감 수행**(김매기·물대기·방제)과 **품질 감점**(하루 작물 진화가 깎은 것)을
//      계절(가을·겨울·봄·여름 — 달력 정본 `EconEngine.Calendar.seasonOf(랩 날 − L_START)`)별로 · econ 인구 · 세계 지문(T641 그 FNV-1a).
//    ⚠감점 세기: 사본 랩(임시 파일)의 하루 작물 진화 줄 앞뒤에 **읽기만 하는** 두 줄을 끼운다(`const __q0=e.q;` … 깎인 몫을 창 함수로) —
//      난수를 안 먹고 상태를 안 바꾼다(지문이 같은지 같은 판으로 확인 — 출력 `계측 무해`). 일감은 전역 `doTask` 를 감싸 전후 칸을 본다.
// ⓑ 서버 대조 — **같은 날 같은 밭**: 월동 셋 × 랩 파종창(가을 달 · econ 1년) 날마다 한 칸을 심고 날마다
//      [하루 작물 진화 → 일감이 있으면 한 가지] 를 두 상태기에 똑같이 시킨다:
//        랩 = 그 페이지의 실제 함수(`cellTask` · `doTask` · 하루 작물 진화 줄은 그 랩 스크립트 글자 그대로 떠서 `new Function`) ·
//        서버 = `server/villages.js` `cropDayTick` · `cropTaskOf` · `cropDoTask`(정본 그대로).
//      날마다 (일감 번호 · 품질) 이 같은가 — 계절별. 병충해는 두 쪽 다 끈다(랩 난수 · 서버 자리 해시라 같은 날이 아니다) ·
//      비는 끈다(`T112_RAIN=0` — 랩엔 하늘이 없다). 둘 다 대조 밖의 축이다.
//
// 실행: node scripts/t648-lab-dormant.js [--lab war|village|both] [--days 500] [--seeds 7,42,1020] [--nvil 8] [--ref origin/main] [--json out.json]
//       node scripts/t648-lab-dormant.js --micro-only    # ⓑ 만
//   --preview — 판 하나 더(**미리보기 · 제품 아님**): 지금 랩 + 돌봄 차례 비율을 서버 정본 활동일 비율로(`crops.grownDays ÷ growDaysOf` —
//     서버 `villages._cropGrowFrac` 그 셈 · 월동 셋만 · 켬일 때만) 바꾼 사본. 랩 비율은 달력일(`(day−planted)/g`)이라 겨울에도 차올라
//     휴면 문만 옮기면 봄에 밀린 김매기가 몰린다 — 서버는 활동일이라 "멈춘 자리에서 재개"한다(villages.js T99 주석). 회부 판단 재료.
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t648-probe-${process.pid}.db`;
process.env.T112_RAIN = '0';   // ⓑ 서버 쪽 — 비 끔(랩엔 하늘이 없다)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const SV = require(path.join(ROOT, 'server/villages.js'));
const Crops = require(path.join(ROOT, 'server/crops'));
const Cal = require(path.join(ROOT, 'server/calendar'));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const LABS = { war: '전쟁실험실.html', village: '마을실험실.html' };
const LABK = opt('lab', 'both');
const DAYS = parseInt(opt('days', '500'), 10);
const SEEDS = opt('seeds', '7,42,1020').split(',').map(Number);
const NVIL = opt('nvil', '8');
const REF = opt('ref', 'origin/main');
const JSON_OUT = opt('json', '');
const WINTER = ['보리', '밀', '마늘'], PEREN = ['부추', '미나리'];
const PEN = "if(e.pest)e.q-=L_QP;else if(wd<L_WEEDS.length&&gf>=L_WEEDS[wd]+0.06)e.q-=L_QW;if(e.crop.field==='논'&&day-(e.watered||e.planted)>=L_WATERGAP+8)e.q-=L_QW;";

// 사본 랩 — 감점 줄 앞뒤에 읽기만 하는 두 줄
function instrumented(src, tag) {
  if (src.split(PEN).length !== 2) throw new Error(`${tag}: 하루 작물 진화 감점 줄을 하나로 못 찾았다 — 랩 꼴이 바뀌었다`);
  return src.replace(PEN, 'const __q0=e.q;' + PEN + 'if(window.__t648pen)window.__t648pen(e,day,__q0-e.q);');
}
const FRAC = '(day-e.planted)/(e.g||e.crop.grow)';
const FRAC_FN = "function __t648frac(e,day){const sid=L_CROPCAL&&L_CROPSID[e.crop.id],C=EconEngine.Crops;if(sid&&C.isWinterCrop(sid))return C.grownDays(sid,e.planted-L_START,day-L_START)/Math.max(1,C.growDaysOf(sid));return (day-e.planted)/(e.g||e.crop.grow);}";
function previewOf(src) {   // 미리보기 사본 — 돌봄 차례 비율 세 자리를 정본 활동일 비율로(월동 셋 · 켬)
  if (src.split(FRAC).length !== 4) throw new Error('돌봄 차례 비율 자리를 셋으로 못 찾았다');
  const END = '// ▲T594-CROPCAL\n';
  if (src.split(END).length !== 2) throw new Error('구운 블록 끝을 못 찾았다');
  return src.split(FRAC).join('__t648frac(e,day)').replace(END, END + FRAC_FN + '   // [T648 미리보기 — 계측 사본만]\n');
}
function labCopies(FILE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't648-lab-'));
  const base = execFileSync('git', ['show', `${REF}:lab/${FILE}`], { cwd: ROOT, maxBuffer: 256 << 20 }).toString('utf8');
  const head = fs.readFileSync(path.join(ROOT, 'lab', FILE), 'utf8');
  const out = { base: path.join(dir, 'base-' + FILE), head: path.join(dir, 'head-' + FILE), prev: path.join(dir, 'prev-' + FILE), headRaw: path.join(ROOT, 'lab', FILE) };
  fs.writeFileSync(out.base, instrumented(base, 'base'));
  fs.writeFileSync(out.head, instrumented(head, 'head'));
  fs.writeFileSync(out.prev, instrumented(previewOf(head), 'prev'));
  return out;
}

const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

async function runWorld(browser, file, query, seed) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(seed));
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await page.goto('file://' + file + (query ? '?' + query : ''), { waitUntil: 'load', timeout: 600000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(({ days, seed, nvil, WINTER, PEREN }) => {
    const out = { err: null };
    try {
      out.cropcal = (typeof L_CROPCAL !== 'undefined') ? !!L_CROPCAL : null;
      out.port = (typeof cropDormant === 'function');
      document.getElementById('seed').value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
      reseed(); lifeInit();
      const C = EconEngine.Calendar, LS = L_START, W = new Set(WINTER), P = new Set(PEREN);
      const grpOf = (id) => (W.has(id) ? 'W' : (P.has(id) ? 'P' : null));
      const cnt = {}; const inc = (k, n) => { cnt[k] = (cnt[k] || 0) + (n == null ? 1 : n); };
      const _dt = doTask;
      doTask = function (a, c, day) {   // 일감 수행 — 전후 칸을 본다(상태 무접촉)
        const s = life, k = ckey(c), e = s && s.crop.get(k);
        const pre = e ? { w: e.weeds || 0, p: e.pest || 0, wa: e.watered, id: e.crop.id } : null;
        const r0 = _dt.apply(this, arguments);
        if (r0 && pre) {
          const g = grpOf(pre.id);
          if (g) {
            const e2 = s.crop.get(k); let kind = null;
            if (e2 !== e) kind = 'harvest';
            else if ((e.weeds || 0) !== pre.w) kind = 'weed';
            else if (pre.p && !e.pest) kind = 'pest';
            else if (e.watered !== pre.wa) kind = 'water';
            if (kind) inc(g + ':' + C.seasonOf(day - LS) + ':' + kind);
          }
        }
        return r0;
      };
      window.__t648pen = (e, day, dq) => {   // 하루 작물 진화가 깎은 품질(사본 랩의 읽기 줄이 부른다)
        if (!(dq > 0)) return; const g = grpOf(e.crop.id); if (!g) return;
        const sn = C.seasonOf(day - LS); inc(g + ':' + sn + ':pen'); inc(g + ':' + sn + ':penQ', dq);
      };
      let h = 0x811c9dc5 >>> 0;
      const mix = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
      const snap = () => {   // T641 세계 지문 그대로
        const parts = [String(ECON_WORLD.day), String(VILS.length)];
        for (const v of VILS) {
          const e = v.econ; if (!e) { parts.push('x'); continue; }
          const st = e.storage || {};
          const ks = Object.keys(st).sort().filter((k) => (+st[k] || 0) !== 0);
          parts.push(e.npcs.length + ':' + (v.agents ? v.agents.length : -1) + ':' + (+v.food || 0).toFixed(4) + ':' + ks.map((k) => k + '=' + (+st[k]).toFixed(6)).join(','));
        }
        return parts.join('|');
      };
      const t0 = performance.now();
      for (let d = 0; d < days; d++) { lifeDayAll(true); mix(snap()); }
      out.ms = Math.round(performance.now() - t0);
      out.fp = (h >>> 0).toString(16).padStart(8, '0');
      out.cnt = cnt;
      out.v1 = VILS.length;
      out.alive = VILS.filter((v) => v.econ && v.econ.npcs.length > 0).length;
      out.pop = VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0);
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
    return out;
  }, { days: DAYS, seed, nvil: NVIL, WINTER, PEREN });
  r.pageErrors = errs.length; r.pageErr0 = errs[0] || null;
  await page.close();
  return r;
}

// ⓑ 랩 쪽 미시 판 — 그 페이지의 실제 함수로 한 칸을 심고 날마다 [하루 작물 진화 → 일감 한 가지]
async function microLab(browser, file, plan) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(7));
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 600000 });
  await page.waitForTimeout(300);
  const r = await page.evaluate(({ plan }) => {
    const out = { err: null, rows: {} };
    try {
      document.getElementById('seed').value = '7'; reseed(); lifeInit();   // 전역(V·CROPS·life) 세움 — 미시 판은 가짜 마을 하나로 돈다
      // 하루 작물 진화 줄 — 이 랩 스크립트 글자 그대로(`let sp=0;for(const[k,e]of s.crop){` … `s.spoiled=sp;`)
      let src = null;
      for (const sc of document.scripts) { const t = sc.textContent || ''; const i = t.indexOf('let sp=0;for(const[k,e]of s.crop){'); if (i >= 0) { const j = t.indexOf('s.spoiled=sp;', i); if (j > i) src = t.slice(i, j); break; } }
      if (!src) throw new Error('하루 작물 진화 줄을 못 떴다');
      const tick = new Function('s', 'day', src + '\nreturn sp;');
      out.tickLen = src.length;
      const saveLife = life, saveRand = Math.random;
      Math.random = () => 1;   // 병충해 끔(랩 난수) — 서버도 끈다
      for (const p of plan) {
        const crop = CROPS.find((c) => c.id === p.lid);
        const fake = { crop: new Map(), food: 0, agents: [] }; life = fake;
        const c = { cx: 4000, cy: 4000 }, k = ckey(c);
        const P0 = p.e + L_START;
        fake.crop.set(k, { crop, planted: P0, tended: P0, watered: P0, weeds: 0, pest: 0, q: 1, cx: c.cx, cy: c.cy, g: cropGrowAt(crop, P0) });
        const a = { plot: { field: crop.field, cx: c.cx, cy: c.cy }, skill: 0, fert: 1, action: '' };
        const rows = [];
        for (let day = P0 + 1; day < P0 + 800; day++) {
          tick(fake, day);
          const e = fake.crop.get(k); if (!e) { rows.push([day - L_START, -1, +(-1)]); break; }
          const t = cellTask(a.plot, c, day);
          if (t === 1 || t === 3 || t === 4 || t === 5) doTask(a, c, day);
          const e2 = fake.crop.get(k);
          rows.push([day - L_START, t, e2 ? +e2.q.toFixed(9) : -1]);
          if (!e2) break;
        }
        out.rows[p.lid + '@' + p.e] = rows;
      }
      Math.random = saveRand; life = saveLife;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
    return out;
  }, { plan });
  r.pageErrors = errs.length; r.pageErr0 = errs[0] || null;
  await page.close();
  return r;
}
// ⓑ 서버 쪽 미시 판 — 정본 상태기 그대로
function microServer(p) {
  const sid = p.sid, nong = p.field === '논';
  const e = { c: sid, p: p.e, td: p.e, w: p.e, wd: 0, ps: 0, q: 1 };
  const rows = [];
  for (let day = p.e + 1; day < p.e + 800; day++) {
    SV.cropDayTick(e, nong, day, '4000,4000'); e.ps = 0;   // 병충해 끔(서버 자리 해시) — 랩도 끈다
    const t = SV.cropTaskOf(e, nong, day);
    let gone = false;
    if (t === 1 || t === 3 || t === 4) SV.cropDoTask(e, nong, day);
    else if (t === 5) { SV.cropDoTask(e, nong, day); gone = !SV.cropAfterHarvest(e, day); }
    rows.push([day, t, gone ? -1 : +e.q.toFixed(9)]);
    if (gone) break;
  }
  return rows;
}
// 랩 파종창(가을 달)의 날마다 — 랩 표 `plantMo`(0 기점 달) · econ 1년
function microPlan(labCrops) {
  const plan = [];
  for (const lid of WINTER) {
    const cr = labCrops.find((c) => c.id === lid); if (!cr) continue;
    const sid = Crops.IDS.find((id) => { const ko = String(Crops.koOf(id) || ''), inner = (/\(([^)]*)\)/.exec(ko) || [])[1]; return [ko, ko.replace(/\(.*\)/, ''), inner].filter(Boolean).includes(lid); });   // 생성기 labIdFor 와 같은 고름
    for (const m0 of cr.plantMo) {
      const m = m0 + 1; const y = m >= 3 ? 1 : 2;
      for (let d = Cal.dayOf(y, m, 1); d < Cal.dayOf(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1); d++) plan.push({ lid, sid, field: cr.field, e: d });
    }
  }
  return plan;
}
function compare(lab, srv) {
  const S = {}; let n = 0, same = 0; const ex = [];
  const L = new Map(lab.map((r) => [r[0], r])), last = Math.max(lab[lab.length - 1][0], srv[srv.length - 1][0]);
  const SR = new Map(srv.map((r) => [r[0], r]));
  for (let d = Math.min(lab[0][0], srv[0][0]); d <= last; d++) {
    const a = L.get(d), b = SR.get(d); if (!a && !b) continue;
    const sn = Cal.seasonOf(d), k = sn;
    S[k] = S[k] || { n: 0, same: 0 };
    n++; S[k].n++;
    const eq = !!a && !!b && a[1] === b[1] && Math.abs(a[2] - b[2]) < 1e-9;
    if (eq) { same++; S[k].same++; } else if (ex.length < 2) ex.push(`${Cal.dateOf(d).month}/${Cal.dateOf(d).dom} 랩 ${a ? a[1] + '·' + a[2] : '—'} 서버 ${b ? b[1] + '·' + b[2] : '—'}`);
  }
  return { n, same, S, ex };
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=4096'] });
  const all = { days: DAYS, seeds: SEEDS, nvil: NVIL, ref: REF, world: {}, micro: {} };
  const which = LABK === 'both' ? ['war', 'village'] : [LABK];
  for (const lk of which) {
    const FILE = LABS[lk], cp = labCopies(FILE);
    // ⓑ 서버 대조(같은 날 같은 밭)
    const labCrops = JSON.parse(execFileSync(process.execPath, ['-e', `const H=require('fs').readFileSync(${JSON.stringify(cp.headRaw)},'utf8');const i=H.indexOf('const CROPS=['),j=H.indexOf('];',i);process.stdout.write(JSON.stringify(Function('return '+H.slice(i+12,j+1))()))`]).toString());
    const plan = microPlan(labCrops);
    const srvRows = {}; for (const p of plan) srvRows[p.lid + '@' + p.e] = microServer(p);
    const mic = {};
    for (const arm of (argv.includes('--preview') ? ['base', 'head', 'prev'] : ['base', 'head'])) {
      const r = await microLab(browser, cp[arm], plan.map((p) => ({ lid: p.lid, e: p.e })));
      if (r.err || r.pageErrors) { console.log(`[${lk} ⓑ ${arm}] 오류 ${r.err || r.pageErr0}`); continue; }
      const agg = {};
      for (const p of plan) {
        const key = p.lid + '@' + p.e, c = compare(r.rows[key], srvRows[key]);
        const A = agg[p.lid] = agg[p.lid] || { plant: 0, n: 0, same: 0, S: {}, ex: [] };
        A.plant++; A.n += c.n; A.same += c.same; for (const [sn, v] of Object.entries(c.S)) { A.S[sn] = A.S[sn] || { n: 0, same: 0 }; A.S[sn].n += v.n; A.S[sn].same += v.same; }
        if (A.ex.length < 2 && c.ex.length) A.ex.push(`${Cal.dateOf(p.e).month}/${Cal.dateOf(p.e).dom} 심음: ${c.ex[0]}`);
      }
      mic[arm] = agg;
      for (const lid of Object.keys(agg)) {
        const A = agg[lid], f = (sn) => (A.S[sn] ? `${A.S[sn].same}/${A.S[sn].n}` : '—');
        console.log(`[${lk} ⓑ ${arm === 'base' ? '이식 전' : (arm === 'head' ? '이식 뒤' : '미리보기(+돌봄 비율)')}] ${lid} 심음 ${A.plant} · 같은 날 같음 ${A.same}/${A.n} — 가을 ${f('autumn')} · 겨울 ${f('winter')} · 봄 ${f('spring')} · 여름 ${f('summer')}${A.ex.length ? ' · 예) ' + A.ex.join(' / ') : ''}`);
      }
    }
    all.micro[lk] = mic;
    if (argv.includes('--micro-only')) continue;
    // ⓐ 랩 세계 판
    const rows = [];
    for (const seed of SEEDS) {
      const A = await runWorld(browser, cp.base, '', seed), B = await runWorld(browser, cp.head, '', seed);
      const Cq = await runWorld(browser, cp.base, 'cropcal=0', seed), D = await runWorld(browser, cp.head, 'cropcal=0', seed);
      const PV = argv.includes('--preview') ? await runWorld(browser, cp.prev, '', seed) : null;
      rows.push({ seed, base: A, head: B, baseOff: Cq, headOff: D, prev: PV });
      const g = (x, k) => (x.cnt && x.cnt[k]) || 0;
      const care = (x, grp, sn) => g(x, `${grp}:${sn}:weed`) + g(x, `${grp}:${sn}:water`) + g(x, `${grp}:${sn}:pest`);
      const s = (x) => `${x.fp} · 인구 ${x.pop} · 생존 ${x.alive}/${x.v1} · ${(x.ms / 1000).toFixed(0)}s${x.err ? ' · ERR ' + x.err.slice(0, 160) : ''}${x.pageErrors ? ' · 페이지오류 ' + x.pageErrors + ' ' + x.pageErr0 : ''}`;
      const line = (x) => `월동 겨울 김매기 ${g(x, 'W:winter:weed')} · 물대기 ${g(x, 'W:winter:water')} · 방제 ${g(x, 'W:winter:pest')} · 감점 ${g(x, 'W:winter:pen')}(−${(+g(x, 'W:winter:penQ')).toFixed(2)}) | 가을 일감 ${care(x, 'W', 'autumn')} · 감점 ${g(x, 'W:autumn:pen')} | 봄 일감 ${care(x, 'W', 'spring')} · 감점 ${g(x, 'W:spring:pen')} | 다년생 겨울 일감 ${care(x, 'P', 'winter')} · 감점 ${g(x, 'P:winter:pen')}`;
      console.log(`[${lk} 시드 ${seed} · ${DAYS}일]`);
      console.log(`  이식 전(${REF}) 켬  ${s(A)}\n      ${line(A)}`);
      console.log(`  이식 뒤      켬  ${s(B)} · 문 ${B.port ? '있음' : '없음'}\n      ${line(B)}`);
      console.log(`  이식 전 ?cropcal=0  ${s(Cq)}\n      ${line(Cq)}`);
      console.log(`  이식 뒤 ?cropcal=0  ${s(D)}\n      ${line(D)}`);
      if (PV) console.log(`  미리보기(+돌봄 비율) 켬  ${s(PV)}\n      ${line(PV)}`);
      console.log(`  ⇒ 끔 판 같음(이식 전 = 뒤) ${Cq.fp === D.fp ? '○' : '✗'} · 켬 판 이식 전 ↔ 뒤 ${A.fp === B.fp ? '같음' : '갈림'}`);
    }
    all.world[lk] = rows;
    // 계측 무해 — 읽기 줄을 끼운 사본 = 끼우지 않은 지금 랩(첫 시드 · 켬)
    const raw = await runWorld(browser, cp.headRaw, '', SEEDS[0]);
    console.log(`  [${lk}] 계측 무해: 읽기 줄 끼운 사본 ${rows[0].head.fp} = 맨 랩 ${raw.fp} ${rows[0].head.fp === raw.fp ? '○' : '✗'}`);
    all.world[lk + ':raw'] = raw;
  }
  await browser.close();
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
