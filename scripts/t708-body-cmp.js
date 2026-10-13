#!/usr/bin/env node
// === scripts/t708-body-cmp.js — [T708 2026-10-12] 몸 모델 전/후 대조 — ① 쉬는 자세 · ② 걷기·달리기(다리 관절각) · ③ 갖옷(따로 지은 옷) ===
//
// ★무엇을 재나(판정 0 · 표만): 사람 3D(`client3d/char3d.js` · `assets/char3d/`)를 T708 전(main 뿌리)과 뒤(이 저장소)에서 **각 뿌리의 클라 그대로** 떠서 맞댄다.
//   재는 길(뿌리마다 central 정적 판 · 빈 쪽에 three.js + 시트 메타 + 그 뿌리의 char3d.js · `__char3d.snap` · 화소 맞대기)은
//   `t654-mesh-cmp.js` 의 함수를 그대로 부른다(사본 0 · 클라 무접촉 · 서버 무접촉).
//   ⓐ 게임 크기(109×90 · 한낮): 몸 둘 × 옷 넷 × 8방향 × (쉼 + 클립 다섯 판 전부) — 바뀐 화소 % · **실루엣 차 %**(알파 > 127 이 갈린 화소 ÷ 전·후 합집합) ·
//      실루엣 꼴(찬 화소 · 둘레 네모 너비 × 높이 — 판 평균).
//   ⓑ ×4: T604 · T654 그림과 **같은 자리(앞 1 · 옆 3)·같은 판(쉼 · 걷기 2 · 달리기 2)** + 옷 넷의 쉼(앞) + 걷기·달리기 한 바퀴(옆 3 · 판 0~7).
//      게임 크기(1×) 판도 같은 자리를 그대로 싣는다(실루엣의 기준 = 게임 크기).
//   ⓒ 다리 관절각: 두 glb 의 클립 열쇠마다 뼈 머리 자리(엉덩이 = 넓적다리 머리 · 무릎 · 발목 · 발끝)로 **땅 기준 시상각**을 잰다 —
//      넓적다리 · 정강이 = atan2(앞, −위)(앞으로 +) · 발 = atan2(위, 앞) − 쉼의 같은 각(발끝 들림 +) · 무릎 굽힘 = 넓적다리 − 정강이 · 발목 = 발 − 정강이
//      (앞 = 모델 +x · 위 = +y — `char3d_meta.facing`). 자료(`assets-src/gait/gait_norms.json`)의 같은 위상(φ0 + k/K · 오른발 + ½ — `clips.<c>.gait.phase0`)과 맞댄다.
// 실행: node scripts/t708-body-cmp.js --before=<뿌리> [--json=<경로>] [--png=<그림 경로>] [--names=<전 이름>,<후 이름>] [--angles-only(ⓒ 만 · 몇 초)]
//   뿌리 = `git archive <전 커밋> public server sim package.json | tar -x -C <뿌리>` + `node_modules` 이음(T654 와 같은 꼴).
'use strict';
const path = require('path');
const fs = require('fs');
const CMP = require('./t654-mesh-cmp');
const ROOT = path.join(__dirname, '..');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const BEFORE = arg('before') && path.resolve(arg('before'));
const OUTJSON = arg('json'), OUTPNG = arg('png');
const [NB, NA] = (arg('names') || 'main,이 가지').split(',');            // 그림 머리의 전·후 이름(글자만)
if (!BEFORE || !fs.existsSync(path.join(BEFORE, 'public', 'client3d', 'char3d.js'))) {
  console.error('쓰는 법: node scripts/t708-body-cmp.js --before=<뿌리(public/client3d/char3d.js 가 있는 자리)> [--json=…] [--png=…]');
  process.exit(2);
}
const C3 = (root) => path.join(root, 'public', 'assets', 'char3d');
const META = { before: JSON.parse(fs.readFileSync(path.join(C3(BEFORE), 'char3d_meta.json'), 'utf8')),
               after: JSON.parse(fs.readFileSync(path.join(C3(ROOT), 'char3d_meta.json'), 'utf8')) };
const GAIT = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-src', 'gait', 'gait_norms.json'), 'utf8'));

