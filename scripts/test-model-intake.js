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
// ★[T1237 · ★재민 11-09 "새 종"] 고라니 = 제 종 — 목록 별칭 `deer` 를 뺐다(사슴 자리는 사슴 그림) · 시트 여섯(서기 · 걷기 8 · 뛰기 4 · 풀 뜯기 · 쓰러짐 키 1.2초 · 엎드림) ·
//   클라 손잡이 둘(`modelSprites` 미리보기 · `waterDeer` 고라니만 — `modelSpriteOn`) · 몸짓 칸 `ps`(1 엎드림 · 2 풀 뜯기 — 뛸 땐 안 바꾼다) ·
//   그림자 = 몸 크기 메타(발자국 타원을 행 방향으로 돌려 아이소에 — 무차별 대입과 견줌 · 주검도 같은 식)
//  ④ 고라니 목록 · 메타(클립 여섯 · 키 쓰러짐 1 ~ 1.5초 · 3.4 ~ 5.7초 키 0 · 뜯기 꺾음 · 엎드림) · 칸마다 그림 · webp 쌍 화소 같음
//  ⑤ 카탈로그 갈래(고라니) — 켬 = 클립 · 몸짓 · 그림자 · 막대 · 방향 · 주검 · 끔 = 사슴 · 늑대 종전 sha 그대로(손잡이 둘 다)
// ★[T1242 · ★재민 11-09 "0.9 m"] 고라니 다시 굽기 — 앞 축 0.9 m(머리–몸 0.857 · 한국아종 85 ~ 115 cm 아래 끝 안) · ④ 크기 한 줄(길이 · 키 · 폭 · 보폭이 한 배)
// 실행: node scripts/test-model-intake.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
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
// [T1210] 고라니 — 걸음 값 · 칸마다 그림 · ★[T1237 · ★재민 11-09 "새 종"] 제 칸(water_deer) · 키 쓰러짐 1 ~ 1.5초 · 풀 뜯기 · 엎드림 · 뛰기 판 수 · webp 쌍둥이
{
  ok(idx.water_deer === 'water_deer/water_deer_meta.json' && !('deer' in idx), '[T1237] 목록 — 고라니는 제 칸 water_deer(사슴 칸 별칭 없음 — 사슴 자리는 옛 도형 그대로)', JSON.stringify(Object.keys(idx)));
  const m = JSON.parse(fs.readFileSync(path.join(A, idx.water_deer), 'utf8'));
  const SIX = ['idle', 'walk', 'run', 'eat', 'die', 'lie'];
  ok(!m.species && m.source && m.source.anims && SIX.every((k) => m.source.anims[k] && /^[0-9a-f]{32}$/.test(m.source.anims[k].md5)),
    '[T1237] 고라니 메타 — 게임 칸 = 폴더 이름(별칭 칸 없음) · 클립 여섯의 원천 동작 파일 지문(md5)', Object.keys((m.source && m.source.anims) || {}).join(' '));
  const W = m.clips.walk, R = m.clips.run, Dc = m.clips.die, I = m.clips.idle, E = m.clips.eat, L = m.clips.lie;
  const feet4 = (c) => c && c.slipCm && Object.keys(c.slipCm).length === 4 && Object.values(c.slipCm).every((v) => v >= 0);
  ok(W && R && W.loop && R.loop && W.strideM > 0 && R.strideM > W.strideM && W.speedMps > 0 && R.speedMps > W.speedMps && feet4(W) && feet4(R) && W.cycle && R.cycle && W.durS === W.cycle.periodS && R.durS === R.cycle.periodS,
    '[T1210] 걷기 · 뛰기 = 한 고리(길이 = 주기) · 보폭 · 제 빠르기(뛰기 > 걷기) · 발 넷의 미끄러짐', W && R ? `보폭 ${W.strideM} · ${R.strideM} m · ${W.speedMps} · ${R.speedMps} m/s` : '');
  ok(W && R && W.frames === 8 && R.frames === 4, '[T1237] 판 수 — 걷기 8 · 뛰기 4(질주 14 m/s 에서 한 고리 = 60 Hz 화면 4.2판 → 4판이면 판마다 보인다 · 보고 §3 표)', W && R ? `${W.frames} · ${R.frames}` : '');
  const skip = (Dc && Dc.keys) ? Dc.keys.filter(([src, t]) => src === 'die' && t > 3.4 && t < 5.7) : null;
  ok(Dc && !Dc.loop && Dc.keys && Dc.keys[0][0] === 'idle' && Dc.keys[0][2] === 0 && Dc.durS >= 1.0 && Dc.durS <= 1.5 && skip.length === 0 && Dc.face && Dc.face.keyTurnDeg.length === Dc.keys.length
    && Math.abs(Dc.fps - (Dc.frames - 1) / Dc.durS) < 1e-3,
    '★[T1237] 쓰러짐 = 키(이 뼈대) 한 번 · 1 ~ 1.5초(카드) · 서기 자세에서 시작 · 원천이 엎드려 머리 드는 3.4 ~ 5.7초 키 0(이은 자리 머리 들림 없앰) · 키마다 몸 돌림', Dc ? `${Dc.durS}초 · ${Dc.frames}판 · 키 ${JSON.stringify(Dc.keys)}` : '');
  const bendDown = E && E.bend && E.bend.filter(([b]) => /^neck|^spine/.test(b)).every(([, d]) => d > 0) && E.bend.some(([b]) => b === 'head');
  ok(E && E.loop && E.frames === 4 && bendDown && E.durS === I.durS && JSON.stringify(E.srcS) === JSON.stringify(I.srcS),
    '[T1237] 풀 뜯기 = 서기 동작(같은 구간 · 고리 4판) 위에 목 · 등뼈 숙임(+) · 머리 받침(−) — 받은 먹기 동작이 없어 키로(카드)', E ? JSON.stringify(E.bend) : '');
  ok(L && L.frames === 1 && L.face && Math.abs(L.face.turnDeg) > 90 && L.srcS[0][0] > 3.4 && L.srcS[0][1] < 5.7,
    '[T1237] 엎드림 = 말용 쓰러짐의 엎드려 쉬는 구간(3.4 ~ 5.7초) 한 판 · 몸 방향을 쉬는 자세로(행이 안 틀어진다)', L ? `${JSON.stringify(L.srcS)} · 돌림 ${L.face.turnDeg}°` : '');
  ok(I && I.loop && I.frames === 4, '[T1210] 서기 — 고리 4판(사람 시트와 같은 수)');
  // ★[T1242 · ★재민 11-09 "0.9 m"] 크기 — 앞 축(코 → 꼬리 끝 · `--length`) 0.9 m · 몸 전체가 한 배로(키 · 몸폭이 길이와 같은 비 — T1237 판 0.809 의 비 그대로 ·
  //   그림자 메타 = 몸길이 · 몸폭 비례) · 걸음 보폭도 같은 배(걸음 꼴은 그대로 · 간 거리로 돌림)
  const r0 = { h: 0.7213 / 0.809, w: 0.2053 / 0.809, sw: 0.4686 / 0.809, sr: 0.9887 / 0.809 };   // T1237 판(0.809) 메타의 비
  const near = (a, b2) => Math.abs(a - b2) < 0.002;
  ok(m.lengthM === 0.9 && /T1242/.test(m.source.sizeSrc) && near(m.heightM / m.lengthM, r0.h) && near(m.widthM / m.lengthM, r0.w) && W && R && near(W.strideM / m.lengthM, r0.sw) && near(R.strideM / m.lengthM, r0.sr),
    '★[T1242] 크기 0.9 m(★재민 11-09) — 키 · 몸폭 · 보폭이 길이와 같은 배(T1237 판 비 그대로 — 몸이 찌그러지지 않았다 · 그림자 메타가 몸 크기를 따른다)',
    `길이 ${m.lengthM} · 키 ${m.heightM} · 폭 ${m.widthM} · 보폭 ${W && W.strideM} · ${R && R.strideM} m`);
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
    ok(bad.length === 0, '[T1237] 고라니 시트 여섯 — 칸(방향 × 판)마다 그림이 있고 한 클립 안 크기가 한 짐승(가장 큰 ÷ 가장 작은 < 3)', bad.join(' · ') || Object.keys(m.sheets).join(' '));
  } catch (e) { ok(false, '고라니 시트 풀기', e.message); }

  // [T1237 · T1131] webp 쌍둥이 — 시트마다 같은 어간 webp 가 있고 화소가 같다(잠금 자 정본 `asset-lock` 화소 해시 · 굽기가 같이 쓴다)
  try {
    const AL = require('./asset-lock.js');
    const tw = Object.keys(m.sheets).map((sk) => { const p = path.join(A, 'water_deer', sk + '.png'), w = p.replace(/\.png$/, '.webp');
      return [sk, fs.existsSync(w) && AL.pixelHash(p) === AL.pixelHash(w), fs.statSync(p).size, fs.existsSync(w) ? fs.statSync(w).size : 0]; });
    const kb = (n) => Math.round(n / 1024);
    ok(tw.length === 6 && tw.every((r) => r[1]), '★[T1237] 시트 여섯 다 같은 화소 webp 쌍둥이(잠금 자 화소 해시 같음)', `png ${kb(tw.reduce((a, r) => a + r[2], 0))} KB → webp ${kb(tw.reduce((a, r) => a + r[3], 0))} KB`);
  } catch (e) { ok(false, 'webp 쌍둥이', e.message); }
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
    _gfetch: (u, o) => sandbox.fetch(u, o),   // [T1237] 그림 문(T1123) — 하네스 판은 문이 열린 꼴(곧바로 · 주소 그대로)
    _gsrc: (im, u) => { im.src = u; },
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

  // ═══ [T1210] 사슴 · 늑대 옛 도형 갈래 — ★[T1237] 고라니가 제 칸(water_deer)으로 가서 사슴 칸엔 시트가 없다 ═══
  const DM = JSON.parse(fs.readFileSync(path.join(A, idx.water_deer), 'utf8'));
  const WFILES = { '/assets/animals/index.json': idx, ['/assets/animals/' + idx.water_deer]: DM };
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
    const W0 = world(undefined, WFILES, { sets: true });
    const off = draw4(W0);
    ok(sha(off) === OLD && W0.fetched.length === 0, '[T1210] 끔 — 사슴 · 늑대 그리기가 종전(66bf163d)과 호출 · 속성 차례까지 같다 · 요청 0', `${off.map((l) => l.length).join(' · ')} · ${sha(off).slice(0, 8)}`);
    const W1 = world(true, WFILES, { sets: true });
    const on0 = draw4(W1);
    ok(sha(on0) === OLD && W1.fetched.includes('/assets/animals/index.json'), '[T1210] 켬(T1194) · 목록이 아직 안 뜸 — 그리기는 끔과 같다 · 목록을 부른다', sha(on0).slice(0, 8));
    for (let k = 0; k < 3; k++) { W1.sb.drawMobIso(100, 100, { mid: 9, type: 'deer', _fvx: 1, _fvy: 0, hp: 30, maxHp: 30 }); for (let i = 0; i < 6; i++) await settle(); }
    W1.calls.length = 0;
    const on1 = draw4(W1);
    ok(sha(on1) === OLD && !on1.some((l) => l.some((c) => c[0] === 'drawImage')), '★[T1237] 목록이 떠도 사슴 칸엔 시트가 없다(고라니는 제 칸 · ★재민 "새 종") — 사슴 · 늑대는 옛 도형 그대로(같은 sha)');
    const W2 = world(undefined, WFILES, { sets: true, ui: { waterDeer: true } });
    const wd0 = draw4(W2);
    ok(sha(wd0) === OLD && W2.fetched.length === 0, '★[T1237] 고라니 손잡이(`waterDeer`)만 켜도 사슴 · 늑대 그리기는 종전 그대로 · 목록 요청 0(사슴 · 늑대 칸은 그 손잡이와 무관)');
  }
  // ═══ [T1237] 고라니 — 제 칸(카탈로그 갈래 · small 0.7) ═══
  const BFILES = Object.assign({}, FILES, WFILES);
  {
    const W0 = world(undefined, BFILES);
    for (let k = 0; k < 2; k++) { W0.sb.drawMobIso(100, 100, { mid: 1, type: 'water_deer', _fvx: 1, _fvy: 0, hp: 20, maxHp: 20 }); for (let i = 0; i < 6; i++) await settle(); }
    ok(W0.fetched.length === 0 && W0.calls.filter((c) => c[0] === 'strokeRect').length === 2 && !W0.calls.some((c) => c[0] === 'drawImage'), '[T1237] 두 손잡이 다 끔 — 고라니 칸은 점선 칸(요청 0 · 세계에 고라니가 0 이라 실제론 안 불린다)');
    const W = world(undefined, BFILES, { ui: { waterDeer: true } });
    for (let k = 0; k < 3; k++) {
      W.sb.drawMobIso(100, 100, { mid: 1, type: 'water_deer', _fvx: 1, _fvy: 0, hp: 20, maxHp: 20 });
      W.sb.drawMobIso(100, 100, { mid: 2, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });
      for (let i = 0; i < 6; i++) await settle();
    }
    W.calls.length = 0;
    W.sb.drawMobIso(100, 100, { mid: 1, type: 'water_deer', _fvx: 1, _fvy: 0, hp: 20, maxHp: 20 });
    const n1 = W.calls.length;
    W.sb.drawMobIso(100, 100, { mid: 2, type: 'wild_boar', _fvx: 1, _fvy: 0, hp: 60, maxHp: 60 });
    ok(W.calls.slice(0, n1).some((c) => c[0] === 'drawImage') && !W.calls.slice(n1).some((c) => c[0] === 'drawImage') && W.calls.slice(n1).some((c) => c[0] === 'strokeRect'),
      '★[T1237] 고라니 손잡이(`waterDeer`) — 고라니는 시트로(T1194 와 따로 · 그림이 시트뿐) · 멧돼지(T1194 미리보기)는 점선 그대로');
  }
  {
    const W = world(undefined, BFILES, { ui: { waterDeer: true } });
    const SZ = 0.7, mob = (o) => Object.assign({ mid: 5, type: 'water_deer', _fvx: 1, _fvy: 0, hp: 20, maxHp: 20, vx: 0, vy: 0, x: 3200, y: 3200 }, o);
    for (let k = 0; k < 3; k++) { W.sb.drawMobIso(200, 150, mob()); for (let i = 0; i < 6; i++) await settle(); }
    const last = () => W.calls.filter((c) => c[0] === 'drawImage').pop();
    const fw = DM.frameW, fh = DM.frameH, C = DM.clips, FOOT = 150 + 6 * SZ;
    // 서기 — 시간으로(fps): 0 판 → 1/fps 초 뒤 1 판
    W.sb.drawMobIso(200, 150, mob({ mid: 6 })); const i0 = last();
    const tEnd = W.clock.t + 1000 / C.idle.fps + 1;
    while (W.clock.t < tEnd) { W.clock.t = Math.min(tEnd, W.clock.t + 1000 / 60); W.sb.drawMobIso(200, 150, mob({ mid: 6 })); }
    const i1 = last();
    ok(i0 && i1 && i0[1]._src.endsWith('/body_idle.png') && i0[2] === 0 && i1[2] === fw && i0[3] === 0, '[T1210] 서 있는 고라니(속도 0) — 서기 시트 · 시간으로 판이 넘어간다(1 ÷ fps 초에 한 판)', i1 ? `열 ${i0[2] / fw} → ${i1[2] / fw}` : '');
    // 걷기 — 간 거리로: 40 px/s(1.25 m/s · 고라니 풀뜯기 걸음 0.22 ~ 0.5 × 5.4 m/s 안)
    const sp = 40, dt = 0.1;
    W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp })); W.clock.t += dt * 1000; W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp })); const w1 = last();
    const want = Math.floor(((sp / 32) * dt / C.walk.strideM) * C.walk.frames) % C.walk.frames;
    ok(w1 && w1[1]._src.endsWith('/body_walk.png') && w1[2] === want * fw, '[T1210] 걷는 고라니 — 걷기 시트 · 판은 간 거리 ÷ 보폭(시간이 아니라)', w1 ? `${sp} px/s · ${dt}초 → 판 ${w1[2] / fw}(식 ${want})` : '');
    W.clock.t += dt * 1000; W.sb.drawMobIso(200, 150, mob({ mid: 7, vx: sp * 2 })); const w2 = last();
    const want2 = Math.floor((((sp / 32) * dt + (sp * 2 / 32) * dt) / C.walk.strideM) * C.walk.frames) % C.walk.frames;
    ok(w2 && w2[2] === want2 * fw, '[T1210] 두 배 빠르면 두 배 돈다(같은 dt · 걸음 두 배 — 발이 안 끌린다)', w2 ? `판 ${w2[2] / fw}(식 ${want2})` : '');
    // 뛰기 · 문턱 — 사람과 같은 charRunMin(102 px/s)
    W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 102 })); const r0 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 103 })); const r1 = last();
    W.sb.uiCfg.charRunMin = 150; W.sb.drawMobIso(200, 150, mob({ mid: 8, vx: 120 })); const r2 = last(); delete W.sb.uiCfg.charRunMin;
    ok(r0[1]._src.endsWith('/body_walk.png') && r1[1]._src.endsWith('/body_run.png') && r2[1]._src.endsWith('/body_walk.png'), '[T1210] 클립 문턱 = 사람 시트의 것(charRunMin 102 · 서버 값이 오면 그 값) — 새 수 0');
    // ★[T1237] 몸짓 — 서버 `ps`: 1 엎드림 · 2 풀 뜯기(뛸 때 말고 · 잔걸음은 몸짓 그대로)
    W.sb.drawMobIso(200, 150, mob({ mid: 20, ps: 1 })); const l0 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 21, ps: 1, vx: 20 })); const l1 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 22, ps: 2 })); const e0 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 23, ps: 2, vx: 200 })); const e1 = last();
    W.sb.drawMobIso(200, 150, mob({ mid: 24, ps: 0 })); const n0 = last();
    ok(l0[1]._src.endsWith('/body_lie.png') && l1[1]._src.endsWith('/body_lie.png') && e0[1]._src.endsWith('/body_eat.png') && e1[1]._src.endsWith('/body_run.png') && n0[1]._src.endsWith('/body_idle.png'),
      '★[T1237] 몸짓 — ps 1 엎드림(잔걸음 20 px/s 에도) · ps 2 풀 뜯기 · 뛰면(200 px/s) 뛰기 · ps 0 서기');
    // ★[T1237] 그림자 = 메타 몸 크기의 땅 위 타원을 그 행으로 눕혀 아이소에 비춘 것(발밑 가운데) — 행 0(동) · 행 3(서남 = 화면 옆) · 행 1(동남 = 화면 정면)
    const ell = (row) => { W.calls.length = 0; const f = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][row]; W.sb.drawMobIso(200, 150, mob({ mid: 30 + row, _fvx: f[0], _fvy: f[1] })); return W.calls.find((c) => c[0] === 'ellipse'); };
    const brute = (row) => { const a = DM.lengthM * 16, b = DM.widthM * 16, th = row * Math.PI / 4; let mx = 0, mn = 1e9;
      for (let i = 0; i < 3600; i++) { const u = i / 3600 * 2 * Math.PI, wx = a * Math.cos(u) * Math.cos(th) - b * Math.sin(u) * Math.sin(th), wy = a * Math.cos(u) * Math.sin(th) + b * Math.sin(u) * Math.cos(th);
        const r = Math.hypot(wx - wy, (wx + wy) / 2); if (r > mx) mx = r; if (r < mn) mn = r; } return [mx, mn]; };
    const sh = [0, 1, 3].map((row) => [row, ell(row), brute(row)]);
    ok(sh.every(([, e, [mx, mn]]) => e && e[1] === 200 && Math.abs(e[2] - FOOT) < 1e-9 && Math.abs(e[3] - mx) < 0.01 && Math.abs(e[4] - mn) < 0.01),
      '★[T1237] 그림자 — 발밑(x, y + 6 · 0.7) 가운데 · 반지름 = 몸 길이 · 폭 타원을 그 행으로 눕혀 비춘 것(전수 표본과 0.01px 안)', sh.map(([r, e]) => `행${r} ${e[3].toFixed(1)}×${e[4].toFixed(1)}`).join(' · '));
    ok(!W.calls.some((c) => c[0] === 'ellipse' && c[3] === 10 * SZ && c[4] === 4 * SZ), '[T1237] (자명 통과 금지) 옛 크기 표 그림자(10 · 4 × 0.7)는 안 그린다 — 그림자가 메타를 읽는다');
    // 그리는 자리 · 막대 — 발밑 = 그림자 가운데(x, y + 6 · 0.7) · 막대 = 그림 머리 위 3(카탈로그 갈래 식 · 이름 줄 없음)
    W.calls.length = 0;
    W.sb.drawMobIso(200, 150, mob({ mid: 10, hp: 8 }));
    const di = W.calls.find((c) => c[0] === 'drawImage'), top = Math.round(FOOT - DM.anchorY);
    const bar = W.calls.find((c) => c[0] === 'fillRect');
    ok(di && di[6] === Math.round(200 - DM.anchorX) && di[7] === top && di[4] === fw && di[5] === fh && bar && bar[2] === Math.min(150 - 18 * SZ, top - 3) && !W.calls.some((c) => c[0] === 'strokeRect'),
      '[T1237] 발밑 = 그림자 가운데 · 막대 = 그림 머리 위(카탈로그 갈래 식) · 점선 칸 0', di ? `그림 (${di[6]}, ${di[7]}) · 막대 y ${bar && bar[2]}` : '');
    // 방향 — 여덟 방향이 행 0 ~ 7(사람과 같은 함수)
    const facings = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], rows = [];
    for (const [fx, fy] of facings) { W.sb.drawMobIso(200, 150, mob({ mid: 11, _fvx: fx, _fvy: fy })); rows.push(last()[3] / fh); }
    ok(rows.join(',') === '0,1,2,3,4,5,6,7', '[T1210] 고라니 방향 여덟 = 시트 행 0 ~ 7(charDirRow)', rows.join(' '));
    // 주검 — 방금 사라진 같은 종의 방향으로 쓰러짐 한 번 · 마지막 판에 눕는다 / 모르는 주검 = 처음부터 누운 판 0행 / 쓰러짐 없는 종 = '×'
    const R = DM.lengthM * 32;
    W.sb.drawMobIso(200, 150, mob({ mid: 12, _fvx: -1, _fvy: 0, x: 4000, y: 4000 }));
    W.sb.drawMobIso(200, 150, mob({ mid: 13, _fvx: 0, _fvy: 1, x: 4000 + R * 0.9, y: 4000 }));
    W.calls.length = 0;
    const co = { cid: 'c1', mobType: 'water_deer', x: 4000 + R * 0.25, y: 4000 };
    const got = [];
    for (let i = 0; i <= C.die.frames + 1; i++) { W.sb.drawModelCorpse(300, 200, co); got.push(last()); W.clock.t += 1000 / C.die.fps; }
    const cols = got.map((g) => g[2] / fw), crow = got[0][3] / fh;
    ok(got.every((g) => g[1]._src.endsWith('/body_die.png')) && crow === 4 && cols.slice(0, C.die.frames).join(',') === [...Array(C.die.frames).keys()].join(',') && cols[C.die.frames] === C.die.frames - 1 && cols[C.die.frames + 1] === C.die.frames - 1,
      '[T1210] 주검 — 한 몸길이 안 가장 가까운 같은 종(쓰러진 그 몸)의 방향 · 쓰러짐 판 0 → 끝 · 그 뒤 마지막 판에 눕는다', `행 ${crow} · 판 ${cols.join(' ')}`);
    const e1c = W.calls.find((c) => c[0] === 'ellipse'), cf = 200 + 6 * SZ, [mx4, mn4] = brute(4);
    ok(e1c && e1c[1] === 300 && Math.abs(e1c[2] - cf) < 1e-9 && Math.abs(e1c[3] - mx4) < 0.01 && Math.abs(e1c[4] - mn4) < 0.01 && got[0][7] === Math.round(cf - DM.anchorY),
      '★[T1237] 주검 그림 = 산 몸과 같은 그림자(메타 몸 크기 · 그 행 — 같은 크기) · 같은 발밑(y + 6 · 0.7)', e1c ? `(${e1c[1]}, ${e1c[2].toFixed(1)}) ${e1c[3].toFixed(1)}×${e1c[4].toFixed(1)}` : '');
    W.sb.drawModelCorpse(300, 200, { cid: 'c2', mobType: 'water_deer', x: 4000 + R * 0.9 + R * 1.01, y: 4000 });
    const old = last();
    ok(old[2] === (C.die.frames - 1) * fw && old[3] === 0, '[T1210] 한 몸길이 안에 그려진 몸이 없는 주검(들어오기 전에 죽은 것) — 처음부터 누운 판 · 0행', `열 ${old[2] / fw} · 행 ${old[3] / fh}`);
    W.sb.drawModelCorpse(300, 200, { cid: 'c4', mobType: 'water_deer', x: 4000 + R * 0.9, y: 4000 + R * 0.5 });
    const nb = last();
    ok(nb[2] === 0 && nb[3] / fh === W.sb.charDirRow(0, 1), '[T1210] (자명 통과 금지) 한 몸길이 안에 몸이 있으면 그 방향으로 쓰러짐 0 판부터 — 위 판과 거리만 다르다', `열 ${nb[2] / fw} · 행 ${nb[3] / fh}`);
    ok(W.sb.drawModelCorpse(300, 200, { cid: 'c3', mobType: 'wild_boar', x: 1, y: 1 }) === false, "[T1210] 쓰러짐 없는 종(멧돼지) — 주검은 그리지 않는다(부르는 쪽 '×')");
  }
  {
    const RL = rd('public/client/34-m-renderloop.js');
    ok(/if \(!\(modelSpriteOn\(item\.co\.mobType\) && drawModelCorpse\(s\.x, s\.y, item\.co\)\)\) \{[^\n]*\n\s+ctx\.font = '24px sans-serif';\n\s+ctx\.textAlign = 'center';\n\s+ctx\.textBaseline = 'middle';\n\s+ctx\.fillText\('×', s\.x, s\.y\);\n\s+\}/.test(RL)
      && /function modelSpriteOn\(type\) \{ return !!\(uiCfg\.modelSprites \|\| \(uiCfg\.waterDeer && type === 'water_deer'\)\); \}/.test(S40),
      "[T1210 · T1237] 주검 자리 — 손잡이 둘(T1194 미리보기 · 고라니 `waterDeer` — `modelSpriteOn` 한 곳)이 꺼지면(또는 시트가 없으면) '×' 그 줄 그대로 · 켜고 쓰러짐이 있으면 그림");
  }

  console.log('\n⑥ 서버 손잡이');
  const Z = rd('server/zone.js');
  const reads = Z.split('process.env.T1194_MODEL_SPRITES').length - 1;
  ok(reads === 1 && Z.includes("...(process.env.T1194_MODEL_SPRITES === '1' ? { modelSprites: true } : {})"), "읽는 자리 하나 · '1' 만 켬 · 끄면 칸이 없다(welcome 바이트 동일)", `${reads}곳`);
  const reads2 = Z.split('process.env.T1237_WATER_DEER').length - 1;
  ok(reads2 === 1 && Z.includes("...(process.env.T1237_WATER_DEER === '1' ? { waterDeer: true } : {})"), "[T1237] 고라니 손잡이도 존이 읽는 자리 하나 · '1' 만 켬 · 끄면 welcome 칸이 없다", `${reads2}곳`);

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
