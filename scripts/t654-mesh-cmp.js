#!/usr/bin/env node
// === scripts/t654-mesh-cmp.js — [T654 2026-10-05] 3D 옷 메시 사본 0 대조 자 — 같은 자세 · 같은 카메라 전/후 그림 차 ==================
//
// ★무엇을 재나: 사람 3D(`client3d/char3d.js` · `assets/char3d/`)의 그림이 메시를 하나로 줄이기 전(T604 · 몸마다 메시 둘 — 본 옷 몸 · 갖옷 몸)과
//   뒤(T654 · 메시 하나 + 갖옷 정점 부풀림 — 셰이더 한 줄)에서 같은가 — **각 뿌리의 클라 그대로** 떠서 화소로 맞댄다(판정 0 · 표만).
//   ⓐ 전 = `--before=<뿌리>`(예: `git archive origin/main public server sim package.json | tar -x -C <뿌리>` + `node_modules` 이음) · 후 = 이 저장소.
//   ⓑ 뿌리마다 central(정적)만 띄우고 빈 쪽에 three.js + `charMeta`(시트 메타 · 게임 크기 또는 ×4) + 그 뿌리의 `client3d/char3d.js` 를 싣는다 →
//      `__char3d.snap`(하네스 `e2e-char3d` ⓑ·ⓓ 의 재는 자리 · 게임 투영 · 한낮 빛) — 그리는 길은 그 뿌리의 것 그대로(사본 0 · 클라 무접촉).
//   ⓒ 게임 크기: 몸 둘 × 옷 넷 × 8방향 × (쉼 + 클립 다섯의 판 전부) — 바뀐 화소(RGBA 하나라도 다른 화소 ÷ 전·후 실루엣 합집합) ·
//      실루엣 차(알파 > 127 이 갈린 화소 ÷ 합집합) · 최대 채널 차. ×4: 갖옷·삼베 × 앞(1)·옆(3) × (쉼 · 걷기 2판 · 달리기 2판) — 그림 재료.
//   ⓓ 크기: glb · 합(잠금 산물 전부) · 메시(이름 · 점 · 삼각형) 전/후.
//   ⓔ 가르기(선택): `--before-glb=<glb>` = 전 뿌리의 `char_body.glb` 만 갈아 끼운다(쪽 요청 가로채기) — 갖옷 몸의 법선·뼈 무게를 본 옷 것으로 바꾼 판을
//      넣으면 화소 차가 어디서 오는지(면 법선 · 뼈 무게 · 나머지) 가른다(보고 T654 §③ 표).
//      그림에 가르기 표를 싣으려면 `--parts=<이름>=<json>,…`(위 판들이 쓴 `--json`).
//   ⓕ [T664] 글자만 바꾸는 손잡이: `--title=<그림 머리>` · `--names=<전 이름>,<후 이름>`(기본 T604,T654) · `--label=<표 첫 줄>` — 재는 식은 그대로.
// 실행: node scripts/t654-mesh-cmp.js --before=<뿌리> [--before-glb=<glb>] [--json=<경로>] [--png=<그림 경로>] [--parts=…]     (서버 무접촉 — central 정적 판만 띄운다)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const BEFORE = arg('before') && path.resolve(arg('before'));
const OUTJSON = arg('json'), OUTPNG = arg('png'), BGLB = arg('before-glb') && path.resolve(arg('before-glb'));
const [NB, NA] = (arg('names') || 'T604,T654').split(',');
const TITLE = arg('title') || 'T654 — 3D 옷 메시 사본 0 · 몸마다 메시 하나 + 갖옷 정점 부풀림(셰이더 한 줄) · 같은 자세 · 같은 카메라 전/후';
const LABEL = arg('label') || `${NB} 갖옷 몸 그대로`;
if (!BEFORE || !fs.existsSync(path.join(BEFORE, 'public', 'client3d', 'char3d.js'))) {
  console.error('쓰는 법: node scripts/t654-mesh-cmp.js --before=<뿌리(public/client3d/char3d.js 가 있는 자리)> [--json=…] [--png=…]');
  process.exit(2);
}
const procs = [], dbs = [];
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of dbs) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } }
};
process.on('exit', cleanup);