// ── ⓒ glb 클립의 뼈 자리(순수 FK — 노드 TRS · 열쇠 값 그대로) ───────────────────────────────────────────
function glbOpen(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const base = 20 + jl + 8, NC = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  const acc = (i) => {
    const a = J.accessors[i], v = J.bufferViews[a.bufferView], n = NC[a.type];
    if (a.componentType !== 5126 || a.sparse || (v.byteStride && v.byteStride !== 4 * n)) throw new Error(`[t708] 접근자 ${i} 는 조밀한 float 가 아니다`);
    const o = base + (v.byteOffset || 0) + (a.byteOffset || 0), out = [];
    for (let k = 0; k < a.count; k++) { const r = []; for (let c = 0; c < n; c++) r.push(b.readFloatLE(o + 4 * (k * n + c))); out.push(r); }
    return out;
  };
  const parent = {};
  J.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  return { J, acc, parent, idx: Object.fromEntries(J.nodes.map((n, i) => [n.name, i])) };
}
function trs(t, q, s) {                       // 행 우선 4×4 = T · R(q) · S
  const [x, y, z, w] = q;
  const R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  return [[R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]], [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
          [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]], [0, 0, 0, 1]];
}
const mul = (A, B) => A.map((r) => [0, 1, 2, 3].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + r[3] * B[3][j]));
function worldPos(G, over, names) {           // over = {노드: {translation, rotation, scale}} — 열쇠가 덮는 값
  const memo = {};
  const W = (i) => {
    if (memo[i]) return memo[i];
    const n = G.J.nodes[i], o = over[i] || {};
    const L = trs(o.translation || n.translation || [0, 0, 0], o.rotation || n.rotation || [0, 0, 0, 1], o.scale || n.scale || [1, 1, 1]);
    return (memo[i] = G.parent[i] === undefined ? L : mul(W(G.parent[i]), L));
  };
  return Object.fromEntries(names.map((nm) => { const M = W(G.idx[nm]); return [nm, [M[0][3], M[1][3], M[2][3]]]; }));
}
const deg = (r) => r * 180 / Math.PI;
function legAngles(P, sex, side, footRest) {  // 앞 = +x · 위 = +y(glTF) — 시상면 성분만 쓴다(옆 성분은 버린다)
  const p = (b) => P[`${sex}_${side}${b}`];
  const hip = p('UpLeg'), knee = p('Leg'), ank = p('Foot'), toe = p('ToeBase');
  const seg = (a, b) => deg(Math.atan2(b[0] - a[0], -(b[1] - a[1])));
  const thigh = seg(hip, knee), shank = seg(knee, ank);
  const footRaw = deg(Math.atan2(toe[1] - ank[1], toe[0] - ank[0]));
  const foot = footRest === undefined ? footRaw : footRaw - footRest;
  return { thigh, shank, foot, knee: thigh - shank, ankle: foot - shank, footRaw };
}
function clipAngles(file, meta) {
  const G = glbOpen(file), out = {};
  for (const sex of ['M', 'F']) {
    const names = [`${sex}_Hips`, ...['Left', 'Right'].flatMap((sd) => ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map((b) => `${sex}_${sd}${b}`))];
    const R0 = worldPos(G, {}, names);         // 쉼(묶기 자세 = 노드 기본값) — 발 0 = 쉼의 발(자료 규약: 발바닥 평평 = 0)
    const raw = { Left: legAngles(R0, sex, 'Left'), Right: legAngles(R0, sex, 'Right') };
    const rest = { Left: legAngles(R0, sex, 'Left', raw.Left.footRaw), Right: legAngles(R0, sex, 'Right', raw.Right.footRaw) };
    out[sex] = { rest: { Left: rest.Left, Right: rest.Right, hipY: R0[`${sex}_Hips`][1] } };
    for (const clip of ['walk', 'run']) {
      const A = G.J.animations.find((a) => a.name === `${sex}.${clip}`);
      if (!A) throw new Error(`[t708] ${file} 에 ${sex}.${clip} 이 없다`);
      const ch = A.channels.map((c) => ({ node: c.target.node, path: c.target.path, v: G.acc(A.samplers[c.sampler].output), n: G.acc(A.samplers[c.sampler].input).length }));
      const K = meta.clips[clip].keys, ph0 = (META.after.clips[clip].gait || {}).phase0;
      const keys = [];
      for (let k = 0; k < K; k++) {             // 루프 끝 열쇠(K = 0번 되풀이)는 뺀다
        const over = {};
        for (const c of ch) { (over[c.node] = over[c.node] || {})[c.path] = c.v[Math.min(k, c.n - 1)]; }
        const P = worldPos(G, over, names);
        const L = legAngles(P, sex, 'Left', rest.Left.footRaw), Rr = legAngles(P, sex, 'Right', rest.Right.footRaw);
        keys.push({ k, phL: ((ph0 + k / K) % 1 + 1) % 1, phR: ((ph0 + k / K + 0.5) % 1 + 1) % 1, L, R: Rr,
          step: Math.abs(P[`${sex}_LeftFoot`][0] - P[`${sex}_RightFoot`][0]), hipY: P[`${sex}_Hips`][1] });   // 보폭 = 두 발목 앞뒤 거리(m) · 엉덩이 높이(m)
      }
      out[sex][clip] = { K, ph0, keys };
    }
  }
  return out;
}
const cyc = (curve, ph) => { const x = (((ph % 1) + 1) % 1) * 100, i = Math.min(99, Math.floor(x)), f = x - i; return curve[i] * (1 - f) + curve[i + 1] * f; };
function angleStats(A) {                      // 열쇠 전부 · 두 다리 — 범위 · 자료(같은 위상)와의 RMS
  const S = {};
  for (const sex of ['M', 'F']) for (const clip of ['walk', 'run']) for (const j of ['thigh', 'knee', 'ankle']) {
    const vals = [], err = [];
    for (const q of A[sex][clip].keys) for (const [sd, ph] of [['L', q.phL], ['R', q.phR]]) {
      vals.push(q[sd][j]); err.push(q[sd][j] - cyc(GAIT[clip][j], ph));
    }
    S[`${sex}|${clip}|${j}`] = { min: +Math.min(...vals).toFixed(2), max: +Math.max(...vals).toFixed(2),
      rms: +Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length).toFixed(2), maxAbs: +Math.max(...err.map(Math.abs)).toFixed(2) };
  }
  for (const sex of ['M', 'F']) for (const clip of ['walk', 'run']) {
    const q = A[sex][clip].keys;
    S[`${sex}|${clip}|stride`] = { stepMax: +Math.max(...q.map((x) => x.step)).toFixed(3), hipMin: +Math.min(...q.map((x) => x.hipY)).toFixed(3),
      hipMax: +Math.max(...q.map((x) => x.hipY)).toFixed(3), hipRest: +A[sex].rest.hipY.toFixed(3) };
  }
  return S;
}

