#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 19 · B 20 · C 19 — 적은 쪽 중 앞 글자
// @pixel     ← ★프레임을 화소로 잰다(`page.screenshot` · 타일 `getImageData`) — 하늘·바람을 끄고 잰다
// === scripts/e2e-char3d.js — 사람을 3D 로 (T522 한 몸 · T539 남의 몸·주민 · 장면 한 번 · T545 소체 교체 — MPFB 실사풍) =====================
//
// ★이 하네스가 지키는 계약:
//   ⓐ glTF — `char_export_gltf.py` 산물(glb·메타·무늬)이 잠금과 같다 · 입력 지문(저장소 안 원본) · 원본은 저장소 밖 ·
//      몸 둘(M·F) × 옷 기하 둘(T604 본·갖옷 — 그리는 것은 하나) · 프리미티브 하나 · 재질 0(엔진이 건다) · 삼각형 2~6k · 뼈 31(cmu_mb) · 클립 다섯 × 몸 둘(모캡 · 판·루프·fps = 시트 표) ·
//      [T604] 청동기 옷 = 시트 링 표 → 3D 몸 → MPFB mhclo(`char_clothes_mhclo.py` · 새 수 0 · 남 시트 단·반팔 · 여 무릎 단·긴팔) ·
//      키 1.60 · 무늬 1024² 이하 · 합 5MB 안 · CREDITS(MPFB/MakeHuman · CMU · ambientCG · three.js) · 옛 클립 파일(T539) 0
//   ⓑ 자 [T545 개정 — 실루엣이 바뀌니 IoU 대신] — 발밑 ≤ 1px(가장 낮은 살 · 몸 둘 × 클립 다섯 × 판 전부) ·
//      8방향 발 가운데(두 발목 가운데 ↔ 앵커 ≤ 1px · 서기 + 서서 하는 클립 × 판 전부) · 키 = 셀 규약(사람 1.6m ↔ 51.2px ±1)
//   ③ 클립 표 — `char_render.py` 열둘: 3D = 모캡 다섯 + 별칭 셋(손 포즈판) · 시트로 넘긴 넷(쓰러짐·업기·포로 둘 — 모캡 원본 없음) · 몸 하나 = 그리기 호출 하나
//   ⓒ 걷기 — 그린 자리 = 같은 순간의 이동 모델 예측 자리 · 걷는 동안 걷기 클립 · 돌아서기는 **연속**(온 메시 몸)
//      가림 — 산 뒤에 서면 **시트와 같은 술어**(화가 순서 · 흐림 겹이 맨 위)로 덮인다 · 비교: 위에 얹은 투명 캔버스(`overlay`)는 못 덮인다
//   ⓓ 옷 넷 — 삼베·모시·가죽·갖옷이 서로 다른 그림 · 밝기 차례 = 시트 정본 색(`CLOTH_MATS`) · 다섯째(가죽 판갑 `hide`)는 시트
//   ④ 빛 — 게임 시각·날씨(클라가 받은 그 값)에서: 한낮 = 시트 태양 · 저녁 고도·세기 · 밤 직사광 0 · 비 = (1 − 강수) · 그림이 갈린다
//   ⓔ 프레임 — 몸 1·10·100 × 시트·메시 짝 · 장면 한 번(렌더 = 판당 1) · [T545] ★그리기 호출 = 몸 수(몸마다 메시 하나·재질 하나)
//   ① 남의 몸·주민 — 같은 문(몸마다 모드 하나) · 남의 몸 타일이 제 앵커에 선다(화면 몸 화소 ↔ 같은 자세 타일 · 자리 Δ 0) ·
//      주민 모드 = 같은 술어(옷 넷 · 클립) n/n · 도구 층은 3D 손목을 따른다
//   ⑤ 마을 광장 — 주민 3D 여럿 + 시트 도구·등짐 층 · 같은 자리 시트 판 나란히(그림)
//   ⓕ 끔(기본) — 주소창에 손잡이가 없으면 three.js·glb·char3d.js 요청 0 · `window.__char3d` 없음 · 시트가 그린다
// 실행: node scripts/e2e-char3d.js [그림.png] [--json 경로] [--fig=t604](그림을 T604 청동기 옷 절만)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const args = process.argv.slice(2);
const OUTPNG = args.find((a) => a.endsWith('.png')) || null;
const FIG = (args.find((a) => a.startsWith('--fig=')) || '').slice(6) || null;   // [T604] `--fig=t604` = 청동기 옷 그림만(옷 넷 × 남·여 · 앞·옆 · 마을 광장)
const JI = args.indexOf('--json'); const OUTJSON = JI >= 0 ? args[JI + 1] : null;
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/e2e-char3d-${process.pid}.db`, CDB = `/tmp/e2e-char3d-c-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
const REC = { a: {}, b: {}, c: {}, d: {}, e: [], f: {}, z: {}, clips: [], light: {}, one: {}, five: {} };
const C3 = path.join(ROOT, 'public', 'assets', 'char3d');
const PX_PER_M = 32;                          // 셀 규약 — 1m 높이 = 32 게임px(`render_common.ZSQ` 의 정의 · char_meta `pxPerMeterH`)

