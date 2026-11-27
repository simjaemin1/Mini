#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3   ← [T1497] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1497-lab-map.js — 브라우저 랩이 판 자와 같은 한반도 땅을 읽는다(T1497 ② · ★재민 판정 81) ==========
//
//   ① 랩 3사본이 같은 표 — 번들(`sim/economy-engine.browser.js` — 두 랩 HTML 이 인라인으로 싣는 그것)의 `LabLand` = `sim/lab-land-hanbando.json` ·
//      `HanbandoPack` = `sim/lab-hanbando-pack.json` · 두 HTML 의 엔진 블록 = 번들(글자 그대로) · 두 HTML 이 `?map=hanbando` 한 줄을 쥔다
//   ② 표 = 지금 지도 — 표 지문 = 굽기 `mapSig`(지도 원천 · 개울 래스터 · 서버 고르기 글자 · `T1497_FERT_PICK` 끔)
//   ③ 끔 = 랩 기준선 — 한반도 판 60날(시드 1020): 번들 길(브라우저) = node 길(`sim/lab-hanbando.js`) = 구운 표를 뺀 번들 길(끔은 표를 안 읽는다) — 날마다 인구 · 땅 한 글자도
//   미끼 셋(이 파일 안 — 아이가 번들 글자를 싣는 순간 한 자리를 바꾼다 · 미끼 아이가 끝까지 돌아 값을 낸 때만 빨강으로 센다):
//     `labcopy` 번들 표의 한 마을 끝 칸을 바꾼 사본 → ① 빨강 · `stale` 지도 원천에 한 글자 더한 나무의 지문 → ② 빨강 ·
//     `oneman` 끔인데 한 마을에 한 사람 더 세우는 번들(랩 기준선이 한 사람 다른 사본) → ③ 빨강
// 실행: node scripts/test-t1497-lab-map.js   (아이 여섯 · 약 60초)
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'sim', 'economy-engine.browser.js');
const TAB = path.join(ROOT, 'sim', 'lab-land-hanbando.json');
const PACK = path.join(ROOT, 'sim', 'lab-hanbando-pack.json');
const DAYS = 60;
const BAITS = {
  // 번들 표 안 첫 마을의 끝 칸 수를 하나 늘린다
  labcopy: (src) => src.replace(/(modules\["labLand"\]=\{[\s\S]*?"end":)(\d+)/, (m, a, n) => a + (+n + 1)),
  // 번들의 한반도 판이 첫 마을에 한 사람을 더 세운다(끔 기준선이 한 사람 다르다)
  oneman: (src) => src.replace("{ initialPop: pack.initialPop, name: s.name }", "{ initialPop: pack.initialPop + (s === pack.villages[0] ? 1 : 0), name: s.name }"),
};

// 번들을 브라우저처럼 싣는다(빈 env · window 없음) — 미끼는 글자를 바꿔 싣는다
function loadBundle(bait, opts) {
  let src = fs.readFileSync(BUNDLE, 'utf8');
  if (bait) { const s2 = BAITS[bait](src); if (s2 === src) return { err: '미끼 자리 없음 ' + bait }; src = s2; }
  if (opts && opts.noTable) src = src.replace(/modules\["labLand"\]=\{[\s\S]*?\};\n/, 'modules["labLand"]=null;\n');
  const ctx = { console: { log() {}, warn() {}, error() {} }, process: { env: {} }, Math, Date, JSON, Object, Array, Set, Map, WeakSet, WeakMap, Number, String, Boolean, Symbol, Error, TypeError, RangeError, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, Float32Array, Float64Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Uint8ClampedArray, ArrayBuffer, DataView, Promise, RegExp, Proxy, Reflect, BigInt, atob, btoa, URLSearchParams, setTimeout, clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'economy-engine.browser.js' });
  return ctx.EconEngine;
}
function runWorld(H, pack) {
  const w = H.build(pack, { seed: 1020 }); const rows = [];
  for (let d = 0; d < DAYS; d++) { H.tick(w); rows.push(w.villages.map((v) => [v.npcs.length, +(+v.land.size).toFixed(4)])); }
  return rows;
}

