#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1471-map-gate.js — 지도를 고친 가지가 **이미 선 세계의 마을 땅** 위에 산을 새로 세우면 빨강 [T1471 덧붙임 셋 2026-11-27 · S5] ==========
//
// ★사건: T1296(11-13)이 닛폰 원 고개를 골짜기로 바꿔 라이브 사키농촌 영토 1,131칸 · 집 한 채 부지 · 주민 다섯이 산 속에 남았다(보고/T1471).
//   새 세계 판은 이걸 못 본다(새 지도 위에 처음부터 선다). 재민 판정 84: 지도를 고칠 때마다 옮김이 선다 — 이 문은 "지도만 고치고 그 손질 없이" 올리는 가지를 막는다.
// ★재는 것(서버 0 · 몇 초):
//   ① 픽스처 — 라이브 사본에서 구운 마을 땅 칸(`계측/T1471_마을땅/<존>_<날>.json.gz` · `scripts/t1471-land-snap.js`)이 있고 칸이 있다.
//   ② 이 가지의 지도(작업 나무) ↔ 갈라진 main 판(`git merge-base HEAD origin/main` · env `T1471_GATE_BASE` 로 바꿈)의 지도 — 존마다 마을 땅 칸 가운데
//      **새로 산이 된 칸 = 0**. 지도 파일이 안 바뀌었으면 셈 없이 통과(바뀐 파일 줄로 보인다).
//      0 이 아니면 — 옮김 손잡이(`T1471_LAND_FIT`)가 켬 기본일 때만 통과(그 가지가 배포되면 첫 부팅이 옮긴다) · 끔 기본이면 빨강.
//   ③ 미끼(자명 통과 금지) — T1296 커밋 하나(`d15ce6868~1` → `d15ce6868`)를 닛폰 11-12 픽스처에 대면 새로 산 = 영토 · 건물 칸 1,000 넘게(라이브에서 잰 1,131 · 102 의 그 판).
//   ④ 미끼 — 같은 지도 두 판(`d15ce6868` ↔ `d15ce6868`)이면 0(자가 아무 판이나 무는 게 아니다).
//   ⚠물(해안 · 강) 고침은 못 잰다 — 물 술어는 존이 떠야 선다(`scripts/t1471-live-fit.js` 로 사본을 띄워 [T1471] 줄을 본다).
//
// 실행: node scripts/test-t1471-map-gate.js     env: T1471_GATE_BASE(견줄 판 · 기본 merge-base)
'use strict';
const path = require('path'), fs = require('fs'), zlib = require('zlib'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const WD = fs.mkdtempSync(path.join(os.tmpdir(), 't1471gate-'));
//   지형이 기대는 파일(산 술어 `terrain.isRockCellLocal` 이 싣는 것 — 레포 안 · 바뀌면 다시 잰다)
const MAP_FILES = ['server/terrain.js', 'server/terrain-segindex.js', 'server/terrain-gen.js', 'server/hanbando-terrain.json', 'server/region-profiles.js', 'server/zone-config.js', 'server/chunk.js'];
function loadSnap(f) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
  const b = Buffer.from(d.cells, 'base64'), out = new Array(d.n); let i = 0, p = 0, n = 0;
  while (p < b.length) { let v = 0, s = 1, c; do { c = b[p++]; v += (c & 0x7f) * s; s *= 128; } while (c & 0x80); n += v; out[i++] = n; }
  return Object.assign(d, { list: out.slice(0, i) });
}
function terrainAt(rev, tag) {
  if (!rev) return require(path.join(ROOT, 'server', 'terrain.js'));
  const d = path.join(WD, tag); fs.mkdirSync(d);
  execFileSync('bash', ['-c', `git -C "${ROOT}" archive "${rev}" server | tar -x -C "${d}"`]);
  return require(path.join(d, 'server', 'terrain.js'));
}
function newRock(snap, TO, TN) {
  let n = 0; const ex = [];
  for (const c of snap.list) {
    const x = c % snap.W, y = Math.floor(c / snap.W), px = x * 32 + 16, py = y * 32 + 16;
    let a = false, b = false; try { b = !!TN.isRockCellLocal(snap.zone, px, py); } catch (e) {}
    if (!b) continue;
    try { a = !!TO.isRockCellLocal(snap.zone, px, py); } catch (e) {}
    if (!a) { n++; if (ex.length < 5) ex.push(`${x},${y}`); }
  }
  return { n, ex };
}
(() => {
  console.log('[T1471 지도 고침 문] 이미 선 세계의 마을 땅 위에 산을 새로 세우는가');
  const SD = path.join(ROOT, '계측', 'T1471_마을땅');
  const files = fs.existsSync(SD) ? fs.readdirSync(SD).filter((f) => f.endsWith('.json.gz')).sort() : [];
  const snaps = files.map((f) => Object.assign(loadSnap(path.join(SD, f)), { file: f }));
  ok(snaps.length >= 2 && snaps.every((s) => s.list.length > 1000), '① 픽스처 — 존마다 마을 땅 칸(라이브 사본에서 구움)', snaps.map((s) => `${s.file} ${s.list.length}`).join(' · '));
  let base = process.env.T1471_GATE_BASE || '';
  if (!base) { try { base = git('merge-base', 'HEAD', 'origin/main'); } catch (e) { base = ''; } }
  let changed = [];
  if (base) { try { changed = git('diff', '--name-only', base, '--', ...MAP_FILES).split('\n').filter(Boolean); } catch (e) { changed = MAP_FILES; } }
  const TN = terrainAt('', 'head');
  if (!base) ok(false, '② 견줄 판(merge-base) — git 판이 없다', '');
  else if (!changed.length) ok(true, '② 지도 파일이 갈라진 main 판과 같다 — 새로 묻힐 칸 0(셈 없음)', base.slice(0, 9));
  else {
    const TO = terrainAt(base, 'base');
    const res = snaps.map((s) => Object.assign({ zone: s.zone, file: s.file }, newRock(s, TO, TN)));
    const tot = res.reduce((p, r) => p + r.n, 0);
    const fitOn = /const T1471_LAND_FIT = process\.env\.T1471_LAND_FIT !== '0'/.test(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    ok(tot === 0 || fitOn, `② 바뀐 지도(${changed.join(' · ')}) — 마을 땅 칸 가운데 새로 산 ${tot}${tot ? (fitOn ? ' · 옮김 손잡이 켬 기본(첫 부팅이 옮긴다)' : ' · 옮김 손잡이가 끔 기본 — 빨강(배포하면 마을이 산 속에 남는다)') : ''}`,
      res.map((r) => `${r.zone} ${r.n}${r.ex.length ? ' 예 ' + r.ex.join(' ') : ''}`).join(' · '));
  }
  //   ③ ④ 미끼 — 닛폰 11-12 픽스처(T1296 앞 세계)
  const NP = snaps.find((s) => s.zone === 'nippon' && /20261112/.test(s.file));
  if (NP) {
    let A = null, B = null;
    try { A = terrainAt('d15ce6868~1', 't1296a'); B = terrainAt('d15ce6868', 't1296b'); } catch (e) {}
    const r1 = A && B ? newRock(NP, A, B) : { n: -1 }, r2 = B ? newRock(NP, B, B) : { n: -1 };
    ok(r1.n > 1000, `③ 미끼 — T1296 한 커밋(원 고개 → 골짜기)을 닛폰 11-12 픽스처에 대면 문다(바꾼 자리 = 그 커밋 · 새로 산 ${r1.n})`);
    ok(r2.n === 0, `④ 미끼 — 같은 지도 두 판이면 0(바꾼 자리 0 · 새로 산 ${r2.n})`);
  } else { ok(false, '③ 미끼 — 닛폰 11-12 픽스처가 없다'); ok(false, '④ 미끼 — 닛폰 11-12 픽스처가 없다'); }
  try { fs.rmSync(WD, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
