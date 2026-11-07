#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-model-intake.js — 손으로 만든 3D 모델 받는 길 (T1194 · 손잡이 `T1194_MODEL_SPRITES` · 끔 기본) ===
//
// ★왜 [★재민 11-06 · 외부 협력자] 받는 규격 · 검사기 · 8방향 굽기 · 끔 손잡이까지. 블렌더 없이 도는 하네스라
//   굽기 그 자체는 안 돌린다 — **굽기가 남긴 산물**과 **글자**, 그리고 **클라 정본 함수**(잘라 와서 vm 에서)를 잰다.
//
//  ① 받는 규격이 한 곳 — 검사기 `SPEC` 의 수(25 MB · 2만 · 3만 · 2048)와 동작 이름 다섯 · 분류 일곱이 안내 README 와 같다
//  ② 검사기 — 항목 12 · 표 차례 = `ITEMS` 차례(코드가 단언) · 판정 셋(통과 · 빠짐 · 경고)
//  ③ 굽기 — 씬 값을 안 적는다(render_common 에서) · 붓은 사람 메타 `shape` 에서 · 가져오기 · 출처 읽기는 검사기 함수(사본 0)
//  ④ 산물 — 목록 → 메타(사람 `char_meta.json` 문법 · 같은 자) → 시트(크기 = 프레임 × 열 · 행 8 · 행마다 그림이 있다)
//  ⑤ 클라(vm) — 끔: 요청 0 · 점선 칸 그대로 / 켬: 시트가 뜨면 점선 칸 대신 그 행 · 발밑 = 그림자 가운데 · 체력 막대가 그림 위 /
//     시트 없는 종 · 메타가 깨진 종은 점선 칸(자명 통과 금지 — 손잡이를 뒤집으면 갈린다)
//  ⑥ 서버 — 손잡이를 읽는 자리 하나 · '1' 만 켬 · 끄면 칸이 없다
//  ⑦ 레포 — `assets-src/models` 아래 25 MB 넘는 파일 0(큰 원본은 레포 밖 `~/Mini/_3d_in/`)
// ★[T1210 · ★재민 11-07] 고라니 한 마리를 게임까지 — 동작 파일 넷을 한 뼈대에(`--anim`) · 걷기 · 뛰기 = 한 고리 · 걸음 재기(`model_gait.py`) ·
//   게임 칸 별칭(`--species` → 목록 `deer` 가 `water_deer/` 를 가리킨다) · 클라는 속도로 클립 · 간 거리로 판 · 주검은 쓰러짐 한 번 뒤 눕는다.
//  ③ 걸음 재기는 model_gait 한 벌 · ④ 고라니 메타(보폭 · 제 빠르기 · 미끄러짐 · 쓰러짐 길이 1.5 ~ 2초 · 몸 돌림)와 칸마다 그림 ·
//  ⑤ 끔 = 사슴 · 늑대 그리기가 종전(66bf163d)과 호출 · 속성 차례까지 같다(sha1) · 켬 = 클립 · 판 · 막대 · 이름 · 주검
// 실행: node scripts/test-model-intake.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

const CHECK = rd('scripts/model-check.py');
const RENDER = rd('scripts/model_render.py');
const GAIT = rd('scripts/model_gait.py');
const README = rd('assets-src/models/README.md');