// ── ⓐ 실루엣 꼴 — 찬 화소(알파 > 127) · 둘레 네모 ─────────────────────────────────────────────────────
function shape(t) {
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 3, q = 0; i < t.buf.length; i += 4, q++) if (t.buf[i] > 127) {
    n++; const x = q % t.w, y = (q / t.w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { n, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { n: 0, w: 0, h: 0 };
}

function printAngles(ANG, AS) {
  console.log('\n[표 ⓒ] 다리 관절각(°) — 범위 [최소, 최대] · 자료(같은 위상)와의 RMS / 최대 차 — 전(모캡) → 후');
  for (const clip of ['walk', 'run']) for (const j of ['thigh', 'knee', 'ankle']) {
    const rg = GAIT[clip].range[j];
    console.log(`${clip} · ${j} · 자료 [${rg}] · ` + ['M', 'F'].map((sex) => { const b = AS.before[`${sex}|${clip}|${j}`], a = AS.after[`${sex}|${clip}|${j}`];
      return `${sex} 전 [${b.min}, ${b.max}] RMS ${b.rms} → 후 [${a.min}, ${a.max}] RMS ${a.rms}(최대 ${a.maxAbs})`; }).join(' · '));
  }
  for (const clip of ['walk', 'run']) console.log(`${clip} · 보폭(두 발목 앞뒤 거리 최대 m) · 엉덩이 높이 [최소, 최대] m(쉼) — ` + ['M', 'F'].map((sex) => { const b = AS.before[`${sex}|${clip}|stride`], a = AS.after[`${sex}|${clip}|stride`];
    return `${sex} 전 ${b.stepMax} · [${b.hipMin}, ${b.hipMax}](${b.hipRest}) → 후 ${a.stepMax} · [${a.hipMin}, ${a.hipMax}](${a.hipRest})`; }).join(' · '));
  for (const sex of ['M', 'F']) console.log(`쉼 다리(${sex}) 전: 넓적다리 ${ANG.before[sex].rest.Left.thigh.toFixed(2)}° · 무릎 ${ANG.before[sex].rest.Left.knee.toFixed(2)}° · 발목 ${ANG.before[sex].rest.Left.ankle.toFixed(2)}° → 후: 넓적다리 ${ANG.after[sex].rest.Left.thigh.toFixed(2)}° · 무릎 ${ANG.after[sex].rest.Left.knee.toFixed(2)}° · 발목 ${ANG.after[sex].rest.Left.ankle.toFixed(2)}°`);
}
const angAll = () => {
  const ANG = { before: clipAngles(path.join(C3(BEFORE), 'char_body.glb'), META.before), after: clipAngles(path.join(C3(ROOT), 'char_body.glb'), META.after) };
  return { ANG, AS: { before: angleStats(ANG.before), after: angleStats(ANG.after) } };
};
if (process.argv.includes('--angles-only')) {           // 관절각만(그림 없이 · 몇 초)
  const { ANG, AS } = angAll();
  printAngles(ANG, AS);
  process.exit(0);
}

(async () => {
  const { chromium } = require('playwright');                       // 하네스와 같은 꼴(NODE_PATH)
  const M = META.after, SEX = ['M', 'F'], KINDS = M.clothKinds, DIRS = [0, 1, 2, 3, 4, 5, 6, 7];
  if (JSON.stringify(META.before.clothKinds) !== JSON.stringify(KINDS) || JSON.stringify(Object.keys(META.before.clips).sort()) !== JSON.stringify(Object.keys(M.clips).sort())) {
    throw new Error('[t708] 전·후 메타의 옷·클립 표가 다르다 — 같은 판끼리만 맞댄다');
  }
  const POSES = [{ g: 'rest', clip: null, f: 0 }, ...Object.entries(M.clips).flatMap(([c, m]) => Array.from({ length: m.frames }, (_, f) => ({ g: c, clip: c, f })))];
  const jobs1 = [];
  for (const sex of SEX) for (const kind of KINDS) for (const d of DIRS) for (const p of POSES) jobs1.push({ id: `${sex}|${kind}|${d}|${p.g}|${p.f}`, sex, kind, d, clip: p.clip, f: p.f, g: p.g });
  // ×4 — T654 그림의 자리(갖옷·삼베 × 앞·옆 × 쉼·걷기 2·달리기 2) + 옷 넷 쉼(앞·옆) + 걷기·달리기 한 바퀴(옆 · 삼베)
  const FIGP = [{ g: 'rest', clip: null, f: 0 }, { g: 'walk', clip: 'walk', f: 2 }, { g: 'run', clip: 'run', f: 2 }];
  const seen = new Set(), jobs4 = [];
  const add4 = (sex, kind, d, p) => { const id = `${sex}|${kind}|${d}|${p.g}|${p.f}`; if (!seen.has(id)) { seen.add(id); jobs4.push({ id, sex, kind, d, clip: p.clip, f: p.f, g: p.g }); } };
  for (const sex of SEX) {
    for (const kind of ['fur', 'hemp']) for (const d of [1, 3]) for (const p of FIGP) add4(sex, kind, d, p);
    for (const kind of KINDS) for (const d of [1, 3]) add4(sex, kind, d, FIGP[0]);
    for (const clip of ['walk', 'run']) for (let f = 0; f < M.clips[clip].frames; f++) add4(sex, 'hemp', 3, { g: clip, clip, f });
  }

  const R = { before: BEFORE, after: ROOT };
  const shots = {}, size = {};
  const browser = await chromium.launch({ headless: true });
  let port = 3171;
  for (const [nm, root] of Object.entries(R)) {
    size[nm] = CMP.sizes(root);
    await CMP.bootCentral(root, ++port);
    const p1 = await CMP.openRoot(browser, port, root, 1, null);
    const s1 = await CMP.snapAll(p1, jobs1);
    const p4 = await CMP.openRoot(browser, port, root, 4, null);
    const s4 = await CMP.snapAll(p4, jobs4);
    shots[nm] = { s1, s4 };
    console.log(`[t708] ${nm}: 게임 크기 ${Object.keys(s1).length}판 · ×4 ${Object.keys(s4).length}판 · 그리기 호출 ${[...new Set(Object.values(s1).map((t) => t.calls))].join('/')} · glb ${size[nm].glb}B · 합 ${size[nm].total}B`);
    await p1.close(); await p4.close();
  }

  // ── ⓐ 표 — 몸 × 옷 × 자세 무리 ──
  const groups = ['rest', ...Object.keys(M.clips)];
  const T = {}, SH = {};
  for (const j of jobs1) {
    const a = shots.before.s1[j.id], b = shots.after.s1[j.id];
    const r = CMP.cmp(a.buf, b.buf), sa = shape(a), sb = shape(b);
    const keys = [`${j.sex}|${j.kind}|${j.g}`, `${j.sex}|${j.kind}|all`, `*|${j.kind}|${j.g}`, `*|${j.kind}|all`, `*|*|${j.g}`, `*|*|all`];
    for (const key of keys) {
      const t = T[key] || (T[key] = { U: 0, X: 0, C: 0, mx: 0, n: 0 });
      t.U += r.U; t.X += r.X; t.C += r.C; t.mx = Math.max(t.mx, r.mx); t.n++;
      const s = SH[key] || (SH[key] = { n: 0, b: { n: 0, w: 0, h: 0 }, a: { n: 0, w: 0, h: 0 } });
      s.n++; for (const q of ['n', 'w', 'h']) { s.b[q] += sa[q]; s.a[q] += sb[q]; }
    }
    if (j.d === 1 && j.g === 'rest') {          // 쉼 · 앞(1) — 팔 벌림이 보이는 자리 따로
      const key = `${j.sex}|${j.kind}|rest1`;
      SH[key] = { n: 1, b: sa, a: sb };
    }
  }
  const pct = (t) => (t.U ? +(100 * t.C / t.U).toFixed(2) : 0), xpct = (t) => (t.U ? +(100 * t.X / t.U).toFixed(2) : 0);
  const avg = (s, w) => ({ n: +(s[w].n / s.n).toFixed(1), w: +(s[w].w / s.n).toFixed(1), h: +(s[w].h / s.n).toFixed(1) });
  console.log('\n[표 ⓐ] 게임 크기(109×90 · 한낮) — 바뀐 화소 % / 실루엣 차 % (8방향 × 판 전부 합)');
  console.log('몸 · 옷 · ' + [...groups, 'all'].join(' · '));
  for (const sex of SEX) for (const kind of KINDS) console.log(`${sex} · ${kind} · ` + [...groups, 'all'].map((g) => { const t = T[`${sex}|${kind}|${g}`]; return `${pct(t)}/${xpct(t)}`; }).join(' · '));
  for (const g of [...groups, 'all']) { const t = T[`*|*|${g}`]; console.log(`모두 · ${g}: ${pct(t)}% / ${xpct(t)}% · 화소 ${t.C}/${t.U} · 실루엣 ${t.X} · 판 ${t.n}`); }
  for (const kind of KINDS) { const t = T[`*|${kind}|all`]; console.log(`옷 ${kind} 전부: ${pct(t)}% / ${xpct(t)}%`); }
  console.log('\n[표 ⓐ+] 실루엣 꼴(게임 크기 · 판 평균 · 찬 화소 · 너비×높이 px) 전 → 후');
  for (const sex of SEX) for (const kind of KINDS) {
    const row = ['rest1', 'rest', 'walk', 'run'].map((g) => { const s = SH[`${sex}|${kind}|${g}`], b = avg(s, 'b'), a = avg(s, 'a'); return `${g} ${b.n}(${b.w}×${b.h}) → ${a.n}(${a.w}×${a.h})`; });
    console.log(`${sex} · ${kind} · ${row.join(' · ')}`);
  }

  // ── ⓒ 다리 관절각 ──
  const { ANG, AS } = angAll();
  printAngles(ANG, AS);

  // ×4 표
  const T4 = {};
  for (const j of jobs4) {
    const r = CMP.cmp(shots.before.s4[j.id].buf, shots.after.s4[j.id].buf);
    T4[j.id] = { pct: r.U ? +(100 * r.C / r.U).toFixed(2) : 0, xor: r.U ? +(100 * r.X / r.U).toFixed(2) : 0 };
  }
  console.log(`\n[크기] glb ${size.before.glb} → ${size.after.glb}B · 합 ${size.before.total} → ${size.after.total}B`);

  const REC = { before: BEFORE, size, groups,
    table: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, { pct: pct(t), xor: xpct(t), C: t.C, X: t.X, U: t.U, mx: t.mx, n: t.n }])),
    shape: Object.fromEntries(Object.entries(SH).map(([k, s]) => [k, { n: s.n, before: avg(s, 'b'), after: avg(s, 'a') }])),
    angles: AS, restLegs: Object.fromEntries(SEX.map((sex) => [sex, { before: ANG.before[sex].rest, after: ANG.after[sex].rest }])),
    x4: T4, jobs: { game: jobs1.length, x4: jobs4.length },
    coat: Object.fromEntries(SEX.map((sex) => [sex, M.bodies[sex].coat])), stand: Object.fromEntries(SEX.map((sex) => [sex, M.bodies[sex].stand])),
    gait: Object.fromEntries(['walk', 'run'].map((c) => [c, M.clips[c].gait])) };
  if (OUTJSON) fs.writeFileSync(OUTJSON, JSON.stringify(REC, null, 1));

  if (OUTPNG) {
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const KN = { hemp: '삼베', ramie: '모시', leather: '가죽', fur: '갖옷' }, GN = { rest: '쉼', walk: '걷기', run: '달리기', idle2: '서기', swing2: '휘두르기', aim2: '겨누기', all: '전부' };
    const SN = { M: '남', F: '여' };
    // 자르기 — 판 묶음마다(같은 축척) 찬 화소를 덮는 가장 작은 네모 + 한 칸
    const box = (ts) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const t of ts) for (let i = 3; i < t.buf.length; i += 4) if (t.buf[i]) {
        const q = (i - 3) / 4, x = q % t.w, y = (q / t.w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1), x1: Math.min(ts[0].w - 1, x1 + 1), y1: Math.min(ts[0].h - 1, y1 + 1) };
    };
    const crop = (t, buf, B) => { const w = B.x1 - B.x0 + 1, h = B.y1 - B.y0 + 1, o = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) buf.copy(o, y * w * 4, ((y + B.y0) * t.w + B.x0) * 4, ((y + B.y0) * t.w + B.x0 + w) * 4); return CMP.png(w, h, o); };
    const all4 = ['before', 'after'].flatMap((nm) => Object.values(shots[nm].s4));
    const B4 = box(all4);
    const all1 = ['before', 'after'].flatMap((nm) => jobs4.map((j) => shots[nm].s1[j.id]));
    const B1 = box(all1);
    const img4 = (nm, id) => `<img src="${crop(shots[nm].s4[id], shots[nm].s4[id].buf, B4)}">`;
    const dif4 = (id) => `<img src="${crop(shots.before.s4[id], CMP.diffImg(shots.before.s4[id].buf, shots.after.s4[id].buf), B4)}">`;
    const img1 = (nm, id) => `<img class="g" src="${crop(shots[nm].s1[id], shots[nm].s1[id].buf, B1)}">`;
    const cw = B4.x1 - B4.x0 + 1;
    // 표 ⓐ
    const rowsA = [];
    for (const sex of SEX) for (const kind of KINDS) rowsA.push(`<tr><td>${SN[sex]}</td><td>${KN[kind]}</td>${[...groups, 'all'].map((g) => { const t = T[`${sex}|${kind}|${g}`]; return `<td>${pct(t)} / <b>${xpct(t)}</b></td>`; }).join('')}</tr>`);
    rowsA.push(`<tr class="sum"><td colspan="2">모두</td>${[...groups, 'all'].map((g) => { const t = T[`*|*|${g}`]; return `<td>${pct(t)} / <b>${xpct(t)}</b></td>`; }).join('')}</tr>`);
    const rowsS = [];
    for (const sex of SEX) for (const kind of KINDS) rowsS.push(`<tr><td>${SN[sex]}</td><td>${KN[kind]}</td>${['rest1', 'rest', 'walk', 'run'].map((g) => { const s = SH[`${sex}|${kind}|${g}`], b = avg(s, 'b'), a = avg(s, 'a');
      return `<td>${b.n} · ${b.w}×${b.h}</td><td>${a.n} · ${a.w}×${a.h}</td>`; }).join('')}</tr>`);
    // 표 ⓒ
    const JN = { thigh: '넓적다리(엉덩이 굽힘 − 골반 앞기울기)', knee: '무릎 굽힘', ankle: '발목(발등굽힘 +)' };
    const rowsC = [];
    for (const clip of ['walk', 'run']) for (const j of ['thigh', 'knee', 'ankle']) {
      const rg = GAIT[clip].range[j];
      rowsC.push(`<tr><td>${GN[clip]}</td><td>${JN[j]}</td><td>${rg[0]} ~ ${rg[1]}</td>${SEX.map((sex) => { const b = AS.before[`${sex}|${clip}|${j}`], a = AS.after[`${sex}|${clip}|${j}`];
        return `<td>${b.min} ~ ${b.max}</td><td>${b.rms}</td><td>${a.min} ~ ${a.max}</td><td>${a.rms}</td>`; }).join('')}</tr>`);
    }
    const rowsD = ['walk', 'run'].map((clip) => `<tr><td>${GN[clip]}</td>${SEX.map((sex) => { const b = AS.before[`${sex}|${clip}|stride`], a = AS.after[`${sex}|${clip}|stride`];
      return `<td>${b.stepMax.toFixed(3)}</td><td>${b.hipMin.toFixed(3)} ~ ${b.hipMax.toFixed(3)}</td><td>${a.stepMax.toFixed(3)}</td><td>${a.hipMin.toFixed(3)} ~ ${a.hipMax.toFixed(3)}</td>`; }).join('')}</tr>`);
    // 그래프 — 자료 곡선(회색) · 전 모캡(주황) · 후(파랑) — 남 · 왼다리 열쇠 + 오른다리(위상 + ½)
    const W = 300, Hh = 150, PADL = 34, PADB = 18;
    const plot = (clip, j) => {
      const curve = GAIT[clip][j];
      const pts = (A) => A.M[clip].keys.flatMap((q) => [[q.phL, q.L[j]], [q.phR, q.R[j]]]);
      const pb = pts(ANG.before), pa = pts(ANG.after);
      const ys = [...curve, ...pb.map((p) => p[1]), ...pa.map((p) => p[1])];
      let lo = Math.floor(Math.min(...ys) / 10) * 10, hi = Math.ceil(Math.max(...ys) / 10) * 10;
      if (hi - lo < 20) hi = lo + 20;
      const X = (ph) => PADL + ph * (W - PADL - 6), Y = (v) => 6 + (hi - v) / (hi - lo) * (Hh - PADB - 6);
      const grid = []; for (let v = lo; v <= hi; v += (hi - lo > 80 ? 20 : 10)) grid.push(`<line x1="${PADL}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e4e4e4"/><text x="${PADL - 3}" y="${Y(v) + 3}" font-size="9" text-anchor="end" fill="#777">${v}</text>`);
      for (const ph of [0, 0.25, 0.5, 0.75, 1]) grid.push(`<text x="${X(ph)}" y="${Hh - 4}" font-size="9" text-anchor="middle" fill="#777">${Math.round(ph * 100)}%</text>`);
      const line = curve.map((v, i) => `${i ? 'L' : 'M'}${X(i / 100).toFixed(1)},${Y(v).toFixed(1)}`).join('');
      const dots = (P, col, r) => P.map(([ph, v]) => `<circle cx="${X(ph).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${r}" fill="${col}"/>`).join('');
      return `<svg width="${W}" height="${Hh}" xmlns="http://www.w3.org/2000/svg">${grid.join('')}<path d="${line}" fill="none" stroke="#999" stroke-width="3"/>${dots(pb, '#e07b00', 2.2)}${dots(pa, '#1f5fd1', 2.2)}<text x="${PADL + 4}" y="15" font-size="11" fill="#222">${GN[clip]} · ${JN[j].replace(/\(.*\)/, '')}</text></svg>`;
    };
    const S = size, mesh = (q) => q.meshes.map((m) => `${esc(m.name)} ${m.verts}점·${m.tris}삼각`).join(' · ');
    const coatLine = SEX.map((sex) => { const c = M.bodies[sex].coat; return `${SN[sex]}: 단 ${c.cut.hem === 'knee' ? '무릎' : c.cut.hem} · 소매 ${c.cut.sleeve === 'long' ? '긴' : c.cut.sleeve} · 털 두께 ${(c.pad * 100).toFixed(1)}cm · 옷 점 옮김 최대 ${(c.offsetMaxM * 100).toFixed(1)}cm · 옮김 0(띠·마개) ${c.offsetZero}점`; }).join(' / ');
    const standLine = SEX.map((sex) => { const s = M.bodies[sex].stand.left; return `${SN[sex]}: 팔 벌림 ${s.armAbd}° · 팔꿈치 ${s.elbow}° · 무릎 ${s.knee}° · 두 발목 사이 ${(s.ankleGap * M.bodies[sex].scale * 100).toFixed(1)}cm`; }).join(' / ');   // 메타 ankleGap = MPFB 축(등배 앞) → × 등배
    const sec = (title) => `<h2>${title}</h2>`;
    const hd = `<div class="hd"><div>남: 전 · 후 · 차</div><div>여: 전 · 후 · 차</div></div>`;
    const row3 = (lab, kind, d, p) => `<div class="row"><div class="lab">${lab}</div>${SEX.map((sex) => { const id = `${sex}|${kind}|${d}|${p.g}|${p.f}`;
      return `<div class="grp">${img4('before', id)}${img4('after', id)}${dif4(id)}<div class="cap">${SN[sex]} 실루엣 차 ${T4[id].xor}% · 바뀐 ${T4[id].pct}%</div></div>`; }).join('')}</div>`;
    const cells = [];
    for (const d of [1, 3]) for (const p of FIGP) cells.push(row3(`갖옷 · ${d === 1 ? '앞(1)' : '옆(3)'} · ${GN[p.g]}${p.clip ? ' ' + p.f + '판' : ''}`, 'fur', d, p));
    for (const kind of ['hemp', 'ramie', 'leather']) cells.push(row3(`${KN[kind]} · 앞(1) · 쉼`, kind, 1, FIGP[0]));
    for (const kind of ['hemp']) for (const p of FIGP.slice(1)) cells.push(row3(`${KN[kind]} · 옆(3) · ${GN[p.g]} ${p.f}판`, kind, 3, p));
    const strip = (sex, clip, nm, fn) => `<div class="strip"><div class="lab">${SN[sex]} · ${GN[clip]} · ${nm === 'before' ? '전' : '후'}</div>${Array.from({ length: M.clips[clip].frames }, (_, f) => fn(nm, `${sex}|hemp|3|${clip}|${f}`)).join('')}</div>`;
    const gaitStrips = ['walk', 'run'].map((clip) => ['before', 'after'].map((nm) => strip('M', clip, nm, img4)).join('')).join('');
    const game = SEX.map((sex) => `<div class="gblock"><div class="lab">${SN[sex]} · 쉼(옷 넷 · 앞 1 · 옆 3)</div>${['before', 'after'].map((nm) => `<div class="gline"><span class="t">${nm === 'before' ? '전' : '후'}</span>${KINDS.flatMap((k) => [1, 3].map((d) => img1(nm, `${sex}|${k}|${d}|rest|0`))).join('')}</div>`).join('')}
      ${['walk', 'run'].map((clip) => `<div class="lab">${SN[sex]} · ${GN[clip]} 판 0~${M.clips[clip].frames - 1}(삼베 · 옆 3)</div>${['before', 'after'].map((nm) => `<div class="gline"><span class="t">${nm === 'before' ? '전' : '후'}</span>${Array.from({ length: M.clips[clip].frames }, (_, f) => img1(nm, `${sex}|hemp|3|${clip}|${f}`)).join('')}</div>`).join('')}`).join('')}</div>`).join('');
    const src = ['walk', 'run'].map((c) => `${GN[c]} = ${esc(GAIT.sources[c].cite)} · doi:${esc(GAIT.sources[c].doi)} · 자료 doi:${esc(GAIT.sources[c].data)} · ${esc(GAIT.sources[c].license)} — 조건 ${esc(GAIT[c].cond)} · ${GAIT[c].n}명 · ${GAIT[c].speed} m/s`).join('<br>');
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{font:13px/1.45 sans-serif;margin:14px;background:#fff;color:#222;width:${Math.max(1500, 170 + 2 * (3 * (cw + 4) + 18))}px}h1{font-size:17px;margin:0 0 6px}h2{font-size:14px;margin:14px 0 5px}
      table{border-collapse:collapse;margin:3px 0}td,th{border:1px solid #bbb;padding:2px 6px;text-align:right}td:nth-child(-n+2){text-align:left}tr.sum td{background:#f3f3f3}
      .row{display:flex;align-items:flex-start;margin:3px 0}.grp{display:flex;flex-wrap:wrap;gap:2px;width:${3 * (cw + 4)}px;margin-right:18px}.grp img{border:1px solid #ddd}
      .cap{width:100%;font-size:11px;color:#555}.lab{width:160px;font-size:12px;padding-top:8px;flex:none}.hd{display:flex;margin-left:160px;font-weight:bold;font-size:12px}
      .hd div{width:${3 * (cw + 4)}px;margin-right:18px;text-align:center}.num{font-family:monospace}.strip{display:flex;align-items:flex-start;gap:2px;margin:2px 0}.strip img{border:1px solid #ddd}
      .gblock{margin:4px 0 10px}.gline{display:flex;align-items:flex-end;gap:3px;margin:1px 0 1px 160px}.gline .t{width:22px;font-size:11px;color:#555}.g{border:1px solid #e3e3e3}
      .plots{display:flex;flex-wrap:wrap;gap:6px;width:${3 * 306}px}.lg span{display:inline-block;width:12px;height:12px;vertical-align:middle;margin:0 3px 0 10px}</style>
      <h1>T708 — 몸 모델: ① 쉬는 자세(A포즈 → 팔 내린 선 자세) · ② 걷기·달리기(다리 = 열린 보행 자료) · ③ 갖옷(따로 지은 겉옷) — 같은 자리 · 같은 카메라 전/후</h1>
      <div>전 = ${esc(NB)}(<span class="num">${mesh(S.before)}</span>) · 후 = ${esc(NA)}(<span class="num">${mesh(S.after)}</span>)</div>
      <div>glb <b class="num">${S.before.glb.toLocaleString()} → ${S.after.glb.toLocaleString()}B</b> · 합(glb·메타·무늬) <b class="num">${S.before.total.toLocaleString()} → ${S.after.total.toLocaleString()}B</b> · 그리는 길 = 각 뿌리의 <span class="num">client3d/char3d.js</span> 그대로(<span class="num">__char3d.snap</span> · 게임 투영 · 한낮 빛) · 몸 메시(MPFB) 그대로</div>
      <div>① 선 자세(후): ${esc(standLine)}</div>
      <div>③ 갖옷(후): ${esc(coatLine)}</div>
      ${sec('ⓐ 게임 크기(109×90) — 바뀐 화소 % / <b>실루엣 차 %</b> · 8방향 × (쉼 + 클립 다섯 판 전부) 합 · 분모 = 전·후 실루엣 합집합')}
      <table><tr><th>몸</th><th>옷</th>${[...groups, 'all'].map((g) => `<th>${GN[g] || g}</th>`).join('')}</tr>${rowsA.join('')}</table>
      ${sec('ⓐ+ 실루엣 꼴(게임 크기 · 판 평균) — 찬 화소 · 너비×높이(px) — 전 | 후')}
      <table><tr><th>몸</th><th>옷</th><th colspan="2">쉼 · 앞(1)</th><th colspan="2">쉼 · 8방향</th><th colspan="2">걷기 · 8방향 × 8판</th><th colspan="2">달리기 · 8방향 × 8판</th></tr>
      <tr><th></th><th></th>${'<th>전</th><th>후</th>'.repeat(4)}</tr>${rowsS.join('')}</table>
      ${sec('ⓒ 다리 관절각(°) — 클립 열쇠 전부 · 두 다리 · 범위 최소 ~ 최대 · 자료(같은 위상)와의 RMS')}
      <table><tr><th>클립</th><th>각</th><th>자료</th><th>남 전(모캡)</th><th>RMS</th><th>남 후</th><th>RMS</th><th>여 전(모캡)</th><th>RMS</th><th>여 후</th><th>RMS</th></tr>${rowsC.join('')}</table>
      <table><tr><th>클립</th><th>남 전 보폭(m)</th><th>남 전 엉덩이 높이(m)</th><th>남 후 보폭</th><th>남 후 엉덩이 높이</th><th>여 전 보폭</th><th>여 전 엉덩이 높이</th><th>여 후 보폭</th><th>여 후 엉덩이 높이</th></tr>${rowsD.join('')}</table>
      <div style="font-size:12px;color:#444">보폭 = 열쇠마다 두 발목(뼈 머리)의 앞뒤 거리 중 최대 · 엉덩이 높이 = 골반 뼈 머리 높이 최소 ~ 최대(쉼 = 전 ${SEX.map((sex) => AS.before[`${sex}|walk|stride`].hipRest.toFixed(3)).join('/')} · 후 ${SEX.map((sex) => AS.after[`${sex}|walk|stride`].hipRest.toFixed(3)).join('/')}m) — 키 1.60m 몸</div>
      <div class="lg">보행 주기(왼발 닿음 = 0 % · 오른다리 = 위상 + ½) — <span style="background:#999"></span>자료 평균 <span style="background:#e07b00"></span>전(CMU 모캡) <span style="background:#1f5fd1"></span>후(= 자료 · 같은 위상 RMS 0) · 남 · 열쇠 32개 × 두 다리</div>
      <div class="plots">${['walk', 'run'].map((c) => ['thigh', 'knee', 'ankle'].map((j) => plot(c, j)).join('')).join('')}</div>
      <div style="font-size:12px;color:#444">출처 — ${src}</div>
      ${sec(`ⓑ ×4(같은 클라 · 같은 투영 · 몸 둘레만 · T604·T654 그림과 같은 자리) — 전 · 후 · 차(회색 = 같음 · 노랑→빨강 = 색만 다름 · 자주 = 실루엣 갈림)`)}
      ${hd}${cells.join('')}
      ${sec('ⓑ ×4 · 한 바퀴 — 남 · 삼베 · 옆(3) · 판 0~7(시트 판 그대로)')}
      ${gaitStrips}
      ${sec('게임 크기(1× · 109×90 판 그대로 · 같은 자리) — 전 · 후')}
      ${game}`;
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.setContent(html);
    await page.screenshot({ path: OUTPNG, fullPage: true });
    await page.close();
    console.log(`[t708] 그림 ${OUTPNG}`);
  }
  await browser.close();
  CMP.cleanup();
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); CMP.cleanup(); process.exit(1); });