// ── 아이 ──
if (process.argv[2] === '--table') {
  const E = loadBundle(process.env.T1497_BAIT || '');
  if (E.err) { process.stdout.write('\n' + JSON.stringify(E)); process.exit(0); }
  const tab = JSON.parse(fs.readFileSync(TAB, 'utf8')), pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  const strip = (o) => JSON.parse(JSON.stringify(o));   // `_byName`(셈 칸 · 안 세는 칸)은 열거 안 돼 빠진다
  const html = ['전쟁실험실.html', '마을실험실.html'].map((f) => fs.readFileSync(path.join(ROOT, 'lab', f), 'utf8'));
  const B = fs.readFileSync(BUNDLE, 'utf8').replace(/<\/script>/g, '<\\/script>');
  process.stdout.write('\n' + JSON.stringify({ tab: JSON.stringify(strip(E.LabLand)) === JSON.stringify(tab), pack: JSON.stringify(strip(E.HanbandoPack)) === JSON.stringify(pack),
    inline: html.map((h) => h.includes(B)), hook: html.map((h) => /EconEngine\.LabHanbando\.panel\(document/.test(h)), n: tab.villages.length }));
  process.exit(0);
}
if (process.argv[2] === '--sig') {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1497-s-${process.pid}.db`);
  delete process.env.T1497_FERT_PICK;
  const B = require(path.join(ROOT, 'scripts', 't1468-land-bake.js'));
  const { streamSig } = B.terrain();
  let root = ROOT;
  if (process.env.T1497_BAIT === 'stale') {
    root = require('./lib-tmp').dir('t1497_stale');
    for (const f of B.MAP_FILES.concat(['server/villages.js'])) { const src = path.join(ROOT, f), dst = path.join(root, f); if (!fs.existsSync(src)) continue; fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    fs.appendFileSync(path.join(root, 'server/hanbando-terrain.json'), '\n');
  }
  process.stdout.write('\n' + JSON.stringify({ sig: B.mapSig(streamSig, root) }));
  process.exit(0);
}
if (process.argv[2] === '--off') {
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  const mode = process.env.T1497_MODE || 'bundle';
  let H;
  if (mode === 'node') H = require(path.join(ROOT, 'sim', 'lab-hanbando.js'));
  else { const E = loadBundle(process.env.T1497_BAIT || '', { noTable: mode === 'notable' }); if (E.err) { process.stdout.write('\n' + JSON.stringify(E)); process.exit(0); } H = E.LabHanbando; }
  const _l = console.log; console.log = () => {};
  const rows = runWorld(H, pack);
  console.log = _l;
  process.stdout.write('\n' + JSON.stringify({ rows, N: rows[rows.length - 1].reduce((a, r) => a + r[0], 0) }));
  process.exit(0);
}

// ── 부모 ──
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const kid = (mode, env) => {
  const r = spawnSync(process.execPath, [__filename, mode], { cwd: ROOT, env: Object.assign({}, process.env, { T1468_LAB_LAND: '', T1457_NO_K_DEATH: '', T1497_BAIT: '', T1497_MODE: '' }, env), encoding: 'utf8', maxBuffer: 256 << 20 });
  const lines = String(r.stdout || '').trim().split('\n');
  try { return JSON.parse(lines[lines.length - 1]); } catch (e) { return { err: 'json — ' + String(r.stderr || '').slice(-300) }; }
};
const q1 = (o) => !!(o && !o.err && o.tab && o.pack && o.inline.every(Boolean) && o.hook.every(Boolean));
const tab = JSON.parse(fs.readFileSync(TAB, 'utf8'));
const q2 = (o) => !!(o && /^[0-9a-f]{16}$/.test(String(o.sig)) && o.sig === tab.sig);
const same = (a, b) => !!(a && b && !a.err && !b.err && JSON.stringify(a.rows) === JSON.stringify(b.rows));

const t0 = Date.now();
console.log('[T1497] 브라우저 랩 = 판 자의 한반도 땅');
const T = kid('--table', {});
ok(q1(T), '① 랩 3사본이 같은 표 — 번들 표 = sim 표 · 번들 짐 = sim 짐 · 두 HTML 엔진 블록 = 번들 · 두 HTML 이 ?map=hanbando 를 쥔다', T && (T.err || JSON.stringify(T)));
const S = kid('--sig', {});
ok(q2(S), '② 구운 표 = 지금 지도(표 지문 = 굽기 mapSig · T1497_FERT_PICK 끔)', `${tab.sig} · ${S && (S.sig || S.err)}`);
const B = kid('--off', { T1497_MODE: 'bundle' }), N = kid('--off', { T1497_MODE: 'node' }), X = kid('--off', { T1497_MODE: 'notable' });
ok(same(B, N), `③ 끔 — 번들 길(브라우저) = node 길 · ${DAYS}날 51마을 날마다 인구 · 땅`, B && (B.err || `인구 ${B.N} · ${N && N.N}`));
ok(same(B, X), '③ 끔 — 구운 표를 뺀 번들과 같다(끔은 표를 안 읽는다)', X && (X.err || `인구 ${X.N}`));

console.log('  — 미끼(이 파일 안)');
// @bait labcopy
const bL = kid('--table', { T1497_BAIT: 'labcopy' });
ok(!!(bL && !bL.err && bL.n) && !q1(bL), '[미끼 labcopy] 바꾼 자리 1곳(번들 표의 한 마을 끝 칸 +1) → ① 빨강', bL && (bL.err || `표 같음 ${bL.tab}`));
// @bait stale
const bS = kid('--sig', { T1497_BAIT: 'stale' });
ok(/^[0-9a-f]{16}$/.test(String(bS && bS.sig)) && !q2(bS), '[미끼 stale] 바꾼 자리 1곳(지도 원천에 한 글자 — 옛 표) → ② 빨강', bS && (bS.sig || bS.err));
// @bait oneman
const bO = kid('--off', { T1497_MODE: 'bundle', T1497_BAIT: 'oneman' });
ok(!!(bO && !bO.err && bO.rows) && !same(bO, B), '[미끼 oneman] 바꾼 자리 1곳(끔인데 첫 마을에 한 사람 더 — 랩 기준선이 한 사람 다른 번들) → ③ 빨강', bO && (bO.err || `인구 ${bO.N}`));

console.log(`\n[T1497] ${pass}/${fail} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
process.exit(fail ? 1 : 0);
