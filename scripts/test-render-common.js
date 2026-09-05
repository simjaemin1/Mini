#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 렌더 공용 모듈 하네스 [T77 2026-09-03] ====================================
//
// 지키는 계약 다섯:
//   ① 헬퍼가 **한 벌**이다 — 두 렌더 스크립트에 `def principled|simple_mat|striped_mat|
//      bumped_mat|box|cyl|ico` 가 0회. (다시 적는 순간 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.)
//   ② 씬 값이 **한 곳**이다 — SAMPLES·PPU·ZSQ·ISO_DIR·태양·월드·clip 이 공용 모듈에만 있다.
//   ③ 팔레트는 **두 벌로 남는다** — 공용 모듈엔 `M` 표가 없고 두 파일이 각자 갖는다.
//      (icon 의 `stone` 과 props 의 `stone` 은 다른 돌이다 — 합치면 그림이 바뀐다. T77 §0-ⓒ)
//   ④ 갈린 기본값이 **안 샌다** — 합치면서 두 판의 기본값이 갈린 인자는 호출부가 명시로 잠갔다.
//      `ico.subdiv`·`cyl.verts` 는 지금 생략 호출이 0이라 합친 기본값이 **닿지 않는다**.
//      새 모델(T79 작물 등)이 무심코 생략하면 icon 쪽이 옛 기본값과 다른 그림을 낸다 — 여기서 잡는다.
//   ⑤ **바이트 대조 표를 다시 읽는다** — `보고/T77_2026-09-03.md` 의 85행 표가 없거나
//      `0` 이 아닌 행이 있으면 빨강. (표를 지우면 "합쳤다"는 주장의 증인이 사라진다.)
//
// ★검사기는 정본을 스스로 찾는다(족보 79): 헬퍼 목록은 공용 모듈에서, 호출부는 AST 대신
//   소스 정규식으로 **직접 읽는다**. 어느 표도 여기 옮겨 적지 않았다.
// ★이 하네스는 **자기가 실패할 줄 안다**: `--selftest` 로 계약 다섯을 일부러 깨 본다.
//
// 실행: node scripts/test-render-common.js  [--selftest]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const COMMON = path.join(ROOT, 'scripts', 'render_common.py');
const SCRIPTS = [
  ['icon_render.py', path.join(ROOT, 'scripts', 'icon_render.py')],
  ['props_render.py', path.join(ROOT, 'scripts', 'props_render.py')],
  // ★[T97] 자연물도 편입됐다 — 씬·헬퍼 한 벌을 따로 갖고 있던 렌더 스크립트였다.
  ['nature_render.py', path.join(ROOT, 'scripts', 'nature_render.py')],
  // ★[T103] 건물이 마지막이었다. 이제 굽는 스크립트 넷이 전부 공용 문법을 쓴다.
  ['building_render.py', path.join(ROOT, 'scripts', 'building_render.py')],
];
const NATURE = path.join(ROOT, 'scripts', 'nature_render.py');
const REPORT = path.join(ROOT, '보고', 'T77_2026-09-03.md');

const rd = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
let common = rd(COMMON);
const srcs = SCRIPTS.map(([n, p]) => [n, rd(p)]);

// --selftest: 오염본으로 갈아 끼운다(파일은 안 건드린다 — 메모리에서만)
if (SELFTEST) {
  common = (common || '') + '\nM = {}\n';                        // ③ 오염
  srcs[0][1] = (srcs[0][1] || '')
    .replace('import render_common as rc', 'import render_common as rc\ndef ico(r, loc): pass')  // ① 오염
    + '\nSAMPLES = 64\nPPU = 45.255\n'                            // ② 오염
    + "\nico(0.2, (0,0,0), mat=None)\n";                          // ④ 오염(subdiv 생략)
}

console.log('=== 렌더 공용 모듈 하네스 (T77) ===');

