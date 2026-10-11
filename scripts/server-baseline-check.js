#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T691 서버 판 기준선 게이트 · 제품 무변 · 판정 0)
// === scripts/server-baseline-check.js — **서버 판 기준선**: T650 자 3시드 400일 지문을 정본으로 두고, 지금 트리로 같은 판을 돌려 바이트로 견준다 ===
//
// ★왜 [T691 · T680] T661 켬 위에서 T650 자(`t577-server-run.js` · `VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0` · 빠른 시계 250ms · 새 세계 · 손님 0)가
//   따로 띄운 쌍도 400일 바이트 같다(6/6 · 상자가 달라도). 그래서 서버 판도 랩 3시드(t17 여덟 수)처럼 기준선을 둘 수 있다.
//   이 파일은 "결과가 바뀌면 안 되는 변경"의 **서버 쪽 게이트**다(랩 3시드 `cmp` 와 짝). 자는 하나도 안 바꾼다 — 같은 판을 같은 env 로 띄운다.
//
// ★지문(읽기만 · 세계에 0) — 서버 장부 `scanDay`(econ 하루 끝 · t577 훅 · t634 · t650 · t663 과 같은 문)에서 날마다:
//   마을마다 네 칸 = st(곳간 전 칸 · 1e-6) · pp(인구 · econ 주민 [id · 나이 · 직업 · 허기 · hp]) · hs(주거 · 확장 · 해체 표) · tr(금고 전 칸)
//   → 칸마다 sha1 앞 4자리(어느 칸이 갈렸나 찾는 용도) · 그날 전체 = 네 칸 원문 전부의 sha1 앞 12자리(같음 판정은 이것으로)
//   + 판 끝 여덟 수 · 판 JSON(env · days 칸 뺌) sha1.
//
// 쓰는 법:
//   만들기: node scripts/server-baseline-check.js --make 계측/서버기준선_<날짜>.json [--days 400] [--seeds 1020,7,42] [--par 2]
//   견주기: node scripts/server-baseline-check.js 계측/서버기준선_<날짜>.json [--days 400|60] [--seeds …] [--par 2]
//           ⇒ 시드마다 ○/✗ · 다르면 첫 갈림 날 · 마을 · 칸(st/pp/hs/tr) · 지금 판의 그 칸 값. 짧은 판(--days N < 기준선 날)은 날 지문 앞 N 날만 견준다.
//   짧은 판(시드마다 날을 따로): --plan 1020:400,7:60,42:60 — 긴 판부터 띄우고 `--par` 개씩 같이 돈다(시드마다 t577 판 하나).
//   교역로 디스크 캐시(T699): 기본 켬(os 임시 폴더) · `--route-cache off` 로 끈다 · 첫 판이 적고 다음 판부터 물려받는다.
//   env 는 아이 판에 그대로 간다 — 손잡이를 켠 트리를 재려면 env 를 얹으면 된다(그 판은 갈려야 맞다).
//   종료 코드: 같음 0 · 다름 1 · 판 실패 2.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const H = (s, n) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n);