console.log('① 받는 규격 — 한 곳');
const num = (k) => { const m = CHECK.match(new RegExp(`"${k}":\\s*([0-9.]+)`)); return m ? +m[1] : null; };
const SPEC = { mb: num('fileMbMax'), t: num('trisTarget'), tmax: num('trisMax'), tex: num('texMax') };
ok(SPEC.mb === 25 && SPEC.t === 20000 && SPEC.tmax === 30000 && SPEC.tex === 2048, '검사기 SPEC — 25 MB · 2만 · 3만 · 2048(카드의 수)', JSON.stringify(SPEC));
ok(README.includes(`${SPEC.mb} MB 밑`) && README.includes('삼각형 **2만 안팎**(3만 넘으면 다시)') && README.includes(`**${SPEC.tex} 이하**`), 'README 가 같은 수를 적는다(파일 · 면 · 텍스처)');
const acts = [...CHECK.matchAll(/^\s+"(\w+)":\s*\["\1"/gm)].map((m) => m[1]);
ok(acts.join(' ') === 'idle walk run eat die' && acts.every((a) => README.includes(`**${a}**`)), '동작 이름 다섯 — 검사기 표 = README', acts.join(' '));
const CLS = ['animals', 'buildings', 'props', 'items', 'nature', 'crops', 'char'];
ok(CLS.every((c) => README.includes('`' + c + '`')), '분류 일곱(public/assets 와 같은 이름)이 README 에 있다');
ok(/fork/i.test(README) && README.includes('Open pull request') && README.includes('기록에 영원히') && README.includes('assets-src/models/animals/wild_boar/'), 'README — fork → PR 순서 · 큰 파일 금지 까닭 · 예시 폴더');

console.log('\n② 검사기');
const items = (CHECK.match(/^ITEMS = \[(.*)\]$/m) || [])[1];
const IT = items ? [...items.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
ok(IT.length === 12, '항목 12', IT.join(' · '));
ok(CHECK.includes('assert [r["item"] for r in rows] == ITEMS'), '표 차례 = ITEMS 차례(코드가 단언 — 항목을 빼먹으면 검사기가 멈춘다)');
ok(['"통과"', '"빠짐"', '"경고"'].every((v) => CHECK.includes(v)) && !/"실패"/.test(CHECK), '판정 셋(통과 · 빠짐 · 경고)');

console.log('\n③ 굽기 — 사본 0');
const own = ['SAMPLES =', 'WORLD_BG', 'SUN_ENERGY', 'ZSQ =', 'NHAT =', 'RHAT =', 'UHAT =', 'world.node_tree', "'CYCLES'"];
ok(own.every((k) => !RENDER.includes(k)), '씬 값을 적지 않는다(샘플 · 월드 · 태양 · 압축 · 카메라 축은 render_common)', own.filter((k) => RENDER.includes(k)).join(' ') || '0');
ok(['rc.build_scene(', 'rc.SUN_WORLD', 'rc._post_png(', 'rc.post_all(', 'rc.save_png(', 'rc.read_pinned_box(', 'rc.fit_pinned_box(', 'rc.RHAT', 'rc.UHAT', 'rc.NHAT', 'rc.ZSQ'].every((k) => RENDER.includes(k)),
  '정본 함수 · 값을 부른다(씬 · 태양 · 되돌리기 · 붓 · 저장 · 상자 못박기 · 카메라 축)');
ok(RENDER.includes('"char_meta.json"') && RENDER.includes('_char["shape"][k] for k in ("inkPx", "celBands", "edgeA", "edgeK")'), '붓(먹선 · 셀 · 가장자리)은 사람 메타 shape 에서 읽는다');
ok(['mc.import_model(', 'mc.read_source_txt(', 'mc.parse_front(', 'mc.parse_size(', 'mc.action_names(', 'mc.ACTIONS', 'mc.md5('].every((k) => RENDER.includes(k)) && !/def import_model|def read_source_txt/.test(RENDER),
  '가져오기 · 출처 읽기 · 동작 이름표는 검사기 함수(두 벌 없음)');
ok(['mg.cycle(', 'mg.loop_gait(', 'mg.heading(', 'mg.set_time(', 'mg.span(', 'mg.LOCO'].every((k) => RENDER.includes(k)) && !/def (cycle|loop_gait|heading|set_time|span|feet)\b/.test(RENDER),
  '[T1210] 걸음 재기(고리 · 보폭 · 몸 방향 · 판의 때)는 model_gait 함수(두 벌 없음)');
const loco = ((GAIT.match(/^LOCO = \(([^)]*)\)/m) || [])[1] || '').match(/"(\w+)"/g) || [];
ok(loco.join(' ') === '"walk" "run"' && loco.every((k) => acts.includes(k.replace(/"/g, ''))) && /^FOOT_TOL = /m.test(GAIT) && /^STANCE_K = /m.test(GAIT),
  '[T1210] 걸음 동작 = 걷기 · 뛰기(검사기 이름표의 키) · 발 · 디딤 문턱이 그 파일 머리에 한 번', loco.join(' '));

console.log('\n④ 산물 — 목록 · 메타 · 시트');
const A = path.join(ROOT, 'public', 'assets', 'animals');
const idx = JSON.parse(fs.readFileSync(path.join(A, 'index.json'), 'utf8'));
const species = Object.keys(idx).filter((k) => k !== '_');
ok(species.includes('wild_boar') && species.every((k) => fs.existsSync(path.join(A, idx[k]))), '목록 → 메타가 다 있다', species.join(' '));
const ANIM = require(path.join(ROOT, 'public', 'animals.js')).ANIMALS;
ok(species.every((k) => ANIM[k]), '종 키 = 게임 짐승 표(`public/animals.js`)의 키');
const CM = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'char_meta.json'), 'utf8'));
const pngSize = (p) => { const b = fs.readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
for (const k of species) {
  const m = JSON.parse(fs.readFileSync(path.join(A, idx[k]), 'utf8'));
  const keys = ['frameW', 'frameH', 'anchorX', 'anchorY', 'ppu', 'renderPpu', 'zsq', 'pxPerMeterH', 'dirs', 'dirOrder', 'rowOrder', 'clips', 'layers', 'sheets', 'ss'];
  ok(keys.every((x) => x in m) && keys.every((x) => x in CM), `${k} — 사람 메타 문법(칸 ${keys.length})`);
  ok(m.ppu === CM.ppu && m.zsq === CM.zsq && m.pxPerMeterH === CM.pxPerMeterH && m.ss === CM.ss && m.dirs === CM.dirs && m.dirOrder === CM.dirOrder && m.rowOrder === CM.rowOrder,
    `${k} — 같은 자(px/m ${m.ppu} · 높이 1m = ${m.pxPerMeterH}px · 8방향 · 행/열 차례)`);
  ok(JSON.stringify(m.shape && { inkPx: m.shape.inkPx, celBands: m.shape.celBands, edgeA: m.shape.edgeA, edgeK: m.shape.edgeK }) === JSON.stringify({ inkPx: CM.shape.inkPx, celBands: CM.shape.celBands, edgeA: CM.shape.edgeA, edgeK: CM.shape.edgeK }), `${k} — 붓 = 사람 시트 붓`);
  ok(m.anchorX > 0 && m.anchorX < m.frameW && m.anchorY > 0 && m.anchorY <= m.frameH && m.heightM * m.pxPerMeterH <= m.frameH, `${k} — 앵커가 프레임 안 · 키(${m.heightM}m × ${m.pxPerMeterH}) ≤ 프레임 높이 ${m.frameH}`);
  const dir = path.dirname(path.join(A, idx[k]));
  for (const [sk, s] of Object.entries(m.sheets)) {
    const f = path.join(dir, sk + '.png');
    const [w, h] = fs.existsSync(f) ? pngSize(f) : [0, 0];
    ok(w === m.frameW * s.cols && h === m.frameH * s.rows && s.rows === 8 && s.w === w && s.h === h && m.clips[s.clip] && m.clips[s.clip].frames === s.cols,
      `${k}/${sk}.png — ${w}×${h} = 프레임 ${m.frameW}×${m.frameH} × 열 ${s.cols} · 행 ${s.rows}`);
  }
  ok(m.source && /^[0-9a-f]{32}$/.test(m.source.md5) && m.source.front && m.source.sizeSrc, `${k} — 원본 지문(md5 ${m.source && m.source.md5.slice(0, 8)}) · 앞 ${m.source && m.source.front} · 크기 근거 적힘`);
}
// 행마다 그림이 있다 — PNG 를 풀어서(pngjs) 행마다 불투명 화소를 센다
try {
  const { PNG } = require('pngjs');
  const m = JSON.parse(fs.readFileSync(path.join(A, idx.wild_boar), 'utf8'));
  const png = PNG.sync.read(fs.readFileSync(path.join(A, 'wild_boar', 'body_idle.png')));
  const rows = [];
  for (let d = 0; d < 8; d++) { let n = 0; for (let y = d * m.frameH; y < (d + 1) * m.frameH; y++) for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3] > 128) n++; rows.push(n); }
  ok(rows.every((n) => n > 200), '멧돼지 시트 — 여덟 행 다 그림이 있다(불투명 화소 > 200)', rows.join(' '));
  const mid = rows.slice().sort((a, b) => a - b);
  ok(mid[7] / mid[0] < 3, '여덟 행의 그림 크기가 한 짐승이다(가장 큰 ÷ 가장 작은 < 3 — 옆모습 · 앞모습 차만)', (mid[7] / mid[0]).toFixed(2));
} catch (e) { ok(false, '시트 풀기', e.message); }
// [T1210] 고라니 — 게임 칸 별칭 · 걸음 값 · 쓰러짐 길이 · 칸마다 그림
{
  ok(idx.deer === 'water_deer/water_deer_meta.json' && !('water_deer' in idx), '[T1210] 목록 — 게임 칸 deer → 고라니 폴더(water_deer 는 게임 키가 아니라 목록에 없다)', idx.deer);
  const m = JSON.parse(fs.readFileSync(path.join(A, idx.deer), 'utf8'));
  ok(m.species === 'deer' && m.source && m.source.anims && ['idle', 'walk', 'run', 'die'].every((k) => m.source.anims[k] && /^[0-9a-f]{32}$/.test(m.source.anims[k].md5)),
    '[T1210] 고라니 메타 — 칸 deer · 동작 파일 넷의 지문(md5)', Object.keys((m.source && m.source.anims) || {}).join(' '));
  const W = m.clips.walk, R = m.clips.run, Dc = m.clips.die, I = m.clips.idle;
  const feet4 = (c) => c && c.slipCm && Object.keys(c.slipCm).length === 4 && Object.values(c.slipCm).every((v) => v >= 0);
  ok(W && R && W.loop && R.loop && W.strideM > 0 && R.strideM > W.strideM && W.speedMps > 0 && R.speedMps > W.speedMps && feet4(W) && feet4(R) && W.cycle && R.cycle && W.durS === W.cycle.periodS && R.durS === R.cycle.periodS,
    '[T1210] 걷기 · 뛰기 = 한 고리(길이 = 주기) · 보폭 · 제 빠르기(뛰기 > 걷기) · 발 넷의 미끄러짐', W && R ? `보폭 ${W.strideM} · ${R.strideM} m · ${W.speedMps} · ${R.speedMps} m/s` : '');
  ok(Dc && !Dc.loop && Dc.durS >= 1.5 && Dc.durS <= 2.0 && Dc.face && Dc.face.bones.length === 2 && Math.abs(Dc.fps - (Dc.frames - 1) / Dc.durS) < 1e-3,
    '[T1210] 쓰러짐 — 한 번 · 1.5 ~ 2초(카드) · 첫 판 몸 돌림 · fps = (판 − 1) ÷ 길이(마지막 판이 끝에 선다)', Dc ? `${Dc.durS}초 · ${Dc.frames}판 · 구간 ${JSON.stringify(Dc.srcS)}` : '');
  ok(I && I.loop && I.frames === 4, '[T1210] 서기 — 고리 4판(사람 시트와 같은 수)');
  try {
    const { PNG } = require('pngjs');
    const bad = [];
    for (const [sk, s] of Object.entries(m.sheets)) {
      const png = PNG.sync.read(fs.readFileSync(path.join(A, 'water_deer', sk + '.png')));
      const cells = [];
      for (let d = 0; d < 8; d++) for (let f = 0; f < s.cols; f++) {
        let n = 0;
        for (let y = d * m.frameH; y < (d + 1) * m.frameH; y++) for (let x = f * m.frameW; x < (f + 1) * m.frameW; x++) if (png.data[(y * png.width + x) * 4 + 3] > 128) n++;
        cells.push(n);
      }
      const lo = Math.min(...cells), hi = Math.max(...cells);
      if (!(lo > 0 && hi / lo < 3)) bad.push(`${sk} ${lo}~${hi}`);
    }
    ok(bad.length === 0, '[T1210] 고라니 시트 넷 — 칸(방향 × 판)마다 그림이 있고 한 클립 안 크기가 한 짐승(가장 큰 ÷ 가장 작은 < 3)', bad.join(' · ') || Object.keys(m.sheets).join(' '));
  } catch (e) { ok(false, '고라니 시트 풀기', e.message); }
}

