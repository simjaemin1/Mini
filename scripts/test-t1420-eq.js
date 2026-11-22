#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3   ← [T1420] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1420-eq.js — 평형 저장본: 통째 저장 → 새 프로세스에서 되살림 → 이어 돈 날 지문 = 안 끊고 돈 판(T1420) ==========
//
// ★무엇을 보나(econ 엔진만 · 작은 세계 — v2 세계 마을 8(`createWorldV2` 의 무작위 땅) + 나무 층 문 · 지도 시딩 0 · 서버 0)
//   ① 저장(날 20) → **다른 프로세스**에서 되살려 +20날 = 안 끊고 40날 돈 판과 날 지문 20/20(`lib-eq-lab.fpDay` — 마을 · 세계 칸 값 지문)
//   ② 같은 저장본을 두 번 되살려 돈다 = 두 판 지문 같음 · 저장본 바이트 앞뒤 같음(끔 팔이 저장본을 안 바꾼다 — `eq-run` 의 끔 팔과 같은 문)
//   ③ 낡은 저장본(다른 코드 지문으로 쓴 것)을 되살리면 멈춘다(`EQ_STALE` · 코드 3) — 조용히 옛 세계를 쓰지 않는다
//   미끼 셋(`T1420_BAIT` — `lib-eq-lab` 안의 한 자리씩): `norng` 난수 상태를 안 싣는 사본 → ① 빨강 · `granary` 곳간만 싣는 사본(새 세계 + 곳간) → ① 빨강 ·
//     `nosig` 코드 지문을 안 보는 사본 → ③ 빨강
// 실행: node scripts/test-t1420-eq.js   (아이 프로세스 아홉 · 수 초씩)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SEED = 1020, NV = 8, SAVE = 20, MORE = 20;