// ── 훅(아이 존 안 · `T577_OUT` 이 있을 때만) ────────────────────────────────────
if (process.env.SBC_HOOK === '1' && process.env.T577_OUT) {
  const ROOT = path.join(__dirname, '..');
  const OUT = process.env.T577_OUT + '.sbc.json';
  const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  const stor = (st) => { const o = {}; for (const k of Object.keys(st || {}).sort()) o[k] = R6(st[k]); return o; };
  const days = [];
  let last = -1;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const all = [], vh = [];
          for (const v of (world.villages || [])) {
            const parts = [
              JSON.stringify(stor(v.storage)),
              JSON.stringify([(v.npcs || []).length, (v.npcs || []).map((n) => (n && typeof n === 'object') ? [n.id != null ? n.id : n.pid, R6(n.age), n.currentJob || null, R6(n.hunger), R6(n.hp)] : n)]),
              JSON.stringify([R6(v.housing), v.expansions || 0, v._banditized ? 1 : 0]),
              JSON.stringify((v.treasury && typeof v.treasury === 'object') ? stor(v.treasury) : R6(v.treasury)),
            ];
            all.push(v.name, ...parts);
            vh.push(parts.map((p) => H(p, 4)).join(''));
          }
          days.push([d, world.day, H(all.join('\n'), 12), vh]);
          if (!globalThis.__sbcNames) globalThis.__sbcNames = (world.villages || []).map((v) => v.name);
          globalThis.__sbcLast = { d, world };
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => {
    try {
      // 마지막 날의 칸 원문(견줄 때 "지금 값"을 보여 주려고 — 갈린 날이 끝 날이 아닐 수도 있어 날마다 원문은 안 남긴다 · 아래 SBC_DUMP_DAY 참조)
      fs.writeFileSync(OUT, JSON.stringify({ names: globalThis.__sbcNames || [], days, dump: globalThis.__sbcDump || null }));
    } catch (e) {}
  });
  // 견줄 때 첫 갈림 날의 칸 원문을 남긴다(`SBC_DUMP_DAY=<날>` — 그날 scanDay 직전 상태)
  const DD = parseInt(process.env.SBC_DUMP_DAY || '', 10);
  if (DD > 0) {
    const mk2 = Ev.createLedger;
    Ev.createLedger = function () {
      const L = mk2.apply(this, arguments); const sd = L.scanDay;
      L.scanDay = function (world, day) {
        try { if ((day | 0) === DD && !globalThis.__sbcDump) globalThis.__sbcDump = (world.villages || []).map((v) => ({ name: v.name, st: stor(v.storage), pop: (v.npcs || []).length,
          jobs: (v.npcs || []).reduce((a, n) => { const j = n && n.currentJob; if (j) a[j] = (a[j] || 0) + 1; return a; }, {}), hs: [R6(v.housing), v.expansions || 0, v._banditized ? 1 : 0], tr: (v.treasury && typeof v.treasury === 'object') ? stor(v.treasury) : R6(v.treasury) })); } catch (e) {}
        return sd.apply(this, arguments);
      };
      return L;
    };
  }
  return;
}
if (require.main !== module) return;

// ── 바깥 ────────────────────────────────────────────────────────────────────────
const { spawn } = require('child_process');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const MAKE = opt('--make', null);
const BASE = MAKE ? null : A.find((x, i) => !x.startsWith('--') && !(A[i - 1] || '').startsWith('--'));
if (!MAKE && !BASE) { console.error('쓰는 법: --make <out.json> [--days 400] [--seeds 1020,7,42] [--par 2] · 또는 <기준선.json> [--days N] [--seeds …] [--par 2]'); process.exit(2); }
const base = BASE ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
const PLAN0 = opt('--plan', null);
const DAYS = parseInt(opt('--days', base ? String(base.days) : '400'), 10);
const SEEDS = PLAN0 ? PLAN0.split(',').map((x) => +x.split(':')[0]) : String(opt('--seeds', base ? base.seeds.join(',') : '1020,7,42')).split(',').map(Number).filter(Boolean);
const DAYS_OF = {}; for (const s of SEEDS) DAYS_OF[s] = DAYS;
if (PLAN0) for (const x of PLAN0.split(',')) { const [a, b] = x.split(':').map(Number); DAYS_OF[a] = b || DAYS; }
if (MAKE && PLAN0) { console.error('--make 는 --plan 없이(모든 시드 같은 날)'); process.exit(2); }
const PAR = parseInt(opt('--par', String(SEEDS.length)), 10);   // ★[T699] 기본 = 시드 수(한꺼번에) — 부하가 겹쳐도 바이트 같다(T680 · T699 동시 3 판 3/3) · 2코어에서 동시 3 이 동시 2 보다 빠르다(690 대 912초)
// ★판의 조건 = T650 자(T680 · T683 이 결정론을 본 그 판). 바꾸면 기준선이 다른 세계다.
const COND = { VILLAGE_CARAVAN_MAX: '0', T400_BUILD_ACT: '0' };
// ★[T699] 교역로 디스크 캐시 — 부팅 소굴 배치의 교역로 A*(109초)를 판마다 다시 파지 않는다(같은 지문 = 같은 길 · 결과 바이트 같음).
//   기본 = os 임시 폴더 `durango-route-cache`(레포 밖) · `--route-cache off` = 종전(판마다 판다) · `--route-cache <dir>` = 그 폴더.
const RC0 = opt('--route-cache', process.env.T699_ROUTE_CACHE || path.join(os.tmpdir(), 'durango-route-cache'));
const ROUTE_CACHE = RC0 === 'off' ? null : RC0;