console.log('\n⑤ 클라(정본 함수를 잘라 vm 에서)');
const S40 = rd('public/client/40-r2-sprites.js'), S42 = rd('public/client/42-r2-char.js');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('표식 없음: ' + a); return src.slice(i, j); };
const BLOCK = cut(S40, '  // ═══ ★[T1194 모델 시트]', '  // ═══ ★[T1194] 끝 ═══');
const MOB = cut(S40, '  function drawMobIso(x, y, mob) {', '  // Phase 5-8: 입체 나무');
const DIR = cut(S42, '  function charDirRow(fx, fy) {', '\n  }\n') + '\n  }\n';
function world(knob, files, opt) {
  const calls = [], fetched = [], clock = { t: 1000 };
  const sets = !!(opt && opt.sets);   // [T1210] 속성 쓰기도 차례에 적는다(끔 = 종전 바이트 대조용)
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? (...a) => { calls.push([k, ...a]); } : undefined)), set: (t, k, v) => { if (sets) calls.push(['=' + String(k), v]); else t[k] = v; return true; } });
  const sandbox = {
    ctx, uiCfg: Object.assign({ modelSprites: knob }, (opt && opt.ui) || {}), Math, JSON, console, Promise, performance: { now: () => clock.t },
    window: { Animals: { ANIMALS: ANIM } },
    fetch: (u) => { fetched.push(u); const f = files[u]; return Promise.resolve({ ok: !!f, json: () => Promise.resolve(f ? JSON.parse(JSON.stringify(f)) : null) }); },
    Image: function () { const self = this; Object.defineProperty(this, 'src', { set(v) { self._src = v; Promise.resolve().then(() => self.onload && self.onload()); }, get() { return self._src; } }); },
  };
  vm.createContext(sandbox);
  vm.runInContext(DIR + '\n' + BLOCK + '\n' + MOB + '\nthis.drawMobIso = drawMobIso; this.charDirRow = charDirRow; this.drawModelCorpse = drawModelCorpse;', sandbox);
  return { sb: sandbox, calls, fetched, clock };
}
const META = JSON.parse(fs.readFileSync(path.join(A, idx.wild_boar), 'utf8'));
const FILES = { '/assets/animals/index.json': idx, ['/assets/animals/' + idx.wild_boar]: META };
const settle = () => new Promise((r) => setTimeout(r, 0));
(async () => {
  {
    const W = world(undefined, FILES);
    W.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });
    await settle(); await settle();
    W.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });
    ok(W.fetched.length === 0 && W.calls.filter((c) => c[0] === 'strokeRect').length === 2 && !W.calls.some((c) => c[0] === 'drawImage'), '끔(칸 없음) — 요청 0 · 두 판 다 점선 칸 · 그림 0', `요청 ${W.fetched.length}`);
  }
  {
    const W = world(true, FILES);
    const facings = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    W.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });   // 판 1 — 목록을 부른다
    for (let i = 0; i < 6; i++) await settle();
    W.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });   // 판 2 — 그 종 메타 · 시트를 부른다
    const first = W.calls.filter((c) => c[0] === 'strokeRect').length;
    for (let i = 0; i < 6; i++) await settle();
    W.calls.length = 0;
    const got = [];
    for (const [fx, fy] of facings) {
      W.sb.drawMobIso(200, 150, { mid: 2, type: 'wild_boar', _fvx: fx, _fvy: fy, hp: 60, maxHp: 60 });
      const di = W.calls.filter((c) => c[0] === 'drawImage').pop();
      got.push(di ? di[3] / META.frameH : null);
    }
    const sz = 1.0;   // 'medium' — 그 함수의 같은 표(아래 자명 통과 금지 판이 다른 크기로 잰다)
    const di = W.calls.filter((c) => c[0] === 'drawImage')[0];
    ok(first === 2, '켬 · 첫 두 판(목록 → 메타 · 시트가 아직 안 뜸) — 점선 칸으로 버틴다', `점선 ${first}`);
    ok(got.join(',') === '0,1,2,3,4,5,6,7' && got.every((r, i) => r === W.sb.charDirRow(...facings[i])), '켬 · 뜬 뒤 — 방향 여덟이 시트 행 0 ~ 7(사람과 같은 함수 `charDirRow`)', got.join(' '));
    ok(di && di[2] === 0 && di[4] === META.frameW && di[5] === META.frameH && di[6] === Math.round(200 - META.anchorX) && di[7] === Math.round(150 + 6 * sz - META.anchorY),
      '그리는 자리 — 발밑 앵커 = 그림자 가운데(x, y + 6 · sz) · 프레임 크기는 메타', di ? `(${di[6]}, ${di[7]})` : '');
    ok(!W.calls.some((c) => c[0] === 'strokeRect'), '켬 · 뜬 뒤 — 점선 칸 0');
    W.calls.length = 0;
    W.sb.drawMobIso(200, 150, { mid: 3, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 20, maxHp: 60 });
    const bar = W.calls.filter((c) => c[0] === 'fillRect')[0];
    const top = Math.round(150 + 6 * sz - META.anchorY);
    ok(bar && bar[2] === Math.min(150 - 18 * sz, top - 3), '다친 짐승 — 체력 막대가 그림 머리 위(막대 높이 3 만큼)', bar ? `y ${bar[2]} · 그림 위 ${top}` : '');
    W.calls.length = 0;
    W.sb.drawMobIso(200, 150, { mid: 4, type: 'cow', _fvx: 1, _fvy: 0, hp: 1, maxHp: 1 });
    for (let i = 0; i < 4; i++) await settle();
    W.sb.drawMobIso(200, 150, { mid: 4, type: 'cow', _fvx: 1, _fvy: 0, hp: 1, maxHp: 1 });
    ok(W.calls.filter((c) => c[0] === 'strokeRect').length === 2 && !W.calls.some((c) => c[0] === 'drawImage'), '켬 · 시트 없는 종(소) — 점선 칸 그대로');
  }
  {
    // 자명 통과 금지 — 메타가 깨지면(프레임 칸 없음) 그림을 안 그린다 · 큰 짐승(크기 다른 판)의 발밑도 같은 식이다
    const bad = JSON.parse(JSON.stringify(META)); delete bad.frameW;
    const W = world(true, { '/assets/animals/index.json': idx, ['/assets/animals/' + idx.wild_boar]: bad });
    for (let k = 0; k < 3; k++) { W.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 }); for (let i = 0; i < 6; i++) await settle(); }
    ok(!W.calls.some((c) => c[0] === 'drawImage') && W.calls.filter((c) => c[0] === 'strokeRect').length === 3, '자명 통과 금지 — 메타가 깨지면 그림 0 · 점선 칸(같은 판에서 손잡이만 켰는데 갈린다)');
    const ANIM2 = JSON.parse(JSON.stringify(ANIM)); ANIM2.wild_boar.size = 'large';
    const W2 = world(true, FILES); W2.sb.window.Animals.ANIMALS = ANIM2;
    for (let k = 0; k < 2; k++) { W2.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 }); for (let i = 0; i < 6; i++) await settle(); }
    W2.calls.length = 0;
    W2.sb.drawMobIso(100, 100, { mid: 1, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });
    const di2 = W2.calls.filter((c) => c[0] === 'drawImage')[0];
    ok(di2 && di2[7] === Math.round(100 + 6 * 1.3 - META.anchorY), '크기 표가 다른 종(large 1.3)도 발밑 = 그 그림자 가운데', di2 ? `y ${di2[7]}` : '');
  }

  // ═══ [T1210] 고라니 — 사슴 칸(옛 도형 갈래) ═══
  const DM = JSON.parse(fs.readFileSync(path.join(A, idx.deer), 'utf8'));
  const DFILES = { '/assets/animals/index.json': idx, ['/assets/animals/' + idx.deer]: DM };
  const MOBS4 = [
    { mid: 1, type: 'deer', _fvx: 1, _fvy: 0, hp: 30, maxHp: 30 },
    { mid: 2, type: 'deer', _fvx: -1, _fvy: 1, hp: 12, maxHp: 30, vx: -40, vy: 40 },
    { mid: 3, type: 'deer', _fvx: 0, _fvy: -1, hp: 30, maxHp: 30, tameOwner: 'p1', tameOwnerName: '재민' },
    { mid: 4, type: 'wolf', _fvx: 1, _fvy: 1, hp: 5, maxHp: 20 },
  ];
  const sha = (x) => require('crypto').createHash('sha1').update(JSON.stringify(x)).digest('hex');
  const draw4 = (W) => MOBS4.map((mb) => { const n0 = W.calls.length; W.sb.drawMobIso(100, 100, JSON.parse(JSON.stringify(mb))); return W.calls.slice(n0); });
  {
    // 끔 = 종전 바이트 — 66bf163d 의 drawMobIso(사슴 · 늑대 갈래)가 그리던 호출 · 속성 쓰기 차례(네 판 30 · 34 · 30 · 26)의 sha1
    const OLD = '1d560ddace373c96880d414301b6eb54a532ed56';
    const W0 = world(undefined, DFILES, { sets: true });
    const off = draw4(W0);
    ok(sha(off) === OLD && W0.fetched.length === 0, '[T1210] 끔 — 사슴 · 늑대 그리기가 종전(66bf163d)과 호출 · 속성 차례까지 같다 · 요청 0', `${off.map((l) => l.length).join(' · ')} · ${sha(off).slice(0, 8)}`);
    const W1 = world(true, DFILES, { sets: true });
    const on0 = draw4(W1);
    ok(sha(on0) === OLD && W1.fetched.includes('/assets/animals/index.json'), '[T1210] 켬 · 시트가 아직 안 뜸 — 그리기는 끔과 같다(도형으로 버틴다) · 목록을 부른다', sha(on0).slice(0, 8));
    for (let k = 0; k < 3; k++) { W1.sb.drawMobIso(100, 100, { mid: 9, type: 'deer', _fvx: 1, _fvy: 0, hp: 30, maxHp: 30 }); for (let i = 0; i < 6; i++) await settle(); }
    W1.calls.length = 0;
    const on1 = draw4(W1);
    ok(sha(on1) !== OLD && on1[0].some((c) => c[0] === 'drawImage') && !on1[3].some((c) => c[0] === 'drawImage') && sha(on1[3]) === sha(off[3]),
      '[T1210] 자명 통과 금지 — 시트가 뜨면 사슴은 그림(같은 판 · 손잡이만 다르다) · 시트 없는 늑대는 종전 그대로');
  }
  {
    const W = world(true, DFILES);
    const mob = (o) => Object.assign({ mid: 5, type: 'deer', _fvx: 1, _fvy: 0, hp: 30, maxHp: 30, vx: 0, vy: 0, x: 3200, y: 3200 }, o);
    for (let k = 0; k < 3; k++) { W.sb.drawMobIso(200, 150, mob()); for (let i = 0; i < 6; i++) await settle(); }
    const last = () => W.calls.filter((c) => c[0] === 'drawImage').pop();
    const fw = DM.frameW, fh = DM.frameH, C = DM.clips;
    // 서기 — 시간으로(fps): 0 판 → 1/fps 초 뒤 1 판(화면은 한 판 60분의 1초씩 — 막이 0.25초는 사람 시트 그대로)
    W.sb.drawMobIso(200, 150, mob({ mid: 6 })); const i0 = last();
    const tEnd = W.clock.t + 1000 / C.idle.fps + 1;
    while (W.clock.t < tEnd) { W.clock.t = Math.min(tEnd, W.clock.t + 1000 / 60); W.sb.drawMobIso(200, 150, mob({ mid: 6 })); }
    const i1 = last();
    ok(i0 && i1 && i0[1] && i0[1]._src.endsWith('/body_idle.png') && i0[2] === 0 && i1[2] === fw && i0[3] === 0,
      '[T1210] 서 있는 고라니(속도 0) — 서기 시트 · 시간으로 판이 넘어간다(1 ÷ fps 초에 한 판)', i1 ? `열 ${i0[2] / fw} → ${i1[2] / fw}` : '');
    // 걷기 — 간 거리로: dt 0.1 초 · 40 px/s(1.25 m/s · 평시 풀뜯기 걸음 0.22 ~ 0.5 × 5 m/s 안) → 판 = ⌊(1.25 × 0.1 ÷ 보폭) × 판 수⌋
    const sp = 40, dt = 0.1;
    W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp })); W.clock.t += dt * 1000; W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp })); const w1 = last();
    const want = Math.floor(((sp / 32) * dt / C.walk.strideM) * C.walk.frames) % C.walk.frames;
    ok(w1 && w1[1]._src.endsWith('/body_walk.png') && w1[2] === want * fw, '[T1210] 걷는 고라니 — 걷기 시트 · 판은 간 거리 ÷ 보폭(시간이 아니라)', w1 ? `${sp} px/s · ${dt}초 → 판 ${w1[2] / fw}(식 ${want})` : '');
    W.clock.t += dt * 1000; W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp * 2 })); const w2 = last();
    const want2 = Math.floor((((sp / 32) * dt + (sp * 2 / 32) * dt) / C.walk.strideM) * C.walk.frames) % C.walk.frames;
    ok(w2 && w2[2] === want2 * fw, '[T1210] 두 배 빠르면 두 배 돈다(같은 dt · 걸음 두 배 — 발이 안 끌린다)', w2 ? `판 ${w2[2] / fw}(식 ${want2})` : '');
    // 뛰기 · 문턱 — 사람과 같은 charRunMin(102 px/s): 102 = 걷기 · 103 = 뛰기 · 서버가 문턱을 주면 그것
    W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 102 })); const r0 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 103 })); const r1 = last();
    W.sb.uiCfg.charRunMin = 150; W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 120 })); const r2 = last(); delete W.sb.uiCfg.charRunMin;
    ok(r0[1]._src.endsWith('/body_walk.png') && r1[1]._src.endsWith('/body_run.png') && r2[1]._src.endsWith('/body_walk.png'),
      '[T1210] 클립 문턱 = 사람 시트의 것(charRunMin 102 · 서버 값이 오면 그 값) — 새 수 0');
    // 그리는 자리 · 막대 · 이름 — 발밑 = 옛 그림자 가운데(x, y + 5) · 막대 = 그림 머리 위 3 · 이름 = 막대 4 위
    W.calls.length = 0;
    W.sb.drawMobIso(200, 150, mob({ mid: 10, hp: 10 }));
    const di = W.calls.find((c) => c[0] === 'drawImage'), top = Math.round(155 - DM.anchorY);
    const bar = W.calls.find((c) => c[0] === 'fillRect'), lab = W.calls.find((c) => c[0] === 'fillText');
    const hy = Math.min(150 - 16, top - 3);
    ok(di && di[6] === Math.round(200 - DM.anchorX) && di[7] === top && di[4] === fw && di[5] === fh && bar && bar[2] === hy && lab && lab[3] === hy - 4 && !W.calls.some((c) => c[0] === 'arc'),
      '[T1210] 발밑 = 옛 그림자 가운데(x, y + 5) · 막대 = 그림 머리 위 · 이름 = 막대 4 위 · 도형 머리(arc) 0', di ? `그림 (${di[6]}, ${di[7]}) · 막대 y ${bar && bar[2]} · 이름 y ${lab && lab[3]}` : '');
    // 방향 — 여덟 방향이 행 0 ~ 7(사람과 같은 함수)
    const facings = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], rows = [];
    for (const [fx, fy] of facings) { W.sb.drawMobIso(200, 150, mob({ mid: 11, _fvx: fx, _fvy: fy })); rows.push(last()[3] / fh); }
    ok(rows.join(',') === '0,1,2,3,4,5,6,7', '[T1210] 고라니 방향 여덟 = 시트 행 0 ~ 7(charDirRow)', rows.join(' '));
    // 주검 — 방금 사라진 같은 종의 방향으로 쓰러짐 한 번 · 마지막 판에 눕는다 / 모르는 주검 = 처음부터 누운 판 0행 / 쓰러짐 없는 종 = '×'
    const R = DM.lengthM * 32;   // 한 몸길이(px)
    W.sb.drawMobIso(200, 150, mob({ mid: 12, _fvx: -1, _fvy: 0, x: 4000, y: 4000 }));            // 쓰러진 몸 — 행 4(서쪽)
    W.sb.drawMobIso(200, 150, mob({ mid: 13, _fvx: 0, _fvy: 1, x: 4000 + R * 0.9, y: 4000 }));   // 무리 이웃 — 한 몸길이 안이지만 더 멀다
    W.calls.length = 0;
    const co = { cid: 'c1', mobType: 'deer', x: 4000 + R * 0.25, y: 4000 };
    const got = [];
    for (let i = 0; i <= C.die.frames + 1; i++) { W.sb.drawModelCorpse(300, 200, co); got.push(last()); W.clock.t += 1000 / C.die.fps; }
    const cols = got.map((g) => g[2] / fw), crow = got[0][3] / fh;
    ok(got.every((g) => g[1]._src.endsWith('/body_die.png')) && crow === 4 && cols.slice(0, C.die.frames).join(',') === [...Array(C.die.frames).keys()].join(',') && cols[C.die.frames] === C.die.frames - 1 && cols[C.die.frames + 1] === C.die.frames - 1,
      '[T1210] 주검 — 한 몸길이 안 가장 가까운 같은 종(쓰러진 그 몸)의 방향 · 쓰러짐 판 0 → 끝 · 그 뒤 마지막 판에 눕는다', `행 ${crow} · 판 ${cols.join(' ')}`);
    const e1 = W.calls.find((c) => c[0] === 'ellipse');
    ok(e1 && e1[1] === 300 && e1[2] === 205 && got[0][7] === Math.round(205 - DM.anchorY), '[T1210] 주검 그림 = 산 몸과 같은 그림자 · 같은 발밑(y + 5)');
    W.sb.drawModelCorpse(300, 200, { cid: 'c2', mobType: 'deer', x: 4000 + R * 0.9 + R * 1.01, y: 4000 });   // 이웃(13)에서 한 몸길이 밖 · 쓰러진 몸(12)은 이미 c1 이 가져갔다
    const old = last();
    ok(old[2] === (C.die.frames - 1) * fw && old[3] === 0, '[T1210] 한 몸길이 안에 그려진 몸이 없는 주검(들어오기 전에 죽은 것) — 처음부터 누운 판 · 0행', `열 ${old[2] / fw} · 행 ${old[3] / fh}`);
    W.sb.drawModelCorpse(300, 200, { cid: 'c4', mobType: 'deer', x: 4000 + R * 0.9, y: 4000 + R * 0.5 });
    const nb = last();
    ok(nb[2] === 0 && nb[3] / fh === W.sb.charDirRow(0, 1), '[T1210] (자명 통과 금지) 한 몸길이 안에 몸이 있으면 그 방향으로 쓰러짐 0 판부터 — 위 판과 거리만 다르다', `열 ${nb[2] / fw} · 행 ${nb[3] / fh}`);
    ok(W.sb.drawModelCorpse(300, 200, { cid: 'c3', mobType: 'wild_boar', x: 1, y: 1 }) === false, "[T1210] 쓰러짐 없는 종(멧돼지) — 주검은 그리지 않는다(부르는 쪽 '×')");
  }
  {
    const RL = rd('public/client/34-m-renderloop.js');
    ok(/if \(!\(uiCfg\.modelSprites && drawModelCorpse\(s\.x, s\.y, item\.co\)\)\) \{\n\s+ctx\.font = '24px sans-serif';\n\s+ctx\.textAlign = 'center';\n\s+ctx\.textBaseline = 'middle';\n\s+ctx\.fillText\('×', s\.x, s\.y\);\n\s+\}/.test(RL),
      "[T1210] 주검 자리 — 손잡이가 꺼지면(또는 시트가 없으면) '×' 그 줄 그대로 · 켜고 쓰러짐이 있으면 그림");
  }

  console.log('\n⑥ 서버 손잡이');
  const Z = rd('server/zone.js');
  const reads = Z.split('process.env.T1194_MODEL_SPRITES').length - 1;
  ok(reads === 1 && Z.includes("...(process.env.T1194_MODEL_SPRITES === '1' ? { modelSprites: true } : {})"), "읽는 자리 하나 · '1' 만 켬 · 끄면 칸이 없다(welcome 바이트 동일)", `${reads}곳`);

  console.log('\n⑦ 레포 — 큰 파일 0');
  let big = [];
  try {
    const ls = execFileSync('git', ['ls-files', '-z', 'assets-src/models'], { cwd: ROOT }).toString().split('\0').filter(Boolean);
    big = ls.filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > SPEC.mb * 1e6);
    ok(ls.includes('assets-src/models/README.md') && big.length === 0, `assets-src/models 아래 ${SPEC.mb} MB 넘는 파일 0(무거운 원본은 레포 밖)`, `파일 ${ls.length}`);
  } catch (e) { ok(false, 'git ls-files', e.message); }

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
