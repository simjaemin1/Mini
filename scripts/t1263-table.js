#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1263 표 · 읽기만)
// === scripts/t1263-table.js — 몸 전부 라이브 시계 한 해 판(밭 켬 · 끔) 10날 표 · 겨울 들머리 곳간 — t1263 · t1243 · t1230 관찰기 JSON(+ 판 JSON)을 읽어 줄로 ===
//   쓰는 법: node scripts/t1263-table.js <켬 판 머리> <끔 판 머리> [--json <표.json>]   (머리 = `<T577_DIR>/<판>-<시드>` · 뒤에 .t1263.json · .t1243.json · .t1230.json · .json)
//   칸(날 d = 그 날 econ 틱 머리 · 누계 칸은 그때까지 · 출생 · CPU 는 그 앞 10날):
//     인구 · 빈 마을 · 굶음 · 늙음(몸 층 `died` · econ `_fdDeadTot` · `_natDeadTot` 누계) = t1263 · 출생 = t1230 날 줄 합 ·
//     심은 칸 · 거둔 칸 = t1263 `_crop` 훑음(두 판 같은 자 · 켬은 `_t1243PStat.reaped` 곁) · 씨 남김 = `_t1243PStat.seedBack`(켬만 · 단위 · kg) ·
//     곳간 품목별 kcal = t1263 품목별 정본 식량 단위(T1246 `storageFoodPer` · 상한 뺌) × `DAY_KCAL` — 갈래(곡식 · 고기 · 생선 · 채집 · 그 밖)는 아래 `cat` ·
//     곳간 일치 = 정본 식량 단위 ÷ 사람(하루 1인 1.0) · 겨울 들머리 = 첫 12월 1일 줄(마을마다 단위 ÷ 사람 · 겨울 날 수 = 달력 정본 12/1 → 3/1) ·
//     하루 CPU = t1243 `cpu`(그 10날 가운데값)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const load = (h) => ({ t: rd(h + '.t1263.json'), a: rd(h + '.t1243.json'), b: rd(h + '.t1230.json'), run: rd(h + '.json') });
// ── 품목 갈래 — 정본 모듈의 품목 표를 읽는다(새 수 0) ──
const req = (m) => { try { return require(path.join(ROOT, 'server', m)); } catch (e) { return null; } };
const Cr = req('crops'), GM = req('game-meat'), FF = req('freshfish'), SF = req('seafish'), FG = req('fish-goods'), FP = req('fish-preserve'), TD = req('tidal');
const FORAGE = new Set(['berry', 'herb', 'fruit', 'vegetable', 'mushroom', 'chestnut', 'walnut', 'acorn', 'seaweed', 'grape', 'dried_fruit', 'pickled_veg', 'pine_nut', 'jujube', 'persimmon', 'hazelnut', 'wild_greens', 'root']);
const FISHX = new Set(['fish', 'dried_fish', 'salmon', 'shrimp', 'crab', 'oyster', 'clam', 'abalone', 'squid', 'octopus']);
const MEATX = new Set(['meat', 'meat_raw', 'smoked_meat', 'egg', 'milk']);
const has = (M, f, id) => { try { return !!(M && typeof M[f] === 'function' && M[f](id)); } catch (e) { return false; } };
const inMap = (M, f, id) => { try { const o = M && typeof M[f] === 'function' ? M[f]() : null; return !!(o && Object.prototype.hasOwnProperty.call(o, id)); } catch (e) { return false; } };
function cat(id) {
  if (FORAGE.has(id)) return 'forage';
  if (id === 'food' || id === 'wheat' || id === 'rice' || id === 'barley' || (Cr && Cr.get && Cr.get(id))) return 'grain';
  if (MEATX.has(id) || inMap(GM, 'foodMap', id) || (GM && GM.RAW && Object.prototype.hasOwnProperty.call(GM.RAW, id))) return 'meat';
  if (FISHX.has(id) || has(FF, 'isFish', id) || has(SF, 'isFish', id) || has(FG, 'isItem', id) || has(FP, 'isItem', id) || inMap(TD, 'foodMap', id)) return 'fish';
  return 'other';
}
const CATS = ['grain', 'meat', 'fish', 'forage', 'other'];
const CAT_KO = { grain: '곡식', meat: '고기', fish: '생선', forage: '채집', other: '그 밖' };
function catSum(by, dk) { const o = { grain: 0, meat: 0, fish: 0, forage: 0, other: 0 }, items = { other: [] }; for (const [id, [q, u]] of Object.entries(by || {})) { const c = cat(id); o[c] += u * dk; if (c === 'other') items.other.push(id); } return { o, items }; }
function winterOf(s) {
  if (!s) return null;
  const W = s.winterLen, vs = (s.vs || []).filter((x) => x[1] > 0);
  const days = vs.map((x) => x[2] / x[1]).sort((p, q) => p - q);
  const N = vs.reduce((p, x) => p + x[1], 0), U = vs.reduce((p, x) => p + x[2], 0), UE = vs.reduce((p, x) => p + x[3], 0);
  const capW = N ? vs.reduce((p, x) => p + Math.min(W, x[2] / x[1]) * x[1], 0) / N : null;
  return { day: s.day, date: `${s.date.year}년 ${s.date.month}월 ${s.date.dom}일`, W, vils: vs.length, pop: N, units: +U.toFixed(1), kcal: U * 2450,
    world: N ? U / N : null, worldEcon: N ? UE / N : null, capW, full: days.filter((d) => d >= W).length, half: days.filter((d) => d < W / 2).length, under30: days.filter((d) => d < 30).length,
    min: days.length ? days[0] : null, med: days.length ? days[days.length >> 1] : null, max: days.length ? days[days.length - 1] : null,
    perVil: vs.map((x) => [x[0], x[1], +(x[2] / x[1]).toFixed(1)]) };
}
function rows(L) {
  const { t, a, b } = L; if (!t) return [];
  const dk = t.dayKcal || 2450;
  const Bc = b ? b.cols : [], B = new Map((b ? b.rows : []).map((r) => [r[0], r])), ci = (k) => Bc.indexOf(k);
  const cpu = new Map(((a && a.cpu) || []).map((r) => [r[0], r]));
  const out = [];
  for (const s of t.snaps) {
    const d = s.day;
    let born = 0, bornT = 0;
    for (const [x, q] of B) { if (x < d) bornT += q[ci('born')]; if (x >= d - 10 && x < d) born += q[ci('born')]; }   // t1230 날 줄 x = 날 x 틱 · 날 d 머리 앞에 끝난 날들
    const cs = []; for (let x = d - 9; x <= d; x++) { const c = cpu.get(x); if (c && x > 1) cs.push(c[1]); }
    cs.sort((p, q) => p - q);
    const { o, items } = catSum(s.by, dk);
    out.push({ d, why: s.why, pop: s.pop, empty: s.empty, born, bornT, starve: s.bodyDied ? s.bodyDied.starve : null, old: s.bodyDied ? s.bodyDied.old : null, fd: s.fd, nat: s.nat, dead: s.dead, emig: s.emig,
      sown: s.sown, reap: s.reap, per: s.per, reaped: s.reaped, pick: s.pick, seedBack: s.seedBack, seedKg: s.seedKg, seedUse: s.seedUse, seedStore: s.seedStore,
      kcal: o, other: items.other, canonDays: s.pop ? s.canon / s.pop : null, econDays: s.pop ? s.econ / s.pop : null, winter: winterOf(s),
      cpuMed: cs.length ? cs[cs.length >> 1] : null, cpuAvg: cs.length ? cs.reduce((p, q) => p + q, 0) / cs.length : null });
  }
  return out;
}
const f1 = (x, n = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n }));
const f0 = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const M = (x) => (x == null ? '—' : (x / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
function cpuAll(L) { const c = (L.a && L.a.cpu) || []; const xs = c.filter((r) => r[0] > 1).map((r) => r[1]); return { boot: c.length ? c[0][1] : null, sum: xs.reduce((p, v) => p + v, 0), n: xs.length, avg: xs.length ? xs.reduce((p, v) => p + v, 0) / xs.length : null, last10: xs.slice(-10).sort((p, q) => p - q)[5] || null, lastDay: c.length ? c[c.length - 1][0] : null }; }
if (require.main === module) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), JOUT = ji >= 0 ? args[ji + 1] : process.env.T1263_TABLE_JSON;
  const [hOn, hOff] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
  const ON = load(hOn), OFF = load(hOff), R1 = rows(ON), R0 = rows(OFF);
  const byD = new Map(); for (const r of R1) if (r.why !== 'exit') byD.set(r.d, [r, null]); for (const r of R0) if (r.why !== 'exit') { const e = byD.get(r.d) || [null, null]; e[1] = r; byD.set(r.d, e); }
  const ds = [...byD.keys()].sort((p, q) => p - q);
  const two = (fn) => ds.map((d) => { const [x, y] = byD.get(d); return `${x ? fn(x) : '—'} : ${y ? fn(y) : '—'}`; });
  const cols = [
    ['인구', (r) => f0(r.pop)], ['빈 마을', (r) => f0(r.empty)], ['출생(10날)', (r) => f0(r.born)], ['출생(누계)', (r) => f0(r.bornT)],
    ['굶음(몸 누계 · econ 식량 빚)', (r) => `${f0(r.starve)} · ${f0(r.fd)}`], ['늙음(몸 누계 · econ 자연사)', (r) => `${f0(r.old)} · ${f0(r.nat)}`],
    ['심은 칸(누계)', (r) => f0(r.sown)], ['거둔 칸(누계 · 훑음)', (r) => f0(r.reap)], ['거둔 칸(켬 `_t1243PStat.reaped`)', (r) => f0(r.reaped)],
    ['씨 남김(단위 누계)', (r) => f1(r.seedBack, 0)], ['곳간 씨(단위)', (r) => f0(r.seedStore)],
    ...CATS.map((c) => [`곳간 ${CAT_KO[c]} 백만 kcal`, (r) => M(r.kcal[c])]),
    ['곳간 일치(정본 · econ)', (r) => `${f1(r.canonDays)} · ${f1(r.econDays)}`],
    ['겨울 날 수 덮는 마을(일치 ≥ 겨울 날 수)', (r) => (r.winter ? `${r.winter.full}/${r.winter.vils}` : '—')],
    ['하루 CPU 초(10날 가운데)', (r) => f1(r.cpuMed)],
  ];
  console.log(`| 칸(켬 : 끔) | ${ds.map((d) => '날 ' + d).join(' | ')} |`);
  console.log(`|---|${ds.map(() => '---:').join('|')}|`);
  for (const [ko, fn] of cols) console.log(`| ${ko} | ${two(fn).join(' | ')} |`);
  const wOn = R1.find((r) => r.why === 'winter'), wOff = R0.find((r) => r.why === 'winter');
  console.log('\n겨울 들머리(켬 : 끔):');
  for (const [k, ko] of [['date', '날짜'], ['W', '겨울 날 수'], ['pop', '사람'], ['units', '정본 식량 단위'], ['world', '세계 일치(단위 ÷ 사람)'], ['worldEcon', 'econ 합 일치'], ['capW', '사람 가중 덮은 날(마을마다 겨울 날 수 상한)'], ['full', '겨울 다 덮는 마을'], ['half', '겨울 반 못 덮는 마을'], ['under30', '30일치 못 되는 마을'], ['min', '마을 최소'], ['med', '마을 가운데'], ['max', '마을 최대']]) {
    const g = (w) => (w && w.winter ? (typeof w.winter[k] === 'number' ? f1(w.winter[k]) : w.winter[k]) : '—');
    console.log(`  ${ko}: ${g(wOn)} : ${g(wOff)}`);
  }
  if (wOn || wOff) console.log('  곳간 kcal 갈래(백만): ' + CATS.map((c) => `${CAT_KO[c]} ${wOn ? M(wOn.kcal[c]) : '—'} : ${wOff ? M(wOff.kcal[c]) : '—'}`).join(' · '));
  const oth = new Set([...R1, ...R0].flatMap((r) => r.other)); if (oth.size) console.log('  그 밖 갈래 품목: ' + [...oth].sort().join(', '));
  const sum = { on: { cpu: cpuAll(ON), last: R1[R1.length - 1] || null, run: ON.run ? { pop: ON.run.eight && ON.run.eight.pop, empty: ON.run.empty, days: ON.run.days } : null },
    off: { cpu: cpuAll(OFF), last: R0[R0.length - 1] || null, run: OFF.run ? { pop: OFF.run.eight && OFF.run.eight.pop, empty: OFF.run.empty, days: OFF.run.days } : null } };
  const brief = (x) => ({ cpu: x.cpu, run: x.run, last: x.last ? Object.assign({}, x.last, { winter: undefined, other: undefined }) : null });
  console.log('\n' + JSON.stringify({ on: brief(sum.on), off: brief(sum.off) }, null, 1));
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ on: R1, off: R0, sum }, null, 1));
}
module.exports = { cat, rows, load, winterOf };
