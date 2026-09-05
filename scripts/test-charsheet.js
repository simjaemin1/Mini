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

console.log(`\n=== test-charsheet 결과: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