// ── ⓐ glTF — 노드 쪽에서 먼저(서버 안 띄우고) ────────────────────────────────────────
console.log('\n=== 사람을 3D 로 (T522 · T539 · T545 소체 교체) ===');
console.log('\nⓐ glTF — 내보낸 것이 잠금과 같고 몸·뼈·클립·무늬가 선다');
const crypto = require('crypto');
const sha16 = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const LOCK = JSON.parse(fs.readFileSync(path.join(C3, 'char3d.lock.json'), 'utf8'));
const META = JSON.parse(fs.readFileSync(path.join(C3, 'char3d_meta.json'), 'utf8'));
const CHMETA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'char', 'char_meta.json'), 'utf8'));
const RCLIPS = (() => {   // `char_render.py` 의 CLIPS 표(이름·판·루프·fps) — 정본을 읽는다(사본 0)
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
  const blk = src.slice(src.indexOf('\nCLIPS = ['), src.indexOf('\n]', src.indexOf('\nCLIPS = [')));
  const out = []; for (const m of blk.matchAll(/\(\"(\w+)\",\s*(\d+),\s*(True|False),\s*([\d.]+)\)/g)) out.push({ name: m[1], frames: +m[2], loop: m[3] === 'True', fps: +m[4] });
  return out;
})();
const MOCAP = (() => {    // `mocap_retarget.py` 의 CLIPS 표(모캡 원본이 있는 클립) — 정본을 읽는다
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'mocap_retarget.py'), 'utf8');
  const blk = src.slice(src.indexOf('\nCLIPS = ['), src.indexOf('\n]', src.indexOf('\nCLIPS = [')));
  return [...blk.matchAll(/\(\"(\w+)\",\s*\"([\w.]+\.bvh)\"/g)].map((m) => ({ name: m[1], file: m[2] }));
})();
const CLOTH = (() => {    // `render_common.CLOTH_MATS` 의 본천 색(선형) — 옷 넷의 밝기 차례 정본
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'render_common.py'), 'utf8');
  const out = {}; for (const m of src.matchAll(/'(\w+)':\s*\(\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g)) out[m[1]] = [+m[2], +m[3], +m[4]];
  return out;
})();
const imgDim = (p) => {   // PNG IHDR · JPEG SOF — 무늬 크기(1024² 이하)
  const b = fs.readFileSync(p);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1], len = b.readUInt16BE(i + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len; }
  return [0, 0];
};
{
  // 잠금 — 산물 전부(glb · 메타 · 무늬)
  const outs = Object.keys(LOCK.char3d || {});
  const bad = outs.filter((k) => !fs.existsSync(path.join(C3, k)) || sha16(path.join(C3, k)) !== LOCK.char3d[k]);
  const onDisk = [];
  (function walk(d, pre) { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q, pre + f + '/'); else onDisk.push(pre + f); } })(C3, '');
  const stray = onDisk.filter((f) => f !== 'char3d.lock.json' && !outs.includes(f));
  const wantTex = Object.keys(META.textures).length * (META.clothKinds.length + 1);
  REC.a.lock = { outs: outs.length, bad, stray, glb: LOCK.char3d['char_body.glb'] };
  ok(bad.length === 0 && stray.length === 0 && outs.length === 2 + wantTex,
     `ⓐ 잠금 — glb·메타·무늬 ${wantTex}장 해시가 잠금표와 같다 · 폴더에 잠금 밖 파일 0`, `${outs.length}개 · 어긋남 ${bad.join(' ') || 0} · 밖 ${stray.join(' ') || 0}`);
  // 입력 지문 — 저장소 안 원본(스크립트 · BVH)은 지금 파일과 같다 · 저장소 밖 원본(MPFB · MakeHuman · ambientCG)은 저장소에 없다
  const inp = LOCK._입력 || {};
  const inRepo = Object.keys(inp).filter((k) => /^(scripts|assets-src)\//.test(k));
  const stale = inRepo.filter((k) => !fs.existsSync(path.join(ROOT, k)) || sha16(path.join(ROOT, k)) !== inp[k]);
  ok(inRepo.length >= 4 + MOCAP.length && stale.length === 0, 'ⓐ 입력 지문 — 내보내기·시트 정본·모캡 원본이 굽던 때와 같다(바뀌면 다시 굽는다)', stale.join(' ') || `${inRepo.length}개 같다`);
  const outside = Object.keys(inp).filter((k) => !inRepo.includes(k));
  const leaked = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { if (['.git', 'node_modules'].includes(f)) continue; const q = path.join(d, f);
    let st; try { st = fs.lstatSync(q); } catch (e) { continue; } if (st.isDirectory()) walk(q); else if (/\.(mhclo|proxy|mhmat|bvh\.zip)$|add-on-mpfb.*\.zip$|_1K-JPG_Color\.jpg$/.test(f)) leaked.push(path.relative(ROOT, q)); } })(ROOT);
  REC.a.inputs = { inRepo: inRepo.length, outside: outside.length, leaked };
  ok(outside.length > 0 && outside.every((k) => !fs.existsSync(path.join(ROOT, k))) && leaked.length === 0,
     `ⓐ 원본은 저장소 밖(\`~/Mini/_3d_in/\`) — 지문 ${outside.length}개는 저장소에 없고 원본 꼴 파일(.mhclo·.proxy·MPFB zip·ambientCG 원판) 0`, leaked.slice(0, 3).join(' ') || '0');
  // GLB
  const b = fs.readFileSync(path.join(C3, 'char_body.glb'));
  const jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const binOff = 20 + jl + 8;
  ok(b.toString('ascii', 0, 4) === 'glTF' && J.asset.version === '2.0', 'ⓐ GLB 2.0', `${b.length}B · ${J.asset.generator}`);
  const sexes = Object.keys(META.bodies).sort();
  const meshN = (J.meshes || []).map((m) => m.name).sort();
  const prims = (J.meshes || []).map((m) => m.primitives.length);
  // ★[T604] 몸마다 옷 기하 둘(본 옷 `<몸>_body` = 삼베·모시·가죽 · 갖옷 `<몸>_fur` = 털 두께) — 옷 → 메시는 메타 `meshOf` · 그리는 것은 하나
  const wantMesh = sexes.flatMap((s) => [...new Set(Object.values(META.bodies[s].meshOf || {}))]).sort();
  const ofOk = sexes.every((s) => { const of = META.bodies[s].meshOf || {}; return META.clothKinds.every((k) => of[k] === `${s}_${k === 'fur' ? 'fur' : 'body'}`); });
  ok(JSON.stringify(sexes) === '["F","M"]' && JSON.stringify(meshN) === JSON.stringify(wantMesh) && ofOk && meshN.length === 2 * sexes.length && prims.every((n) => n === 1) && !(J.materials && J.materials.length),
     'ⓐ ★몸 둘(M·F) — [T604] 몸마다 옷 기하 둘(본 · 갖옷 — 옷에 맞는 하나만 그린다 `meshOf`) · 메시마다 프리미티브 하나 · 재질 0(아틀라스 재질은 엔진이 건다 · 족보 487)', `${meshN.join(' ')} · 프리미티브 ${prims.join('/')} · 재질 ${(J.materials || []).length}`);
  const tris = {}, topY = {};
  for (const m of J.meshes) {
    const p = m.primitives[0], ia = J.accessors[p.indices], pa = J.accessors[p.attributes.POSITION];
    tris[m.name] = ia.count / 3; topY[m.name] = pa.max[1];
  }
  REC.a.tris = tris;
  ok(Object.values(tris).every((t) => t >= 2000 && t <= 6000) && sexes.every((s) => META.bodies[s].tris === tris[`${s}_body`] && META.bodies[s].trisFur === tris[`${s}_fur`]),
     'ⓐ 삼각형 2~6k — 한 몸(살·옷·머리·눈·눈썹 합 · 본 옷 몸 · 갖옷 몸 따로) · 메타와 같다(카드 ① 좀보이드 결 · T604 6,000 안)', JSON.stringify(tris));
  const skins = J.skins || [];
  const jn = skins.map((s) => s.joints.map((i) => J.nodes[i].name));
  ok(skins.length === 2 && jn.every((L) => L.length === 31) && jn.every((L) => { const p = L[0].split('_')[0]; return L.every((n) => n.startsWith(p + '_')); }),
     'ⓐ 뼈 31 × 몸 둘(MPFB `cmu_mb` · 이름 = CMU BVH 관절 · 몸 머리 M_/F_)', skins.map((s) => `${s.name}:${s.joints.length}`).join(' '));
  // 클립 — 모캡 표 그대로 · 판·루프·fps = 시트 표 · 길이(열쇠) = 메타
  const an = {}; for (const a of J.animations || []) an[a.name] = J.accessors[a.samplers[0].input].max[0];
  const cn = Object.keys(META.clips).sort();
  const want = MOCAP.map((c) => c.name).sort();
  const specOk = cn.every((n) => { const r = RCLIPS.find((c) => c.name === n), mm = META.clips[n];
    const K = mm.loop ? META.keysPerFrame * mm.frames : META.keysPerFrame * (mm.frames - 1) + 1;
    return r && r.frames === mm.frames && r.loop === mm.loop && Math.abs(r.fps - mm.fps) < 1e-9 && mm.keys === K && mm.span === (mm.loop ? K : K - 1); });
  const spanOk = sexes.every((s) => cn.every((n) => Math.abs((an[`${s}.${n}`] || -1) - META.clips[n].span) < 1e-6));
  REC.a.clips = { names: cn, anims: Object.keys(an).length, span: an };
  ok(JSON.stringify(cn) === JSON.stringify(want) && Object.keys(an).length === cn.length * sexes.length && specOk && spanOk,
     `ⓐ ★클립 = CMU 모캡 ${cn.length}개 × 몸 둘(코드 흔들기 0) · 판·루프·fps = 시트 표 · 길이 = 메타(열쇠 ${META.keysPerFrame}/판)`, cn.map((n) => `${n} ${META.clips[n].keys}`).join(' · '));
  ok(Math.abs(META.height - 1.6) < 1e-9 && Object.values(topY).every((y) => y >= 1.6 - 1e-4 && y <= 1.6 + 1 / PX_PER_M),
     'ⓐ 키 1.60m — 쉼 자세 정수리(살) = 1.60 · 머리털까지 1px(1/32m) 안', Object.entries(topY).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(' · '));
  // 무늬 — 1024² 이하 · 몸마다 옷 넷 + 알파 하나 · 합 5MB 안
  const tex = []; for (const s of sexes) { for (const k of META.clothKinds) tex.push(META.textures[s][k]); tex.push(META.textures[s].alpha); }
  const dims = tex.map((t) => imgDim(path.join(C3, t)));
  const total = [...tex, META.glb, 'char3d_meta.json'].reduce((a, f) => a + fs.statSync(path.join(C3, f)).size, 0);
  REC.a.tex = { n: tex.length, dims: [...new Set(dims.map((d) => d.join('x')))], totalBytes: total };
  ok(JSON.stringify(META.clothKinds) === '["hemp","ramie","leather","fur"]' && tex.length === wantTex && dims.every((d) => d[0] > 0 && d[0] <= 1024 && d[1] <= 1024) && total <= 5 * 1024 * 1024,
     'ⓐ 무늬 — 옷 넷(삼베·모시·가죽·갖옷) × 몸 둘 + 알파 둘 · 1024² 이하 · glb·메타·무늬 합 5MB 안', `${tex.length}장 · ${REC.a.tex.dims.join(' ')} · ${(total / 1024 / 1024).toFixed(2)}MB`);
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_export_gltf.py'), 'utf8');
  ok(/HS\.create_human\(/.test(src) && /add_builtin_rig\(base, "cmu_mb"\)/.test(src) && !/from_pydata|bmesh|primitive_\w+_add/.test(src) && !/casualsuit|elegantsuit/.test(src.replace(/#.*$/gm, '')),
     'ⓐ 새 형상 = 도구가 뽑는다(MPFB `create_human` · `cmu_mb`) · 손 모델링 0(점·면을 손으로 짓는 줄 0) · [T604] CC0 현대 옷(`casualsuit`·`elegantsuit`) 0');
  // ★[T604 ②] 청동기 옷 기하 — 시트 링 표 → 3D 몸 → MPFB mhclo(`char_clothes_mhclo.py`) · 재단 = 카드("무릎 길이 웃옷 · 반팔/긴팔 · 허리띠 · 여: 긴 웃옷/치마")
  {
    const cs = fs.readFileSync(path.join(ROOT, 'scripts', 'char_clothes_mhclo.py'), 'utf8');
    const cr = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
    const reads = ['TUNIC_R', 'SKIRT_R', 'BELT_R', 'SLV_R', 'FUR_PAD', 'TORSO_R', 'LEG_R', 'ARM_R', 'BONES', 'LOFT_SEG'].every((k) => new RegExp(`"${k}"`).test(cs)) && /ast\.parse/.test(cs) && /char_render\.py/.test(cs);
    // 생성기의 소수 상수 = 0 · 1 · 수치 허용(1e-6 ~ 1e-15)뿐 — 꼴의 수는 전부 시트 표에서 온다(정수는 첨자·표본 수)
    const lits = [...cs.replace(/#.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').matchAll(/(?<![\w.])(\d+\.\d*|\d*\.\d+|\d+e-?\d+)(?![\w.])/g)].map((m) => m[1]);
    const okLit = new Set(['0.0', '1.0', '1e-6', '1e-9', '1e-12', '1e-15']);
    const badLit = [...new Set(lits.filter((x) => !okLit.has(x)))];
    const skirtLow = Math.min(...[...cr.slice(cr.indexOf('\nSKIRT_R = ['), cr.indexOf(']', cr.indexOf('\nSKIRT_R = [')) + 1).matchAll(/\(([\d.]+),/g)].map((m) => +m[1]));
    const zKnee = +(/Z_ANKLE, Z_KNEE, Z_HIP, Z_WAIST, Z_SHLD, Z_NECK = ([\d.]+), ([\d.]+)/.exec(cr) || [0, 0, NaN])[2];
    const C = (s) => META.bodies[s].clothes || {};
    const cutOk = C('M').cut && C('M').cut.hem === 'sheet' && C('M').cut.sleeve === 'short' && C('F').cut && C('F').cut.hem === 'knee' && C('F').cut.sleeve === 'long';
    const hemOk = Math.abs(C('M').hemS - skirtLow) < 1e-9 && Math.abs(C('F').hemS - zKnee) < 1e-9;
    const fp = sexes.every((s) => C(s).mhclo && ['base', 'fur'].every((v) => /^[0-9a-f]{16}$/.test((C(s).mhclo[v] || {}).mhclo || '') && /^[0-9a-f]{16}$/.test((C(s).mhclo[v] || {}).obj || '')));
    const noCC0 = sexes.every((s) => !('clothes' in (META.bodies[s].parts || {})));
    REC.a.clothes = { M: { cut: C('M').cut, hemS: C('M').hemS, rings: C('M').rings, sleeve: C('M').sleeve, tris: C('M').tris_base }, F: { cut: C('F').cut, hemS: C('F').hemS, rings: C('F').rings, sleeve: C('F').sleeve, tris: C('F').tris_base }, badLit };
    ok(reads && badLit.length === 0 && cutOk && hemOk && fp && noCC0,
       'ⓐ ★[T604] 청동기 옷 = 시트 링 표(웃옷·옷자락·허리띠·소매·털 두께 — 원문을 읽는다 · 생성기에 새 수 0) → 3D 몸 → MPFB mhclo · 남 = 시트 단·반팔 · 여 = 무릎 단·긴팔 · CC0 현대 옷 0',
       `남 단 ${C('M').hemS}(시트 SKIRT_R 맨 아래 ${skirtLow}) · 여 단 ${C('F').hemS}(Z_KNEE ${zKnee}) · 관 링 ${C('M').rings}/${C('F').rings} · 소매 링 ${C('M').sleeve}/${C('F').sleeve} · 옷 삼각형 ${C('M').tris_base}/${C('F').tris_base}${badLit.length ? ' · 새 수 ' + badLit.join(',') : ''}`);
  }
  const v = path.join(ROOT, 'public', 'vendor', 'three.0.186.1.min.js');
  const vh = fs.existsSync(v) ? fs.readFileSync(v, 'utf8').slice(0, 300) : '';
  ok(/three\.js 0\.186\.1/.test(vh) && /MIT/.test(vh) && fs.existsSync(path.join(ROOT, 'public', 'vendor', 'three.LICENSE.txt')), 'ⓐ three.js 한 판 고정(public/vendor · MIT 전문 동봉 · CDN 0)');
  const cr = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  const crNeed = [/three\.js/, /0\.186\.1/, /MPFB/, /MakeHuman/, /CC0/, /CMU/, /ambientCG/, ...Object.values(META.fabric).map((id) => new RegExp(id))];
  ok(crNeed.every((re) => re.test(cr)), 'ⓐ CREDITS — three.js · MPFB/MakeHuman(CC0) · CMU 모캡 · ambientCG 결 넷(아이디마다 한 줄)', crNeed.filter((re) => !re.test(cr)).map(String).join(' ') || '빠짐 0');
  const gone = ['scripts/char_export_clips.py', 'public/assets/char3d/char_clips.glb', 'public/assets/char3d/char3d_clips_meta.json', 'public/assets/char3d/char3d_clips.lock.json'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  ok(gone.length === 0, 'ⓐ [T545] 옛 클립 파일(T539 `char_clips.glb` · 도형 소체 뼈대) 0 — 클립은 몸 파일 하나에 몸마다', gone.join(' ') || '0');
}

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('server/zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '1', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', CHAR_SPRITE: 'on' });
    // ★[T539] 마을 하나 · 하루 0.5초(`e2e-npcsprite` 의 그 세계 문법) — 광장에 주민이 나와 다닌다(⑤ 그림 · ① 주민)
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!cu.ok || !zu.ok) { ok(false, '서버가 떴다', `${cu.why || ''} ${zu.why || ''}`); process.exit(1); }
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const VW = 1280, VH = 800;
  const open = async (q, root) => {   // root = `/?…`(T539 ⓪ — 쿼리를 뗀 길이 `/` 여도 index) · 아니면 `/index.html?…`
    const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
    const reqs = [], errs = [];
    page.on('request', (r) => reqs.push(r.url()));
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/${root ? '' : 'index.html'}${q || ''}`);
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
    try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
    const iw = await FX.waitInWorld(page);
    await FX.setClock(page, { day: FX.anchorDays().summer, night: false });
    await page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
    await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { if (window.__rainForce) window.__rainForce({ precip: 0 }); try { drawNameTag = function () {}; } catch (e) { } });
    return { page, reqs, errs, iw };
  };
  const send = (page, m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const meDbg = (page) => page.evaluate(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) return d[k]; return null; });
  // ★게임 시각을 낮 안의 자리 u(0 해 뜸 · 0.5 한낮 · 1 해 짐)에 세운다 — 클라 시계의 기준점만 옮긴다(`worldPhase` 정본 식은 그대로 돈다)
  const setDayU = (page, u) => page.evaluate((uu) => { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs;
    const p = (((uu * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; return +(worldPhase() / dr).toFixed(4); }, u);

  // ── ⓕ 끔(기본) — 먼저 잰다(손잡이 없는 주소) ──
  console.log('\nⓕ 끔(기본) — 손잡이가 없으면 3D 는 한 바이트도 안 실린다');
  {
    const A = await open('');
    await sleep(4000);
    const knob = await A.page.evaluate(() => { try { return T522_CHAR_3D; } catch (e) { return 'ERR'; } });
    const has3d = await A.page.evaluate(() => typeof window.__char3d);
    const bad = A.reqs.filter((u) => /\/vendor\/|\/client3d\/|\/assets\/char3d\//.test(u));
    const d = await meDbg(A.page);
    REC.f = { knob, has3d, reqs3d: bad.length, sheet: !!(d && d.on && !d.mesh) };
    ok(A.iw.ok && knob === null && has3d === 'undefined', 'ⓕ 손잡이 끔 — `T522_CHAR_3D` null · `window.__char3d` 없음', `${knob} · ${has3d}`);
    ok(bad.length === 0, 'ⓕ ★three.js·glb·무늬·char3d.js 요청 0(끔 = 비트 동일 경로)', bad.slice(0, 3).join(' ') || '0');
    ok(!!(d && d.on && !d.mesh && !('hand' in d)), 'ⓕ 내 몸은 시트가 그린다(종전 그대로 · 진단 칸도 종전)', d ? JSON.stringify({ on: d.on, clip: d.clip, layers: d.layers }) : 'null');
    ok(A.errs.length === 0, 'ⓕ pageerror 0', A.errs.slice(0, 2).join(' | '));
    await A.page.context().close();
  }

  // ── ⓪ [T539] central 정적 절 — 쿼리를 뗀 길이 `/` 면 index ──
  {
    const get = async (u) => { try { const r = await fetch(`http://localhost:${CPORT}${u}`, { signal: AbortSignal.timeout(5000) }); return { st: r.status, body: await r.text() }; } catch (e) { return { st: 0, body: '' }; } };
    const idx = await get('/index.html'), rq = await get('/?T522_CHAR_3D=1'), rv = await get('/?v=1'), nope = await get('/nope?x=1'), idq = await get('/index.html?T522_CHAR_3D=1');
    REC.z = { idx: idx.st, rootQ: rq.st, rootV: rv.st, nope: nope.st, idxQ: idq.st };
    ok(rq.st === 200 && rq.body === idx.body && rv.st === 200 && idq.st === 200 && nope.st === 404,
       '⓪ [T539] `/?T522_CHAR_3D=1` = index(200 · 같은 바이트) · `/index.html?…` 그대로 · 없는 길은 404 그대로', JSON.stringify(REC.z));
  }

  // ── 켬 — ★주소는 `/?T522_CHAR_3D=1`(⓪ 이 연 문) ──
  const B = await open('?T522_CHAR_3D=1', true);
  const P = B.page;
  await P.waitForFunction(() => window.__char3d && (window.__char3d.ready || (window.__char3d.why && window.__char3d.why !== '싣는 중')), { timeout: 90000 }).catch(() => {});
  const info = await P.evaluate(() => ({ ready: !!(window.__char3d && window.__char3d.ready), why: window.__char3d && window.__char3d.why, info: window.__char3d && window.__char3d.info }));
  REC.a.gl = info.info;
  ok(info.ready, 'ⓐ 켬 — three.js + glb + 무늬가 실리고 WebGL 층이 섰다', JSON.stringify(info.info) + (info.why ? ' ' + info.why : ''));
  // 가죽옷을 입힌다 — 내 층이 몸 + `clothes_leather` 두 층(옷 넷 가운데 하나 → 온 메시 · 연속)
  await send(P, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'leather', lvl: 5 }] });
  await P.waitForFunction(() => { try { return !!(charSheet('body_idle') && charSheet('clothes_hemp_idle') && charSheet('body_walk')); } catch (e) { return false; } }, { timeout: 60000 }).catch(() => {});
  await setDayU(P, 0.5);

  // ── ⓑ 자 [T545 개정] — 발밑 · 8방향 발 가운데 · 키 ──
  console.log('\nⓑ 자 [T545 개정 — IoU 대신] — 발밑 ≤ 1px · 8방향 발 가운데 ≤ 1px · 키 = 셀 규약(1.6m ↔ 51.2px)');
  const geo = await P.evaluate(() => {
    const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh, C = window.__char3d;
    const mk = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0; return o; };
    const st = (k) => { let y0 = 1e9, y1 = -1, fx = 0, fn = 0; for (let i = 0; i < N; i++) if (k[i]) { const y = (i / fw) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (let i = 0; i < N; i++) if (k[i] && ((i / fw) | 0) >= y1 - 3) { fx += i % fw; fn++; } return { y0, y1, fx: fn ? fx / fn : 0 }; };
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d', { willReadFrequently: true });
    const out = { ax: m.anchorX, ay: m.anchorY, stand: [], rest: [], low: [], feet: [], calls: new Set(), bait: {} };
    for (const sex of ['M', 'F']) {
      for (let d = 0; d < 8; d++) {
        // 서기(게임 안의 서 있는 몸 = 'idle' → 모캡 서기 0판) ↔ 시트 서기 0판(적기만 — 실루엣이 다르다)
        const t = C.snap(d, 'idle', 0, { sex, kind: 'hemp', geo: true }); out.calls.add(t.calls);
        g.clearRect(0, 0, fw, fh); g.drawImage(charSheet('body_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh); g.drawImage(charSheet('clothes_hemp_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh);
        const a = st(mk(g.getImageData(0, 0, fw, fh).data)), q = st(mk(t.data));
        out.stand.push({ sex, d, low: t.low, feetDx: +(t.feet[0] - m.anchorX).toFixed(3), sheetBottom: q.y1 - a.y1, sheetFeetX: +(q.fx - a.fx).toFixed(2) });
        const r = C.snap(d, null, 0, { sex, kind: 'hemp', rest: true, geo: true }); out.calls.add(r.calls);
        out.rest.push({ sex, d, top: r.top, y0: st(mk(r.data)).y0 });
      }
      for (const c of C.clips(sex)) {
        if (c.src.split('.')[1] !== c.name) continue;          // 별칭(손 포즈판)은 같은 액션 — 한 번만 잰다
        for (let f = 0; f < c.frames; f++) {
          const t = C.snap(0, c.name, f, { sex, kind: 'hemp', geo: true }); out.calls.add(t.calls);
          out.low.push({ sex, clip: c.name, f, low: t.low });
          for (let d = 0; d < 8; d++) { const u = d ? C.snap(d, c.name, f, { sex, kind: 'hemp' }) : t; out.feet.push({ sex, clip: c.name, f, d, dx: +(u.feet[0] - m.anchorX).toFixed(3) }); }
        }
      }
    }
    // 자명 통과 금지 재료 — 0.9배 몸의 정수리 줄(방향 3·7) · 걷기(엉덩이 원점)의 발 가운데
    out.bait.small = [3, 7].map((d) => st(mk(C.snap(d, null, 0, { kind: 'hemp', rest: true, scale: 0.9 }).data)).y0);
    out.calls = [...out.calls];
    return out;
  });
  const want = geo.ay - 1.6 * PX_PER_M;                        // 정수리 줄(px) — 앵커에서 사람 키 1.6m 위
  const lowPx = geo.low.map((r) => r.low * PX_PER_M), standLow = geo.stand.map((r) => r.low * PX_PER_M);
  const worstLow = Math.max(...lowPx.map(Math.abs), ...standLow.map(Math.abs));
  const standClips = Object.keys(META.clips).filter((n) => META.clips[n].center === 'feet');
  const feetStand = geo.stand.map((r) => Math.abs(r.feetDx)), feetClips = geo.feet.filter((r) => standClips.includes(r.clip)).map((r) => Math.abs(r.dx));
  const worstFeet = Math.max(...feetStand, ...feetClips);
  const restTop = geo.rest.map((r) => r.top * PX_PER_M);
  const rows37 = geo.rest.filter((r) => r.d === 3 || r.d === 7);
  REC.b = { anchor: [geo.ax, geo.ay], worstLowPx: +worstLow.toFixed(3), worstFeetPx: +worstFeet.toFixed(3), standClips, restTopPx: restTop.map((v) => +v.toFixed(2)),
            topRows37: rows37.map((r) => `${r.sex}${r.d}:${r.y0}`), wantTop: +want.toFixed(2), calls: geo.calls,
            stand: geo.stand, sheetCmp: geo.stand.map((r) => [r.sex, r.d, r.sheetBottom, r.sheetFeetX]) };
  console.log('    [표] 몸 · 방향 · 서기 발목 가운데 Δx(px) · 가장 낮은 살(px) · (적기만) 시트 서기 0판 대비 발밑 줄 Δ · 발 가운데 Δx');
  for (const r of geo.stand) console.log(`      ${r.sex} · ${r.d} · ${r.feetDx} · ${(r.low * PX_PER_M).toFixed(2)} · ${r.sheetBottom} · ${r.sheetFeetX}`);
  console.log(`    [표] 클립별 가장 낮은 살(px · 몸 둘 × 판 전부): ${Object.keys(META.clips).map((n) => { const v = geo.low.filter((r) => r.clip === n).map((r) => r.low * PX_PER_M); return `${n} ${Math.min(...v).toFixed(2)}~${Math.max(...v).toFixed(2)}`; }).join(' · ')}`);
  ok(worstLow <= 1, `ⓑ ★발밑 ≤ 1px — 가장 낮은 살이 땅(높이 0)에서 1px(1/32m) 안 · 몸 둘 × 클립 다섯 × 판 전부 + 서기 8방향(${lowPx.length + standLow.length}표본)`, `최대 ${worstLow.toFixed(3)}px`);
  ok(worstFeet <= 1, `ⓑ ★8방향 발 가운데 ≤ 1px — 두 발목 가운데 ↔ 앵커 x · 서기 8방향 × 몸 둘 + 서서 하는 클립(${standClips.join('·')}) × 판 전부 × 8방향(${feetStand.length + feetClips.length}표본)`, `최대 ${worstFeet.toFixed(3)}px`);
  ok(restTop.every((v) => Math.abs(v - 1.6 * PX_PER_M) <= 1) && rows37.every((r) => Math.abs(r.y0 - want) <= 1),
     `ⓑ ★키 = 셀 규약 — 쉼 자세 정수리 높이 × 32px/m = 51.2px ± 1(몸 둘) · 화면 정수리 줄 = 앵커 − 51.2 = ${want.toFixed(2)} ± 1(깊이가 가로로만 눕는 방향 3·7)`,
     `높이 ${[...new Set(restTop.map((v) => v.toFixed(2)))].join('/')}px · 줄 ${REC.b.topRows37.join(' ')}`);
  ok(geo.calls.length === 1 && geo.calls[0] === 1, 'ⓑ 몸 하나 = 그리기 호출 하나(메시 하나 · 재질 하나 — 재는 판 전부)', `호출 ${geo.calls.join('/')}`);
  { const walkOff = Math.max(...geo.feet.filter((r) => r.clip === 'walk').map((r) => Math.abs(r.dx)));
    const smallOff = geo.bait.small.map((y) => y - want);
    REC.b.bait = { walkFeetMaxPx: +walkOff.toFixed(2), smallTopRows: geo.bait.small };
    ok(walkOff > 1 && smallOff.every((dy) => Math.abs(dy) > 1), 'ⓑ 자명 통과 금지 — 걷기(엉덩이 원점 · 발이 번갈아 나간다)는 발 가운데 자가 물고 · 0.9배 몸은 키 자가 문다',
       `걷기 발 가운데 최대 ${walkOff.toFixed(2)}px · 0.9배 정수리 줄 Δ ${smallOff.map((v) => v.toFixed(1)).join('/')}px`); }

  // ── ③ 클립 표 — char_render.py 열둘: 3D 냐 시트냐 ──
  console.log('\n③ 클립 표 — 시트 열둘: 3D(모캡 다섯 + 별칭 셋) · 시트로 넘긴 넷(모캡 원본 없음)');
  {
    const r = await P.evaluate((names) => { const C = window.__char3d, out = [];
      const has = new Set(C.clips().map((c) => c.name));
      for (const n of names) { const md = C.modeOf(['body', 'clothes_hemp'], n); out.push({ name: n, has: has.has(n), src: (C.clips().find((c) => c.name === n) || {}).src || null, mode: md && md.kind ? '3D' : ('시트:' + (md && md.why)) }); }
      return out; }, RCLIPS.map((c) => c.name));
    REC.clips = r;
    const mocapN = MOCAP.map((c) => c.name), alias = META.clipAlias || {};
    const expect3d = RCLIPS.filter((c) => mocapN.includes(c.name) || (alias[c.name] && mocapN.includes(alias[c.name]))).map((c) => c.name);
    const sheetOnly = RCLIPS.filter((c) => !expect3d.includes(c.name)).map((c) => c.name);
    console.log('    [표] 클립 · 3D · 액션 · 모드(몸 + 삼베옷)');
    for (const q of r) console.log(`      ${q.name} · ${q.has ? '○' : '-'} · ${q.src || '-'} · ${q.mode}`);
    ok(r.filter((q) => q.has).map((q) => q.name).join() === expect3d.join() && Object.keys(alias).every((k) => (r.find((q) => q.name === k) || {}).src === `${geo.stand[0].sex}.${alias[k]}`),
       `③ ★3D 클립 ${expect3d.length} = 모캡 ${mocapN.length}(${mocapN.join('·')}) + 별칭 ${Object.keys(alias).length}(손 포즈판 → 같은 뜻 모캡판: ${Object.entries(alias).map(([a, b]) => `${a}→${b}`).join(' ')})`, expect3d.join(' '));
    ok(r.filter((q) => !q.has).map((q) => q.name).join() === sheetOnly.join() && r.filter((q) => !q.has).every((q) => q.mode === '시트:clip') && r.filter((q) => q.has).every((q) => q.mode === '3D'),
       `③ ★시트로 넘긴 클립 ${sheetOnly.length} — 모캡 원본이 없는 것 그대로(${sheetOnly.join('·')}) · 그 판의 몸은 시트가 그린다(같은 문 · ⓒ)`, sheetOnly.join(' '));
  }

  // ── ⓒ 걷기 — 마을 안에서 ──
  console.log('\nⓒ 걷기 — 한반도 마을에서 한 몸이 걷는다(서버 무접촉 · 같은 이동 모델 예측)');
  const vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;
  await send(P, { type: 'teleport_debug', x: vx + 96, y: vy + 160 });
  await sleep(4000);
  const samples = [];
  const sample = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await P.evaluate(() => ({ ld: window.__char3d.lastDraw, dbg: (() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) return d[k]; return null; })() })); samples.push(s); await sleep(40); } };
  await P.keyboard.down('d'); await sample(1600);
  await P.keyboard.down('s'); await sample(900); await P.keyboard.up('d'); await sample(900); await P.keyboard.up('s');
  await sample(1500);
  const dPos = samples.filter((s) => s.ld && s.ld.w2s).map((s) => Math.hypot(s.ld.x - s.ld.w2s[0], s.ld.y - s.ld.w2s[1]));
  const maxD = dPos.length ? Math.max(...dPos) : 1e9;
  const walked = samples.filter((s) => s.dbg && s.dbg.mesh && s.ld && s.ld.clip === 'walk').length;
  const idleEnd = samples.slice(-5).every((s) => s.dbg && s.dbg.mesh && s.ld && s.ld.clip === 'idle');
  const yaws = samples.filter((s) => s.ld && s.ld.yaw != null).map((s) => s.ld.yaw);
  const offGrid = yaws.filter((y) => { const k = y / (Math.PI / 4); return Math.abs(k - Math.round(k)) > 0.02; }).length;
  const conv = samples.slice(-5).every((s) => s.ld && Math.abs(s.ld.yaw - s.ld.yawTarget) < 0.02);
  const abs0 = samples.find((s) => s.ld && s.ld.abs), abs1 = [...samples].reverse().find((s) => s.ld && s.ld.abs);
  const moved = abs0 && abs1 ? Math.hypot(abs1.ld.abs[0] - abs0.ld.abs[0], abs1.ld.abs[1] - abs0.ld.abs[1]) : 0;
  const contAll = samples.filter((s) => s.ld && s.ld.tile).every((s) => s.ld.cont === true && s.ld.kind === 'leather');
  REC.c = { samples: samples.length, maxDrawVsPredPx: +maxD.toFixed(3), walkFrames: walked, idleEnd, yawOffGrid: offGrid, yawConverged: conv, movedPx: +moved.toFixed(1), contAll };
  ok(moved > 60, 'ⓒ [상황] 몸이 실제로 걸었다(이동 모델 예측 자리)', `${moved.toFixed(1)}px`);
  ok(maxD < 0.51, 'ⓒ ★그린 자리 = 같은 순간의 몸 자리(`myAbsRender` — 시트와 같은 renderables 한 줄 · 이동 모델 예측을 보간해 따라간다)', `최대 ${maxD.toFixed(3)}px · ${dPos.length}표본`);
  { const lag = samples.filter((s) => s.ld && s.ld.pred && s.ld.abs).map((s) => Math.hypot(s.ld.pred[0] - s.ld.abs[0], s.ld.pred[1] - s.ld.abs[1])); REC.c.renderVsPredMaxPx = lag.length ? +Math.max(...lag).toFixed(2) : null; console.log(`    [곁] 보간 자리 ↔ 예측 자리 최대 ${REC.c.renderVsPredMaxPx}px(30Hz 예측 계단을 펴는 보간 — 시트도 같은 자리)`); }
  ok(walked >= 5 && idleEnd && contAll, 'ⓒ 걷는 동안 걷기 클립 · 멈추면 서기(시트와 같은 상태기계) · 가죽옷 한 벌 = 온 메시(연속)', `걷기 ${walked}표본 · 끝 서기 ${idleEnd} · 연속 ${contAll}`);
  ok(offGrid >= 2 && conv, 'ⓒ ★방향 8 → 연속 — 돌아서는 동안 45° 계단이 아닌 각이 서고 끝엔 목표에 붙는다', `계단 밖 ${offGrid}/${yaws.length} · 수렴 ${conv}`);

  // ── ⓒ 가림 — 이 엔진에서 사람을 덮는 것은 **산의 흐림 겹**이다 ──
  //   ★집·나무는 사람을 안 덮는다: 사람은 renderables 에서 z + 500 으로 선다(`34-m-renderloop` · 시트와 같은 한 줄) —
  //     그래서 여기서 재는 가림은 산 뒤에 선 몸 위에 얹히는 **흐림 겹**(`11-r1-mountain` · 앞 산을 모아 알파 `MT_OCC_A` 로 맨 위에 얹는다)이다.
  //   재는 법(수 하나로 갈린다): 흐림 겹 **아래**에 선 화소는 산을 켜면 바탕과의 대비가 정확히 (1 − MT_OCC_A) 배로 준다
  //     — 몸 B · 바탕 G · 산 M 이면 켠 판은 (1−A)B + AM 과 (1−A)G + AM, 둘의 차 = (1−A)(B − G).
  //     흐림 겹 **위**(덮개)면 몸 화소가 산을 켜도 **그대로**다(바뀐 양 0).
  console.log('\nⓒ 가림 — 산 뒤에 서면 흐림 겹이 몸을 덮는다(시트와 같은 화가 순서 · 새 규칙 0)');
  const OCC_A = +(/const MT_OCC_A = ([\d.]+)/.exec(fs.readFileSync(path.join(ROOT, 'public', 'client', '11-r1-mountain.js'), 'utf8')) || [0, NaN])[1];   // 정본 상수를 읽는다(사본 0)
  const MT = { cx: 2150, cy: 1959 };   // `e2e-mtcut` 의 그 산(한가운데 칸은 바위라 순간이동이 안 선다 — 둘레에서 찾는다)
  const offOf = (PG) => PG.evaluate(() => { const c = conns.get(primaryZoneId); return [c.meta.worldOffsetX || 0, c.meta.worldOffsetY || 0]; });
  const tpTo = async (PG, off, x, y) => {   // 존 좌표로 보내고 **내 자리가 실제로 옮겨졌나** 본다(바위·물은 서버가 거절한다)
    await send(PG, { type: 'teleport_debug', x, y });
    for (let i = 0; i < 12; i++) { await sleep(150); const a = await PG.evaluate(() => { const m = window.__getMyAbs(); return m ? [m.x, m.y] : null; }); if (a && Math.hypot(a[0] - off[0] - x, a[1] - off[1] - y) < 40) return true; }
    return false;
  };
  const settleMt = async (PG, maxMs) => { let prev = null, same = 0; const t0 = Date.now();   // 청크 굽기가 멎을 때까지(e2e-mtcut 의 그 안정 대기)
    while (Date.now() - t0 < maxMs) { const st = await PG.evaluate(() => { const d = window.__mtDbg || {}; const c = window.__mtCutN(); return [d.mt3chunks | 0, d.mt3segs | 0, c.split | 0].join(','); });
      if (st === prev) { if (++same >= 3) return; } else { same = 0; prev = st; } await sleep(600); } };
  const hereOcc = (PG) => PG.evaluate(() => { const a = window.__getMyAbs(); const r = window.__mtOccAt(a.x, a.y); return { n: r ? r.n : 0, split: window.__mtCutN().split | 0 }; });
  const findSpot = async (PG) => {
    const off = await offOf(PG);
    let land = false;
    for (let r = 0; r <= 8 && !land; r++) for (let dx = -r; dx <= r && !land; dx++) for (let dy = -r; dy <= r && !land; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      land = await tpTo(PG, off, (MT.cx + dx) * 32 + 16, (MT.cy + dy) * 32 + 16);
    }
    if (!land) return null;
    await PG.evaluate(() => { window.__mtFadeCut(1); window.__mtFadePlane(0); });
    await settleMt(PG, 20000);
    const cand = await PG.evaluate((o) => { const a = window.__getMyAbs(), out = [];
      for (let dx = -24; dx <= 24; dx++) for (let dy = -24; dy <= 24; dy++) { const r = window.__mtOccAt(a.x + dx * 32, a.y + dy * 32);
        if (r && r.n) out.push({ x: Math.round(a.x - o[0]) + dx * 32, y: Math.round(a.y - o[1]) + dy * 32, n: r.n, d: Math.hypot(dx, dy) }); }
      return out.sort((p, q) => (q.n - p.n) || (p.d - q.d)).slice(0, 16); }, off);
    for (const c of cand) {
      if (!await tpTo(PG, off, c.x, c.y)) continue;
      await settleMt(PG, 12000);
      const h = await hereOcc(PG);
      if (h.n > 0 && h.split > 0) return { x: c.x, y: c.y };
    }
    return null;
  };
  const occOf = async (PG, label, spot) => {
    if (!spot) spot = await findSpot(PG);
    else { await tpTo(PG, await offOf(PG), spot.x, spot.y); await PG.evaluate(() => { window.__mtFadeCut(1); window.__mtFadePlane(0); }); await settleMt(PG, 20000); }
    if (!spot) return { spot: null, out: {} };
    const here = await hereOcc(PG);
    const box = await PG.evaluate(() => { const l = window.__char3d.lastDraw; return l ? [Math.round(l.x), Math.round(l.y)] : null; });
    const grab = async () => PNG.sync.read(await PG.screenshot({ clip: { x: box[0] - 60, y: box[1] - 90, width: 120, height: 100 } }));
    const set = async (o) => { await PG.evaluate((oo) => { Object.assign(window.__terrain19, { mtOff: oo.mtOff }); window.__char3d.hide = oo.hide; if (oo.mode) window.__char3d.mode = oo.mode; }, o); await sleep(700); };
    // ★몸의 시계를 멈춘다(서기 클립도 숨을 쉰다 — 판 사이 몸짓이 가림 잣대에 잡음이 된다).
    const freeze = (on) => PG.evaluate((f) => { const d = window.__charDbg || {};
      for (const k of Object.keys(d)) { if (!d[k] || !d[k].isMe) continue; const st = _charAnim.get(k) || _charAnim.get(+k); if (!st) continue;
        if (f) Object.defineProperty(st, 't', { get: () => 0, set: () => {}, configurable: true }); else { delete st.t; st.t = 0; } } }, on);
    await freeze(true);
    const out = {};
    for (const mode of (label === 'overlay' ? ['mesh'] : ['mesh', 'sheet'])) {
      await set({ mtOff: true, hide: false, mode }); const offOn = await grab();
      await set({ mtOff: true, hide: true, mode: 'mesh' }); const offHid = await grab(); const offHid2 = await grab();
      await set({ mtOff: false, hide: false, mode }); const onOn = await grab();
      await set({ mtOff: false, hide: true, mode: 'mesh' }); const onHid = await grab();
      await set({ mtOff: false, hide: false, mode: 'mesh' });
      const dif = (a, b, i) => Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      let mask = 0, tint = 0, bg = 0, noise = 0, sxy = 0, sxx = 0;
      for (let i = 0; i < offOn.data.length; i += 4) {
        noise += dif(offHid, offHid2, i) / 3;
        if (dif(onHid, offHid, i) > 24) bg++;                      // 산이 이 상자에 실제로 있다
        if (dif(offOn, offHid, i) <= 24) continue;                 // 몸 화소 = 산을 끈 판에서 몸 있음 ≠ 몸 없음
        mask++;
        tint += dif(onOn, offOn, i) / 3;                           // 산을 켜면 몸 화소가 얼마나 바뀌나(덮개면 0)
        for (let ch = 0; ch < 3; ch++) { const x = offOn.data[i + ch] - offHid.data[i + ch], y = onOn.data[i + ch] - onHid.data[i + ch]; sxy += x * y; sxx += x * x; }
      }
      const key = label === 'overlay' ? 'overlay' : (mode === 'mesh' ? 'slot' : 'sheet');
      out[key] = { mask, tint: mask ? +(tint / mask).toFixed(2) : 0, k: sxx ? +(sxy / sxx).toFixed(3) : null, bg, noise: +(noise / (offOn.data.length / 4)).toFixed(3), png: onOn };
    }
    await freeze(false);
    return { spot, here, box, out };
  };
  const occ = await occOf(P, 'slot');
  const OS = occ.out.slot || {}, OH = occ.out.sheet || {};
  REC.c.occ = { spot: occ.spot, here: occ.here, A: OCC_A, want: +(1 - OCC_A).toFixed(3),
                slot: { mask: OS.mask, tint: OS.tint, k: OS.k, noise: OS.noise }, sheet: { mask: OH.mask, tint: OH.tint, k: OH.k, noise: OH.noise }, bg: OS.bg };
  ok(!!occ.spot && occ.here.n > 0 && occ.here.split > 0 && OS.bg > 500 && OS.mask > 300 && OH.mask > 300,
     'ⓒ [상황] 산 뒤 자리 — 정본 방아쇠가 나를 덮는 산을 세고(걸친 띠가 갈린다) 몸 상자에 산이 실제로 있다',
     occ.spot ? `존 (${occ.spot.x},${occ.spot.y}) · 덮는 산 ${occ.here.n} · 걸친 띠 ${occ.here.split} · 산 화소 ${OS.bg} · 몸 ${OS.mask}/${OH.mask}px · 잡음 ${OS.noise}` : '자리 없음');
  const kOk = (o) => o && o.k != null && Math.abs(o.k - (1 - OCC_A)) < 0.1;
  ok(kOk(OS) && kOk(OH),
     `ⓒ ★가림 ○ — 3D(제 차례)도 시트도 흐림 겹 **아래**다: 산을 켜면 몸↔바탕 대비가 (1 − MT_OCC_A) = ${(1 - OCC_A).toFixed(2)} 배로 준다(같은 술어)`,
     `3D k ${OS.k} · 시트 k ${OH.k} · 바뀐 양 3D ${OS.tint} · 시트 ${OH.tint}(0–255)`);

  // ── ⓓ 옷 넷 — 삼베·모시·가죽·갖옷 ──
  console.log('\nⓓ 옷 넷 — 아틀라스 넉 장이 서로 다른 그림 · 밝기 차례 = 시트 정본 색 · 다섯째는 시트');
  {
    const tt = await P.evaluate((kinds) => {
      const C = window.__char3d, out = { kinds: {}, turn: [] };
      for (const k of kinds) { const t = C.snap(1, 'walk', 2, { kind: k }); let n = 0, l = 0;
        for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3] > 127) { n++; l += 0.2126 * t.data[i] + 0.7152 * t.data[i + 1] + 0.0722 * t.data[i + 2]; }
        out.kinds[k] = { lum: +(l / Math.max(1, n)).toFixed(2), data: t.data }; }
      for (let k = 0; k < 16; k++) out.turn.push(C.snap(k / 2, 'walk', 2, { kind: 'leather' }).data);
      return out; }, META.clothKinds);
    const hash = (d) => crypto.createHash('sha1').update(Buffer.from(d)).digest('hex');
    const distinctK = new Set(Object.values(tt.kinds).map((q) => hash(q.data))).size;
    const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const ordCanon = [...META.clothKinds].sort((a, b) => lumOf(CLOTH[b]) - lumOf(CLOTH[a]));
    const ordMesh = [...META.clothKinds].sort((a, b) => tt.kinds[b].lum - tt.kinds[a].lum);
    const clothesPng = fs.readdirSync(path.join(ROOT, 'public', 'assets', 'char')).filter((f) => /^clothes_.*\.png$/.test(f));
    const cBytes = clothesPng.reduce((s, f) => s + fs.statSync(path.join(ROOT, 'public', 'assets', 'char', f)).size, 0);
    REC.d = { clothesSheets: clothesPng.length, clothesSheetBytes: cBytes, lum: Object.fromEntries(Object.entries(tt.kinds).map(([k, q]) => [k, q.lum])), ordCanon, ordMesh, distinctKinds: distinctK };
    ok(clothesPng.length === 72, 'ⓓ 시트 옷 층 = 재질 6 × 클립 12 = 72장(방향 8 · 판 전부 구운 그림 — 무접촉)', `${clothesPng.length}장 · ${(cBytes / 1024).toFixed(0)}KB`);
    ok(distinctK === META.clothKinds.length && ordMesh.join() === ordCanon.join(),
       `ⓓ ★옷 ${META.clothKinds.length}벌이 서로 다른 그림 — 같은 몸·판·방향에서 밝기 차례가 시트 정본 색(\`CLOTH_MATS\`) 차례와 같다`, `${ordMesh.join(' > ')} · ${ordMesh.map((k) => tt.kinds[k].lum).join(' > ')}`);
    const distinct = new Set(tt.turn.map(hash)).size;
    ok(distinct === 16, 'ⓓ 16방향(22.5° 걸음) 돌림판이 전부 다른 그림 — 시트 8행 사이의 방향도 메시가 낸다', `${distinct}/16`);
    REC.d.turnPng = tt.turn; REC.d.kindPng = Object.fromEntries(Object.entries(tt.kinds).map(([k, q]) => [k, q.data]));
    // 다섯째(가죽 판갑 hide) → 시트(옷 재질 다섯째 이상 = 회부) · 가죽으로 되돌리면 다시 3D
    await send(P, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'hide', lvl: 5 }] });
    await P.waitForFunction(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe && (d[k].layers || []).includes('clothes_hide') && performance.now() - d[k].t < 300) return true; return false; }, { timeout: 20000 }).catch(() => {});
    await sleep(400);
    const dh = await meDbg(P);
    await send(P, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'leather', lvl: 5 }] });
    await P.waitForFunction(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) if (d[k] && d[k].isMe && (d[k].layers || []).includes('clothes_leather') && d[k].mesh) return true; return false; }, { timeout: 20000 }).catch(() => {});
    const dl = await meDbg(P);
    REC.d.hide = { layers: dh && dh.layers, mesh: dh && dh.mesh, back: dl && dl.mesh };
    ok(!!(dh && (dh.layers || []).includes('clothes_hide') && !dh.mesh && dl && dl.mesh),
       'ⓓ 다섯째 옷(가죽 판갑 `hide`)은 시트가 그린다(옷 재질 다섯째 이상 = 회부) · 가죽으로 되입으면 다시 3D', dh ? `판갑 ${dh.layers.join('+')} 3D ${dh.mesh} · 가죽 3D ${dl && dl.mesh}` : 'null');
  }

  // ── ⓓ+ [T604 ②] 청동기 옷 — 옷 → 메시(본 · 갖옷) · 시트 판과 나란히(같은 판 · 같은 방향) · 큰 그림(같은 엔진 · 4배) ──
  console.log('\nⓓ+ [T604] 청동기 옷 — 본 옷 셋은 한 기하(무늬만) · 갖옷은 제 기하(털 두께) · 시트와 같은 판 나란히(적기만)');
  {
    const DIRS = [1, 3];                                       // 1 = 카메라를 마주 본 행(앞) · 3 = 옆(깊이가 가로로만 눕는 행 — ⓑ 키 자와 같은 줄)
    await P.waitForFunction((kinds) => kinds.every((k) => { try { return !!charSheet('clothes_' + k + '_idle'); } catch (e) { return false; } }), META.clothKinds, { timeout: 60000 }).catch(() => {});
    const g = await P.evaluate(([kinds, dirs]) => {
      const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh, C = window.__char3d, out = { snap: {}, sheet: {}, area: {}, iou: {} };
      const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const gg = cv.getContext('2d', { willReadFrequently: true });
      const mk = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0; return o; };
      const iou = (a, b) => { let I = 0, U = 0; for (let i = 0; i < N; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++; } return U ? +(I / U).toFixed(4) : 0; };
      const cnt = (a) => a.reduce((x, y) => x + y, 0);
      for (const sex of ['M', 'F']) for (const k of kinds) for (const d of dirs) {
        const t = C.snap(d, 'idle', 0, { sex, kind: k });
        out.snap[`${sex}_${k}_${d}`] = t.data;
        const a = mk(t.data); out.area[`${sex}_${k}_${d}`] = cnt(a);
        if (sex === 'M') {                                     // 시트 몸은 하나(남녀 칸 없음) — 게임 안의 몸(`defaultBody` M)과 맞댄다
          gg.clearRect(0, 0, fw, fh); gg.drawImage(charSheet('body_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh); gg.drawImage(charSheet('clothes_' + k + '_idle'), 0, d * fh, fw, fh, 0, 0, fw, fh);
          const sd = gg.getImageData(0, 0, fw, fh).data; out.sheet[`${k}_${d}`] = Array.from(sd);
          out.iou[`${k}_${d}`] = iou(a, mk(sd)); out.area[`sheet_${k}_${d}`] = cnt(mk(sd));
        }
      }
      const same = (x, y) => { const A = out.snap[x], B = out.snap[y]; for (let i = 3; i < A.length; i += 4) if ((A[i] > 127) !== (B[i] > 127)) return false; return true; };
      out.sameBase = ['M', 'F'].every((sx) => dirs.every((d) => same(`${sx}_hemp_${d}`, `${sx}_ramie_${d}`) && same(`${sx}_hemp_${d}`, `${sx}_leather_${d}`)));
      return out;
    }, [META.clothKinds, DIRS]);
    const furBig = ['M', 'F'].every((sx) => DIRS.every((d) => g.area[`${sx}_fur_${d}`] > g.area[`${sx}_leather_${d}`]));
    REC.t604 = { iou: g.iou, area: g.area, sameBase: g.sameBase, furBig, snap: g.snap, sheet: g.sheet };
    console.log('    [표] (적기만) 남 몸 3D ↔ 시트 같은 판(서기 0판) — 옷 · 방향 · 실루엣 겹침(IoU) · 화소 3D / 시트');
    for (const k of META.clothKinds) for (const d of DIRS) console.log(`      ${k} · ${d} · ${g.iou[`${k}_${d}`]} · ${g.area[`M_${k}_${d}`]} / ${g.area[`sheet_${k}_${d}`]}`);
    ok(g.sameBase && furBig,
       'ⓓ ★[T604] 옷 → 메시 — 삼베·모시·가죽은 한 기하(실루엣 화소가 같다 · 무늬만 다르다) · 갖옷은 제 기하(털 두께 — 같은 몸·판·방향에서 실루엣이 크다) · 몸 둘 × 앞·옆',
       DIRS.map((d) => `방향 ${d}: 남 가죽 ${g.area[`M_leather_${d}`]} → 갖옷 ${g.area[`M_fur_${d}`]} · 여 ${g.area[`F_leather_${d}`]} → ${g.area[`F_fur_${d}`]}`).join(' · '));
    if (OUTPNG) {                                              // 큰 그림(같은 엔진 · 같은 투영 · 4배 · 서기 0판) — 메타·glb·무늬를 같은 문법으로 따로 싣는다(클라 무접촉)
      REC.t604.studio = await P.evaluate(async (o) => {
        const T = window.THREE, meta = await (await fetch('/assets/char3d/char3d_meta.json')).json();
        const gltf = await new Promise((ok2, no) => new T.GLTFLoader().load('/assets/char3d/' + meta.glb, ok2, undefined, no));
        const TL = new T.TextureLoader();
        const tex = (u, srgb) => new Promise((ok2, no) => TL.load('/assets/char3d/' + u, (t) => { t.flipY = false; if (srgb) t.colorSpace = T.SRGBColorSpace; ok2(t); }, undefined, no));
        const MAT = {};
        for (const sex of Object.keys(meta.textures)) { MAT[sex] = {}; const al = await tex(meta.textures[sex].alpha, false);
          for (const k of meta.clothKinds) MAT[sex][k] = new T.MeshStandardMaterial({ map: await tex(meta.textures[sex][k], true), alphaMap: al, alphaTest: meta.alphaTest, roughness: meta.roughness[k], metalness: 0, side: T.DoubleSide }); }
        const cm = charMeta(), PPU = cm.ppu * o.k, W = o.w, H = o.h, AX = W / 2, AY = H - o.foot;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const R = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        R.setPixelRatio(1); R.setClearColor(0x000000, 0);
        const scene = new T.Scene(), sd = meta.sunDir, E0 = Math.asin(-sd[2]), A0 = Math.atan2(-sd[1], -sd[0]);
        const sun = new T.DirectionalLight(0xffffff, meta.sunEnergy);
        sun.position.set(Math.cos(E0) * Math.cos(A0) * 10, Math.sin(E0) * 10, Math.cos(E0) * Math.sin(A0) * 10); scene.add(sun); scene.add(sun.target);
        const sky = new T.Color(meta.sky[0], meta.sky[1], meta.sky[2]); scene.add(new T.HemisphereLight(sky, sky, Math.PI * meta.skyStrength));
        const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
        const cam = new T.OrthographicCamera(-AX / PPU, (W - AX) / PPU, AY / PPU, -(H - AY) / PPU, 0.1, 200);
        cam.up.set(-s / Math.SQRT2, c, -s / Math.SQRT2); cam.position.set(c / Math.SQRT2 * 50, s * 50, c / Math.SQRT2 * 50); cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        const out = {};
        for (const j of o.jobs) {                              // j = {sex, kind, d, clip(없으면 쉼 자세 — 묶기 자세 그대로), key(열쇠)}
          const model = T.SkeletonUtils.clone(gltf.scene.getObjectByName(j.sex)); model.scale.set(1, meta.zsq, -1);
          const root = new T.Group(); root.add(model); scene.add(root);
          const of = meta.bodies[j.sex].meshOf;
          for (const nm of new Set(Object.values(of))) { const m = model.getObjectByName(nm); m.frustumCulled = false; m.visible = nm === of[j.kind]; if (m.visible) m.material = MAT[j.sex][j.kind]; }
          if (j.clip) { const mixer = new T.AnimationMixer(model), a = mixer.clipAction(gltf.animations.find((q) => q.name === j.sex + '.' + j.clip)); a.play(); a.time = j.key; mixer.update(0); }
          root.rotation.y = -(j.d * Math.PI / 4);
          R.clear(); R.render(scene, cam);
          out[j.id] = cv.toDataURL('image/png');
          scene.remove(root);
        }
        return out;
      }, { k: 4, w: 232, h: 300, foot: 34, jobs: [
        ...['M', 'F'].flatMap((sex) => META.clothKinds.flatMap((kind) => DIRS.map((d) => ({ id: `${sex}_${kind}_${d}`, sex, kind, d, clip: null })))),
        ...['M', 'F'].flatMap((sex) => [0, 2, 4, 6].map((f) => ({ id: `walk_${sex}_${f}`, sex, kind: 'hemp', d: 3, clip: 'walk', key: f * META.keysPerFrame }))),
        ...['M', 'F'].flatMap((sex) => [0, 2, 4, 6].map((f) => ({ id: `run_${sex}_${f}`, sex, kind: 'fur', d: 1, clip: 'run', key: f * META.keysPerFrame }))) ] });
    }
  }

  // ── ④ 빛 — 게임 시각 · 날씨 ──
  console.log('\n④ 빛 — 방향광 + 반구광 하나 · 게임 시각(`worldPhase`)·날씨(`wxState().precip`)에서 각도·세기');
  {
    const sd = META.sunDir, E0 = Math.asin(-sd[2]), A0 = Math.atan2(-sd[1], -sd[0]);
    const shot = async (u, precip) => {
      await P.evaluate((p) => window.__rainForce({ precip: p }), precip);
      const uu = await setDayU(P, u);
      return P.evaluate(([w, p]) => { const t = window.__char3d.snap(1, 'idle', 0, { kind: 'hemp' }); let n = 0, l = 0;
        for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3] > 127) { n++; l += 0.2126 * t.data[i] + 0.7152 * t.data[i + 1] + 0.0722 * t.data[i + 2]; }
        return { L: Object.assign({}, window.__char3d.light), lum: +(l / Math.max(1, n)).toFixed(2), data: t.data, u: w }; }, [uu, precip]);
    };
    const noon = await shot(0.5, 0), eve = await shot(0.9, 0), night = await shot(1.2, 0), rain = await shot(0.5, 1), half = await shot(0.5, 0.5);
    await P.evaluate(() => window.__rainForce({ precip: 0 })); await setDayU(P, 0.5);
    const deg = (r) => r * 180 / Math.PI;
    const eEve = E0 * Math.sin(Math.PI * 0.9), iEve = META.sunEnergy * Math.sin(eEve) / Math.sin(E0);
    let difPx = 0; for (let i = 0; i < noon.data.length; i += 4) if (Math.abs(noon.data[i] - eve.data[i]) + Math.abs(noon.data[i + 1] - eve.data[i + 1]) + Math.abs(noon.data[i + 2] - eve.data[i + 2]) > 24) difPx++;
    REC.light = { E0: +deg(E0).toFixed(3), A0: +deg(A0).toFixed(3), noon: noon.L, eve: eve.L, night: night.L, rain: rain.L, half: half.L,
                  lum: { noon: noon.lum, eve: eve.lum, night: night.lum, rain: rain.lum }, difPx };
    console.log(`    [표] 낮자리 u · 고도° · 방위° · 직사광 · 강수 · 평균 밝기 — 한낮 ${noon.L.u}·${noon.L.elev}·${noon.L.azim}·${noon.L.sun}·${noon.L.precip}·${noon.lum} / 저녁 ${eve.L.u}·${eve.L.elev}·${eve.L.azim}·${eve.L.sun}·${eve.lum} / 밤 ${night.L.u}·${night.L.sun}·${night.lum} / 비 ${rain.L.sun}·${rain.lum} / 반비 ${half.L.sun}`);
    ok(Math.abs(noon.L.u - 0.5) < 2e-3 && Math.abs(noon.L.elev - deg(E0)) < 0.2 && Math.abs(noon.L.azim - deg(A0)) < 0.5 && Math.abs(noon.L.sun - META.sunEnergy) < 1e-3 && Math.abs(noon.L.hemi - Math.PI * META.skyStrength) < 1e-3,
       `④ 한낮 = 시트 굽기의 태양 그대로(고도 ${deg(E0).toFixed(1)}° · 방위 · 세기 ${META.sunEnergy}) · 반구광 = 시트 하늘(π × ${META.skyStrength})`, `고도 ${noon.L.elev}° · 방위 ${noon.L.azim}° · 직사광 ${noon.L.sun} · 반구 ${noon.L.hemi}`);
    ok(Math.abs(eve.L.elev - deg(eEve)) < 0.5 && Math.abs(eve.L.sun - iEve) < 0.02 && eve.L.azim !== noon.L.azim && difPx > 0,
       '④ ★저녁(낮자리 0.9) — 해가 낮고 돈다(고도 = 한낮 × sin πu · 방위 = 한낮 − (u − ½)π) · 직사광 = 수평면 조도(sin 고도) · 같은 판 그림이 갈린다',
       `고도 ${eve.L.elev}° · 방위 ${eve.L.azim}° · 직사광 ${eve.L.sun} · 갈린 화소 ${difPx} · (적기만) 평균 밝기 ${noon.lum} → ${eve.lum} — 해가 돌면 비치는 면이 바뀌어 평균은 어느 쪽으로도 간다`);
    ok(!night.L.day && night.L.sun === 0 && night.lum < noon.lum, '④ 밤 — 직사광 0(반구광만 · 푸른 어두움은 2D 밤 덮개가 맡는다) · 한낮보다 어둡다', `직사광 ${night.L.sun} · 밝기 ${noon.lum} → ${night.lum}`);
    ok(rain.L.precip === 1 && rain.L.sun === 0 && Math.abs(half.L.sun - META.sunEnergy * 0.5) < 1e-3 && rain.lum < noon.lum,
       '④ ★비 — 직사광 × (1 − 강수)(클라가 받은 강수 그대로 · 사본 0) · 큰비면 직사광 0', `강수 1 → ${rain.L.sun} · 0.5 → ${half.L.sun} · 밝기 ${noon.lum} → ${rain.lum}`);
    REC.light.png = { noon: noon.data, eve: eve.data, rain: rain.data };
  }

  // ── ⓔ 프레임 짝 — 몸 1·10·100 × 시트·메시 ──
  console.log('\nⓔ 프레임 — 몸 1·10·100 × 시트·메시(같은 자 `__frameCapture` · 최적화 0 · 적기만)');
  const FIELD = { x: vx + 20 * 32, y: vy - 12 * 32 };
  { const offF = await offOf(P); let land = false;
    for (let r = 0; r <= 6 && !land; r++) for (let dx = -r; dx <= r && !land; dx++) land = await tpTo(P, offF, FIELD.x + dx * 64, FIELD.y + r * 64);
    REC.e_spot = land; }
  await sleep(3000);
  for (const N of [1, 10, 100]) for (const mode of ['sheet', 'mesh']) {
    await P.evaluate(([n, md]) => { window.__char3d.benchN = n; window.__char3d.mode = md; }, [N, mode]);
    await sleep(1500);
    const cap = await P.evaluate(async () => { const acc = { gl: [], blit: [] }; let last = null;
      const S0 = { ...window.__char3d.stats };
      const h = setInterval(() => { const l = window.__char3d.lastDraw; if (l && l !== last) { last = l; acc.gl.push(l.gl); acc.blit.push(l.blit); } }, 5);
      const fc = await window.__frameCapture(5); clearInterval(h);
      const S1 = { ...window.__char3d.stats };
      const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
      return { fc, gl: mean(acc.gl), blit: mean(acc.blit), n: acc.gl.length,
               glR: S1.glRenders - S0.glRenders, bodyF: S1.bodyFrames - S0.bodyFrames, toks: S1.tok - S0.tok, bodies: S1.bodies, calls: S1.calls }; });
    const fc = cap.fc;
    const row = { N, mode, fps: fc.frames.fps, p50: fc.frames.p50, p95: fc.frames.p95, renderMs: +(fc.frames.sum.render / Math.max(1, fc.frames.n)).toFixed(2),
                  gl: mode === 'mesh' ? cap.gl : null, blit: mode === 'mesh' ? cap.blit : null,
                  glRenders: cap.glR, bodyFrames: cap.bodyF, toks: cap.toks, bodies: mode === 'mesh' ? cap.bodies : null, calls: mode === 'mesh' ? cap.calls : null };
    REC.e.push(row);
    console.log(`    [짝] 몸 ${N} · ${mode} · 렌더 ${row.renderMs}ms/프레임 · 프레임 p50 ${row.p50} · p95 ${row.p95} · fps ${row.fps}${row.gl != null ? ` · (3D 한 판 ${row.gl}ms + 옮기기 ${row.blit}ms · 몸 ${row.bodies} · 그리기 호출 ${row.calls}) · WebGL 렌더 ${row.glRenders}번 / 3D 몸 판 ${row.bodyFrames}` : ''}`);
    if (N === 100) await P.screenshot({ path: `/tmp/e2e-char3d-bench-${mode}.png` });
  }
  await P.evaluate(() => { window.__char3d.benchN = 1; window.__char3d.mode = 'mesh'; });
  const r1 = REC.e.filter((r) => r.N === 100);
  ok(REC.e.length === 6 && REC.e.every((r) => r.renderMs > 0), 'ⓔ 짝 여섯을 쟀다(몸 1·10·100 × 시트·메시)', r1.map((r) => `${r.mode} ${r.renderMs}ms`).join(' · '));
  {
    const ms = REC.e.filter((r) => r.mode === 'mesh');
    ok(ms.every((r) => r.bodyFrames > 0 && r.glRenders === r.bodyFrames), '② [T539] ★장면 한 번 — 3D 몸을 부른 판마다 WebGL 렌더 1(몸 1·10·100 다)',
       ms.map((r) => `몸 ${r.N}: 렌더 ${r.glRenders} / 판 ${r.bodyFrames}`).join(' · '));
    ok(ms.every((r) => r.bodies > 0 && r.calls === r.bodies), 'ⓔ [T545] ★그리기 호출 = 몸 수 — 몸마다 메시 하나·재질 하나(T539 는 몸 × 메시 15 · 족보 487 "다음 수")',
       ms.map((r) => `몸 ${r.bodies}: 호출 ${r.calls}`).join(' · '));
    const sh = REC.e.filter((r) => r.mode === 'sheet');
    ok(sh.every((r) => r.glRenders === 0), '② 시트 판(기준선)은 WebGL 렌더 0 — 벤치가 정말 시트로만 그렸다', sh.map((r) => r.glRenders).join(' · '));
    const S = r1.find((r) => r.mode === 'sheet'), M = r1.find((r) => r.mode === 'mesh');
    REC.e100 = { sheet: S && S.renderMs, mesh: M && M.renderMs, ratio: S && M ? +(M.renderMs / S.renderMs).toFixed(2) : null };
    console.log(`    [표] 몸 100 · 시트 ${REC.e100.sheet}ms · 메시 ${REC.e100.mesh}ms · 메시 ÷ 시트 ×${REC.e100.ratio}(적기만 · SwiftShader 는 GPU 가 CPU 다)`);
  }
  ok(B.errs.length === 0, 'ⓒ pageerror 0(켬)', B.errs.slice(0, 2).join(' | '));

  // ── ① 남의 몸 · 주민 — 시트가 고르던 그 자리에서 몸마다 모드 하나 ──
  console.log('\n① 남의 몸 · 주민 — 같은 문(`drawCharSprite` 층 고리)으로 3D · 도구 층은 3D 손목을 따른다');
  const recent = (PG) => PG.evaluate(() => { const d = window.__charDbg || {}, now = performance.now(), out = [];
    for (const k of Object.keys(d)) { const e = d[k]; if (e && e.on && !e.isMe && now - e.t < 400) out.push({ pid: k, job: e.job || null, mesh: !!e.mesh, full: !!e.meshFull, hand: e.hand || null, clip: e.clip, frame: e.frame, row: e.row, layers: (e.layers || []).slice(), speed: e.speed }); }
    return out; });
  const offP = await offOf(P);
  // 시트 합성 ↔ 3D 합성(타일 자리 · 알파 > 127) — 그 몸이 이번에 그린 판(클립·판·행·층)으로: 발밑 줄 Δ · 발 가운데 Δx(적기만 — 실루엣이 다르다)
  const CHK = (list) => P.evaluate((L0) => {
    const m = charMeta(), fw = m.frameW, fh = m.frameH, N = fw * fh, out = [], C = window.__char3d;
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; const g = cv.getContext('2d', { willReadFrequently: true });
    const mk = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0; return o; };
    const st = (k) => { let y1 = -1, fx = 0, fn = 0; for (let i = 0; i < N; i++) if (k[i]) y1 = Math.max(y1, (i / fw) | 0);
      for (let i = 0; i < N; i++) if (k[i] && ((i / fw) | 0) >= y1 - 3) { fx += i % fw; fn++; } return { y1, fx: fn ? fx / fn : 0 }; };
    for (const e of L0) {
      const sheets = e.layers.map((L) => charSheet(L + '_' + e.clip));
      const md = C.modeOf(e.layers, e.clip);
      if (!sheets.every(Boolean) || !md || !md.kind) { out.push({ pid: e.pid, skip: 'sheet' }); continue; }
      const sx = e.frame * fw, sy = e.row * fh;
      g.clearRect(0, 0, fw, fh); e.layers.forEach((L, i) => { if (L !== 'band') g.drawImage(sheets[i], sx, sy, fw, fh, 0, 0, fw, fh); });
      const S = mk(g.getImageData(0, 0, fw, fh).data);
      const t = C.snap(e.row, e.clip, e.frame, { kind: md.kind });
      const hs = m.handScreen && m.handScreen[e.clip] && m.handScreen[e.clip][e.row] && m.handScreen[e.clip][e.row][e.frame];
      const hand = hs ? [Math.round(t.wrist[0] - hs[0]), Math.round(t.wrist[1] - hs[1])] : null;
      g.clearRect(0, 0, fw, fh); g.putImageData(new ImageData(new Uint8ClampedArray(t.data), fw, fh), 0, 0);
      e.layers.forEach((L, i) => { if (C.meshLayer(L) || L === 'band') return; const o = (hand && L.startsWith('tool_')) ? hand : [0, 0]; g.drawImage(sheets[i], sx, sy, fw, fh, o[0], o[1], fw, fh); });
      const M = mk(g.getImageData(0, 0, fw, fh).data);
      const a = st(S), b = st(M);
      out.push({ pid: e.pid, job: e.job, clip: e.clip, layers: e.layers.join('+'), cont: md.cont, bottom: b.y1 - a.y1, feetX: +(b.fx - a.fx).toFixed(2), hand, drawnHand: e.hand });
    }
    return out;
  }, list);
  // ①-a 남의 몸 — 둘째 접속 Q(손잡이 끔 · 제 화면은 시트)를 들판에 내 곁에 세우고 P 화면에서 Q 몸을 잰다
  {
    const Q = await open('');
    const SP = FIELD;
    let spot = null;
    for (let r = 0; r <= 6 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) {
      const x = SP.x + dx * 64, y = SP.y + r * 64;
      if (await tpTo(P, offP, x, y) && await tpTo(Q.page, await offOf(Q.page), x + 64, y - 64)) spot = { x, y };
    }
    await sleep(2500);
    // ★Q 의 pid 는 자리를 잡은 **뒤에** 읽는다 — 새 접속은 들어오며 한 번 다시 붙고 그때 pid 가 바뀐다(실측: 존 로그 `게스트 접속` 두 줄)
    const qpid = String(await Q.page.evaluate(() => myPid));
    const qPos = () => P.evaluate((qp) => { for (const c of conns.values()) { const o = c.others.get(qp); if (o) { const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0; const s2 = window.__w2s(ox + o.x, oy + o.y); return [s2.px, s2.py]; } } return null; }, qpid);
    await P.waitForFunction((qp) => { const e = (window.__charDbg || {})[qp]; return !!(e && e.on && e.mesh && performance.now() - e.t < 400); }, qpid, { timeout: 20000 }).catch(() => {});
    // Q 의 시계를 멈춘다(서기도 숨을 쉰다) — 화면 판과 재는 판이 같은 자세가 되게
    await P.evaluate((qp) => { const st = _charAnim.get(qp) || _charAnim.get(+qp); if (st) Object.defineProperty(st, 't', { get: () => 0, set: () => {}, configurable: true }); }, qpid);
    // Q 몸만 빼는 문 — 그 몸이면 그림자만 그리고 돌아간다(이름표는 이미 껐다 · 재는 판 전용)
    await P.evaluate(() => { window.__t539hide = null; if (!window.__t539wrap) { window.__t539wrap = true; const d0 = drawCharSprite;
      drawCharSprite = function (x, y, isMe, opts) { if (window.__t539hide && opts && String(opts.pid) === window.__t539hide) { if (!opts.carriedOn) drawCharShadow(x, y, !!opts.down); return true; } return d0.apply(this, arguments); }; } });
    await sleep(800);
    const q0 = (await recent(P)).find((e) => e.pid === qpid) || null;
    const qp = await qPos();
    let gM = null, gS = null, gB = null, tileQ = null, snapQ = null;
    if (qp && q0) {
      const cx = Math.round(qp[0]), cy = Math.round(qp[1]);
      const grab = async () => PNG.sync.read(await P.screenshot({ clip: { x: cx - 60, y: cy - 90, width: 120, height: 100 } }));
      await P.evaluate(() => { window.__char3d.mode = 'mesh'; window.__t539hide = null; }); await sleep(700); gM = await grab();
      tileQ = await P.evaluate((q) => window.__char3d.tileOf(q), qpid);
      snapQ = tileQ ? await P.evaluate((tq) => { const t = window.__char3d.snap(tq.row, tq.clip, tq.frame, { kind: tq.kind, yaw: tq.yaw }); return { data: t.data, w: t.w, h: t.h, ax: t.ax, ay: t.ay }; }, tileQ) : null;
      await P.evaluate(() => { window.__char3d.mode = 'sheet'; }); await sleep(700); gS = await grab();
      await P.evaluate((q) => { window.__char3d.mode = 'mesh'; window.__t539hide = q; }, qpid); await sleep(700); gB = await grab();
      await P.evaluate(() => { window.__t539hide = null; });
      REC.one.qcrop = [cx, cy];
    }
    // ★자리 — 화면 몸 화소(3D 판 − 몸 뺀 판) ↔ 같은 자세 타일을 앵커에 놓은 것: 어긋남(dx,dy) 을 ±3px 에서 찾는다 · 기대 = (0,0)
    let place = null;
    if (gB && snapQ) {
      const W = gM.width, H = gM.height;
      const dif = (a, b, i) => Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      const scr = new Uint8Array(W * H); let n = 0; for (let i = 0; i < W * H; i++) if (dif(gM, gB, i * 4) > 8) { scr[i] = 1; n++; }
      const [cx, cy] = REC.one.qcrop;
      const ox = Math.round(qp[0] - snapQ.ax) - (cx - 60), oy = Math.round(qp[1] - snapQ.ay) - (cy - 90);   // 타일 왼쪽 위(자르기 좌표) = drawCharSprite 의 dx·dy
      const tm = (x, y) => (x >= 0 && y >= 0 && x < snapQ.w && y < snapQ.h) ? (snapQ.data[(y * snapQ.w + x) * 4 + 3] > 127 ? 1 : 0) : 0;
      let best = null;
      for (let sy = -3; sy <= 3; sy++) for (let sx = -3; sx <= 3; sx++) {
        let I = 0, U = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = scr[y * W + x], b = tm(x - ox - sx, y - oy - sy); if (a && b) I++; if (a || b) U++; }
        const s = U ? I / U : 0; if (!best || s > best.s) best = { sx, sy, s };
      }
      place = { dx: best.sx, dy: best.sy, overlap: +best.s.toFixed(3), screenPx: n };
    }
    const tc = q0 ? (await CHK([q0]))[0] : null;
    REC.one.other = { pid: qpid, spot, dbg: q0, tile: tileQ, place, sheetCmp: tc, png: gM ? [gM, gS] : null };
    ok(!!(q0 && q0.mesh && !q0.job && tileQ && tileQ.cont), '①-a 남의 몸(둘째 접속 · 삼베 기본옷)이 3D 로 그려졌다 — 같은 문 · 온 메시(연속)', q0 ? JSON.stringify({ mesh: q0.mesh, clip: q0.clip, layers: q0.layers, kind: tileQ && tileQ.kind }) : '안 보였다');
    ok(!!place && place.dx === 0 && place.dy === 0 && place.screenPx > 300,
       '①-a ★남의 몸 타일이 제 앵커에 섰다 — 화면 몸 화소 ↔ 같은 자세 타일(앵커에 놓은): 가장 잘 겹치는 어긋남 = (0,0)px',
       place ? `어긋남 (${place.dx},${place.dy}) · 겹침 ${place.overlap} · 화면 몸 ${place.screenPx}px${tc && !tc.skip ? ` · (적기만) 시트 합성 대비 발밑 Δ ${tc.bottom} · 발 가운데 Δx ${tc.feetX}` : ''}` : '못 쟀다');
    await Q.page.context().close();
  }
  // ①-b 주민 — 마을로 가서 주민이 그려지는 동안 표본을 모은다: 모드 = 같은 술어 · 도구 층 옮김
  // ⑤ 광장 그림 — 그려진 주민이 가장 많은 순간에 3D 판 · 시트 판을 붙여 찍는다(말풍선·이름표는 그림에서 뺀다)
  {
    await P.evaluate(() => { try { drawSpeechBubble = function () {}; } catch (e) { } });
    const seenN = new Map();           // pid → {job, n, mesh, want, chk}
    let bestShot = null, bestK = 0;
    await tpTo(P, offP, vx, vy);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      await sleep(700);
      const rs = (await recent(P)).filter((e) => e.job);
      const wants = await P.evaluate((L) => L.map((e) => { const md = window.__char3d.modeOf(e.layers, e.clip); return md && md.kind ? '3D' : ('시트:' + (md && md.why)); }), rs);
      rs.forEach((e, i) => { let v = seenN.get(e.pid); if (!v) { v = { job: e.job, n: 0, agree: 0, mesh: 0, want3d: 0, tools: 0, hand: 0, chk: null, whys: new Set() }; seenN.set(e.pid, v); }
        v.n++; if (e.mesh) v.mesh++; if (wants[i] === '3D') v.want3d++; else v.whys.add(wants[i]); if ((wants[i] === '3D') === e.mesh) v.agree++;
        if (e.mesh && e.layers.some((L) => L.startsWith('tool_'))) { v.tools++; if (Array.isArray(e.hand)) v.hand++; } });
      const todo = rs.filter((e) => e.mesh && !seenN.get(e.pid).chk);
      if (todo.length) for (const r of await CHK(todo)) { const v = seenN.get(r.pid); if (v) v.chk = r; }
      if (rs.length > bestK && rs.length >= 3) {
        bestK = rs.length;
        const fM = PNG.sync.read(await P.screenshot());
        const npcScr = await P.evaluate((pids) => (window.__getNpcs ? window.__getNpcs() : []).filter((q) => pids.includes(String(q.pid))).map((q) => { const s2 = window.__w2s(q.wx, q.wy); return [Math.round(s2.px), Math.round(s2.py), q.job]; }), rs.map((e) => String(e.pid)));
        await P.evaluate(() => { window.__char3d.mode = 'sheet'; }); await sleep(150);
        const fS = PNG.sync.read(await P.screenshot());
        await P.evaluate(() => { window.__char3d.mode = 'mesh'; });
        bestShot = { frames: [fM, fS], npcScr, drawn: rs.length, mesh: rs.filter((e) => e.mesh).length };
      }
      const multiN = [...seenN.values()].filter((v) => v.n >= 3).length;
      if (multiN >= 5 && [...seenN.values()].some((v) => v.tools > 0) && (bestK >= 10 || Date.now() - t0 > 30000)) break;
      if (rs.length < 3 && ((Date.now() - t0) / 700 | 0) % 6 === 5) {
        const tgt = await P.evaluate((o) => { const n = window.__getNpcs ? window.__getNpcs() : []; let best = null;
          for (const q of n) { const k = n.filter((r) => Math.hypot(r.wx - q.wx, r.wy - q.wy) < 256).length; if (!best || k > best.k) best = { k, x: Math.round(q.wx - o[0]), y: Math.round(q.wy - o[1]) }; } return best; }, offP);
        if (tgt) await tpTo(P, offP, tgt.x + 48, tgt.y + 48);
      }
    }
    const all = [...seenN.values()];
    const multi = all.filter((v) => v.n >= 3);
    const agreeAll = multi.filter((v) => v.agree >= v.n - 1);          // 처음 보인 한 판은 시트(타일이 한 판 늦다)
    const toolMesh = all.filter((v) => v.tools > 0);
    const chk = all.map((v) => v.chk).filter((r) => r && !r.skip);
    REC.one.npc = { distinct: all.length, multi: multi.length, agree: agreeAll.length, mesh3d: multi.filter((v) => v.want3d > 0).length,
                    sheetWhy: [...new Set(all.flatMap((v) => [...v.whys]))], toolBodies: toolMesh.length, toolHand: toolMesh.filter((v) => v.hand === v.tools).length,
                    jobs: [...new Set(all.map((v) => v.job))], rows: chk };
    console.log('    [표] 주민 · 클립 · 층 · 연속 · (적기만) 시트 합성 대비 발밑 Δ · 발 가운데 Δx · 도구 옮김(px)');
    for (const r of chk.slice(0, 14)) console.log(`      ${r.job} · ${r.clip} · ${r.layers} · ${r.cont ? '○' : '-'} · ${r.bottom} · ${r.feetX} · ${r.hand ? r.hand.join(',') : '-'}`);
    REC.one.npc.seen3d = all.filter((v) => v.mesh > 0).length;
    ok(multi.length >= 3 && agreeAll.length === multi.length,
       `①-b ★세 표본(0.7초 간격) 넘게 그려진 주민 ${multi.length}명 — 그린 모드 = 같은 술어(옷 넷 · 클립)로 기대한 모드(처음 한 판만 시트 · 직업 ${REC.one.npc.jobs.join(',')})`,
       `일치 ${agreeAll.length}/${multi.length} · 3D 로 그려진 주민 ${REC.one.npc.seen3d}/${all.length} · 시트 사유 ${REC.one.npc.sheetWhy.join(' ') || '0'}(cloth = 옷 넷 밖 — 다섯째부터 회부)`);
    console.log(`    [곁] 도구 든 3D 주민 ${REC.one.npc.toolHand}/${toolMesh.length}명 옮김 있음 · 예 ${chk.filter((r) => r.hand).slice(0, 4).map((r) => `${r.job}:${r.hand.join(',')}`).join(' ') || '-'}(관문은 아래 ①-c — 내 몸으로 잰다 · 주민 옷은 마을 곳간이 정한다)`);
    REC.five = bestShot ? { frames: bestShot.frames, npcScr: bestShot.npcScr, drawn: bestShot.drawn, mesh: bestShot.mesh } : {};
    ok(!!bestShot && bestShot.drawn >= 3, `⑤ 마을 광장 — 그려진 주민 ${bestShot ? bestShot.drawn : 0}명(3D ${bestShot ? bestShot.mesh : 0}) · 3D 판 · 시트 판 두 장(그림)`);
  }
  // ①-c 도구 든 몸(나 · 도끼) — 층이 몸 + 가죽옷 + 도끼면 3D 몸이 시트 판에 서고(ⓑ) 도끼 층은 3D 오른 손목을 따른다
  {
    await send(P, { type: '__e2e_give', tools: ['axe'] });
    await P.waitForFunction(() => Array.isArray(toolItems) && toolItems.some((t) => t.type === 'axe'), { timeout: 20000 }).catch(() => {});
    await send(P, { type: 'equip', tool: 'axe' });
    await P.waitForFunction(() => { const d = window.__charDbg || {}; for (const k of Object.keys(d)) { const e = d[k]; if (e && e.isMe && (e.layers || []).includes('tool_axe') && e.mesh && Array.isArray(e.hand) && performance.now() - e.t < 300) return true; } return false; }, { timeout: 20000 }).catch(() => {});
    const got = await P.evaluate(() => { const d = window.__charDbg || {}; let me = null; for (const k of Object.keys(d)) if (d[k] && d[k].isMe) me = d[k];
      if (!me || !Array.isArray(me.hand)) return { me };
      const t = window.__char3d.snap(me.row, me.clip, me.frame, { kind: 'leather' }), hs = charMeta().handScreen[me.clip][me.row][me.frame];
      return { me: { layers: me.layers, clip: me.clip, frame: me.frame, row: me.row, hand: me.hand, mesh: me.mesh }, cont: window.__char3d.lastDraw && window.__char3d.lastDraw.cont,
               want: [Math.round(t.wrist[0] - hs[0]), Math.round(t.wrist[1] - hs[1])], wrist: t.wrist, sheetWrist: hs }; });
    REC.one.tool = got;
    ok(!!(got.me && got.me.mesh && got.cont === false && got.want && got.me.hand[0] === got.want[0] && got.me.hand[1] === got.want[1]),
       '①-c ★도구 든 몸(나 · 가죽옷 + 도끼) — 3D 몸이 시트 판에 서고(ⓑ · 연속 아님) 도끼 층이 3D 오른 손목을 따른다(옮김 = 같은 판 타일의 손목 − 시트 `handScreen`)',
       got.me ? `${got.me.layers.join('+')} · ${got.me.clip} ${got.me.frame}판 행 ${got.me.row} · 옮김 ${got.me.hand} = 기대 ${got.want} · 3D 손목 ${got.wrist} · 시트 손목 ${got.sheetWrist}` : '못 쟀다');
    await send(P, { type: 'equip', tool: null });
  }
  ok(B.errs.length === 0, '① pageerror 0(켬 · 남의 몸·주민)', B.errs.slice(0, 2).join(' | '));

  // ── 덮개 비교: 위에 얹은 투명 캔버스(overlay) ──
  console.log('\nⓒ 비교 — 2D 위에 투명 캔버스로 얹으면(overlay) 산의 흐림 겹이 몸을 못 덮는다');
  {
    const O = await open('?T522_CHAR_3D=overlay');
    await O.page.waitForFunction(() => window.__char3d && window.__char3d.ready, { timeout: 90000 }).catch(() => {});
    await send(O.page, { type: '__e2e_give', equip: [{ type: 'clothes', material: 'leather', lvl: 5 }] });
    const oc = occ.spot ? await occOf(O.page, 'overlay', occ.spot) : { out: {} };
    const OV = oc.out.overlay || {};
    REC.c.occ.overlay = { mask: OV.mask, tint: OV.tint, k: OV.k, noise: OV.noise, here: oc.here };
    occ.out.overlay = OV;
    ok(OV.mask > 300 && oc.here && oc.here.n > 0 && OV.tint < 1,
       'ⓒ ★덮개(overlay)는 가림 × — 같은 자리에서 산을 켜도 몸 화소가 **그대로**다(흐림 겹 **위**에 얹혔다 · 가리려면 새 규칙이 든다)',
       `덮개 바뀐 양 ${OV.tint}(0–255) · k ${OV.k} · 몸 ${OV.mask}px · 덮는 산 ${oc.here && oc.here.n}`);
    await O.page.context().close();
  }
  // ── 그림 — 하네스 그림(한 장 · 캡션 · 같은 브라우저로 그린다 · 화소 그대로 · 확대는 계단식) ──
  if (OUTPNG) {
    const crop = (png, cx, cy, w, h) => { const o = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(png.width - 1, Math.max(0, cx - (w >> 1) + x)), sy = Math.min(png.height - 1, Math.max(0, cy - (h >> 1) + y)); png.data.copy(o.data, (y * w + x) * 4, (sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4); } return o; };
    const uri = (png) => 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
    const im = (png, z, cap) => `<figure><img src="${uri(png)}" width="${png.width * z}" height="${png.height * z}">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
    const E = (n, m) => REC.e.find((r) => r.N === n && r.mode === m) || {};
    const onBg = (arr, fw, fh) => { const o = new PNG({ width: fw, height: fh }); for (let i = 0; i < fw * fh * 4; i += 4) { const a = arr[i + 3] / 255; o.data[i] = Math.round(arr[i] * a + 70 * (1 - a)); o.data[i + 1] = Math.round(arr[i + 1] * a + 84 * (1 - a)); o.data[i + 2] = Math.round(arr[i + 2] * a + 62 * (1 - a)); o.data[i + 3] = 255; } return o; };
    const fw = CHMETA.frameW, fh = CHMETA.frameH;
    const sec = [];
    if (REC.t604 && REC.t604.studio) {                         // [T604] 청동기 옷 — 큰 그림 · 게임 크기 3D ↔ 시트 · (아래) 마을 광장
      const ko = { hemp: '삼베', ramie: '모시', leather: '가죽', fur: '갖옷' }, dn = { 1: '앞', 3: '옆' }, D = [1, 3];
      const st = REC.t604.studio, cut = (s) => (META.bodies[s].clothes || {}).cut || {};
      const fig = (src, cap) => `<figure><img src="${src}" style="image-rendering:auto"><figcaption>${cap}</figcaption></figure>`;
      for (const sx of ['M', 'F']) {
        const C = META.bodies[sx].clothes || {};
        sec.push(`<section><h2>${sx === 'M' ? '남' : '여'} — ${sx === 'M' ? '시트 그대로: 옷자락 단(시트 SKIRT_R 맨 아래) · 반팔 · 허리띠' : '긴 웃옷: 단 무릎(Z_KNEE) · 긴팔(손목까지) · 허리띠'} · 쉼 자세(묶기 자세 — 옷 꼴 그대로) · 게임 투영 · 4배 <b>(관 링 ${C.rings} · 소매 링 ${C.sleeve} · 옷 삼각형 ${C.tris_base} · 몸 ${META.bodies[sx].tris})</b></h2>
          <div class="row">${META.clothKinds.map((k) => D.map((d) => fig(st[`${sx}_${k}_${d}`], `${ko[k]} · ${dn[d]}`)).join('')).join('')}</div></section>`);
      }
      sec.push(`<section><h2>움직임 — 걷기(삼베 · 옆 · 0·2·4·6판) · 달리기(갖옷 · 앞 · 0·2·4·6판) — 남 · 여 <b>(옷자락 = MakeHuman 치마 보조 기하에 묶임 · 소매 = 위팔·아래팔)</b></h2>
        <div class="row">${['M', 'F'].map((sx) => [0, 2, 4, 6].map((f) => fig(st[`walk_${sx}_${f}`], `${sx === 'M' ? '남' : '여'} 걷기 ${f}`)).join('')).join('')}</div>
        <div class="row">${['M', 'F'].map((sx) => [0, 2, 4, 6].map((f) => fig(st[`run_${sx}_${f}`], `${sx === 'M' ? '남' : '여'} 달리기 ${f}`)).join('')).join('')}</div></section>`);
      const tri = (k, d) => `<div class="pair">${im(onBg(REC.t604.snap[`M_${k}_${d}`], fw, fh), 3, `3D ${ko[k]} ${dn[d]}`)}${im(onBg(REC.t604.sheet[`${k}_${d}`], fw, fh), 3, `시트 ${ko[k]} ${dn[d]} · IoU ${REC.t604.iou[`${k}_${d}`]}`)}</div>`;
      sec.push(`<section><h2>게임 크기 — 남 몸 3D ↔ 시트(같은 판: 서기 0판 · 같은 방향 · ×3 계단) <b>(실루엣 겹침은 적기만 — 판정은 재민)</b></h2>
        <div class="row">${['hemp', 'leather'].map((k) => D.map((d) => tri(k, d)).join('')).join('')}</div>
        <div class="row">${['ramie', 'fur'].map((k) => D.map((d) => tri(k, d)).join('')).join('')}</div>
        <div class="row">${META.clothKinds.map((k) => D.map((d) => im(onBg(REC.t604.snap[`F_${k}_${d}`], fw, fh), 3, `여 3D ${ko[k]} ${dn[d]}`)).join('')).join('')}</div></section>`);
    }
    if (REC.five.frames) {                                     // ⑤ 마을 광장(T604 그림의 "마을 광장 한 컷"도 이 판)
      const [fM, fS] = REC.five.frames, ps = REC.five.npcScr || [];
      const mx = ps.length ? ps.reduce((s, q) => s + q[0], 0) / ps.length : VW >> 1, my = ps.length ? ps.reduce((s, q) => s + q[1], 0) / ps.length - 30 : (VH >> 1) - 10;
      const cx = Math.round(Math.max(310, Math.min(VW - 310, mx))), cy = Math.round(Math.max(210, Math.min(VH - 210, my)));
      sec.push(`<section><h2>⑤ 마을 광장 — 주민 3D(MPFB 소체) + 시트 도구·등짐 층 · 같은 자리 시트 판 <b>(그려진 주민 ${REC.five.mesh}/${REC.five.drawn} 3D)</b></h2>
        <div class="row">${im(crop(fM, cx, cy, 620, 420), 1, '3D — 몸·옷은 메시 하나 · 도구는 3D 손목을 따른 시트 층')}${im(crop(fS, cx, cy, 620, 420), 1, '시트 — 같은 자리(0.15초 사이)')}</div></section>`);
      const pts = (REC.five.npcScr || []).filter((q) => q[0] > 140 && q[0] < VW - 140 && q[1] > 110 && q[1] < VH - 70);
      let best = null; for (const q of pts) { const k = pts.filter((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 110).length; if (!best || k > best.k) best = { q, k }; }
      if (best) sec.push(`<section><h2>⑤ 확대 ×2 — 주민 ${best.k}명 둘레</h2><div class="row">${im(crop(fM, best.q[0], best.q[1] - 30, 280, 180), 2, '3D')}${im(crop(fS, best.q[0], best.q[1] - 30, 280, 180), 2, '시트')}</div></section>`);
    }
    if (REC.d.kindPng && FIG !== 't604') {
      sec.push(`<section><h2>ⓓ 옷 넷 — 같은 몸·판(걷기 2판 · 방향 1) <b>(밝기 ${REC.d.ordMesh.join(' > ')})</b></h2><div class="row">${META.clothKinds.map((k) => im(onBg(REC.d.kindPng[k], fw, fh), 3, k)).join('')}</div></section>`);
    }
    if (REC.light.png && FIG !== 't604') {
      sec.push(`<section><h2>④ 빛 — 한낮 · 저녁(u 0.9) · 큰비 <b>(직사광 ${REC.light.noon.sun} · ${REC.light.eve.sun} · ${REC.light.rain.sun})</b></h2><div class="row">${['noon', 'eve', 'rain'].map((k) => im(onBg(REC.light.png[k], fw, fh), 3, k)).join('')}</div></section>`);
    }
    if (REC.one.other && REC.one.other.png && FIG !== 't604') {
      const [gM, gS] = REC.one.other.png, o = REC.one.other;
      sec.push(`<section><h2>① 남의 몸(둘째 접속 · 삼베옷) — 화면 3D ↔ 시트 <b>(타일 자리 어긋남 ${o.place ? `(${o.place.dx},${o.place.dy})` : '-'}px)</b></h2>
        <div class="row">${im(gM, 3, '3D × 3')}${im(gS, 3, '시트 × 3')}</div></section>`);
    }
    if (FIG !== 't604' && fs.existsSync('/tmp/e2e-char3d-bench-mesh.png') && fs.existsSync('/tmp/e2e-char3d-bench-sheet.png')) {
      const bs = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-sheet.png')), bm = PNG.sync.read(fs.readFileSync('/tmp/e2e-char3d-bench-mesh.png'));
      const M = E(100, 'mesh');
      sec.push(`<section><h2>② 몸 100 — 장면 한 번(WebGL 렌더 ${M.glRenders}번 / 3D 판 ${M.bodyFrames}) · 그리기 호출 ${M.calls} <b>(SwiftShader 렌더 시트 ${E(100, 'sheet').renderMs}ms / 메시 ${M.renderMs}ms)</b></h2>
        <div class="row">${im(crop(bs, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `시트 — 몸 1 · 10 · 100 = ${E(1, 'sheet').renderMs} · ${E(10, 'sheet').renderMs} · ${E(100, 'sheet').renderMs} ms`)}${im(crop(bm, VW >> 1, (VH >> 1) - 40, 600, 330), 1, `메시 — ${E(1, 'mesh').renderMs} · ${E(10, 'mesh').renderMs} · ${M.renderMs} ms`)}</div></section>`);
    }
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#1b1f1b;color:#e6e9e3;font:15px 'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif}
      .w{padding:22px;display:grid;gap:22px;width:max-content}
      h1{margin:0;font-size:20px;font-weight:700}
      section{display:grid;gap:8px} h2{margin:0;font-size:16px;font-weight:600} h2 b{color:#e0b074;font-weight:600}
      .row{display:flex;gap:10px;align-items:flex-start} figure{margin:0;display:grid;gap:4px} .pair{display:flex;gap:2px;padding-right:10px}
      img{image-rendering:pixelated;display:block;border:1px solid #3a423a} figcaption{font-size:12.5px;color:#b7bfb4}
      .num{font-family:'Noto Sans Mono CJK KR',monospace}
    </style><div class="w">
      <h1>${FIG === 't604' ? 'T604 ② — 청동기 옷(시트 링 표 → 3D 몸 → MPFB mhclo) · 옷 넷 × 남·여 · 앞·옆 · 마을 광장 한 컷' : 'T545 — 소체 교체(MPFB 실사풍 저폴리) · 하네스 그림'} (손잡이 <span class="num">/?T522_CHAR_3D=1</span> · 끔이 기본)</h1>
      ${sec.join('\n')}
    </div>`;
    const pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })).newPage();
    await pg.setContent(html, { waitUntil: 'load' });
    await pg.screenshot({ path: OUTPNG, fullPage: true });
    const sz = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    console.log('→', OUTPNG, `${sz[0]}x${sz[1]}`);
  }
  await browser.close();
  if (OUTJSON) { const r = JSON.parse(JSON.stringify(REC, (k, v) => (['turnPng', 'kindPng', 'png', 'frames', 'thumbs', 'data', 'snap', 'sheet', 'studio'].includes(k) ? undefined : v))); fs.writeFileSync(OUTJSON, JSON.stringify(r, null, 1)); }
  console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
