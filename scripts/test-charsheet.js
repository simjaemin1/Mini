#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-charsheet.js — 캐릭터 시트 파이프라인 하네스 [재민 확정 2026-08-30] =========
//
// 대상: `scripts/char_render.py` 의 **산물**(`public/assets/char/*.png` + `char_meta.json`).
//   Blender 를 여기서 돌리지 않는다(2코어 캐논 — 렌더와 e2e/회귀를 겹치지 마라).
//   재렌더 결정론은 **해시 기록**으로 검사한다(아래 ⑤ · 렌더는 사람이 돌린다).
//
// ★★검사 상황 선행 assert — 숫자를 보기 전에 "무엇을 재고 있는지"부터 못 박는다.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'assets', 'char');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

// ── 순수 PNG 디코더(8bit RGBA) — 의존성 0 ────────────────────────────────────
function readPng(p) {
  const d = fs.readFileSync(p);
  if (d.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 아님: ' + p);
  let i = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (i < d.length) {
    const ln = d.readUInt32BE(i), typ = d.slice(i + 4, i + 8).toString('ascii');
    const dat = d.slice(i + 8, i + 8 + ln);
    if (typ === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); bd = dat[8]; ct = dat[9]; }
    else if (typ === 'IDAT') idat.push(dat);
    i += 12 + ln;
  }
  if (bd !== 8 || ct !== 6) throw new Error(`${p}: 8bit RGBA 아님 (bd=${bd} ct=${ct})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.slice(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, px: out };
}

console.log('\n=== ⓪ 검사 상황 선행 assert — 무엇을 재고 있는가 ===');
const metaPath = path.join(DIR, 'char_meta.json');
ok(fs.existsSync(metaPath), '★메타가 있다 (클라가 규격을 하드코딩하지 않는 근거)');
const META = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
{
  const rp = path.join(ROOT, 'scripts', 'char_render.py');
  const src = fs.readFileSync(rp, 'utf8');
  ok(/PPU0 = 64\.0 \/ math\.sqrt\(2\.0\)/.test(src), '★씬 정본 PPU0 이 자연물과 같다 (그림이 한 몸)');
  ok(/math\.radians\(52\).*math\.radians\(-35\)/.test(src), '★태양 52°/−35° — 자산 정본과 같은 빛');
  ok(/def _flip_png/.test(src) && /_flip_png\(tmp\)/.test(src), '★좌우 FLIP 을 실제로 건다 (손방향 규약)');
  ok(/scene\.cycles\.samples = SAMPLES/.test(src) && /SAMPLES = 64/.test(src), 'SAMPLES 64');
  const cl = require('./client-src.js').readClientSrc();
  ok(/char_meta\.json/.test(cl), '★클라가 메타를 fetch 한다 (규격 하드코딩 금지)');
  ok(/uiCfg\.charSprite/.test(cl), '★플래그로 감싼다 (기본 OFF — 병행 안전)');
  // ★★[T13 2026-09-02] 이 줄은 **뒤집혔다.** 종전 판정은 `!item.npc &&` 를 요구했고, 그 판정의
  //   이름이 곧 해제 조건이었다 — *"마을 적용은 회부된 별도 배치"*. **그 배치가 T13 이다.**
  //   ⇒ 지우지 않고 **새 계약으로 갈아 끼운다**: NPC 도 시트로 가되, 직업 표를 쓰고, 폴백은 산다.
  ok(!/!item\.npc &&/.test(cl), '★★NPC 제외가 풀렸다 (T13 — 마을 주민도 소체 시트)');
  ok(/npcCharLayers\(/.test(cl), '★NPC 는 직업 표(`npcCharLayers`)로 레이어를 고른다');
  ok(/const NPC_JOB_TOOL = \{/.test(cl), '★직업 표가 클라 소스에 하나뿐이다(사본 금지)');
  ok(/job: item\.npc \?/.test(cl), '★`job` 은 NPC 일 때만 실린다 — 사람 경로는 종전 그대로');
  ok(/Math\.min\(_rawSpeed, _npcRun - 1\)/.test(cl),
     '★NPC 속도를 달리기 문턱 아래로 묶는다 — "걷기·서기 둘만" 계약');
}

console.log('\n=== ① 시트 ↔ 메타 정합 ===');
{
  let bad = 0, n = 0;
  for (const [key, sp] of Object.entries(META.sheets)) {
    if (key.startsWith('probeall')) continue;
    n++;
    const p = path.join(DIR, key + '.png');
    if (!fs.existsSync(p)) { ok(false, `${key}.png 없음`); bad++; continue; }
    const im = readPng(p);
    const wantW = META.frameW * sp.cols, wantH = META.frameH * sp.rows;
    if (im.w !== wantW || im.h !== wantH || im.w !== sp.w || im.h !== sp.h) {
      ok(false, `${key} 크기 불일치`, `${im.w}x${im.h} vs 메타 ${sp.w}x${sp.h} / 계산 ${wantW}x${wantH}`);
      bad++;
    }
    const cl = META.clips[sp.clip];
    if (!cl || cl.frames !== sp.cols) { ok(false, `${key} 프레임 수 불일치`, `${sp.cols} vs 클립 ${cl && cl.frames}`); bad++; }
    if (sp.rows !== META.dirs) { ok(false, `${key} 행 수 ≠ 방향 수`); bad++; }
  }
  ok(bad === 0, `시트 ${n}장 전부 메타와 정합 (크기·열=프레임·행=방향)`);
  ok(n === Object.keys(META.clips).length * META.layers.length,
     `시트 수 = 클립 ${Object.keys(META.clips).length} × 레이어 ${META.layers.length} = ${n}`);
  ok(META.pxPerMeterH === 32.0, `★1m 높이 = ${META.pxPerMeterH}px — 자산 정본 축척(자연물·건물과 같은 자)`);
  ok(Math.abs(META.heightM * META.pxPerMeterH - 54.4) < 0.5,
     `키 ${META.heightM}m → 화면 ${(META.heightM * META.pxPerMeterH).toFixed(1)}px`);

  // ★★약속한 축척을 **시트에서 직접 잰다** — 위 두 줄은 메타 안의 상수끼리 견준 것이라
  //   "굽는 쪽이 실제로 그 자로 구웠는가"는 하나도 안 본다.
  //   2026-08-31 에 정확히 그 구멍으로 버그가 살았다: `char_render.py` 가 z 압축(ZSQ)을
  //   화면 bbox 계산에만 곱하고 **기하에는 안 걸어**, 캐릭터만 1m=39.7px 로 구워졌다.
  //   (자연물·건물은 정점 z 에 직접 곱한다 — 둘 다 `render_common.squash_z()` 를 부른다.
  //    자연물은 T97, 건물은 T103 에서 편입되며 자기 줄이 없어졌다 — 줄 번호 대신 **이름**으로 적는다.)
  //   세상은 32px/m 인데 사람만 24% 컸다. 아래가 그걸 잡는 자다.
  {
    const im = readPng(path.join(DIR, 'body_idle.png'));
    const FW = META.frameW, FH = META.frameH, N = META.clips.idle.frames;
    let crown = -1;            // 발밑(anchorY)에서 정수리까지, px — 전 방향·전 프레임 최댓값
    for (let d = 0; d < META.dirs; d++) {
      for (let f = 0; f < N; f++) {
        for (let y = 0; y < FH; y++) {
          let any = false;
          for (let x = 0; x < FW; x++) {
            if (im.px[(((d * FH + y) * im.w) + (f * FW + x)) * 4 + 3] > 8) { any = true; break; }
          }
          if (any) { const h = META.anchorY - y; if (h > crown) crown = h; break; }
        }
      }
    }
    const want = META.heightM * META.pxPerMeterH;
    // 여유 5px: 정수리는 머리칼 꼭대기(모델 1.694m)이고, 방향에 따라 머리의 x/y 폭이
    // 화면 세로로 ±2px 만큼 새어 들어온다. 24% 오차(=13px)는 이 여유로 절대 못 숨는다.
    ok(Math.abs(crown - want) <= 5,
       `★★시트 실측 발밑→정수리 ${crown.toFixed(1)}px ≈ 약속 ${want.toFixed(1)}px (1m=${META.pxPerMeterH}px)`,
       Math.abs(crown - want) > 5 ? `실측 ${(crown / META.heightM).toFixed(1)}px/m — 기하에 z 압축을 안 걸었나?` : '');
  }
}

console.log('\n=== ② 레이어 픽셀 정렬 — 어긋남 0px ===');
{
  // ★계약: 모든 레이어가 **같은 프레임 박스**를 쓴다. 그래서 런타임은 오프셋 계산 없이 겹치기만 한다.
  //   자명 통과 금지: 크기만 같은지가 아니라, **내용이 실제로 정렬**되는지를 본다 —
  //   옷(소매)은 몸(위팔)을 감싸므로 옷의 불투명 화소는 몸의 화소와 **크게 겹쳐야** 한다.
  //   레이어 하나가 한 프레임이라도 어긋나면 이 겹침이 무너진다.
  let sizeBad = 0, worstOverlap = 1;
  for (const clip of Object.keys(META.clips)) {
    const dims = [];
    for (const L of META.layers) {
      if (L === 'probeall') continue;
      const p = path.join(DIR, `${L}_${clip}.png`);
      const im = readPng(p);
      dims.push(`${im.w}x${im.h}`);
      if (im.w !== META.frameW * META.clips[clip].frames || im.h !== META.frameH * META.dirs) sizeBad++;
    }
    if (new Set(dims).size !== 1) { ok(false, `${clip}: 레이어 크기가 갈린다`, dims.join(' ')); sizeBad++; }
    const body = readPng(path.join(DIR, `body_${clip}.png`));
    const cloth = readPng(path.join(DIR, `clothes_hemp_${clip}.png`));
    let inter = 0, clothN = 0;
    for (let i = 3; i < cloth.px.length; i += 4) {
      if (cloth.px[i] > 200) { clothN++; if (body.px[i] > 0) inter++; }
    }
    const frac = clothN ? inter / clothN : 0;
    worstOverlap = Math.min(worstOverlap, frac);
    if (frac < 0.55) ok(false, `${clip}: 옷이 몸과 안 겹친다 — 정렬 의심`, `겹침 ${(frac * 100).toFixed(1)}%`);
  }
  ok(sizeBad === 0, '전 클립·전 레이어가 **같은 프레임 박스**(크기 동일)');
  ok(worstOverlap >= 0.55, `옷 화소의 최저 ${(worstOverlap * 100).toFixed(1)}% 가 몸 화소 위에 있다 — 정렬 실증`);
}

console.log('\n=== ③ 가림(occlusion) 오차 — 합성은 깊이를 모른다 ===');
{
  // ★대조군: `--probe` 로 몸+옷+도끼를 **한 번에** 구운 시트(깊이가 맞다).
  //   런타임 합성(화가 순서)과 견주면 "도구가 몸 뒤로 가야 하는데 앞에 뜨는" 화소 수가 나온다.
  //   ★이건 통과/실패가 아니라 **수치 보고**다 — 크면 방향별 z 순서가 필요하다는 뜻.
  //   ★2026-08-31 3차: ⓐ(순서표) 대신 ⓑ(홀드아웃)로 갔다. 순서는 고정이고 어긋남이 남으면
  //     그건 홀드아웃이 못 덮는 자리(옷↔도구)다.
  const pp = path.join(DIR, 'probeall_walk.png');
  if (!fs.existsSync(pp)) {
    ok(true, '(대조군 없음 — `--probe` 로 굽지 않았다. 측정 생략)');
  } else {
    const probe = readPng(pp);
    const body = readPng(path.join(DIR, 'body_walk.png'));
    const cloth = readPng(path.join(DIR, 'clothes_hemp_walk.png'));
    const tool = readPng(path.join(DIR, 'tool_axe_walk.png'));
    const W = probe.w, FH = META.frameH;
    const perRow = [];
    for (let r = 0; r < META.dirs; r++) {
      let diff = 0, on = 0;
      for (let y = r * FH; y < (r + 1) * FH; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          // 화가 순서 합성: 몸 → 옷 → 도구 — 클라와 **같은 고정 순서**다.
          //   깊이는 굽는 쪽 홀드아웃이 잡는다(char_render.py set_visible). 여기서 재는 건
          //   "그 홀드아웃이 정말 통했는가" 다.
          let a = 0, R = 0, G = 0, B = 0;
          for (const L of [body, cloth, tool]) {
            const la = L.px[i + 3] / 255;
            if (la <= 0) continue;
            R = L.px[i] * la + R * (1 - la); G = L.px[i + 1] * la + G * (1 - la);
            B = L.px[i + 2] * la + B * (1 - la); a = la + a * (1 - la);
          }
          const pa = probe.px[i + 3] / 255;
          if (a > 0.5 || pa > 0.5) {
            on++;
            const dR = Math.abs(R - probe.px[i]), dG = Math.abs(G - probe.px[i + 1]), dB = Math.abs(B - probe.px[i + 2]);
            if (Math.abs(a - pa) > 0.35 || dR + dG + dB > 150) diff++;
          }
        }
      }
      perRow.push({ r, diff, on, pct: on ? (100 * diff / on) : 0 });
    }
    const worst = perRow.reduce((m, x) => x.pct > m.pct ? x : m, perRow[0]);
    const tot = perRow.reduce((s, x) => s + x.diff, 0), totOn = perRow.reduce((s, x) => s + x.on, 0);
    console.log('    방향별 어긋남%: ' + perRow.map((x) => `d${x.r} ${x.pct.toFixed(1)}`).join(' · '));
    ok(true, `합성 vs 깊이정본 어긋남 전체 ${(100 * tot / totOn).toFixed(2)}% · 최악 d${worst.r} ${worst.pct.toFixed(1)}%`);
    ok(worst.pct < 12, `★최악 방향도 ${worst.pct.toFixed(1)}% < 12% — 화가 순서 합성이 쓸 만하다`,
       worst.pct >= 12 ? '방향별 z 순서 필요(회부)' : '');
  }
}

console.log('\n=== ③-나 홀드아웃이 실제로 통했는가 ===');
{
  // ★자명 통과 금지: ③ 의 어긋남이 작다고 "홀드아웃이 통했다"가 되지 않는다 —
  //   애초에 겹칠 일이 없었을 수도 있다. **잘려 나간 자리**를 직접 센다.
  //   ★첫 시도는 "사방이 불투명에 둘린 투명 화소(안쪽 구멍)"를 셌는데 0 이 나왔다.
  //     홀드아웃이 내는 자국은 대개 실루엣 가장자리에서 파고드는 **만입**이지 섬 구멍이 아니다.
  //     그래서 **가로줄 기준**으로 센다: 그 줄에서 옷이 좌·우로 있는데 가운데가 비었고,
  //     그 자리에 **몸이 불투명**하면 = 몸이 앞이라 옷이 잘린 자리다.
  const cl = readPng(path.join(DIR, 'clothes_hemp_walk.png'));
  const bd = readPng(path.join(DIR, 'body_walk.png'));
  const W = cl.w, H = cl.h;
  const CA = (x, y) => cl.px[(y * W + x) * 4 + 3];
  const BA = (x, y) => bd.px[(y * W + x) * 4 + 3];
  let cut = 0, rows = 0;
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (CA(x, y) > 200) { if (l < 0) l = x; r = x; }
    if (l < 0 || r - l < 3) continue;
    rows++;
    for (let x = l + 1; x < r; x++) if (CA(x, y) < 8 && BA(x, y) > 200) cut++;
  }
  ok(cut > 0, `옷이 몸에 잘린 화소 ${cut}개 (옷이 있는 가로줄 ${rows}개 기준) — 홀드아웃이 실제로 팠다`,
     cut ? '' : '홀드아웃이 안 걸렸거나 겹칠 일이 없었다 — ③ 이 자명 통과일 수 있다');
}

console.log('\n=== ④ 알파 위생 ===');
{
  // 검은 테두리(프린지) = 알파 가중 없이 다운샘플했을 때 나오는 그 증상. 반투명 화소의 어두움을 본다.
  const im = readPng(path.join(DIR, 'body_walk.png'));
  let semi = 0, dark = 0;
  for (let i = 0; i < im.px.length; i += 4) {
    const a = im.px[i + 3];
    if (a > 8 && a < 200) { semi++; if (im.px[i] + im.px[i + 1] + im.px[i + 2] < 90) dark++; }
  }
  ok(semi > 100, `반투명 경계 화소 ${semi}개 — 안티에일리어싱이 살아 있다`);
  ok(dark / Math.max(1, semi) < 0.06, `그중 검은 화소 ${(100 * dark / Math.max(1, semi)).toFixed(1)}% < 6% — 알파 가중 다운샘플이 프린지를 막았다`);
}

console.log('\n=== ⑤ 결정론 — 같은 .py = 같은 시트 ===');
{
  // ★재렌더 diff 0 은 **해시 기록**으로 지킨다. 렌더는 사람이 돌리고(2코어 캐논), 여기선 대조만.
  //   시트가 바뀌면 이 파일도 같이 갱신돼야 한다 — 안 그러면 회귀가 빨개져서 "몰래 바뀜"을 잡는다.
  const lockP = path.join(DIR, 'char_sheets.lock.json');
  const cur = {};
  for (const key of Object.keys(META.sheets)) {
    if (key.startsWith('probeall')) continue;
    cur[key] = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, key + '.png'))).digest('hex').slice(0, 16);
  }
  if (!fs.existsSync(lockP)) {
    fs.writeFileSync(lockP, JSON.stringify(cur, null, 1));
    ok(true, `해시 기록 신설 (${Object.keys(cur).length}장) — 다음 배치부터 diff 0 을 강제한다`);
  } else {
    const lock = JSON.parse(fs.readFileSync(lockP, 'utf8'));
    const changed = Object.keys(cur).filter((k) => lock[k] !== cur[k]);
    const added = Object.keys(cur).filter((k) => !(k in lock));
    ok(changed.length === 0, `시트 ${Object.keys(cur).length}장 해시 = 기록과 동일 (재렌더 diff 0)`,
       changed.length ? `바뀜: ${changed.slice(0, 4).join(',')}` : '');
    ok(added.length === 0, '기록에 없는 새 시트 없음', added.join(','));
  }
}

console.log('\n=== ⑥ 먹선 1px · 셀 셰이딩 [T96] ===');
{
  // ★상황부터 못 박는다 — 굽는 쪽이 실제로 켜고 구웠는가(메타가 자기 손잡이를 적는다).
  const SH = META.shape || {};
  ok(SH.inkPx === 1, '★검사 전제 — 이 시트는 먹선을 켜고 구웠다 (`shape.inkPx`)', String(SH.inkPx));
  ok(SH.celBands >= 2, '★검사 전제 — 셀 셰이딩을 켜고 구웠다 (`shape.celBands`)', String(SH.celBands));
  ok(SH.poseSrc === 'mocap', '★검사 전제 — 포즈가 모캡 표다 (`shape.poseSrc`)', String(SH.poseSrc));

  // 먹색은 `scripts/ink_post.py` 의 정본에서 읽는다(하네스가 숫자를 베끼지 않는다).
  const inkSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'ink_post.py'), 'utf8');
  const m = inkSrc.match(/INK_RGB\s*=\s*\((\d+)\s*\/\s*255\.0,\s*(\d+)\s*\/\s*255\.0,\s*(\d+)\s*\/\s*255\.0\)/);
  ok(!!m, '★먹색을 `ink_post.py` 에서 읽었다 (하네스에 숫자 사본 0)', m ? m.slice(1, 4).join(',') : '');
  const INK = m ? [ +m[1], +m[2], +m[3] ] : [21, 19, 17];
  // ★★문턱도 **정본에서 읽는다**. 먹은 `EDGE_A`(0.60) 가 아니라 `INK_A`(200/255) 에만 닿는다 —
  //   ④ 가 `a < 200` 을 반투명이라 부르기 때문이다(`ink_post.py` 주석에 실측·유도).
  //   ⚠1차 하네스는 여기서 `edgeA` 를 썼다가 **없는 결함을 봤다**: 알파 153~199 구간이 실루엣에
  //     들어가 버려, 먹이 그 안쪽에 있는 것처럼 보였다(안쪽 19.1% · 2겹 6.6%). 자를 틀리게 잡은 것이다.
  const ma = inkSrc.match(/INK_A\s*=\s*(\d+)\s*\/\s*255\.0/);
  ok(!!ma, '★먹 문턱도 `ink_post.py` 에서 읽었다', ma ? `INK_A = ${ma[1]}/255` : '');
  const AT = ma ? +ma[1] : 200;

  const im = readPng(path.join(DIR, 'body_walk.png'));
  const { w: W, h: H, px } = im;
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : px[(y * W + x) * 4 + 3]);
  const isInk = (x, y) => {
    if (A(x, y) < AT) return false;
    const o = (y * W + x) * 4;
    return Math.abs(px[o] - INK[0]) <= 1 && Math.abs(px[o + 1] - INK[1]) <= 1 && Math.abs(px[o + 2] - INK[2]) <= 1;
  };
  const isEdge = (x, y) => A(x, y) >= AT && (A(x - 1, y) < AT || A(x + 1, y) < AT || A(x, y - 1) < AT || A(x, y + 1) < AT);

  let opaque = 0, inkN = 0, inkInside = 0, semiInk = 0, semi = 0, second = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = A(x, y);
      if (a > 8 && a < AT) { semi++; if (isInk(x, y)) semiInk++; }
      if (a < AT) continue;
      opaque++;
      if (!isInk(x, y)) continue;
      inkN++;
      // ⓐ 먹색은 **경계에만** 있어야 한다(합집합 실루엣의 경계가 제 알파 경계보다 안쪽일 수 있으므로
      //   '제 알파 경계가 아니면서 먹색' 을 세되, 그 이웃 넷 중 하나라도 비어 있으면 경계로 본다).
      if (!isEdge(x, y)) inkInside++;
      // ⓑ **1겹** — 바깥이 비어 있는 방향으로 한 칸 더 들어간 자리가 또 먹색이고 그 자리가
      //   제 경계가 아니면 띠가 두 겹이다.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (A(x - dx, y - dy) >= AT) continue;          // 바깥이 아니다
        if (isInk(x + dx, y + dy) && !isEdge(x + dx, y + dy)) { second++; break; }
      }
    }
  }
  ok(inkN > opaque * 0.05, `★먹선이 실제로 있다 — 먹색 화소 ${inkN} (불투명의 ${(100 * inkN / opaque).toFixed(0)}%)`);
  ok(inkN > 0 && inkInside / Math.max(1, inkN) < 0.02,
     `★먹색이 실루엣 **경계에만** 있다 — 안쪽 먹색 ${inkInside}개 (${(100 * inkInside / Math.max(1, inkN)).toFixed(2)}% < 2%)`);
  ok(inkN > 0 && second / Math.max(1, inkN) < 0.01,
     `★★띠가 **정확히 1겹** — 2겹째 ${second}개 (${(100 * second / Math.max(1, inkN)).toFixed(2)}% < 1%)`);
  ok(semiInk === 0,
     `★★반투명 화소는 먹이 안 묻었다 — 반투명 ${semi}개 중 먹색 ${semiInk}개 (④ 프린지 계약과 같은 자리)`);

  // ★★자명 통과 금지 — 일부러 2겹으로 만든 픽스처에서 위 판정이 **빨개지는가**
  {
    const FW = 12, FH = 12;
    const fx = Buffer.alloc(FW * FH * 4);
    const set = (x, y, c) => { const o = (y * FW + x) * 4; fx[o] = c[0]; fx[o + 1] = c[1]; fx[o + 2] = c[2]; fx[o + 3] = 255; };
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) set(x, y, [120, 110, 90]);
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) {
      const e = (x === 2 || x === 9 || y === 2 || y === 9);
      const e2 = (x === 3 || x === 8 || y === 3 || y === 8);
      if (e || e2) set(x, y, INK);            // ← 일부러 **두 겹**
    }
    const fA = (x, y) => (x < 0 || y < 0 || x >= FW || y >= FH ? 0 : fx[(y * FW + x) * 4 + 3]);
    const fInk = (x, y) => { if (fA(x, y) < AT) return false; const o = (y * FW + x) * 4;
      return fx[o] === INK[0] && fx[o + 1] === INK[1] && fx[o + 2] === INK[2]; };
    const fEdge = (x, y) => fA(x, y) >= AT && (fA(x - 1, y) < AT || fA(x + 1, y) < AT || fA(x, y - 1) < AT || fA(x, y + 1) < AT);
    let f2 = 0, fN = 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (!fInk(x, y)) continue;
      fN++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (fA(x - dx, y - dy) >= AT) continue;
        if (fInk(x + dx, y + dy) && !fEdge(x + dx, y + dy)) { f2++; break; }
      }
    }
    ok(fN > 0 && f2 / fN >= 0.01, '★★돌연변이 — 일부러 2겹으로 그린 픽스처는 이 판정이 **잡는다**',
       `2겹 ${f2}/${fN}`);
  }

  // ⓒ 셀 — 실루엣 안 고유 휘도 값 수. 옛 판(연속 음영)은 166이었다.
  {
    const seen = new Set();
    for (let i = 0; i < W * H; i++) {
      if (px[i * 4 + 3] < AT) continue;
      seen.add(Math.round(0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]));
    }
    // 몸 시트엔 색이 여럿이라(살·머리칼·짚신) 단수 × 색 수 + 먹 만큼 나온다. 실측 20.
    const BAR = 8 * (META.shape.celBands || 3);
    ok(seen.size <= BAR, `★셀 — 실루엣 안 고유 휘도 ${seen.size}개 ≤ ${BAR} (${META.shape.celBands}단 × 색 여럿 · 옛 판은 166)`);
  }

  // ⓓ 층 경계에 **겹선이 없다** — 옷 시트의 먹색이 몸 실루엣 안쪽에 생기면 살↔옷에 없는 선이 하나 더 생긴다.
  {
    const bo = readPng(path.join(DIR, 'body_walk.png'));
    const cl = readPng(path.join(DIR, 'clothes_hemp_walk.png'));
    ok(bo.w === cl.w && bo.h === cl.h, '검사 전제 — 몸/옷 시트 크기가 같다');
    let clInk = 0, insideBody = 0;
    const bA = (x, y) => (x < 0 || y < 0 || x >= bo.w || y >= bo.h ? 0 : bo.px[(y * bo.w + x) * 4 + 3]);
    for (let y = 0; y < cl.h; y++) for (let x = 0; x < cl.w; x++) {
      const o = (y * cl.w + x) * 4;
      if (cl.px[o + 3] < AT) continue;
      if (!(Math.abs(cl.px[o] - INK[0]) <= 1 && Math.abs(cl.px[o + 1] - INK[1]) <= 1 && Math.abs(cl.px[o + 2] - INK[2]) <= 1)) continue;
      clInk++;
      // 몸이 그 자리에서 불투명하고 **몸의 경계도 아니면** = 몸 한가운데에 그은 선
      const bodyHere = bA(x, y) >= AT;
      const bodyEdge = bodyHere && (bA(x - 1, y) < AT || bA(x + 1, y) < AT || bA(x, y - 1) < AT || bA(x, y + 1) < AT);
      if (bodyHere && !bodyEdge) insideBody++;
    }
    ok(clInk > 0, `검사 전제 — 옷 시트에도 먹선이 있다 (${clInk}개)`);
    ok(clInk > 0 && insideBody / Math.max(1, clInk) < 0.02,
       `★★살↔옷 경계에 **겹선이 없다** — 몸 한가운데 놓인 옷 먹선 ${insideBody}개 (${(100 * insideBody / Math.max(1, clInk)).toFixed(2)}% < 2%) — 합집합 마스크가 일한다`);
  }
}

console.log('\n=== ⑦ 모캡 포즈표 [T96] ===');
{
  const { execFileSync } = require('child_process');
  const MP = path.join(ROOT, 'assets-src', 'mocap', 'poses.json');
  ok(fs.existsSync(MP), '★포즈표가 커밋돼 있다 (`assets-src/mocap/poses.json`)');
  const raw0 = fs.readFileSync(MP);
  const P = JSON.parse(raw0.toString('utf8'));
  ok(P.nframes === META.clips.walk.frames && P.nframes === META.clips.run.frames,
     `★표 프레임 수 = 클립 프레임 수 (${P.nframes})`);
  for (const f of ['cmu_07_01_walk.bvh', 'cmu_09_01_run.bvh']) {
    ok(fs.existsSync(path.join(ROOT, 'assets-src', 'mocap', f)), `★원본 BVH 가 커밋돼 있다 — ${f} (표를 다시 만들 수 있다)`);
  }
  ok(fs.existsSync(path.join(ROOT, 'assets-src', 'mocap', 'README.md')), '★출처·저작 README 가 있다');

  // ★★[T96 §0-ⓒ 회귀 감시] 옛 사인 걸음은 **앞뒤(rz)가 0** 이고 좌우(rx)로만 흔들렸다 —
  //   리그의 `rx` 는 뼈를 캐릭터의 좌우로 눕힌다(depsgraph 실측). 즉 가랑이를 옆으로 벌린 것이다.
  //   사람 걸음은 그 반대여야 한다: **앞뒤 진폭이 좌우보다 훨씬 크다.**
  for (const clip of ['walk', 'run']) {
    const T = P.clips[clip];
    const amp = (b, j) => {
      const v = T.map((f) => f[b][j]);
      return Math.max(...v) - Math.min(...v);
    };
    const legs = ['thighL', 'thighR', 'shinL', 'shinR'];
    const fb = Math.max(...legs.map((b) => amp(b, 2)));   // rz = 앞뒤
    const lr = Math.max(...legs.map((b) => amp(b, 0)));   // rx = 좌우
    ok(fb > lr * 3, `★★${clip} — 다리가 **앞뒤로** 흔들린다 (앞뒤 ${(fb * 180 / Math.PI).toFixed(0)}° > 좌우 ${(lr * 180 / Math.PI).toFixed(0)}° × 3)`);
    // 좌우 다리가 반대 위상인가 — 같은 위상이면 두 발 모아 뛰는 것이다
    const dot = T.reduce((s, f) => s + f.thighL[2] * f.thighR[2], 0);
    ok(dot < 0, `★${clip} — 두 다리가 **엇갈린다**(위상 반대 · 내적 ${dot.toFixed(3)} < 0)`);
    // 루프 이음새 — 첫↔끝 간격이 프레임 사이 최대 간격 안이면 튀지 않는다
    const gap = (a, b) => Math.max(...Object.keys(a).map((n) => Math.max(Math.abs(a[n][0] - b[n][0]), Math.abs(a[n][2] - b[n][2]))));
    const steps = T.map((_, k) => gap(T[k], T[(k + 1) % T.length]));
    const seam = steps[steps.length - 1], mx = Math.max(...steps.slice(0, -1));
    ok(seam <= mx, `★${clip} 루프 이음새 ${(seam * 180 / Math.PI).toFixed(1)}° ≤ 프레임 간 최대 ${(mx * 180 / Math.PI).toFixed(1)}° — 되돌아올 때 안 튄다`);
  }

  // ★★결정론 — 같은 원본으로 다시 뽑으면 **바이트가 같다**
  try {
    const tmp = path.join(ROOT, 'assets-src', 'mocap', 'poses.json');
    const before = fs.readFileSync(tmp);
    execFileSync('python3', [path.join(ROOT, 'scripts', 'mocap_retarget.py')], { stdio: 'ignore', cwd: ROOT });
    const after = fs.readFileSync(tmp);
    ok(before.equals(after), '★★결정론 — `mocap_retarget.py` 를 다시 돌려도 `poses.json` 바이트가 같다');
  } catch (e) {
    ok(false, '결정론 검사가 못 돌았다(python3 없음?)', String(e.message).slice(0, 80));
  }

  // ★되돌림 경로가 살아 있다 — 사인 함수를 지우지 않았다
  {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
    ok(/T96_SINE/.test(src) && /def _pose_walk/.test(src) && /def _pose_run/.test(src),
       '★`T96_SINE=1` 되돌림 경로 — 옛 사인 함수가 지워지지 않았다');
    ok(/import ink_post/.test(src) && /T96_INK/.test(src) && /T96_CEL/.test(src),
       '★먹선·셀도 스위치로 되돌아간다 (`T96_INK=0` · `T96_CEL=0`)');
    // ★★[T120 2026-09-05] **금칙이 좁아졌다 — "부르지 마라"에서 "씬은 가져오지 마라"로.**
    //   T97 때 이 줄은 `import render_common` **자체**를 금했다. 이유는 그 파일이 그때
    //   세션8 손에 있었다는 것이고, 지킨 것은 "char 가 남의 씬·헬퍼에 얽히지 않는다"였다.
    //   T120 이 옷 재질 표를 `render_common` 하나로 올리면서(회부 T77·T87·T95) char 는 그
    //   **표만** 읽는다 — 씬·카메라·헬퍼는 여전히 이 파일 것이다.
    //   ⇒ import 를 금하면 사본을 강제하게 된다. 금칙을 **무엇을 쓰는가**로 옮긴다.
    {
      const uses = [...src.matchAll(/\brc\.([A-Za-z_][A-Za-z_0-9]*)/g)].map((m) => m[1]);
      const ALLOW = new Set(['CLOTH_MATS', 'CLOTH_TRIM_K', 'CLOTH_PLACKET_K', 'FUR_PAD']);
      const bad = [...new Set(uses)].filter((u) => !ALLOW.has(u));
      ok(/^\s*import\s+render_common\s+as\s+rc/m.test(src),
         '★`render_common` 을 **표를 읽으려고만** 부른다 (`import render_common as rc`)');
      ok(bad.length === 0,
         `★가져오는 것이 **옷 재질 표뿐**이다 — 씬·헬퍼 0 ${bad.length ? '— 새어 든 것: ' + bad.join(' · ') : `(쓰는 이름: ${[...new Set(uses)].sort().join(' ')})`}`);
      ok(/^scene = bpy\.context\.scene/m.test(src) || /scene = bpy\.context\.scene/.test(src),
         '★씬은 여전히 이 파일이 세운다(`render_common.build_scene` 을 안 부른다)');
    }
  }
}

console.log('\n=== ⑧ 도끼질·조준의 축 · EXR 되굽기 [T107] ===');
{
  // ★★[T107] 재는 것은 도끼의 **자리**가 아니라 **움직인 방향**이다.
  //   자리로 재면 손이 늘 몸 오른쪽(−y)에 붙어 있는 붙박이 치우침이 신호를 덮는다
  //   (1차 계측: 옛 0.73 vs 새 1.25 — 갈리긴 하는데 `idle` 대조군이 0.98 이라 못 쓴다).
  //   두 프레임의 무게중심 **차**를 쓰면 그 붙박이가 빠지고 동작만 남는다.
  const FW = META.frameW, FH = META.frameH, AX = META.anchorX, AY = META.anchorY;
  const cent = (im, frame, d) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = d * FH; y < (d + 1) * FH; y++) {
      for (let x = frame * FW; x < (frame + 1) * FW; x++) {
        if (im.px[(y * im.w + x) * 4 + 3] >= 200) { sx += x - frame * FW; sy += y - d * FH; n++; }
      }
    }
    return n ? [sx / n, sy / n, n] : null;
  };
  // 아이소 투영 — 정본 `w2i(wx,wy) = (wx−wy, (wx+wy)/2)` 와 같은 식(화면 y 는 아래로).
  const split = (dx, dy, d, rot) => {
    const a = ((d + (rot || 0)) % 8) * Math.PI / 4;
    const fw = [Math.cos(a), Math.sin(a)], sd = [-Math.sin(a), Math.cos(a)];
    const pf = [fw[0] - fw[1], (fw[0] + fw[1]) / 2], ps = [sd[0] - sd[1], (sd[0] + sd[1]) / 2];
    const nf = Math.hypot(pf[0], pf[1]) || 1, ns = Math.hypot(ps[0], ps[1]) || 1;
    return [(dx * pf[0] + dy * pf[1]) / nf, (dx * ps[0] + dy * ps[1]) / ns];
  };
  const move = (imA, fa, imB, fb, rot) => {
    const front = [], side = [];
    for (let d = 0; d < 8; d++) {
      const a = cent(imA, fa, d), b = cent(imB, fb, d);
      if (!a || !b) continue;                       // 도끼가 몸에 완전히 가린 행 — 홀드아웃이 판 것
      const [f, sq] = split(b[0] - a[0], b[1] - a[1], d, rot);
      front.push(f); side.push(sq);
    }
    const m = (v) => v.reduce((x, y) => x + Math.abs(y), 0) / Math.max(1, v.length);
    return { front, side, F: m(front), S: m(side), n: front.length };
  };
  const axe = {};
  for (const c of ['idle', 'swing', 'aim']) axe[c] = readPng(path.join(DIR, `tool_axe_${c}.png`));

  // ⓐ 내려침 — 도끼가 **앞으로** 간다
  {
    const r = move(axe.swing, 2, axe.swing, 3, 0);
    ok(r.n >= 6, `★전제 — 여덟 행 중 ${r.n}행에서 도끼가 보인다(나머지는 몸에 가렸다)`);
    ok(r.front.every((v) => v > 0),
       `★★내려침(f2→f3)에서 도끼가 **여덟 행 모두 앞으로** 간다 (${r.front.map((v) => v.toFixed(0)).join(' ')})`);
    ok(r.F > r.S * 1.5, `★★앞 성분이 옆의 1.5배 넘는다 — 앞 ${r.F.toFixed(1)}px vs 옆 ${r.S.toFixed(1)}px (${(r.F / r.S).toFixed(2)}배)`,
       '옛 시트 실측 0.46배 = 몸 옆에서 쓸고 갔다');
    // ★★자명 통과 금지 — 행을 4칸 돌리면(앞뒤 맞바꿈) 앞 성분 부호가 통째로 뒤집힌다
    const rot = move(axe.swing, 2, axe.swing, 3, 4);
    ok(rot.front.every((v) => v < 0), '★★돌연변이 — 앞뒤를 맞바꾸면 부호가 **전부** 뒤집힌다(신호 없는 시트는 여기서 깨진다)');
  }
  // ⓑ 들어올림 — 뒤로 간다(도끼를 등 뒤로 젖힌다)
  {
    const r = move(axe.swing, 0, axe.swing, 2, 0);
    const back = r.front.filter((v) => v < 0).length;
    ok(back >= Math.ceil(r.n * 0.7), `★들어올림(f0→f2)은 **뒤로** 젖힌다 — ${back}/${r.n} 행이 음수`,
       r.front.map((v) => v.toFixed(0)).join(' '));
  }
  // ⓒ 조준 — 쉼(idle)에서 aim 으로 갈 때 도끼가 앞으로 나온다
  {
    const r = move(axe.idle, 0, axe.aim, 0, 0);
    ok(r.front.every((v) => v > 0),
       `★★조준은 손을 **앞으로** 내민다 (${r.front.map((v) => v.toFixed(0)).join(' ')})`,
       '옛 시트 실측 앞/옆 0.36배 = 오른쪽으로 내밀고 있었다');
    ok(r.F > r.S, `★조준 앞 ${r.F.toFixed(1)}px > 옆 ${r.S.toFixed(1)}px`);
  }

  // ⓓ EXR 되굽기 — **바이트 동일** 증명 기록
  {
    const pp = path.join(ROOT, 'assets-src', 'char_repost_proof.json');
    ok(fs.existsSync(pp), '★되굽기 증명 기록이 있다 (`assets-src/char_repost_proof.json`)');
    if (fs.existsSync(pp)) {
      const P = JSON.parse(fs.readFileSync(pp, 'utf8'));
      const bad = [];
      for (const [k, h] of Object.entries(P.sheets || {})) {
        const q = path.join(DIR, k + '.png');
        if (!fs.existsSync(q)) { bad.push(k + '(없음)'); continue; }
        const cur = crypto.createHash('sha256').update(fs.readFileSync(q)).digest('hex').slice(0, 16);
        if (cur !== h) bad.push(k);
      }
      ok(Object.keys(P.sheets || {}).length >= 14 && bad.length === 0,
         `★★**굽지 않고** EXR 에서 되굽은 ${Object.keys(P.sheets || {}).length}장이 배포 PNG 와 바이트가 같다`,
         bad.length ? `어긋남: ${bad.slice(0, 4).join(',')}` : `먹선 ${P.ink} · 셀 ${P.cel}`);
      const rp = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
      ok(P.ink === +(rp.match(/T96_INK",\s*"(\d+)"/) || [0, 1])[1] && P.cel === +(rp.match(/T96_CEL",\s*"(\d+)"/) || [0, 4])[1],
         '★증명이 **지금 손잡이**로 낸 것이다(굽기 기본값과 같다)', `ink ${P.ink} cel ${P.cel}`);
    }
  }
  // ⓔ 구조 — 굽기와 되굽기가 **같은 함수**를 탄다(본문이 둘이면 '바이트 동일'은 우연이다)
  {
    const rp = fs.readFileSync(path.join(ROOT, 'scripts', 'char_render.py'), 'utf8');
    const ip = fs.readFileSync(path.join(ROOT, 'scripts', 'ink_repost.py'), 'utf8');
    ok(/ink_post\.post_all\(/.test(rp), '★굽기가 `ink_post.post_all` 을 부른다');
    ok(/ink_post\.post_all\(/.test(ip), '★되굽기도 **같은** `ink_post.post_all` 을 부른다');
    ok(!/def\s+(cel_quantize|ink_outline|edge_darken)/.test(ip), '★되굽기가 제 후처리를 따로 만들지 않는다(사본 0)');
    ok(/T107_BOXPIN/.test(rp) && /얼린 값/.test(rp),
       '★공유 프레임 상자 **못박기**가 살아 있다 — 포즈를 고쳐도 앵커가 안 흔들린다');
  }
}

console.log(`\n=== test-charsheet 결과: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