function runOne(dir, seed, days, dumpDay) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, COND, { SBC_HOOK: '1', T577_DIR: dir, T577_TAG: 'sbc', T577_PAR: '1',
      NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ` --require ${__filename}`).trim() });
    if (ROUTE_CACHE) env.T699_ROUTE_CACHE = ROUTE_CACHE; else delete env.T699_ROUTE_CACHE;
    if (dumpDay) env.SBC_DUMP_DAY = String(dumpDay);   // 없으면 바깥 env 의 SBC_DUMP_DAY 를 그대로 넘긴다
    const t0 = Date.now();
    const ch = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(days), String(seed)], { cwd: ROOT, env, stdio: 'ignore' });
    ch.on('exit', (code) => resolve({ seed, code, sec: Math.round((Date.now() - t0) / 1000) }));
  });
}
async function runSet(dir, dumpDay) {
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const queue = SEEDS.slice().sort((a, b) => DAYS_OF[b] - DAYS_OF[a]);   // 긴 판부터
  const per = {};
  const worker = async () => { while (queue.length) { const s = queue.shift(); const r = await runOne(dir, s, DAYS_OF[s], dumpDay); per[s] = r; console.log(`  · 시드 ${s} ${DAYS_OF[s]}일 판 ${r.sec}초(종료 ${r.code})`); } };
  await Promise.all(Array.from({ length: Math.max(1, PAR) }, worker));
  const sec = Math.round((Date.now() - t0) / 1000);
  const out = {};
  for (const s of SEEDS) {
    const f = path.join(dir, `sbc-${s}.json`);
    let run = null, fp = null; try { run = JSON.parse(fs.readFileSync(f, 'utf8')); fp = JSON.parse(fs.readFileSync(f + '.sbc.json', 'utf8')); } catch (e) {}
    if (!run || !fp) { out[s] = null; continue; }
    const strip = Object.assign({}, run); delete strip.env; delete strip.days;
    out[s] = { eight: run.eight, dissolved: run.dissolved, empty: run.empty, runHash: H(JSON.stringify(strip), 16), names: fp.names, days: fp.days, dump: fp.dump };
  }
  return { sec, out, per };
}