// ── ① 헬퍼가 한 벌 ────────────────────────────────────────────────
console.log('\n[① 헬퍼 정의가 두 렌더 스크립트에 0회 — 정본은 render_common.py 하나]');
ok(!!common, 'scripts/render_common.py 가 있다');
const HELPERS = ['principled', 'simple_mat', 'striped_mat', 'bumped_mat', 'box', 'cyl', 'ico'];
for (const [name, src] of srcs) {
  if (src == null) { ok(false, `${name} 을 못 읽었다`); continue; }
  const dup = HELPERS.filter(h => new RegExp(`^def ${h}\\(`, 'm').test(src));
  ok(dup.length === 0, `${name}: 헬퍼 재정의 ${dup.length}개 ${dup.length ? '→ ' + dup.join(', ') : ''}`);
  ok(/^from render_common import/m.test(src) && /^import render_common as rc$/m.test(src),
     `${name}: render_common 을 불러 쓴다`);
}
if (common) {
  const have = HELPERS.filter(h => new RegExp(`^def ${h}\\(`, 'm').test(common));
  ok(have.length === HELPERS.length,
     `render_common.py 가 헬퍼 ${have.length}/${HELPERS.length} 를 갖는다` +
     (have.length === HELPERS.length ? '' : ` (없음: ${HELPERS.filter(h => !have.includes(h)).join(', ')})`));
  for (const extra of ['cone', 'plane', 'cord', 'add', '_post_png', 'build_scene',
                       'render_icon_pass', 'render_world_pass']) {
    if (!new RegExp(`^def ${extra}\\(`, 'm').test(common)) ok(false, `render_common.py 에 ${extra} 가 없다`);
  }
  ok(true, '이관 함수(cone·plane·cord·add·_post_png·build_scene·프리셋 둘) 전수 확인');
}

// ── ② 씬 값이 한 곳 ───────────────────────────────────────────────
console.log('\n[② 씬 상수가 render_common.py 한 곳에만 있다]');
// 값 자체는 여기 안 적는다 — **어디에 있나**만 본다(사본 금지 · 족보 79).
const SCENE_CONST = ['SAMPLES', 'PPU', 'ZSQ', 'RES_ICON', 'SS', 'ISO_DIR',
                     'SUN_ICON', 'SUN_WORLD', 'SUN_ENERGY', 'WORLD_BG', 'CLIP_END', 'NHAT', 'RHAT', 'UHAT'];
if (common) {
  const miss = SCENE_CONST.filter(k => !new RegExp(`^${k}\\s*=`, 'm').test(common));
  ok(miss.length === 0, `공용 모듈이 씬 상수 ${SCENE_CONST.length - miss.length}/${SCENE_CONST.length} 를 갖는다` +
     (miss.length ? ` (없음: ${miss.join(', ')})` : ''));
}
for (const [name, src] of srcs) {
  if (src == null) continue;
  const redef = SCENE_CONST.filter(k => new RegExp(`^${k}\\s*=`, 'm').test(src));
  ok(redef.length === 0, `${name}: 씬 상수 재정의 ${redef.length}개 ${redef.length ? '→ ' + redef.join(', ') : ''}`);
}