async function bootCentral(root, port) {
  const db = path.join(os.tmpdir(), `t654-cmp-${process.pid}-${port}.db`);
  dbs.push(db);
  const c = spawn(process.execPath, [path.join(root, 'server', 'central.js')], { cwd: root, env: { ...process.env, PORT: String(port), DB_PATH: db, PUBLIC_HOST: 'localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(c);
  const up = await FB.waitUp(c, /central server up on/, { name: `central(${root})` });
  if (!up.ok) throw new Error(`central 이 안 떴다(${root}): ${up.why}`);
}

async function openRoot(browser, port, root, k, glb) {
  const page = await browser.newPage();
  if (glb) await page.route('**/assets/char3d/char_body.glb', (r) => r.fulfill({ path: glb, contentType: 'model/gltf-binary' }));
  await page.goto(`http://localhost:${port}/t654-blank`).catch(() => {});     // 같은 출처의 빈 쪽(404) — 게임 판은 안 띄운다
  await page.addScriptTag({ url: '/vendor/three.0.186.1.min.js' });
  const cm = JSON.parse(fs.readFileSync(path.join(root, 'public', 'assets', 'char', 'char_meta.json'), 'utf8'));
  await page.evaluate((m) => { window.charMeta = () => m; },
    { frameW: Math.round(cm.frameW * k), frameH: Math.round(cm.frameH * k), anchorX: cm.anchorX * k, anchorY: cm.anchorY * k, ppu: cm.ppu * k });
  await page.addScriptTag({ url: '/client3d/char3d.js' });
  await page.waitForFunction(() => window.__char3d && (window.__char3d.ready || /없음|glb|:/.test(window.__char3d.why || '')), null, { timeout: 120000 });
  const why = await page.evaluate(() => (window.__char3d.ready ? null : window.__char3d.why));
  if (why) throw new Error(`char3d 가 안 섰다(${root}): ${why}`);
  return page;
}

// 재는 판 — `__char3d.snap(방향, 클립, 판, {sex, kind, rest})` 의 RGBA 를 날 바이트(base64)로
async function snapAll(page, jobs) {
  const out = {};
  for (let i = 0; i < jobs.length; i += 64) {
    Object.assign(out, await page.evaluate((js) => {
      const C = window.__char3d, o = {};
      for (const j of js) {
        const t = C.snap(j.d, j.clip, j.f, { sex: j.sex, kind: j.kind, rest: !j.clip });
        const u8 = Uint8Array.from(t.data);
        let s = '';
        for (let q = 0; q < u8.length; q += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(q, q + 0x8000));
        o[j.id] = { w: t.w, h: t.h, calls: t.calls, b64: btoa(s) };
      }
      return o;
    }, jobs.slice(i, i + 64)));
  }
  for (const t of Object.values(out)) { t.buf = Buffer.from(t.b64, 'base64'); delete t.b64; }
  return out;
}

function cmp(A, B) {                   // U = 전·후 실루엣 합집합 · X = 실루엣이 갈린 화소 · C = RGBA 하나라도 다른 화소 · H = 둘 다 찬 화소의 색 차(최대 채널) 분포
  let U = 0, X = 0, C = 0, mx = 0;
  const H = new Array(256).fill(0);
  for (let i = 0; i < A.length; i += 4) {
    const a = A[i + 3] > 127, b = B[i + 3] > 127;
    if (!a && !b) continue;
    U++;
    if (a !== b) X++;
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(A[i + c] - B[i + c]));
    if (d > 0) C++;
    if (d > mx) mx = d;
    if (a && b && d > 0) H[d]++;
  }
  return { U, X, C, mx, H };
}
function hstat(H) {                    // 색만 다른 화소의 차(0~255) — 평균 · 가운데 · 90번째
  const n = H.reduce((x, y) => x + y, 0);
  if (!n) return { n: 0, mean: 0, med: 0, p90: 0 };
  let s = 0, acc = 0, med = null, p90 = null;
  for (let d = 1; d < 256; d++) { s += d * H[d]; acc += H[d]; if (med === null && acc >= n / 2) med = d; if (p90 === null && acc >= n * 0.9) p90 = d; }
  return { n, mean: +(s / n).toFixed(2), med, p90 };
}

function sizes(root) {
  const C3 = path.join(root, 'public', 'assets', 'char3d');
  const lock = JSON.parse(fs.readFileSync(path.join(C3, 'char3d.lock.json'), 'utf8'));
  const total = Object.keys(lock.char3d).reduce((a, f) => a + fs.statSync(path.join(C3, f)).size, 0);
  const b = fs.readFileSync(path.join(C3, 'char_body.glb')), jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const meshes = J.meshes.map((m) => { const p = m.primitives[0];
    return { name: m.name, verts: J.accessors[p.attributes.POSITION].count, tris: J.accessors[p.indices].count / 3, attrs: Object.keys(p.attributes) }; });
  return { glb: b.length, total, files: Object.keys(lock.char3d).length, meshes };
}

const png = (w, h, buf) => { const p = new PNG({ width: w, height: h }); buf.copy(p.data); return 'data:image/png;base64,' + PNG.sync.write(p).toString('base64'); };
function diffImg(A, B) {               // 같은 실루엣·같은 색 = 옅은 회색 · 색만 다름 = 노랑→빨강(차 × 8) · 실루엣이 갈림 = 자주
  const o = Buffer.alloc(A.length);
  for (let i = 0; i < A.length; i += 4) {
    const a = A[i + 3] > 127, b = B[i + 3] > 127;
    if (!a && !b) continue;
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(A[i + c] - B[i + c]));
    const px = a !== b ? [200, 0, 200] : d > 0 ? [255, Math.max(0, 230 - d * 8), 0] : [215, 215, 215];
    o[i] = px[0]; o[i + 1] = px[1]; o[i + 2] = px[2]; o[i + 3] = 255;
  }
  return o;
}

(async () => {
  const { chromium } = require('playwright');                       // 하네스와 같은 꼴(NODE_PATH)
  const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char3d', 'char3d_meta.json'), 'utf8'));
  const SEX = ['M', 'F'], KINDS = META.clothKinds, DIRS = [0, 1, 2, 3, 4, 5, 6, 7];
  const POSES = [{ g: 'rest', clip: null, f: 0 }, ...Object.entries(META.clips).flatMap(([c, m]) => Array.from({ length: m.frames }, (_, f) => ({ g: c, clip: c, f })))];
  const jobs1 = [];
  for (const sex of SEX) for (const kind of KINDS) for (const d of DIRS) for (const p of POSES) jobs1.push({ id: `${sex}|${kind}|${d}|${p.g}|${p.f}`, sex, kind, d, clip: p.clip, f: p.f, g: p.g });
  const FIGP = [{ g: 'rest', clip: null, f: 0 }, { g: 'walk', clip: 'walk', f: 2 }, { g: 'run', clip: 'run', f: 2 }];
  const jobs4 = [];
  for (const sex of SEX) for (const kind of ['fur', 'hemp']) for (const d of [1, 3]) for (const p of FIGP) jobs4.push({ id: `${sex}|${kind}|${d}|${p.g}|${p.f}`, sex, kind, d, clip: p.clip, f: p.f, g: p.g });

  const R = { before: BEFORE, after: ROOT };
  const shots = {}, size = {};
  const browser = await chromium.launch({ headless: true });
  let port = 3141;
  for (const [nm, root] of Object.entries(R)) {
    size[nm] = sizes(root);
    await bootCentral(root, ++port);
    const glb = nm === 'before' ? BGLB : null;
    const p1 = await openRoot(browser, port, root, 1, glb);
    const s1 = await snapAll(p1, jobs1);
    const p4 = await openRoot(browser, port, root, 4, glb);
    const s4 = await snapAll(p4, jobs4);
    shots[nm] = { s1, s4 };
    console.log(`[t654] ${nm}${glb ? ' (glb ' + glb + ')' : ''}: 게임 크기 ${Object.keys(s1).length}판 · ×4 ${Object.keys(s4).length}판 · 그리기 호출 ${[...new Set(Object.values(s1).map((t) => t.calls))].join('/')} · glb ${size[nm].glb}B · 합 ${size[nm].total}B`);
    await p1.close(); await p4.close();
  }

  // ── 표 — 몸 × 옷 × 자세 무리(쉼 · 클립) · 8방향 × 판 전부 합 ──
  const groups = ['rest', ...Object.keys(META.clips)];
  const T = {};
  const worst = [];
  for (const j of jobs1) {
    const a = shots.before.s1[j.id], b = shots.after.s1[j.id];
    const r = cmp(a.buf, b.buf);
    for (const key of [`${j.sex}|${j.kind}|${j.g}`, `${j.sex}|${j.kind}|all`, `*|${j.kind}|all`, `*|*|all`]) {
      const t = T[key] || (T[key] = { U: 0, X: 0, C: 0, mx: 0, n: 0, nChanged: 0, H: new Array(256).fill(0) });
      t.U += r.U; t.X += r.X; t.C += r.C; t.mx = Math.max(t.mx, r.mx); t.n++; if (r.C) t.nChanged++;
      for (let d = 1; d < 256; d++) t.H[d] += r.H[d];
    }
    if (r.C) worst.push({ id: j.id, pct: +(100 * r.C / r.U).toFixed(2), xor: +(100 * r.X / r.U).toFixed(2), C: r.C, X: r.X, U: r.U, mx: r.mx });
  }
  worst.sort((x, y) => y.pct - x.pct);
  const pct = (t) => (t.U ? +(100 * t.C / t.U).toFixed(3) : 0), xpct = (t) => (t.U ? +(100 * t.X / t.U).toFixed(3) : 0);
  console.log('\n[표] 게임 크기(109×90 · 한낮) — 바뀐 화소 % / 실루엣 차 % (8방향 × 판 전부 합) · 최대 채널 차');
  console.log('몸 · 옷 · ' + groups.join(' · ') + ' · 전부');
  for (const sex of SEX) for (const kind of KINDS) {
    console.log(`${sex} · ${kind} · ` + [...groups, 'all'].map((g) => { const t = T[`${sex}|${kind}|${g}`]; return `${pct(t)}/${xpct(t)}`; }).join(' · ') + ` · 최대 ${T[`${sex}|${kind}|all`].mx} · 바뀐 판 ${T[`${sex}|${kind}|all`].nChanged}/${T[`${sex}|${kind}|all`].n}`);
  }
  for (const kind of KINDS) { const t = T[`*|${kind}|all`], h = hstat(t.H); console.log(`옷 ${kind} 전부: ${pct(t)}% / ${xpct(t)}% · 화소 ${t.C}/${t.U} · 실루엣 ${t.X} · 최대 ${t.mx} · 색만 다른 화소 ${h.n}의 차 평균 ${h.mean} · 가운데 ${h.med} · 90번째 ${h.p90}(/255)`); }
  { const t = T['*|*|all']; console.log(`모두: ${pct(t)}% / ${xpct(t)}% · 화소 ${t.C}/${t.U} · 판 ${t.n}`); }
  console.log('가장 많이 바뀐 판 다섯: ' + worst.slice(0, 5).map((w) => `${w.id} ${w.pct}%(실루엣 ${w.xor}%)`).join(' · '));
  // ×4
  const T4 = {};
  for (const j of jobs4) {
    const r = cmp(shots.before.s4[j.id].buf, shots.after.s4[j.id].buf);
    T4[j.id] = { pct: r.U ? +(100 * r.C / r.U).toFixed(3) : 0, xor: r.U ? +(100 * r.X / r.U).toFixed(3) : 0, mx: r.mx, C: r.C, X: r.X, U: r.U };
  }
  console.log('\n[표] ×4 — ' + jobs4.map((j) => `${j.id} ${T4[j.id].pct}%/${T4[j.id].xor}%`).join(' · '));
  console.log(`\n[크기] glb ${size.before.glb} → ${size.after.glb}B · 합 ${size.before.total} → ${size.after.total}B · 메시 ${size.before.meshes.map((m) => `${m.name}(${m.verts}점)`).join(' ')} → ${size.after.meshes.map((m) => `${m.name}(${m.verts}점 · ${m.attrs.join(',')})`).join(' ')}`);

  const REC = { beforeGlb: BGLB || null, size, groups, table: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, { pct: pct(t), xor: xpct(t), C: t.C, X: t.X, U: t.U, mx: t.mx, n: t.n, nChanged: t.nChanged, dcol: hstat(t.H) }])),
                x4: T4, worst: worst.slice(0, 20), jobs: { game: jobs1.length, x4: jobs4.length } };
  if (OUTJSON) fs.writeFileSync(OUTJSON, JSON.stringify(REC, null, 1));

  if (OUTPNG) {                                                       // 그림 — 표 + ×4 전 · 후 · 차(같은 자세 · 같은 카메라) · 남 | 여 나란히
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const KN = { hemp: '삼베', ramie: '모시', leather: '가죽', fur: '갖옷' }, GN = { rest: '쉼', walk: '걷기', run: '달리기', idle2: '서기', swing2: '휘두르기', aim2: '겨누기', all: '전부' };
    // ×4 판은 몸 둘레만 — 그림 판 전부(전·후)의 찬 화소를 덮는 가장 작은 네모 + 한 칸
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W4 = shots.after.s4[jobs4[0].id].w;
    for (const nm of ['before', 'after']) for (const t of Object.values(shots[nm].s4)) for (let i = 3; i < t.buf.length; i += 4) if (t.buf[i]) {
      const q = (i - 3) / 4, x = q % W4, y = (q / W4) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W4 - 1, x1 + 1); y1 += 1;
    const crop = (t, buf) => { const w = x1 - x0 + 1, h = Math.min(t.h - 1, y1) - y0 + 1, o = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) buf.copy(o, y * w * 4, ((y + y0) * t.w + x0) * 4, ((y + y0) * t.w + x0 + w) * 4); return png(w, h, o); };
    const rows = [];
    for (const sex of SEX) for (const kind of KINDS) rows.push(`<tr><td>${sex === 'M' ? '남' : '여'}</td><td>${KN[kind]}</td>${[...groups, 'all'].map((g) => { const t = T[`${sex}|${kind}|${g}`]; return `<td class="${t.C ? 'nz' : ''}">${pct(t)} / ${xpct(t)}</td>`; }).join('')}<td>${hstat(T[`${sex}|${kind}|all`].H).mean} · ${hstat(T[`${sex}|${kind}|all`].H).med}</td></tr>`);
    const parts = (arg('parts') || '').split(',').filter(Boolean).map((kv) => { const [lab, f] = kv.split('='); return [lab, JSON.parse(fs.readFileSync(f, 'utf8'))]; });
    const prow = (lab, tb) => { const f = tb['*|fur|all'], al = tb['*|*|all']; return `<tr><td>${esc(lab)}</td><td>${f.pct} / ${f.xor}</td><td>${f.dcol.mean} · ${f.dcol.med}</td><td>${al.pct} / ${al.xor}</td></tr>`; };
    const ptab = parts.length ? `<h2>가르기 — 갖옷 화소 차는 어디서 오나(전 뿌리의 갖옷 몸에 본 옷 몸의 값을 넣고 다시 맞댐 · 게임 크기 전부)</h2><table><tr><th>전 판</th><th>갖옷 바뀐 % / 실루엣 %</th><th>색 차 평균 · 가운데</th><th>모두 % / 실루엣 %</th></tr>`
      + prow(LABEL, REC.table) + parts.map(([lab, j]) => prow(lab, j.table)).join('') + '</table>' : '';
    const cells = [];
    for (const d of [1, 3]) for (const p of FIGP) {
      const lab = `${d === 1 ? '앞(1)' : '옆(3)'} · ${GN[p.g]}${p.clip ? ' ' + p.f + '판' : ''}`;
      cells.push(`<div class="row"><div class="lab">갖옷 · ${lab}</div>${SEX.map((sex) => { const id = `${sex}|fur|${d}|${p.g}|${p.f}`, a = shots.before.s4[id], b = shots.after.s4[id];
        return `<div class="grp"><img src="${crop(a, a.buf)}"><img src="${crop(b, b.buf)}"><img src="${crop(a, diffImg(a.buf, b.buf))}"><div class="cap">${sex === 'M' ? '남' : '여'} 바뀐 ${T4[id].pct}% · 실루엣 ${T4[id].xor}%</div></div>`; }).join('')}</div>`);
    }
    cells.push(`<div class="row"><div class="lab">삼베 · 앞(1) · 쉼<br>(본 옷 셋 = 같은 메시 · 바이트 같은 기하)</div>${SEX.map((sex) => { const id = `${sex}|hemp|1|rest|0`, a = shots.before.s4[id], b = shots.after.s4[id];
      return `<div class="grp"><img src="${crop(a, a.buf)}"><img src="${crop(b, b.buf)}"><img src="${crop(a, diffImg(a.buf, b.buf))}"><div class="cap">${sex === 'M' ? '남' : '여'} 바뀐 ${T4[id].pct}%</div></div>`; }).join('')}</div>`);
    const S = size, mesh = (q) => q.meshes.map((m) => `${esc(m.name)} ${m.verts}점·${m.tris}삼각`).join(' · ');
    const cw = x1 - x0 + 1;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{font:13px/1.45 sans-serif;margin:14px;background:#fff;color:#222;width:${170 + 2 * (3 * (cw + 4) + 18)}px}h1{font-size:17px;margin:0 0 6px}h2{font-size:14px;margin:12px 0 5px}
      table{border-collapse:collapse;margin:3px 0}td,th{border:1px solid #bbb;padding:2px 6px;text-align:right}td:nth-child(-n+2){text-align:left}.nz{background:#fff2cc}
      .row{display:flex;align-items:flex-start;margin:3px 0}.grp{display:flex;flex-wrap:wrap;gap:2px;width:${3 * (cw + 4)}px;margin-right:18px}.grp img{border:1px solid #ddd}
      .cap{width:100%;font-size:11px;color:#555}.lab{width:160px;font-size:12px;padding-top:8px}.hd{display:flex;margin-left:160px;font-weight:bold;font-size:12px}
      .hd div{width:${3 * (cw + 4)}px;margin-right:18px;text-align:center}.num{font-family:monospace}</style>
      <h1>${esc(TITLE)}</h1>
      <div>전 = ${esc(NB)}(<span class="num">${mesh(S.before)}</span>)<br>후 = ${esc(NA)}(<span class="num">${mesh(S.after)}</span> · 사용자 속성 <span class="num">${esc([...new Set(S.after.meshes.flatMap((m) => m.attrs.filter((a) => a.startsWith('_'))))].join(' · ') || '없음')}</span>)</div>
      <div>glb <b class="num">${S.before.glb.toLocaleString()} → ${S.after.glb.toLocaleString()}B</b> · 합(glb·메타·무늬 ${S.after.files - 2}) <b class="num">${S.before.total.toLocaleString()} → ${S.after.total.toLocaleString()}B</b> · 그리는 길 = 각 뿌리의 <span class="num">client3d/char3d.js</span> 그대로(<span class="num">__char3d.snap</span> · 게임 투영 · 한낮 빛)</div>
      <h2>게임 크기(109×90) — 바뀐 화소 % / 실루엣 차 % · 8방향 × (쉼 + 클립 다섯 판 전부) 합 · 분모 = 전·후 실루엣 합집합</h2>
      <table><tr><th>몸</th><th>옷</th>${[...groups, 'all'].map((g) => `<th>${GN[g] || g}</th>`).join('')}<th>색 차 평균 · 가운데(/255)</th></tr>${rows.join('')}</table>${ptab}
      <h2>×4(같은 클라 · 같은 투영 · 몸 둘레만) — 전 · 후 · 차(회색 = 같음 · 노랑→빨강 = 색만 다름(차 × 8) · 자주 = 실루엣 갈림)</h2>
      <div class="hd"><div>남: 전(${esc(NB)}) · 후(${esc(NA)}) · 차</div><div>여: 전 · 후 · 차</div></div>${cells.join('')}`;
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.setContent(html);
    await page.screenshot({ path: OUTPNG, fullPage: true });
    await page.close();
    console.log(`[t654] 그림 ${OUTPNG}`);
  }
  await browser.close();
  cleanup();
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); cleanup(); process.exit(1); });