(async () => {
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-'));
console.log(`\n=== 서버 판 기준선 ${MAKE ? '만들기' : '견주기'} — ${SEEDS.map((x) => `${x}:${DAYS_OF[x]}일`).join(' · ')} · 동시 ${PAR} · 교역로 캐시 ${ROUTE_CACHE || '끔'} · 판 ${tmp} ===`);
const R = await runSet(tmp);
console.log(`  판 모두 ${R.sec}초`);
if (MAKE) {
  const seeds = {};
  for (const s of SEEDS) { const o = R.out[s]; if (!o) { console.log(`  ✗ 시드 ${s} 판 실패`); process.exit(2); } seeds[s] = { eight: o.eight, dissolved: o.dissolved, empty: o.empty, runHash: o.runHash, names: o.names, days: o.days }; }
  let head = ''; try { head = require('child_process').execSync('git rev-parse --short=8 HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) {}
  const doc = { made: new Date().toISOString().slice(0, 10), head, days: DAYS, seeds: SEEDS, cond: COND, clock: 'VILLAGE_DAY_MS=250(t577 기본)', sec: R.sec,
    how: `node scripts/server-baseline-check.js --make ${MAKE} --days ${DAYS} --seeds ${SEEDS.join(',')}`,
    note: '날 지문 = [scanDay 날 · econ world.day · 그날 전체 sha1 12 · 마을마다 칸 넷(st·pp·hs·tr) sha1 4자리씩]', byseed: seeds };
  fs.writeFileSync(MAKE, JSON.stringify(doc));
  for (const s of SEEDS) { const e = seeds[s].eight; console.log(`  시드 ${s}: 인구 ${e.pop} · 소멸 ${e.dead}/${e.ever} · 무기Q ${e.weapQ} · 확장 ${e.expand} · 게시 ${e.board} · 도구Q ${e.toolQ} · 보존 ${e.preserve} · 곡물 ${e.grain} · 해체 ${seeds[s].dissolved} · 빈 ${seeds[s].empty} · 날 ${seeds[s].days.length}`); }
  console.log(`\n→ ${MAKE} (${fs.statSync(MAKE).size.toLocaleString()} B)`);
  process.exit(0);
}

// 견주기
const PARTS = ['st(곳간)', 'pp(인구·주민)', 'hs(주거·확장·해체)', 'tr(금고)'];
let bad = 0, firstBad = null;
const res = {};
for (const s of SEEDS) {
  const b = base.byseed[s], o = R.out[s];
  if (!b) { console.log(`  ? 시드 ${s}: 기준선에 없음`); continue; }
  if (!o) { console.log(`  ✗ 시드 ${s}: 판 실패`); bad++; continue; }
  const DS = DAYS_OF[s];
  const n = Math.min(o.days.length, b.days.length, DS);
  let fd = null;
  for (let i = 0; i < n; i++) if (o.days[i][2] !== b.days[i][2]) { fd = i; break; }
  const full = DS >= base.days;
  const endSame = full ? (o.runHash === b.runHash && JSON.stringify(o.eight) === JSON.stringify(b.eight)) : null;
  if (fd == null && o.days.length < Math.min(DS, b.days.length)) fd = o.days.length;   // 판이 짧게 끝났다
  if (fd == null && endSame !== false) { console.log(`  ○ 시드 ${s}: 날 지문 ${n}일 같음${full ? ` · 판 JSON · 여덟 수 같음(인구 ${o.eight.pop})` : ' (짧은 판 — 앞 날만)'}`); res[s] = { same: true, days: n }; continue; }
  bad++;
  if (fd == null) { console.log(`  ✗ 시드 ${s}: 날 지문 ${n}일은 같은데 판 끝이 다르다(판 JSON ${o.runHash} / ${b.runHash} · 인구 ${o.eight.pop} / ${b.eight.pop})`); res[s] = { same: false, end: true }; continue; }
  const od = o.days[fd], bd = b.days[fd];
  const diffs = [];
  for (let v = 0; v < Math.max(od[3].length, bd[3].length); v++) {
    const x = od[3][v] || '', y = bd[3][v] || '';
    if (x === y) continue;
    const parts = []; for (let p = 0; p < 4; p++) if (x.slice(p * 4, p * 4 + 4) !== y.slice(p * 4, p * 4 + 4)) parts.push(PARTS[p]);
    diffs.push(`${(o.names[v] || b.names[v] || '#' + v)}[${parts.join('·')}]`);
  }
  console.log(`  ✗ 시드 ${s}: 첫 갈림 = 날 ${od[0]}(econ ${od[1]} · 기준선 econ ${bd[1]}) · 마을 ${diffs.length} — ${diffs.slice(0, 6).join(' · ')}${diffs.length > 6 ? ' …' : ''}`);
  if (o.dump && o.dump.length) {   // SBC_DUMP_DAY 판 — 갈린 마을의 그날 칸 값(지금 트리)
    for (const nm of diffs.slice(0, 3).map((x) => x.split('[')[0])) { const r = o.dump.find((q) => q.name === nm); if (r) console.log(`      지금 ${nm}: 인구 ${r.pop} · 직업 ${JSON.stringify(r.jobs)} · 주거·확장·해체 ${JSON.stringify(r.hs)} · 곳간 통나무 ${r.st.wood} · 식량 ${r.st.food}`); }
  }
  res[s] = { same: false, day: od[0], diffs };
  if (!firstBad || od[0] < firstBad.day) firstBad = { seed: s, day: od[0] };
}
if (firstBad && !process.env.SBC_DUMP_DAY) console.log(`\n  (그날 칸 값을 보려면: SBC_DUMP_DAY=${firstBad.day} 로 시드 ${firstBad.seed} 한 판 — 판 JSON 옆 .sbc.json 의 dump)`);
console.log(`\n=== ${bad ? `다름 ${bad}/${SEEDS.length}` : `같음 ${SEEDS.length}/${SEEDS.length}`} · 판 ${R.sec}초 ===`);
fs.writeFileSync(path.join(tmp, 'check.json'), JSON.stringify({ base: BASE, plan: DAYS_OF, seeds: SEEDS, sec: R.sec, per: R.per, res }, null, 1));
process.exit(bad ? 1 : 0);
})();