// ── ③ 팔레트는 두 벌 ──────────────────────────────────────────────
console.log('\n[③ 재질표는 파일마다 — 공용 모듈은 문법만 갖는다 (§0-ⓒ)]');
if (common) ok(!/^M\s*=\s*\{/m.test(common) && !/^M\['/m.test(common),
               'render_common.py 에 재질표 `M` 이 없다');
for (const [name, src] of srcs) {
  if (src == null) continue;
  const n = (src.match(/^M\['/gm) || []).length;
  ok(n > 0, `${name}: 자기 팔레트 ${n}개를 갖는다`);
}
// 두 팔레트가 섞이지 않았다 — datablock 이름 접두가 갈려 있다
if (srcs[0][1] && srcs[1][1]) {
  const pre = s => (s.match(/(?:simple_mat|striped_mat|bumped_mat)\("([A-Za-z_0-9]+)"/g) || [])
    .map(m => m.split('"')[1]);
  const iNames = pre(srcs[0][1]), pNames = pre(srcs[1][1]);
  const iBad = iNames.filter(n => !/^i_/.test(n));
  const pBad = pNames.filter(n => !/^[pft]_/.test(n));
  ok(iBad.length === 0 && pBad.length === 0,
     `재질 datablock 이름 네임스페이스 — icon ${iNames.length}개 \`i_\` · props ${pNames.length}개 \`p_/f_/t_\`` +
     (iBad.length || pBad.length ? ` (어긋남: ${[...iBad, ...pBad].slice(0, 5).join(', ')})` : ''));
}

// ── ④ 갈린 기본값이 안 샌다 ────────────────────────────────────────
console.log('\n[④ 합치며 갈린 기본값 — 호출부가 잠그고 있다]');
// 합친 기본값이 **닿지 않아야** 하는 인자: 생략 호출이 0이어야 한다.
//   ico.subdiv (icon 2 ↔ props 1) · cyl.verts (icon 24 ↔ props 12)
function callsOf(src, fname) {
  const out = [];
  const re = new RegExp(`(?<![A-Za-z0-9_])${fname}\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1, s = '';
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
      s += c; i++;
    }
    out.push(s);
  }
  return out;
}
for (const [name, src] of srcs) {
  if (src == null) continue;
  for (const [fn, arg] of [['ico', 'subdiv'], ['cyl', 'verts']]) {
    const cs = callsOf(src, fn).filter(s => !/^\s*$/.test(s));
    const missing = cs.filter(s => !new RegExp(`(?<![A-Za-z0-9_])${arg}\\s*=`).test(s));
    ok(missing.length === 0,
       `${name}: \`${fn}(…)\` ${cs.length}곳 모두 \`${arg}=\` 를 명시한다` +
       (missing.length ? ` — 생략 ${missing.length}곳(합친 기본값이 icon 옛값과 다르다)` : ''));
  }
}
// icon 쪽 명시 잠금이 살아 있다(옛 기본값 재현용)
if (srcs[0][1]) {
  const s = srcs[0][1];
  const n = (x) => (s.match(new RegExp(x, 'g')) || []).length;
  ok(n('smooth=True') + n('smooth=False') >= 31,
     `icon_render.py: \`smooth=\` 명시 ${n('smooth=True') + n('smooth=False')}곳 (ico 9 + cyl 22)`);
  ok(n('bump=0\\.3(?![0-9])') >= 10,
     `icon_render.py: \`striped_mat(…, bump=0.3)\` ${n('bump=0\\.3(?![0-9])')}곳 (옛 하드코딩 값 잠금)`);
}

// ── ⑤ 바이트 대조 표 ─────────────────────────────────────────────
console.log('\n[⑤ ③ 바이트 대조 표(보고/T77) 를 다시 읽는다 — 표가 없으면 빨강]');
const rep = rd(REPORT);
ok(!!rep, '보고/T77_2026-09-03.md 가 있다');
if (rep) {
  const rows = [...rep.matchAll(/^\| `((?:icons|props)\/[\w.]+\.png|props_anchors\.json)` \| (\d+) \| (\S+) \|$/gm)];
  ok(rows.length === 85, `대조 표 ${rows.length}행 (PNG 84 + 앵커 1 = 85)`);
  const bad = rows.filter(r => r[3] !== '0').map(r => r[1]);
  ok(bad.length === 0, `표의 cmp 가 전부 0` + (bad.length ? ` — 아닌 것 ${bad.length}: ${bad.slice(0, 5).join(', ')}` : ''));
  const icons = rows.filter(r => r[1].startsWith('icons/')).length;
  const props = rows.filter(r => r[1].startsWith('props/')).length;
  ok(icons === 70 && props === 14, `내역 — 아이콘 ${icons} · 세계 스프라이트 ${props}`);
}

// ── ⑥ 자연물 편입 [T97] ─────────────────────────────────────────
console.log('\n[⑥ 자연물 편입 — 자기 한 벌이 남아 있지 않다 (T97)]');
{
  const nat = SELFTEST ? (rd(NATURE) || '') + '\ndef simple_mat(name, color, rough=0.8):\n    pass\n'
                       : rd(NATURE);
  ok(!!nat, 'scripts/nature_render.py 가 있다');
  if (nat) {
    // 옛 자기 한 벌 — 정의가 0이어야 한다. `_flip_png` 은 `_post_png(ss=1)` 로 흡수됐다.
    for (const h of ['principled', 'simple_mat', 'cleanup', '_flip_png']) {
      const n = (nat.match(new RegExp(`^def ${h}\\(`, 'gm')) || []).length;
      ok(n === 0, `nature_render.py: \`def ${h}…\` 정의 ${n}회`);
    }
    // 씬 조립도 공용 것 — 옛 최상위 씬 블록(`scene.render.engine = `)이 남아 있으면 두 벌이다.
    ok(!/^scene\.render\.engine\s*=/m.test(nat), 'nature_render.py: 최상위 씬 조립 블록 0');
    ok(/rc\.build_scene\(/.test(nat), 'nature_render.py: `rc.build_scene()` 로 씬을 세운다');
    // 세계 패스 — 규격 둘을 **명시**해서 부른다(기본값에 기대면 규격이 조용히 바뀐다).
    ok(/rc\.render_world_pass\([^)]*ppu_mul=[^)]*ss=/.test(nat),
       'nature_render.py: `render_world_pass(…, ppu_mul=…, ss=…)` 를 명시한다');
    ok(/^M\['/m.test(nat), 'nature_render.py: 자기 팔레트를 그대로 갖는다(§0-ⓒ)');
  }
  // `bpy.data.textures` 데이터블록을 만드는 곳이 하나뿐이라 공용 `cleanup()` 의 무조건 순회가
  // 다른 파일엔 **빈 순회**다. 둘째가 생기면 이 줄이 먼저 빨개진다.
  {
    const makers = ['icon_render.py', 'props_render.py', 'nature_render.py', 'fields_render.py', 'models_crops.py']
      .filter(f => /bpy\.data\.textures\.new/.test(rd(path.join(ROOT, 'scripts', f)) || ''));
    ok(makers.length === 1 && makers[0] === 'nature_render.py',
       `\`bpy.data.textures.new\` 를 쓰는 렌더 스크립트 = ${JSON.stringify(makers)} (nature 하나)`);
    ok(/for blk in \(bpy\.data\.meshes, bpy\.data\.textures\)/.test(common || ''),
       'render_common.cleanup() 이 메시·텍스처 둘 다 쓸어낸다');
  }
}

// ── ⑦ 범프 기본값 의존 0 [T103] ────────────────────────────────
console.log('\n[⑦ `Bump.Distance` 를 기본값에 안 맡긴다 — 판올림이 그림을 가져갔다 (T101 발견)]');
{
  // ★왜: 블렌더 5.0 이 `ShaderNodeBump` 의 `Distance` 기본값을 1.0 → 0.001 로 바꿨다.
  //   범프가 1000분의 1 로 죽는데 **에러도 경고도 없다** — 그림만 매끈해진다.
  //   T79·T97 이 그걸 "4.0.2 가 얼룩을 남긴다" 로 두 번 잘못 읽었다. 이제 검사기가 지킨다.
  const fs2 = require('fs');
  const dir = path.join(ROOT, 'scripts');
  const pys = fs2.readdirSync(dir).filter(f => f.endsWith('.py'));
  const bad = [];
  let total = 0;
  for (const f of pys) {
    let src = fs2.readFileSync(path.join(dir, f), 'utf8');
    // --selftest: 기본값에 기대는 자리를 하나 심는다 — ⑦ 이 눈멀지 않았는지 본다.
    if (SELFTEST && f === 'render_common.py') src += '\n    zz = nt.nodes.new("ShaderNodeBump")\n';
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/nodes\.new\((['"])ShaderNodeBump\1\)/.test(lines[i])) continue;
      total++;
      // 같은 줄 또는 뒤따르는 세 줄 안에 `Distance` 대입이 있어야 한다
      const win = lines.slice(i, i + 4).join('\n');
      if (!/\[["']Distance["']\]\.default_value\s*=/.test(win)) bad.push(`${f}:${i + 1}`);
    }
  }
  ok(total > 0, `\`ShaderNodeBump\` 를 만드는 자리 ${total}곳을 전수로 찾았다`);
  ok(bad.length === 0,
     `그 ${total}곳이 전부 \`Distance\` 를 명시한다` +
     (bad.length ? ` — 기본값에 기대는 곳 ${bad.length}: ${bad.slice(0, 6).join(', ')}` : ''));
  ok(/^BUMP_DIST\s*=\s*1\.0/m.test(common || ''),
     'render_common 이 `BUMP_DIST = 1.0`(4.x 까지의 기본값)을 정본으로 갖는다');
  // 값의 사본이 없다 — 다른 스크립트가 1.0 을 다시 적으면 그날 한쪽만 고쳐진다.
  {
    const dup = pys.filter(f => f !== 'render_common.py' &&
      /BUMP_DIST\s*=\s*[\d.]/.test(fs2.readFileSync(path.join(dir, f), 'utf8')));
    ok(dup.length === 0, `\`BUMP_DIST = <숫자>\` 를 다시 적은 스크립트 0 ${dup.length ? JSON.stringify(dup) : ''}`);
  }
}

if (SELFTEST) {
  console.log('\n[--selftest] 오염본을 넣었다 → 위에 ✗ 가 여섯 이상 있어야 통과다(①②③④⑥⑦).');
  console.log('결과: ' + (fail >= 6 ? `PASS(검사기가 오염 ${fail}건을 잡았다)` : `FAIL(${fail}건만 잡았다 — 검사기가 눈멀었다)`));
  process.exit(fail >= 6 ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
