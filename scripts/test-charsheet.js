#!/usr/bin/env node
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
  const cl = fs.readFileSync(path.join(ROOT, 'public', 'client.js'), 'utf8');
  ok(/char_meta\.json/.test(cl), '★클라가 메타를 fetch 한다 (규격 하드코딩 금지)');
  ok(/uiCfg\.charSprite/.test(cl), '★플래그로 감싼다 (기본 OFF — 병행 안전)');
  ok(/!item\.npc &&/.test(cl), '★★NPC 는 시트에서 제외된다 (마을 적용은 회부된 별도 배치)');
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
  //   ★이건 통과/실패가 아니라 **수치 보고**다 — 크면 방향별 z 순서가 필요하다는 뜻(회부).
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
          // 화가 순서 합성: 몸 → 옷 → 도구
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