// ── 아이(세계를 세우고 · 돌리고 · 저장 / 되살려 돌리고 지문을 쓴다) ──────────────────────────────
if (process.argv[2] === '--child') {
  const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Lq = require('./lib-eq-lab');
  const fresh = () => { const w = econV2.createWorldV2({ seed: SEED, villageCount: NV, picker: 'rational', infoRange: 5000, raidPer100: 0.005 }); require(path.join(ROOT, 'server', 'trees')).attachToWorld(w); return w; };
  const [mode, file, out] = process.argv.slice(3);
  const fp = [];
  try {
    if (mode === 'make') {
      const w = fresh();
      for (let d = 0; d < SAVE + MORE; d++) { econV2.tickWorldV2(w); fp.push(Lq.fpDay(w)); if (w.day === SAVE) Lq.save(file, w, econ, { harness: 't1420' }); }
      fs.writeFileSync(out, JSON.stringify({ fp }));
    } else {
      const r = Lq.load(file, econ, { fresh: fresh() });
      const w = r.world;
      for (let d = 0; d < MORE; d++) { econV2.tickWorldV2(w); fp.push(Lq.fpDay(w)); }
      fs.writeFileSync(out, JSON.stringify({ fp, loadedDay: r.meta.day, rng: !!(r.meta && r.meta.fns) }));
    }
    process.exit(0);
  } catch (e) { process.stderr.write(String(e && e.message) + '\n'); process.exit(e && e.code === 'EQ_STALE' ? 3 : 1); }
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1420-eq-'));
const child = (mode, file, out, env) => {
  const r = spawnSync(process.execPath, [__filename, '--child', mode, file, out], { cwd: ROOT, env: Object.assign({}, process.env, { T1420_BAIT: '', T1420_SIG_FAKE: '' }, env || {}), encoding: 'utf8' });
  let j = null; try { j = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
  return { code: r.status, err: (r.stderr || '').trim().split('\n').pop(), j };
};
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const cmp = (A, B) => { const m = new Map(B.fp.map((r) => [r.d, r.all])); let n = 0, same = 0; for (const r of A.fp) if (m.has(r.d)) { n++; if (m.get(r.d) === r.all) same++; } return { n, same }; };
const body = (f) => require('v8').deserialize(require('zlib').gunzipSync(fs.readFileSync(f)));
try {
  console.log(`[T1420] 평형 저장본 — 마을 ${NV} · 저장 날 ${SAVE} · 이어 ${MORE}날`);
  // ① 안 끊은 판 · 저장 · 되살린 판
  const S = path.join(T, 's.v8.gz'), A = child('make', S, path.join(T, 'a.json'));
  ok(A.code === 0 && A.j && A.j.fp.length === SAVE + MORE && fs.existsSync(S), '아이 판 — 40날 돌며 날 20 에 통째 저장', `코드 ${A.code} · ${A.err || ''}`);
  const h0 = fs.existsSync(S) ? sha(S) : null;
  const B = child('load', S, path.join(T, 'b.json'));
  const c1 = A.j && B.j ? cmp(A.j, B.j) : { n: 0, same: 0 };
  ok(B.code === 0 && c1.n === MORE && c1.same === MORE, '★① 다른 프로세스에서 되살려 +20날 = 안 끊고 돈 판과 날 지문 같음', `${c1.same}/${c1.n} · 코드 ${B.code} ${B.err || ''}`);
  // ② 같은 저장본 두 번 · 저장본 바이트
  const B2 = child('load', S, path.join(T, 'b2.json'));
  const c2 = B.j && B2.j ? cmp(B.j, B2.j) : { n: 0, same: 0 };
  ok(B2.code === 0 && c2.n === MORE && c2.same === MORE && h0 && sha(S) === h0, '★② 같은 저장본을 두 번 되살려 돈다 = 지문 같음 · 저장본 바이트 앞뒤 같음', `${c2.same}/${c2.n} · sha ${h0 && sha(S) === h0 ? '같음' : '다름'}`);
  // ③ 낡은 저장본
  const SO = path.join(T, 'old.v8.gz'); child('make', SO, path.join(T, 'o.json'), { T1420_SIG_FAKE: 'old0000000000000' });
  const C = child('load', SO, path.join(T, 'c.json'));
  ok(C.code === 3 && /낡은 저장본/.test(C.err), '★③ 낡은 저장본(다른 코드 지문)은 되살리지 않는다 — 코드 3 · "낡은 저장본"', `코드 ${C.code} · ${C.err.slice(0, 90)}`);

  // 미끼 셋 — 바꾼 자리를 세고 그 물음만 빨강인지 본다
  const SR = path.join(T, 'norng.v8.gz'); child('make', SR, path.join(T, 'r0.json'), { T1420_BAIT: 'norng' });
  const R = child('load', SR, path.join(T, 'r.json'));
  const cR = A.j && R.j ? cmp(A.j, R.j) : { n: 0, same: 0 };
  const bR = fs.existsSync(SR) ? body(SR) : null, nR = bR && bR.world ? bR.world.villages.filter((v) => v._rs === undefined).length : -1;
  ok(bR && bR.rng === null && bR.world && nR === NV && R.code === 0 && cR.same < cR.n, `[미끼] 바꾼 자리 1곳(난수 상태 — 전역 씨 null · 마을 흐름 칸 ${nR}/${NV} 비움 · 세계 나머지는 그대로) — 난수 상태를 안 싣는 사본은 ① 빨강`, `지문 ${cR.same}/${cR.n}`);
  const SG = path.join(T, 'gran.v8.gz'); child('make', SG, path.join(T, 'g0.json'), { T1420_BAIT: 'granary' });
  const G = child('load', SG, path.join(T, 'g.json'));
  const cG = A.j && G.j ? cmp(A.j, G.j) : { n: 0, same: 0 };
  const bG = fs.existsSync(SG) ? body(SG) : null;
  ok(bG && bG.world === null && Array.isArray(bG.granary) && bG.granary.length === NV && G.code === 0 && cG.same === 0, `[미끼] 바꾼 자리 1곳(세계 대신 곳간 ${bG && bG.granary ? bG.granary.length : 0}마을 — 새 세계에 붓는다) — 곳간만 싣는 사본은 ① 빨강`, `지문 ${cG.same}/${cG.n}`);
  const N = child('load', SO, path.join(T, 'n.json'), { T1420_BAIT: 'nosig' });
  ok(N.code === 0 && N.j && N.j.fp.length === MORE, '[미끼] 바꾼 자리 1곳(코드 지문 문) — 코드 지문을 안 보는 사본은 낡은 저장본을 쓴다 = ③ 빨강', `코드 ${N.code}`);
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
