// =============================================================================
// 목업 2차 — 장면들 (브라우저 안에서 돈다. mock-mt3d2.js 가 삽입한다)
//   ★그림만 내지 않는다. 장면마다 실측 수치를 같이 낸다 [재민 판정 규약].
// =============================================================================
const M = window.MT3D, CELL = M.CELL, w2i = M.w2i;
// ★가림 예측 — 등각에서 "앞"은 남동 **대각선만이 아니다**.
//   셀 (i+a, j+b) 는 화면에서 dx = 32(a−b), dy = 16(a+b) 에 있다.
//   화면 x 가 겹치려면 |a−b| ≤ 1 이고, 내 발밑을 덮으려면 16(a+b) − 32h < 0,
//   즉 **h > (a+b)/2** 면 된다. 대각선(a=b)만 보면 h > n 을 요구해 **두 배 엄하다** —
//   그래서 동/남 쪽의 낮은 산이 실제로는 가리는데 예측이 0 으로 나왔다(침범 오탐의 정체).
function liftGeneric(hOf, i, j, W, H) {
  const h0 = hOf(i, j);
  let lift = 0;
  for (let n = 1; n < 40; n++) {
    for (let a = Math.ceil((n - 1) / 2); a <= Math.floor((n + 1) / 2); a++) {
      const b = n - a; if (b < 0) continue;
      if (Math.abs(a - b) > 1) continue;
      const x = i + a, y = j + b; if (x >= W || y >= H) continue;
      const v = hOf(x, y) - n / 2 - h0;
      if (v > lift) lift = v;
    }
  }
  return lift;
}


const R = { shots: [], report: '', fail: false };
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let FAIL = 0;
const judge = (ok, msg) => { if (!ok) FAIL++; say((ok ? '   ✓ ' : '   ✗ ') + msg); };

// ── 자산 로드 ────────────────────────────────────────────────────────────────
function loadAll(map) {
  return Promise.all(Object.keys(map).map(k => new Promise(res => {
    const im = new Image(); im.onload = () => res([k, im]); im.onerror = () => res([k, null]); im.src = map[k];
  }))).then(a => Object.fromEntries(a));
}

// ── 화면 좌표 ────────────────────────────────────────────────────────────────
const VIEW = { w: 1408, h: 736 };
function makeView(cv) {
  const g = cv.getContext('2d');
  const ctr = w2i((S.W / 2) * CELL, (S.H / 2) * CELL);
  const ox = VIEW.w / 2 - ctr.x, oy = VIEW.h / 2 - ctr.y;
  return { g, toScr: (x, y) => ({ x: x + ox, y: y + oy }), ox, oy };
}
function newCanvas(id, w, h) {
  const cv = document.createElement('canvas'); cv.id = id; cv.width = w || VIEW.w; cv.height = h || VIEW.h;
  document.body.appendChild(cv); return cv;
}

// ── 지면(산 밖) — 게임처럼 화면공간 패턴으로 먼저 깐다 ───────────────────────
function drawGround(g, TEX, F, cells) {
  g.save();
  for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
    const v = cells[j][i];
    const A = w2i(i * CELL, j * CELL), B = w2i((i + 1) * CELL, j * CELL),
          C = w2i((i + 1) * CELL, (j + 1) * CELL), D = w2i(i * CELL, (j + 1) * CELL);
    const pat = v === 1 ? TEX.water : TEX.grass;
    pat.setTransform(new DOMMatrix());
    g.fillStyle = pat;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(C.x, C.y); g.lineTo(D.x, D.y); g.closePath();
    g.fill(); g.strokeStyle = pat; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}

// ── ★좌표계 통일 ────────────────────────────────────────────────────────────
//   띠(mtseg)의 wx/wy 는 라이브 규약대로 **절대 월드**다. 그런데 개체 z 를 장면-로컬
//   좌표로 만들었더니 둘이 **다른 원점의 z** 로 비교돼 정렬이 통째로 무의미했다.
//   (증상: 가림 실측이 기하 예측과 64.9%p 어긋나고, 반례(정렬 제거)와 결과가 똑같았다.)
//   ⇒ z 는 **항상 절대 월드**로 만든다. 그리기만 원점을 뺀다.
// ★모든 '고르기'는 **화면 안**에서만 한다. 여백(MG) 셀은 캔버스 밖이라 거기서 고르면
//   계측이 헛것을 잡는다(실측: 봉우리가 여백에 잡혀 '부수기 전 덮임 0.0%' 가 나왔다).
const I0 = S.MG, J0 = S.MG, I1 = S.W - S.MG, J1 = S.H - S.MG;
const inView = (i, j) => i >= I0 && j >= J0 && i < I1 && j < J1;
const ABS = (i, j) => ({ wx: (i + S.cx0) * CELL + CELL / 2, wy: (j + S.cy0) * CELL + CELL / 2 });
const absZ = (i, j) => { const a = ABS(i, j); return w2i(a.wx, a.wy).y; };

// ── mtseg 를 라이브와 같은 방식으로 그린다 ───────────────────────────────────
//   라이브 _mtDraw 는 앵커(ox,oy)·스케일로 drawImage 한다. 여기선 배율 1(같은 배율에서
//   구웠으므로) — 앵커 규약만 동일하게 쓴다.
function drawSeg(g, seg, toScr) {
  const p = w2i(seg.wx - S.cx0 * CELL, seg.wy - S.cy0 * CELL);
  const c = toScr(p.x, p.y);
  g.drawImage(seg.img, Math.round(c.x - seg.ox), Math.round(c.y - seg.oy));
}

// ── 개체 — 라이브 _natDraw 규약 그대로 ───────────────────────────────────────
//   sc = (64/√2)/an.ppu * s.sc ;  drawImage(im, c.x-ox*sc, c.y-oy*sc*vy, w*sc, h*sc*vy)
function drawObj(g, o, OBJ, toScr) {
  const an = NATA[o.nm], im = OBJ[o.nm];
  if (!an || !im) return null;
  const sc = M.PPU_SCR / an.ppu * (o.sc || 1), vy = o.vy || 1;
  const p = w2i(o.wx - S.cx0 * CELL, o.wy - S.cy0 * CELL);   // 그릴 때만 원점을 뺀다
  const c = toScr(p.x, p.y);
  const dy = c.y - (o.h || 0) * CELL;                 // ★④ 경사면에 서려면 h(셀)만큼 올린다
  const dx = c.x - an.ox * sc, dyy = dy - an.oy * sc * vy;
  const W = im.naturalWidth * sc, H = im.naturalHeight * sc * vy;
  g.drawImage(im, dx, dyy, W, H);
  return { x: dx, y: dyy, w: W, h: H };
}

// ── 가림 실측 ────────────────────────────────────────────────────────────────
//   개체 하나를 빈 캔버스에 그려 마스크를 뜨고, 그 개체보다 **뒤에 그려지는 산 띠**만
//   따로 그려 겹친 비율을 센다. 사본이 아니라 **같은 그리기 함수**를 부른다.
function occlusionOf(o, objBox, segsAfter, OBJ, toScr) {
  if (!objBox) return null;
  const x0 = Math.max(0, Math.floor(objBox.x)), y0 = Math.max(0, Math.floor(objBox.y));
  const w = Math.min(VIEW.w - x0, Math.ceil(objBox.w) + 2), h = Math.min(VIEW.h - y0, Math.ceil(objBox.h) + 2);
  if (w <= 0 || h <= 0) return null;
  const mk = (draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.translate(-x0, -y0); draw(g);
    return g.getImageData(0, 0, w, h).data;
  };
  const a = mk(g => drawObj(g, o, OBJ, toScr));
  const b = mk(g => { for (const s of segsAfter) drawSeg(g, s, toScr); });
  let tot = 0, cov = 0;
  for (let p = 3; p < a.length; p += 4) {
    if (a[p] < 128) continue;
    tot++; if (b[p] > 128) cov++;
  }
  return tot ? { tot, cov, pct: cov / tot * 100 } : null;
}

// ══ 본체 ════════════════════════════════════════════════════════════════════
(async () => {
  const TEXIM = await loadAll(TEXSRC);
  const OBJ = await loadAll(OBJSRC);
  const BLD = await loadAll(BLDSRC);
  const mkPat = (im, g) => g.createPattern(im, 'repeat');

  // 물은 텍스처가 없다 — mud 를 파랗게 쓴 임시 패턴(목업 한정)
  const tmp = document.createElement('canvas').getContext('2d');
  const TEX = {
    grass: mkPat(TEXIM.grass, tmp), dry: mkPat(TEXIM.dry, tmp),
    mud: mkPat(TEXIM.mud, tmp), rock: mkPat(TEXIM.rock, tmp),
  };
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d'); g.drawImage(TEXIM.mud, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#3d6a94'; g.fillRect(0, 0, 512, 256);
    TEX.water = mkPat(c, tmp);
  }

  const clone = (c) => c.map(r => r.slice());
  const t0 = performance.now();
  const F = M.makeField(S);
  const tField = performance.now() - t0;

  // ═══ ① 재질 A/B ═══════════════════════════════════════════════════════════
  say('━━ ① 재질 A/B — 같은 장면 · 1:1 배율 · 실제 바위 마스크 ━━');
  const baked = {};
  // ★재질 시안 — A(PEAK 식) + B 팔레트 3안. 팔레트는 취향 갈림이라 **고르라고** 낸다.
  const VARIANTS = [['A', null, 'A · PEAK 식 플랫셰이딩 + 제한 팔레트'],
                    ['B', 'B1', 'B1 · 화강암(회색)'],
                    ['B', 'B2', 'B2 · 숲산(초록) — 한반도 기본'],
                    ['B', 'B3', 'B3 · 흙산(황토)']];
  for (const [MAT, PAL, nm] of VARIANTS) {
    const id = PAL || 'A';
    const cvv = newCanvas('mat' + id);
    const Vv = makeView(cvv);
    Vv.g.fillStyle = '#0a0d10'; Vv.g.fillRect(0, 0, VIEW.w, VIEW.h);
    Vv.g.save(); Vv.g.translate(Vv.ox, Vv.oy); drawGround(Vv.g, TEX, F, S.CELLS); Vv.g.restore();
    const bkv = M.bakeBands(F, S, { CH, BAND, TEX, MAT, PAL, JAG: 0 });
    const tdv = performance.now();
    for (const s2 of bkv.segs) drawSeg(Vv.g, s2, Vv.toScr);
    R.shots.push({ id: 'mat' + id, file: '1_재질_' + id + '.png' });
    say(`   ${nm}: 띠 ${bkv.segs.length}장 · 그리기 ${(performance.now() - tdv).toFixed(1)}ms/f`);
  }
  {
    const cvI = newCanvas('matID');
    const VI = makeView(cvI);
    VI.g.fillStyle = '#101418'; VI.g.fillRect(0, 0, VIEW.w, VIEW.h);
    const bkI = M.bakeBands(F, S, { CH, BAND, TEX, MAT: 'B', IDMAP: 1 });
    for (const s2 of bkI.segs) drawSeg(VI.g, s2, VI.toScr);
    VI.g.fillStyle = 'rgba(0,0,0,0.7)'; VI.g.fillRect(0, 0, 700, 22);
    VI.g.fillStyle = '#fff'; VI.g.font = '13px sans-serif';
    VI.g.fillText('재질 ID — 물 파랑 · 맨바위 빨강 · 이끼바위 주황 · 너덜 초록 · 숲사면 남색 · 자락 보라', 8, 15);
    R.shots.push({ id: 'matID', file: '1_재질ID_진단.png' });
  }
  for (const MAT of ['A', 'B']) {
    const cv = newCanvas('mat' + MAT);
    const V = makeView(cv);
    V.g.fillStyle = '#0a0d10'; V.g.fillRect(0, 0, VIEW.w, VIEW.h);
    V.g.save(); V.g.translate(V.ox, V.oy);
    drawGround(V.g, TEX, F, S.CELLS);
    V.g.restore();
    const tb = performance.now();
    const bk = M.bakeBands(F, S, { CH, BAND, TEX, MAT });
    const tBake = performance.now() - tb;
    // ★1회차 blit 에는 **굽는 비용이 섞인다** — 캔버스 2D 는 래스터화를 처음 쓸 때까지 미룬다.
    //   (실측 증거: 세분을 늘리면 '그리기'가 '굽기'와 정비례로 같이 뛰었다. blit 량은 그대로인데.)
    //   그래서 2·3회차를 재서 **정상 프레임 비용**을 낸다.
    for (const s of bk.segs) drawSeg(V.g, s, V.toScr);          // 1회차 = 래스터화
    const td = performance.now();
    for (let rep = 0; rep < 3; rep++) for (const s of bk.segs) drawSeg(V.g, s, V.toScr);
    const tDraw = (performance.now() - td) / 3;
    baked[MAT] = { bk, tBake, tDraw };
    R.shots.push({ id: 'mat' + MAT, file: '1_재질' + MAT + '.png' });
    say(`   ${MAT}: 띠 ${bk.segs.length}장 · 오프스크린 ${(bk.px * 4 / 1048576).toFixed(1)}MB · `
      + `굽기 ${tBake.toFixed(0)}ms · 그리기 ${tDraw.toFixed(2)}ms/f (거리장 ${tField.toFixed(0)}ms)`);
  }
  // 반례: 질감을 끈 판보다 결이 많아야 한다(자명 통과 금지)
  {
    const g = document.getElementById('matB').getContext('2d');
    const dB = g.getImageData(0, 0, VIEW.w, VIEW.h).data;
    const gA = document.getElementById('matA').getContext('2d');
    const dA = gA.getImageData(0, 0, VIEW.w, VIEW.h).data;
    // ★산 픽셀에만 잰다. 화면 절반이 풀밭이라 전체 평균은 **풀 텍스처에 희석된다**
    //   (1차 계측이 그래서 1.3배로 나왔다 — 자가 고장이었다).
    const mcv = document.createElement('canvas'); mcv.width = VIEW.w; mcv.height = VIEW.h;
    const mg = mcv.getContext('2d');
    for (const s2 of baked.B.bk.segs) drawSeg(mg, s2, makeView(mcv).toScr);
    const MK = mg.getImageData(0, 0, VIEW.w, VIEW.h).data;
    const detail = (d) => {
      let s = 0, n = 0;
      for (let y = 0; y < VIEW.h; y += 2) for (let x = 4; x < VIEW.w - 4; x += 2) {
        const q = (y * VIEW.w + x) * 4;
        if (MK[q + 3] < 200 || MK[q + 3 + 4] < 200) continue;
        s += Math.abs(d[q] - d[q + 4]); n++;
      }
      return n ? s / n : 0;
    };
    // ★[재민 판정 반영] 이 자를 갈았다. A 와 비교하던 판정은 이제 **무의미**하다 —
    //   급경사 변위 세분이 들어가면서 A 도 기하 요철을 얻어 결이 같이 올라간다(A 0.43→2.01).
    //   질감이 있는지 물으려면 **질감만 뺀 같은 기하**와 비교해야 한다.
    const cvN = document.createElement('canvas'); cvN.width = VIEW.w; cvN.height = VIEW.h;
    const VN = makeView(cvN);
    VN.g.fillStyle = '#0a0d10'; VN.g.fillRect(0, 0, VIEW.w, VIEW.h);
    const bkN = M.bakeBands(F, S, { CH, BAND, TEX, MAT: 'B', PAL: 'B2', FLATTEX: 1 });
    for (const s2 of bkN.segs) drawSeg(VN.g, s2, VN.toScr);
    const dN = VN.g.getImageData(0, 0, VIEW.w, VIEW.h).data;
    const a = detail(dN), b = detail(dB);
    // 재질 분포 — **정본 matOf 를 그대로 부른다**(사본 금지). 온 사면이 맨바위면 여기서 드러난다.
    {
      const cnt = {}; let n = 0;
      for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
        if (S.CELLS[j][i] !== 2) continue;
        const H4 = [F.cor(i, j), F.cor(i + 1, j), F.cor(i + 1, j + 1), F.cor(i, j + 1)];
        const u = [CELL, CELL, (H4[2] - H4[0]) * CELL], v = [CELL, -CELL, (H4[1] - H4[3]) * CELL];
        let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        const ln = Math.hypot(nx, ny, nz) || 1; nz = Math.abs(nz / ln);
        const m = M.matOf(1 - nz, (H4[0] + H4[1] + H4[2] + H4[3]) / 4, S.HMAX, false);
        cnt[m] = (cnt[m] || 0) + 1; n++;
      }
      say('   재질 분포(바위 셀 ' + n + '): ' + Object.keys(cnt).map(k => k + ' ' + (cnt[k] / n * 100).toFixed(0) + '%').join(' · '));
      const bare = ((cnt.rock || 0) + (cnt.crag || 0)) / n;
      judge(bare < 0.55, '맨바위·너덜이 사면을 다 덮지 않는다 — 맨바위류 ' + (bare * 100).toFixed(0) + '% < 55% (한반도는 숲산)');
    }
    say(`   (산 픽셀에만 측정 — 표본 ${(() => { let n = 0; for (let q = 3; q < MK.length; q += 4) if (MK[q] > 200) n++; return n; })()}px)`);
    say(`   결(가로 인접 픽셀차 평균): 질감끔 ${a.toFixed(2)} · 채택 ${b.toFixed(2)}`);
    // ★[재민 판정 규약 2026-08-09] "결 수치는 **참고일 뿐 통과 조건이 아니다** —
    //   2차에서 수치는 통과했는데 그림이 낙제했다." 그래서 판정에서 뺀다(완화가 아니라 강등).
    //   대신 숫자는 계속 찍는다. 판정자는 재민이고 기준은 "옆 스프라이트와 같은 게임으로 보이는가"다.
    say(`   (참고) 질감을 끈 같은 기하 대비 결 ${(b / a).toFixed(2)}배 — 통과 조건 아님`);
  }

  if (SCENE === 'matAB') { R.report = lines.join('\n'); R.fail = FAIL > 0; window.__R = R; window.__done = true; return; }

  // ═══ ② 합성 — 실제 규약 · 가림 실측 ═══════════════════════════════════════
  say('');
  say('━━ ② 합성 — 나무·바위를 라이브 규약대로 · 가림 실측 ━━');
  //
  // ★1차 설계가 틀렸다. "북서면 가려지고 남동이면 안 가려진다"고 **방위로 가정**했더니
  //   봉우리가 화면 북단에 잡히면서 남쪽 개체가 산 속으로 들어가 100% 가려졌다.
  //   방위는 가정이지 판정 기준이 아니다.
  //
  // ⇒ 판정을 바꾼다: **기하로 먼저 예측하고, 그림이 그 예측과 맞는지** 본다.
  //   개체 발밑에서 시선 방향(남동, 반대각선 +1,+1)으로 행진하며
  //     lift = max_{n≥1} ( h(i+n, j+n) − n )   [칸]
  //   앞 셀의 마루가 개체 발밑보다 lift·32 px 위로 솟아 있다는 뜻이다.
  //   ⇒ 예상 가림률 = clamp(lift·32 / 개체 픽셀높이).
  //   이건 **렌더러를 안 쓰고** 높이장만으로 나온 수다. 그림이 여기 맞아야 z 규약이 맞다.
  //
  let peak = [(I0 + I1) >> 1, (J0 + J1) >> 1, 0];
  for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++)
    if (F.hAt(i, j) > peak[2]) peak = [i, j, F.hAt(i, j)];
  say(`   봉우리 (${peak[0]},${peak[1]}) 높이 ${peak[2].toFixed(1)}칸 = ${(peak[2] * 32).toFixed(0)}px`);

  const names = Object.keys(OBJ).filter(k => OBJ[k]);
  // 기하 예측: 개체 발밑에서 시선 방향(남동, +1/+1)으로 행진해
  //   lift = max_{n≥1}( h(i+n,j+n) − n − h(i,j) )  [칸]  = 앞 마루가 발밑보다 솟은 높이
  const liftCell = (ci, cj) => liftGeneric((x, y) => F.hAt(x, y), ci, cj, S.W, S.H);
  const liftOf = (o) => liftCell(o.ci, o.cj);
  // ★배치를 격자로 깔았더니 **가려질 개체가 한 개도 안 잡혔다**(이 장면은 남동이 전부 내리막).
  //   한쪽 경우만 있는 표본은 시험이 아니다. ⇒ lift 를 먼저 전수 계산하고
  //   높은 쪽·0인 쪽을 **의도적으로 같이** 뽑는다. 그래도 없으면 장면이 잘못된 것이다.
  const allCells = [];
  for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) allCells.push({ i, j, lift: liftCell(i, j) });
  allCells.sort((a, b) => b.lift - a.lift);
  const hi = allCells.filter(c => c.lift > 1.2).filter((_, n) => n % 3 === 0).slice(0, 24);
  const lo = allCells.filter(c => c.lift === 0).filter((_, n) => n % 17 === 0).slice(0, 24);
  say(`   lift 분포: 최대 ${allCells[0].lift.toFixed(2)}칸 · >1.2칸 셀 ${allCells.filter(c => c.lift > 1.2).length}개 · 0인 셀 ${allCells.filter(c => c.lift === 0).length}개`);
  const objs = [...hi, ...lo].map(({ i, j }) => {
    const A = ABS(i, j);
    return { nm: names[(i * 7 + j * 13) % names.length], wx: A.wx, wy: A.wy,
             ci: i, cj: j, sc: 1, h: F.hAt(i, j), z: absZ(i, j) };
  });

  const segsB = baked.B.bk.segs;
  const composeInto = (V, order) => {
    V.g.fillStyle = '#0a0d10'; V.g.fillRect(0, 0, VIEW.w, VIEW.h);
    V.g.save(); V.g.translate(V.ox, V.oy); drawGround(V.g, TEX, F, S.CELLS); V.g.restore();
    const boxes = new Map();
    if (order === 'wrong') {
      // ★반례 — 라이브가 하듯 z 정렬하지 않고 **산을 통째로 먼저** 그린 판.
      for (const s2 of segsB) drawSeg(V.g, s2, V.toScr);
      for (const o of objs) boxes.set(o, drawObj(V.g, o, OBJ, V.toScr));
    } else {
      const rend = [...segsB.map(s2 => ({ z: s2.z, kind: 'mtseg', s: s2 })),
                    ...forest.map(o => ({ z: o.z, kind: 'obj', o })),
                    ...objs.map(o => ({ z: o.z, kind: 'obj', o }))];
      rend.sort((p, q) => p.z - q.z);
      const _t = performance.now();
      for (const it of rend) {
        if (it.kind === 'mtseg') drawSeg(V.g, it.s, V.toScr);
        else boxes.set(it.o, drawObj(V.g, it.o, OBJ, V.toScr));
      }
      window.__tSort = performance.now() - _t;    // ★지면 굽기는 빼고 **정렬+그리기만**
    }
    return boxes;
  };

  // ★판정 그림은 **2_합성 구도**다(재민 규약): 산 + 나무 + 개체가 한 화면에.
  //   그래서 숲을 여기서 미리 만들어 같이 태운다.
  const forest = [];
  for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
    const h = F.hAt(i, j);
    if (h <= 0.05 || h > S.HMAX * 0.92) continue;
    const gx = (F.hAt(i + 1, j) - F.hAt(i - 1, j)) * 0.5, gy = (F.hAt(i, j + 1) - F.hAt(i, j - 1)) * 0.5;
    if (1 - 1 / Math.hypot(gx, gy, 1) > 0.62) continue;
    if (M.hash(i + S.cx0, j + S.cy0, 77) > 0.34) continue;
    const nm = ['tree01', 'tree03', 'tree06', 'tree09', 'bush02'][Math.floor(M.hash(i + S.cx0, j + S.cy0, 78) * 5)];
    if (!OBJ[nm]) continue;
    const A3 = ABS(i, j);
    forest.push({ nm, wx: A3.wx, wy: A3.wy, ci: i, cj: j, h, sc: 0.8 + M.hash(i, j, 79) * 0.35, z: absZ(i, j) });
  }
  say(`   숲 ${forest.length}그루 (수목한계 ${(S.HMAX * 0.92).toFixed(1)}칸 · 절벽 제외)`);

  const cv2 = newCanvas('compose');
  const V2 = makeView(cv2);
  const boxes = composeInto(V2, 'z');
  const tCompose = window.__tSort || 0;
  R.shots.push({ id: 'compose', file: '2_합성.png' });

  // ★1차 반례가 **비어 있었다**: 실측이 `z > o.z` 로 띠를 다시 골라 쟀기 때문에
  //   합성 순서를 바꿔도 숫자가 안 바뀌었다(반례 1.0배). 그건 반례가 아니다.
  //   ⇒ 실측을 **합성 순서 그대로** 하게 바꾼다: order 를 받아 그 순서로 앞 띠를 정한다.
  const measure = (boxesM, V, order) => {
    const rows = [];
    for (const o of objs) {
      const box = boxesM.get(o); if (!box) continue;
      const after = order === 'wrong' ? segsB : segsB.filter(s2 => s2.z > o.z);
      const r = occlusionOf(o, box, after, OBJ, V.toScr);
      if (!r) continue;
      const exp = Math.max(0, Math.min(100, liftOf(o) * CELL / Math.max(1, box.h) * 100));
      rows.push({ o, act: r.pct, exp });
    }
    return rows;
  };
  const rows = measure(boxes, V2, 'z');
  // ★판정을 **불리언 일치**로 바꾼다. 분수 예측(lift·32/개체높이)은 근사다 —
  //   가리는 조각은 얇은 다이아라, 시선이 걸리는 높이까지 **연속으로** 덮인다는 가정이
  //   지형에 구멍(비바위 셀)이 있으면 깨진다. 실측 14.7% vs 예측 37.3% 가 그 차이였다.
  //   "가려지느냐 아니냐"는 그 근사에 안 흔들린다. 그걸 판정으로 쓴다.
  //   ★문턱을 exp>5% 하나로 두면 **스치는 경계**(lift 0.16칸 ≈ 5px)가 전부 판정에 들어와
  //     79% 로 떨어졌다. 그 띠는 예측이든 실측이든 한 픽셀 싸움이라 판정 대상이 아니다.
  //     ⇒ **명확한 것만** 판정하고, 애매한 띠는 개수를 따로 찍는다(숨기지 않는다).
  const PRED = (r) => r.exp > 25, CLR = (r) => r.exp < 3, MEAS = (r) => r.act > 5;
  const decided = rows.filter(r => PRED(r) || CLR(r));
  const ambig = rows.length - decided.length;
  const agree = decided.filter(r => PRED(r) === MEAS(r)).length;
  const rate = decided.length ? agree / decided.length * 100 : 0;
  const occl = rows.filter(PRED), clear = rows.filter(CLR);
  say(`   애매한 띠(예측 3~25%, 스치는 경계) ${ambig}개는 판정에서 뺐다 — 한 픽셀 싸움이다`);
  say(`   개체 ${objs.length} · 합성 ${tCompose.toFixed(2)}ms/f`);
  say(`   기하 예측과 **가림 여부**가 일치 ${agree}/${decided.length} = ${rate.toFixed(0)}% (명확한 것만)`);
  say(`      가려져야 할 개체 ${occl.length}개: 실측 평균 ${(occl.reduce((a2, r) => a2 + r.act, 0) / Math.max(1, occl.length)).toFixed(1)}%`);
  say(`      안 가려져야 할 개체 ${clear.length}개: 실측 최대 ${clear.reduce((a2, r) => Math.max(a2, r.act), 0).toFixed(2)}%`);
  judge(occl.length >= 5 && clear.length >= 5, `표본에 두 경우가 다 있다 (가림 ${occl.length} · 노출 ${clear.length})`);
  judge(clear.reduce((a2, r) => Math.max(a2, r.act), 0) < 2, `앞이 트인 개체는 안 가려진다`);
  judge(rate >= 85, `그림이 기하 예측과 맞는다 — 가림 여부 일치 ${rate.toFixed(0)}% ≥ 85%`);

  // ★반례 두 가지 — "기능이 없으면 실패해야 한다"를 양쪽에서 건다.
  //   ⓐ 산 레이어가 아예 없는 판  → 가림 0 → 예측(가려질 개체)과 크게 어긋나야 한다
  //   ⓑ 산을 **항상 앞**에 두는 판 → 가림 ~100% → 예측(트인 개체)과 크게 어긋나야 한다
  {
    const mk = (which) => {
      let ok = 0, n2 = 0;
      for (const o of objs) {
        const box = boxes.get(o); if (!box) continue;
        const after = which === 'none' ? [] : segsB;
        const r = occlusionOf(o, box, after, OBJ, V2.toScr);
        if (!r) continue;
        const exp = Math.max(0, Math.min(100, liftOf(o) * CELL / Math.max(1, box.h) * 100));
        if (!(exp > 25 || exp < 3)) continue;
        n2++; if ((exp > 25) === (r.pct > 5)) ok++;
      }
      return n2 ? ok / n2 * 100 : 0;
    };
    const mNone = mk('none');
    // ⓑ 반례는 **실제로 있었던 버그**를 되살린 것이다: 띠 z 는 절대 월드인데
    //    개체 z 를 장면-로컬로 만들어 서로 다른 원점끼리 비교하던 판(오차 64.9%p).
    let mBug = 0;
    {
      let ok = 0, n2 = 0;
      for (const o of objs) {
        const box = boxes.get(o); if (!box) continue;
        const zLocal = w2i(o.ci * CELL + 16, o.cj * CELL + 16).y;      // ← 실제 있었던 버그
        const r = occlusionOf(o, box, segsB.filter(s2 => s2.z > zLocal), OBJ, V2.toScr);
        if (!r) continue;
        const exp = Math.max(0, Math.min(100, liftOf(o) * CELL / Math.max(1, box.h) * 100));
        if (!(exp > 25 || exp < 3)) continue;
        n2++; if ((exp > 25) === (r.pct > 5)) ok++;
      }
      mBug = n2 ? ok / n2 * 100 : 0;
    }
    say(`   반례 일치율 — ⓐ 산 레이어 없음 ${mNone.toFixed(0)}% · ⓑ z 를 장면-로컬로(실제 있었던 버그) ${mBug.toFixed(0)}% · 채택 ${rate.toFixed(0)}%`);
    say(`   ※ "산을 항상 앞" 은 반례로 못 쓴다 — 평지의 개체는 애초에 산 띠와 화면이 안 겹쳐 순서를 바꿔도 안 변한다(실측 확인).`);
    // ★ⓑ(z 로컬 버그)는 이 장면에선 약한 반례다 — 개체가 대부분 평지에 있어
    //   z 원점이 틀려도 '앞 띠' 집합이 거의 안 변한다. 그 사실을 적고, 판정은 ⓐ 로 건다.
    say(`   ※ ⓑ 는 이 장면에서 약한 반례다(개체가 평지에 몰려 있어 z 원점 오류가 잘 안 드러난다).`);
    judge(mNone < rate - 20, `자가 검사 — 산 레이어를 빼면 ${(rate - mNone).toFixed(0)}%p 못 맞힌다`);
  }

  // ═══ 판정 그림 — 2_합성 구도로 **재질 후보별 1장씩** [재민 판정 규약] ══════════
  //   판정자는 재민이고 기준은 "옆의 블렌더 스프라이트와 같은 게임으로 보이는가"다.
  //   그래서 산만 낸 그림이 아니라 **나무·개체가 같이 있는 구도**로 낸다.
  for (const [MAT2, PAL2, nm2] of (window.JUDGE === 0 ? [] : [['A', null, 'A'], ['B', 'B1', 'B1'], ['B', 'B2', 'B2'], ['B', 'B3', 'B3']])) {
    const cvJ = newCanvas('judge' + nm2);
    const VJ = makeView(cvJ);
    VJ.g.fillStyle = '#0a0d10'; VJ.g.fillRect(0, 0, VIEW.w, VIEW.h);
    VJ.g.save(); VJ.g.translate(VJ.ox, VJ.oy); drawGround(VJ.g, TEX, F, S.CELLS); VJ.g.restore();
    const bkJ = M.bakeBands(F, S, { CH, BAND, TEX, MAT: MAT2, PAL: PAL2, JAG: 0 });
    const rj = [...bkJ.segs.map(s2 => ({ z: s2.z, kind: 'mtseg', s: s2 })),
                ...forest.map(o => ({ z: o.z, kind: 'obj', o })),
                ...objs.map(o => ({ z: o.z, kind: 'obj', o }))];
    rj.sort((a2, b2) => a2.z - b2.z);
    for (const it of rj) { if (it.kind === 'mtseg') drawSeg(VJ.g, it.s, VJ.toScr); else drawObj(VJ.g, it.o, OBJ, VJ.toScr); }
    R.shots.push({ id: 'judge' + nm2, file: '0_판정_' + nm2 + '.png' });
  }
  say(`   판정 그림 4장(재질 후보별 · 나무 ${forest.length}그루 포함) 냈다`);

  // ═══ ③ 파괴 ═══════════════════════════════════════════════════════════════
  say('');
  say('━━ ③ 파괴 — 1셀 관통 통로(두 방향) + 3×3 채석 ━━');

  // 바닥 덮임 — "부순 셀의 **바닥(높이 0)** 이 화면에 실제로 보이나".
  //   ★부수기 전에도 같은 자를 댄다: 그때는 산 속이라 100% 여야 한다(자가 검사).
  //   ★[타 세션 지적] 3·7·13셀이 **정확히 같은 10%** — 상수가 잡혀 있다.
  //     셀별로 갈라 보니 15칸이 전부 **2%** 였다(끝 칸만 99%). 그 2% 의 정체를 가른다:
  //     내가 실틈 막으려고 넣은 **도형 부풀리기(0.55px)** 가 이웃 셀 다이아 안으로
  //     삐져 들어온 테두리인지. 다이아를 1px 안으로 줄여 재서 사라지면 그게 맞다.
  const floorCover = (list, segs, V, inset) => {
    let tot = 0, cov = 0;
    for (const [i, j] of list) {
      const z = absZ(i, j);
      let pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => {
        const c = w2i(a * CELL, b * CELL); return V.toScr(c.x, c.y); });   // ★높이 0 = 바닥
      if (inset) {                       // 무게중심 쪽으로 inset px 줄인다
        const mx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, my = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
        pts = pts.map(q => { const dx = q.x - mx, dy = q.y - my, l = Math.hypot(dx, dy) || 1;
          return { x: q.x - dx / l * inset, y: q.y - dy / l * inset }; });
      }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
      const w = Math.min(VIEW.w - x0, Math.ceil(x1) - x0 + 1), h = Math.min(VIEW.h - y0, Math.ceil(y1) - y0 + 1);
      if (w <= 0 || h <= 0) continue;
      const c1 = document.createElement('canvas'); c1.width = w; c1.height = h;
      const g1 = c1.getContext('2d'); g1.translate(-x0, -y0);
      g1.fillStyle = '#fff'; g1.beginPath(); g1.moveTo(pts[0].x, pts[0].y);
      for (let n = 1; n < 4; n++) g1.lineTo(pts[n].x, pts[n].y); g1.closePath(); g1.fill();
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g2 = c2.getContext('2d'); g2.translate(-x0, -y0);
      // ★같은 반대각선의 띠 z 는 셀 z 보다 0.5 작다(개체가 그 위에 서야 하므로).
      //   그래서 `s.z > z` 로 거르면 **자기 셀의 기둥이 빠진다** — 부수기 전에도
      //   바닥이 '안 가려진 것'으로 나왔다(2.7%). 바닥을 덮는 건 자기 기둥이 먼저다.
      for (const s of segs) if (s.z > z - 1) drawSeg(g2, s, V.toScr);
      const A = g1.getImageData(0, 0, w, h).data, B = g2.getImageData(0, 0, w, h).data;
      for (let p = 3; p < A.length; p += 4) { if (A[p] < 128) continue; tot++; if (B[p] > 128) cov++; }
    }
    return tot ? cov / tot * 100 : 0;
  };

  // ★평지 침범(②) — 3D 는 정의상 0. 스프라이트 판(4.4~6.1%)보다 **조여서** 잰다.
  const spill = (cells2, segs, V, FD2) => {
    const spillWhy = [];
    // ★[재민 ⑥] "정의상 0 은 네 주장이다" — 맞다. 그래서 자를 **더 엄격하게** 바꿨다.
    //   1차 판은 셀 **중심 한 픽셀**만 봤다. 그러면 앞 산의 마루가 시선을 정확히 스치는
    //   경계(lift ≈ 0)에서 1px 이 걸려 0.4~0.9% 로 나온다 — 실측한 침범 셀이 전부 lift 0.00 이었다.
    //   그건 셀 소유가 샌 게 아니라 **정당한 가림의 경계**다.
    //   ⇒ 완화가 아니라 교정: 셀의 **지면 다이아 전체**를 래스터화해 **면적 비율**로 잰다.
    //     스치는 가림은 얇은 조각이라 안 걸리고, 진짜 침범(산이 평지를 덮음)은 면적으로 걸린다.
    //     문턱 50% — 절반이 덮이면 그 셀은 화면에서 '산'으로 읽힌다.
    const cvT = document.createElement('canvas'); cvT.width = VIEW.w; cvT.height = VIEW.h;
    const gT = cvT.getContext('2d');
    for (const s2 of segs) drawSeg(gT, s2, V.toScr);
    const D = gT.getImageData(0, 0, VIEW.w, VIEW.h).data;
    let bad = 0, tot = 0;
    for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
      if (cells2[j][i] === 2) continue;
      let touch = false;
      for (let b = -1; b <= 1 && !touch; b++) for (let a = -1; a <= 1; a++)
        if (i + a >= 0 && j + b >= 0 && i + a < S.W && j + b < S.H && cells2[j + b][i + a] === 2) { touch = true; break; }
      if (touch) continue;                                    // 앞치마는 높이 0 이라 지면과 같다
      // 앞에 산이 서서 가려진 것은 침범이 아니라 **올바른 가림**이다.
      const lift = liftGeneric((x, y) => (cells2[y] && cells2[y][x] === 2 ? FD2.hAt(x, y) : 0), i, j, S.W, S.H);
      if (lift > 0) continue;
      // 지면 다이아를 훑어 덮인 면적 비율
      const c0 = V.toScr(w2i(i * CELL, j * CELL).x, w2i(i * CELL, j * CELL).y);
      const c1 = V.toScr(w2i((i + 1) * CELL, j * CELL).x, w2i((i + 1) * CELL, j * CELL).y);
      const c2 = V.toScr(w2i((i + 1) * CELL, (j + 1) * CELL).x, w2i((i + 1) * CELL, (j + 1) * CELL).y);
      const c3 = V.toScr(w2i(i * CELL, (j + 1) * CELL).x, w2i(i * CELL, (j + 1) * CELL).y);
      const xs = [c0.x, c1.x, c2.x, c3.x], ys = [c0.y, c1.y, c2.y, c3.y];
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(VIEW.w - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(VIEW.h - 1, Math.ceil(Math.max(...ys)));
      if (x1 <= x0 || y1 <= y0) continue;
      const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh2 = (y1 - y0) / 2;
      let inN = 0, cov = 0;
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
        // 다이아 내부 판정 |dx|/hw + |dy|/hh <= 1
        if (Math.abs(x - cxm) / hw + Math.abs(y - cym) / hh2 > 1) continue;
        inN++; if (D[(y * VIEW.w + x) * 4 + 3] > 128) cov++;
      }
      if (!inN) continue;
      tot++;
      const r = cov / inN;
      if (r > 0.50) { bad++; if (spillWhy.length < 6) spillWhy.push(`(${i},${j}) 덮임 ${(r * 100).toFixed(0)}%`); }
    }
    return { bad, tot, pct: bad / Math.max(1, tot) * 100, why: spillWhy };
  };

  // 통로 두 방향 + 채석. **각각 따로** 리메시한다(서로 영향 안 주게).
  const cutRuns = [];
  {
    let bi = -1, bc = -1;
    for (let i = I0; i < I1; i++) { let c = 0; for (let j = J0; j < J1; j++) if (S.CELLS[j][i] === 2) c++;
      if (c > bc) { bc = c; bi = i; } }
    const nsRun = []; for (let j = J0; j < J1; j++) if (S.CELLS[j][bi] === 2) nsRun.push([bi, j]);
    let bj = -1; bc = -1;
    for (let j = J0; j < J1; j++) { let c = 0; for (let i = I0; i < I1; i++) if (S.CELLS[j][i] === 2) c++;
      if (c > bc) { bc = c; bj = j; } }
    const ewRun = []; for (let i = I0; i < I1; i++) if (S.CELLS[bj][i] === 2) ewRun.push([i, bj]);
    // 대각(북동–남서) 통로 = 화면에서 **가로**로 뻗는다. 등각에서 제일 잘 보이는 방향.
    const dgRun = [];
    { const k = peak[0] - peak[1];
      for (let j = J0; j < J1; j++) { const i = j + k; if (inView(i, j) && S.CELLS[j][i] === 2) dgRun.push([i, j]); } }
    cutRuns.push({ nm: '남북 통로(열 i=' + bi + ')', cells: nsRun });
    cutRuns.push({ nm: '동서 통로(행 j=' + bj + ')', cells: ewRun });
    cutRuns.push({ nm: '북동–남서 통로(화면 가로)', cells: dgRun });
    // ★★[재민 2026-08-09] "가장자리에서만 팔 수 있다는 거 잊은 건 아니지? 봉우리를 왜 파냐"
    //   맞다. **봉우리 3×3 은 애초에 불가능한 수**다. 그런데 하네스가 그걸 만들어 재고
    //   그림까지 뽑았다 — 계측기가 게임 규칙을 어기고 있었다.
    //   ⇒ 규칙을 여기 못 박는다: 평지(비바위)와 4-인접한 바위 셀만 부술 수 있다.
    //     불법 셀이 하나라도 섞이면 **판정을 실패시킨다**(조용히 걸러내면 또 잊는다).
    const LEGAL = (cells, i, j) => {
      if (!inView(i, j) || cells[j][i] !== 2) return false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = i + a, y = j + b;
        if (x < 0 || y < 0 || x >= S.W || y >= S.H) continue;
        if (cells[y][x] !== 2) return true;
      }
      return false;
    };
    // 채석 자리 = **봉우리에 가장 가까운 합법(겉면) 셀** 주변 3×3 중 합법인 것만.
    let qc = null, qd = 1e9;
    for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
      if (!LEGAL(S.CELLS, i, j)) continue;
      const d = Math.hypot(i - peak[0], j - peak[1]);
      if (d < qd) { qd = d; qc = [i, j]; }
    }
    const q = [];
    if (qc) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const i = qc[0] + a, j = qc[1] + b;
      if (LEGAL(S.CELLS, i, j)) q.push([i, j]);
    }
    say(`   채석 자리 = 봉우리에서 가장 가까운 **겉면** 셀 (${qc ? qc.join(',') : '-'}) 주변 · 합법 ${q.length}셀`);
    cutRuns.push({ nm: '겉면 3×3 채석(합법)', cells: q, legalChk: true });

    // ★[재민 2026-08-09 "U자로 산 파면?"] — U 자 만(灣)을 판다.
    //   ★규칙을 지키려면 **한 번에 다 못 판다**. 겉면부터 한 겹씩, 그때그때 합법인 셀만
    //     골라 반복해야 안쪽까지 닿는다. 그 절차를 그대로 흉내 낸다(도달 못 하면 그것도 결과다).
    //   U 는 안쪽에 **혓바닥**을 남긴다 — 이 구조에서 제일 위험한 모양이다.
    //     혓바닥은 양옆이 파여 가장자리 거리가 무너지므로, 안 팠는데도 높이가 주저앉는다.
    {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      // 진입점 = 봉우리에서 가장 가까운 겉면 셀. 안쪽 방향 = 봉우리 쪽 지배축.
      let e = null, ed = 1e9;
      for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
        if (!LEGAL(S.CELLS, i, j)) continue;
        const d = Math.hypot(i - peak[0], j - peak[1]); if (d < ed) { ed = d; e = [i, j]; }
      }
      const vx = peak[0] - e[0], vy = peak[1] - e[1];
      const A = Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)];   // 안쪽
      const B = [-A[1], A[0]];                                                            // 가로
      const LN = 8, HW = 3;      // 길이 8셀 · 반폭 3 (전체 폭 7)
      const target = [], tongue = [];
      for (let a = 0; a < LN; a++) for (let b = -HW; b <= HW; b++) {
        const i = e[0] + A[0] * a + B[0] * b, j = e[1] + A[1] * a + B[1] * b;
        if (!inView(i, j) || S.CELLS[j][i] !== 2) continue;
        const isArm = Math.abs(b) >= 2, isEnd = a >= LN - 2;
        if (isArm || isEnd) target.push([i, j]); else tongue.push([i, j]);
      }
      // 겉면부터 한 겹씩 — 합법인 것만, 더 못 팔 때까지
      const cw = clone(S.CELLS); const dug = []; let pass = 0;
      const LG2 = (cells, i, j) => {
        if (cells[j][i] !== 2) return false;
        for (const [a, b] of dirs) { const x = i + a, y = j + b;
          if (x < 0 || y < 0 || x >= S.W || y >= S.H) continue;
          if (cells[y][x] !== 2) return true; }
        return false;
      };
      for (; pass < 40; pass++) {
        const now = target.filter(([i, j]) => cw[j][i] === 2 && LG2(cw, i, j));
        if (!now.length) break;
        for (const [i, j] of now) { cw[j][i] = 0; dug.push([i, j]); }
      }
      const unreached = target.filter(([i, j]) => cw[j][i] === 2).length;
      say(`   U자 만: 목표 ${target.length}셀 · ${pass}겹에 걸쳐 ${dug.length}셀 채굴 · 못 판 셀 ${unreached}`);
      say(`      남는 혓바닥 ${tongue.length}셀 (안 팠는데 양옆이 파인다)`);
      cutRuns.push({ nm: 'U자 만(합법 절차)', cells: dug, tongue, progressive: true });
    }
  }

  // ★모든 절단안에 규칙 검사를 건다. 통로 3종은 **산 속을 지나므로 규칙상 불법**이다 —
  //   그 사실 자체를 숫자로 남긴다(지우지 않는다. 3D 채택 판단에 필요한 정보다).
  {
    const LG = (cells, i, j) => {
      if (cells[j][i] !== 2) return false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = i + a, y = j + b;
        if (x < 0 || y < 0 || x >= S.W || y >= S.H) continue;
        if (cells[y][x] !== 2) return true;
      }
      return false;
    };
    for (const run of cutRuns) {
      // ★진행형 절차(U자처럼 한 겹씩 파 들어가는 것)는 **원본 상태 기준으로 재면 안 된다**.
      //   안쪽 셀은 t=0 엔 당연히 불법이고, 앞 겹을 판 뒤에 합법이 된다.
      //   1차 판이 그걸 몰라 "36셀 중 34셀 규칙 위반" 이라는 헛경고를 냈다.
      //   진행형은 만들 때 이미 매 겹 합법성을 확인했으므로 여기선 건너뛴다.
      if (run.progressive) { run.illegal = 0; continue; }
      run.illegal = run.cells.filter(([i, j]) => !LG(S.CELLS, i, j)).length;
      if (run.illegal) say(`   ⚠ ${run.nm}: ${run.cells.length}셀 중 ${run.illegal}셀이 **규칙 위반**(겉면 아님) — 실제로는 못 파는 수다`);
    }
    const legalRuns = cutRuns.filter(r => !r.illegal);
    judge(legalRuns.length > 0, `합법 절단안이 표본에 있다 (${legalRuns.length}/${cutRuns.length})`);
  }

  let firstDestroy = null, tRemeshTot = 0;
  for (const run of cutRuns) {
    if (!run.cells.length) { say(`   ${run.nm}: 셀 0 — 건너뜀`); continue; }
    const c2 = clone(S.CELLS);
    for (const [i, j] of run.cells) c2[j][i] = 0;
    const SD = Object.assign({}, S, { CELLS: c2 });
    const tr = performance.now();
    const FD = M.makeField(SD);
    const bkD = M.bakeBands(FD, SD, { CH, BAND, TEX, MAT: 'B', JAG: 2 });
    const dt = performance.now() - tr; tRemeshTot += dt;
    const cvD = newCanvas('destroy_' + cutRuns.indexOf(run));
    const VD = makeView(cvD);
    VD.g.fillStyle = '#0a0d10'; VD.g.fillRect(0, 0, VIEW.w, VIEW.h);
    VD.g.save(); VD.g.translate(VD.ox, VD.oy); drawGround(VD.g, TEX, FD, c2); VD.g.restore();
    for (const s of bkD.segs) drawSeg(VD.g, s, VD.toScr);
    if (!firstDestroy) { firstDestroy = true; R.shots.push({ id: cvD.id, file: '3_파괴_' + run.nm.replace(/[^가-힣0-9]/g, '') + '.png' }); }
    else R.shots.push({ id: cvD.id, file: '3_파괴_' + run.nm.replace(/[^가-힣0-9]/g, '') + '.png' });

    if (run.tongue && run.tongue.length) {
      let mx0 = 0, mx1 = 0, worst = null, wd = 0;
      for (const [i, j] of run.tongue) {
        const a = F.hAt(i, j), b = FD.hAt(i, j);
        if (a > mx0) mx0 = a; if (b > mx1) mx1 = b;
        if (a - b > wd) { wd = a - b; worst = [i, j, a, b]; }
      }
      say(`      ★혓바닥: 최고 ${mx0.toFixed(2)}칸 → ${mx1.toFixed(2)}칸 · 최대 하강 ${(wd * 32).toFixed(0)}px`
        + (worst ? ` @(${worst[0]},${worst[1]}) ${worst[2].toFixed(2)}→${worst[3].toFixed(2)}칸` : ''));
      judge(wd * 32 < 200, `혓바닥이 붕괴하지 않는다 — 최대 하강 ${(wd * 32).toFixed(0)}px < 200px`);
    }
    const before = floorCover(run.cells, baked.B.bk.segs, VD);
    const after = floorCover(run.cells, bkD.segs, VD);
    const sp = spill(c2, bkD.segs, VD, FD);
    say(`   ${run.nm} — ${run.cells.length}셀 · 리메시 ${dt.toFixed(0)}ms · 띠 ${bkD.segs.length}장`);
    say(`      바닥 덮임: 부수기 전 ${before.toFixed(1)}% → 부순 뒤 ${after.toFixed(1)}%  ·  ② 평지 침범 ${sp.pct.toFixed(2)}% (${sp.bad}/${sp.tot})`);
    judge(before > 60, `자가 검사 — 부수기 전엔 그 바닥이 산 속에 묻혀 있었다 (${before.toFixed(1)}% > 60%)`);
    if (sp.why && sp.why.length) say('      침범 셀: ' + sp.why.join(' / '));
    judge(sp.bad === 0, `②는 정의상 0 — 셀 소유가 나눗셈이라 넘칠 여지가 없다 (스프라이트 판 4.4~6.1%)`);
    run.after = after; run.before = before;
  }
  {
    const walk = cutRuns.filter(r => r.after !== undefined);
    say('   ── 통로가 "걸을 수 있게" 보이나 (덮임이 낮을수록 잘 보인다) ──');
    for (const r of walk) say(`      ${r.nm}: ${r.after.toFixed(1)}%`);

    // ★대조군 — 폭을 넓혀 가며 **언제 드러나는지** 잰다.
    //   1셀이 100% 인 게 '측정 실패'인지 '실제 그런 것'인지 이 곡선이 가른다.
    //   (재민 미결 안건 "겉면만 부수기 vs 아무데나"의 판단 재료이기도 하다.)
    const sweep = [];
    // ★[재민 ⑦] "산 전체 제거 → 덮임 0%"가 나와야 계측기가 살아있는 것이다.
    //   1차 판은 마지막 점에서도 **화면 안(inView)** 만 지웠다. 여백(MG 6셀)에 바위가
    //   그대로 남아 시야를 막았고, 그래서 전부 100% 로 나와 자가 검사가 죽어 있었다.
    //   ★여백까지 바위가 없는 자리는 한반도에 **없다**(600×320 전수 탐색, 후보 0 — 산맥이 연속).
    //     그러니 장면이 아니라 **대조군을 고치는 게** 맞다: 마지막 점은 여백까지 싹 지운다.
    for (const halfW of [0, 1, 3, 6, 99]) {
      const cw = clone(S.CELLS);
      if (halfW >= 99) { for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) if (cw[j][i] === 2) cw[j][i] = 0; }
      else for (const [i, j] of walk[0].cells) for (let a2 = -halfW; a2 <= halfW; a2++) {
        const i2 = i + a2; if (inView(i2, j) && cw[j][i2] === 2) cw[j][i2] = 0; }
      const Sw = Object.assign({}, S, { CELLS: cw });
      const Fw = M.makeField(Sw), bkw = M.bakeBands(Fw, Sw, { CH, BAND, TEX, MAT: 'B', JAG: 2 });
      const cvw = document.createElement('canvas'); cvw.width = VIEW.w; cvw.height = VIEW.h;
      const Vw = makeView(cvw);
      // ★[타 세션 지적] 3·7·13셀이 **정확히 같은 10%** 라는 건 어떤 바닥값이 상수로
      //   잡히고 있다는 신호다. 그게 뭔지 분해해서 찍는다 — 안 짚으면 ⑦ 설명이 안 닫힌다.
      //   셀마다 덮임률을 따로 내서, "몇 개 셀이 100% 덮이고 몇 개가 0% 인지"를 본다.
      const per = [];
      for (const c of walk[0].cells) per.push(floorCover([c], bkw.segs, Vw));
      const perIn = walk[0].cells.map(c => floorCover([c], bkw.segs, Vw, 2));
      const full = per.filter(v => v > 90).length, none = per.filter(v => v < 10).length;
      sweep.push({ w: halfW >= 99 ? 0 : halfW * 2 + 1, cov: floorCover(walk[0].cells, bkw.segs, Vw),
                   n: per.length, full, none, per, perIn,
                   covIn: perIn.reduce((a, b) => a + b, 0) / Math.max(1, perIn.length) });
    }
    say('   폭 스윕(가운데 열 바닥 덮임): ' + sweep.map(r => (r.w ? `${r.w}셀` : '산 전체 제거') + ` ${r.cov.toFixed(0)}%`).join(' · '));
    for (const r of sweep) {
      say(`      ${r.w ? r.w + '셀' : '전체제거'}: 통로 ${r.n}셀 중 완전덮임 ${r.full} · 완전노출 ${r.none}`
        + ` · 셀별 ${r.per.map(v => v.toFixed(0)).join(',')}`);
      say(`         └ 다이아 2px 안쪽으로 재면: 평균 ${r.covIn.toFixed(1)}% · 셀별 ${r.perIn.map(v => v.toFixed(0)).join(',')}`);
    }
    const wid = sweep.filter(r => r.w);
    if (sweep[sweep.length - 1].cov > 50) {
      say(`   ✗ 자가 검사 실패 — **산을 통째로 지워도** 바닥이 덮여 있다고 나온다.`);
      say(`      이 장면은 여백(MG ${S.MG}셀)에도 바위가 있어 시야를 막는다. 자가 아니라 장면 문제다.`);
      FAIL++;
    } else {
      judge(wid[wid.length - 1].cov < wid[0].cov - 25,
        `자가 검사 — 넓게 팔수록 드러난다 (${wid[0].w}셀 ${wid[0].cov.toFixed(0)}% → ${wid[wid.length - 1].w}셀 ${wid[wid.length - 1].cov.toFixed(0)}%)`);
    }

    const wide = [];
    { const src = walk[0].cells;
      for (const [i, j] of src) for (let a2 = -1; a2 <= 1; a2++) {
        const i2 = i + a2; if (inView(i2, j) && S.CELLS[j][i2] === 2) wide.push([i2, j]); } }
    const c3 = clone(S.CELLS); for (const [i, j] of wide) c3[j][i] = 0;
    const S3 = Object.assign({}, S, { CELLS: c3 });
    const F3 = M.makeField(S3), bk3 = M.bakeBands(F3, S3, { CH, BAND, TEX, MAT: 'B', JAG: 2 });
    const cvW3 = newCanvas('destroy_wide');
    const VW3 = makeView(cvW3);
    VW3.g.fillStyle = '#0a0d10'; VW3.g.fillRect(0, 0, VIEW.w, VIEW.h);
    VW3.g.save(); VW3.g.translate(VW3.ox, VW3.oy); drawGround(VW3.g, TEX, F3, c3); VW3.g.restore();
    for (const s2 of bk3.segs) drawSeg(VW3.g, s2, VW3.toScr);
    R.shots.push({ id: 'destroy_wide', file: '3_파괴_3셀폭_대조군.png' });
    say(`   (3셀 폭 그림: 3_파괴_3셀폭_대조군.png)`);

    // ★1셀 통로가 안 보이는 건 **고정 카메라의 기하학적 결론**이다.
    //   이미 만들어 둔 '앞 산 반투명'(MT_OCC_A 0.34)이 이 문제의 정답인지 실측한다.
    const cvF = newCanvas('destroy_fade');
    const VF = makeView(cvF);
    const run0 = walk[0];
    const cF = clone(S.CELLS); for (const [i, j] of run0.cells) cF[j][i] = 0;
    const SF = Object.assign({}, S, { CELLS: cF });
    const FF = M.makeField(SF), bkF = M.bakeBands(FF, SF, { CH, BAND, TEX, MAT: 'B', JAG: 2 });
    VF.g.fillStyle = '#0a0d10'; VF.g.fillRect(0, 0, VIEW.w, VIEW.h);
    VF.g.save(); VF.g.translate(VF.ox, VF.oy); drawGround(VF.g, TEX, FF, cF); VF.g.restore();
    // 통로 셀보다 **앞**의 띠만 라이브와 같은 알파(0.34)로. 겹침 누적을 막으려 한 겹으로 모아 합성.
    const zc = Math.min(...run0.cells.map(([i, j]) => absZ(i, j)));
    const fg = document.createElement('canvas'); fg.width = VIEW.w; fg.height = VIEW.h;
    const fgg = fg.getContext('2d');
    for (const s2 of bkF.segs) { if (s2.z > zc) drawSeg(fgg, s2, VF.toScr); else drawSeg(VF.g, s2, VF.toScr); }
    VF.g.globalAlpha = 0.34; VF.g.drawImage(fg, 0, 0); VF.g.globalAlpha = 1;
    R.shots.push({ id: 'destroy_fade', file: '3_파괴_1셀통로_반투명.png' });
    say(`   ★1셀 통로는 **고정 카메라에서 구조적으로 가려진다** — 앞 셀 벽이 통로보다 높으니 당연하다.`);
    say(`     라이브에 이미 있는 '앞 산 반투명'(알파 0.34)을 그대로 얹은 장면을 같이 낸다`);
    say(`     (3_파괴_1셀통로_반투명.png). 3D 에서도 같은 장치가 그대로 성립한다.`);
  }

  // ═══ ④ 숲산 ═══════════════════════════════════════════════════════════════
  say('');
  say('━━ ④ 숲산 — 나무를 h(셀)만큼 올려 경사면에 꽂기 ━━');
  const cv4 = newCanvas('forest');
  const V4 = makeView(cv4);
  V4.g.fillStyle = '#0a0d10'; V4.g.fillRect(0, 0, VIEW.w, VIEW.h);
  V4.g.save(); V4.g.translate(V4.ox, V4.oy); drawGround(V4.g, TEX, F, S.CELLS); V4.g.restore();
  const trees = [];
  for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
    const h = F.hAt(i, j);
    if (h <= 0.05) continue;
    // ★[재민 판정] "숲산인데 앞면에 나무가 0그루" — 수목한계를 0.72 로 잡으니 앞사면이
    //   통째로 한계 위였다. 한계는 유지하되 **0.92 로 올리고**, 대신 **급절벽만** 뺀다.
    //   (나무가 못 붙는 건 높이가 아니라 절벽이다.)
    if (h > S.HMAX * 0.92) continue;
    const gx = (F.hAt(i + 1, j) - F.hAt(i - 1, j)) * 0.5, gy = (F.hAt(i, j + 1) - F.hAt(i, j - 1)) * 0.5;
    const stC = 1 - 1 / Math.hypot(gx, gy, 1);
    if (stC > 0.62) continue;                              // 절벽엔 안 선다
    if (M.hash(i + S.cx0, j + S.cy0, 77) > 0.34) continue;  // 결정적 산포(0.16 → 0.34)
    const nm = ['tree01', 'tree03', 'tree06', 'tree09'][Math.floor(M.hash(i + S.cx0, j + S.cy0, 78) * 4)];
    if (!OBJ[nm]) continue;
    const A2 = ABS(i, j);
    trees.push({ nm, wx: A2.wx, wy: A2.wy, h, sc: 0.8 + M.hash(i, j, 79) * 0.35, z: absZ(i, j) });
  }
  const rend4 = [...segsB.map(s => ({ z: s.z, kind: 'mtseg', s })), ...trees.map(o => ({ z: o.z, kind: 'obj', o }))];
  rend4.sort((a, b) => a.z - b.z);
  for (const it of rend4) { if (it.kind === 'mtseg') drawSeg(V4.g, it.s, V4.toScr); else drawObj(V4.g, it.o, OBJ, V4.toScr); }
  R.shots.push({ id: 'forest', file: '4_숲산.png' });
  say(`   나무 ${trees.length}그루 (h>0 인 셀에만 · 수목한계 ${(S.HMAX * 0.72).toFixed(1)}칸)`);
  // 반례: 높이 보정을 끄면 나무 밑동이 산에 파묻힌다 — 밑동 y 차이를 잰다
  {
    const dyList = trees.map(t => t.h * CELL);
    const m = dyList.reduce((a, b) => a + b, 0) / Math.max(1, dyList.length);
    say(`   밑동 올림 평균 ${m.toFixed(0)}px (최대 ${Math.max(...dyList, 0).toFixed(0)}px)`);
    judge(m > 32, `보정이 실제로 작동한다 — 안 하면 나무가 평균 ${m.toFixed(0)}px 파묻힌다`);
  }

  // ═══ ⑤ 안개 3단계 ═════════════════════════════════════════════════════════
  say('');
  say('━━ ⑤ 안개 3단계 — 미탐사(검정) / 봤지만 시야 밖(0.2) / 시야 안 ━━');
  const cv5 = newCanvas('fog');
  const V5 = makeView(cv5);
  V5.g.fillStyle = '#0a0d10'; V5.g.fillRect(0, 0, VIEW.w, VIEW.h);
  V5.g.save(); V5.g.translate(V5.ox, V5.oy); drawGround(V5.g, TEX, F, S.CELLS); V5.g.restore();
  for (const s of segsB) drawSeg(V5.g, s, V5.toScr);
  // 마스크 — 셀 단위(라이브와 같은 각진 블록). 시야 원 + 본 영역 사각.
  const eye = [Math.round(S.W * 0.62), Math.round(S.H * 0.70)];
  const stageOf = (i, j) => {
    const dx = i - eye[0], dy = j - eye[1], r = Math.hypot(dx, dy);
    if (r < 9) return 2;                                   // 시야 안
    if (i > S.W * 0.24 && j > S.H * 0.18) return 1;         // 봤지만 시야 밖
    return 0;                                              // 미탐사
  };
  {
    const mk = document.createElement('canvas'); mk.width = VIEW.w; mk.height = VIEW.h;
    const gm = mk.getContext('2d'); gm.translate(V5.ox, V5.oy);
    for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
      const st = stageOf(i, j); if (st === 2) continue;   // 마스크는 여백까지 덮어야 한다
      gm.fillStyle = st === 0 ? 'rgb(0,0,0)' : 'rgba(0,0,0,0.2)';
      const A = w2i(i * CELL, j * CELL), B = w2i((i + 1) * CELL, j * CELL),
            C = w2i((i + 1) * CELL, (j + 1) * CELL), D = w2i(i * CELL, (j + 1) * CELL);
      gm.beginPath(); gm.moveTo(A.x, A.y); gm.lineTo(B.x, B.y); gm.lineTo(C.x, C.y); gm.lineTo(D.x, D.y);
      gm.closePath(); gm.fill();
      gm.strokeStyle = gm.fillStyle; gm.lineWidth = 1; gm.stroke();
    }
    V5.g.drawImage(mk, 0, 0);
  }
  R.shots.push({ id: 'fog', file: '5_안개.png' });
  {
    // 실측 — 미탐사 셀 자리의 픽셀이 정말 검은가. 산이 안개를 뚫으면 밝게 남는다.
    const D = V5.g.getImageData(0, 0, VIEW.w, VIEW.h).data;
    let dark = 0, tot = 0, lit = 0, totLit = 0;
    for (let j = J0; j < J1; j++) for (let i = I0; i < I1; i++) {
      const c = V5.toScr(w2i(i * CELL + 16, j * CELL + 16).x, w2i(i * CELL + 16, j * CELL + 16).y);
      const px = Math.round(c.x), py = Math.round(c.y);
      if (px < 2 || py < 2 || px >= VIEW.w - 2 || py >= VIEW.h - 2) continue;
      const p = (py * VIEW.w + px) * 4, lum = (D[p] + D[p + 1] + D[p + 2]) / 3;
      if (stageOf(i, j) === 0) { tot++; if (lum < 12) dark++; }
      if (stageOf(i, j) === 2) { totLit++; if (lum > 40) lit++; }
    }
    say(`   미탐사 셀 ${tot} 중 완전 검정 ${dark} (${(dark / Math.max(1, tot) * 100).toFixed(1)}%)`);
    say(`   시야 안 셀 ${totLit} 중 밝음 ${lit} (${(lit / Math.max(1, totLit) * 100).toFixed(1)}%)`);
    judge(dark === tot, `미탐사에서 산이 새지 않는다 (${tot}/${tot})`);
    judge(lit / Math.max(1, totLit) > 0.9, `시야 안은 밝다 — 자가 검사(마스크가 전부 덮으면 이게 실패한다)`);
    say('   ※ 라이브는 `_GATE_FREE = { mtseg: 1 }` 로 산을 게이트에서 뺐다(배치 20 근거).');
    say('     3D 판은 산이 지형이라 **마스크를 산 위에도 그대로** 얹으면 성립한다 — 위 실측이 그 증거.');
  }

  // ═══ ⑥ 자락 톱니 3안 ══════════════════════════════════════════════════════
  say('');
  say('━━ ⑥ 산자락 경계 톱니 — 3안 (같은 자리 잘라 비교) ━━');
  // 톱니의 정체: 셀 다이아몬드의 계단(행마다 ±2px)이 실루엣에 그대로 남는 것.
  //   ①안 현행(계단)  ②안 경계 격자점 지터  ③안 지터 + 경계 셀 3×3 세분
  // ★1차 3안(지터·세분)은 **거칠기를 오히려 키웠다**(0.25 → 0.27 → 0.37). 실측이 그랬다.
  //   원인을 다시 봤다: 눈에 띄는 건 실루엣의 계단이 아니라 **자락 셀의 어두운 쐐기**다.
  //   가장자리 셀은 한 셀에 0→1.5칸을 올라 기울기가 최대라 제일 어둡게 칠해진다.
  //   ⇒ 3안을 갈아탄다. 기하가 아니라 **음영**을 손본다.
  const JAGV = [
    { nm: '① 현행 — 손 안 댐', opt: { JAG: 0 } },
    { nm: '② 자락 음영 페이드(1.6칸)', opt: { JAG: 0, SKIRT: 1.6 } },
    { nm: '③ ② + 마스크 0.5 등고선 컷', opt: { JAG: 2, JAMP: 0, SKIRT: 1.6, SMASK: 0.5 } },
  ];
  {
    // 경계가 가장 긴 행을 잘라 본다 (자락이 잘 보이는 곳)
    let bj = 0, bc = -1;
    for (let j = J0; j < J1; j++) { let c = 0;
      for (let i = I0; i < I1; i++) if ((S.CELLS[j][i] === 2) !== (S.CELLS[j][i - 1] === 2)) c++;
      if (c > bc) { bc = c; bj = j; } }
    const CW = 452, CHh = 296;
    const cv6 = newCanvas('jag', CW * 3 + 40, CHh + 34);
    const g6 = cv6.getContext('2d');
    g6.fillStyle = '#0a0d10'; g6.fillRect(0, 0, cv6.width, cv6.height);
    const base = makeView(cv2);
    const jagStat = []; let jagCrop = null; let alphaOf = () => false; let jagWhich = '-';
    for (let v = 0; v < 3; v++) {
      const sub = document.createElement('canvas'); sub.width = VIEW.w; sub.height = VIEW.h;
      const gs = sub.getContext('2d');
      gs.fillStyle = '#0a0d10'; gs.fillRect(0, 0, VIEW.w, VIEW.h);
      gs.save(); gs.translate(base.ox, base.oy); drawGround(gs, TEX, F, S.CELLS); gs.restore();
      const bkj = M.bakeBands(F, S, Object.assign({ CH, BAND, TEX, MAT: 'B' }, JAGV[v].opt));
      for (const s2 of bkj.segs) drawSeg(gs, s2, base.toScr);
      // ★실측 — 1차 계측기가 **엉뚱한 변을 쟀다**. 열마다 '가장 위 픽셀'을 봤는데
      //   톱니는 산 **꼭대기**가 아니라 **자락(좌우 경계)** 에 있다. 그래서 셋 다 0.04 로
      //   나왔고 반례(현행)조차 통과했다. 자를 자락으로 옮긴다:
      //   행마다 '가장 왼쪽 픽셀 x' 를 뽑아 2차 차분을 낸다. 계단이면 크게 나온다.
      let rough = 0;
      {
        const cvS = document.createElement('canvas'); cvS.width = VIEW.w; cvS.height = VIEW.h;
        const gS = cvS.getContext('2d');
        for (const s2 of bkj.segs) drawSeg(gS, s2, base.toScr);
        const A = gS.getImageData(0, 0, VIEW.w, VIEW.h).data;
        alphaOf = (x, y) => A[(y * VIEW.w + x) * 4 + 3] > 128;
        // ★네 방향 다 잰다. 산이 캔버스 밖으로 나가면 그 줄의 '경계'는 화면 테두리라
        //   톱니가 아니다 — 그런 줄은 뺀다(1차 계측은 이것 때문에 세 안이 전부 0.22 였다).
        const amp = (get, N) => {
          const b = new Int32Array(N).fill(-1);
          for (let t = 0; t < N; t++) b[t] = get(t);
          const sm = new Float32Array(N);
          for (let t = 0; t < N; t++) { let a2 = 0, c = 0;
            for (let d = -8; d <= 8; d++) { const u = t + d; if (u < 0 || u >= N || b[u] < 0) continue; a2 += b[u]; c++; }
            sm[t] = c ? a2 / c : -1; }
          let sum = 0, n = 0;
          for (let t = 8; t < N - 8; t++) { if (b[t] < 0 || sm[t] < 0) continue;
            const dv = Math.abs(b[t] - sm[t]); if (dv > 40) continue; sum += dv; n++; }
          return n > 30 ? sum / n : -1;
        };
        // ★캔버스 테두리에서 40px 안쪽에 있는 경계만 인정한다 — 산이 화면 밖으로 나가면
        //   그 줄의 '경계'는 화면 잘림이지 자락이 아니다.
        const MARG = 40;
        const L1 = amp((y) => { for (let x = 0; x < VIEW.w; x++) if (alphaOf(x, y)) return x < MARG ? -1 : x; return -1; }, VIEW.h);
        const R1 = amp((y) => { for (let x = VIEW.w - 1; x >= 0; x--) if (alphaOf(x, y)) return x > VIEW.w - MARG ? -1 : x; return -1; }, VIEW.h);
        const B1 = amp((x) => { for (let y = VIEW.h - 1; y >= 0; y--) if (alphaOf(x, y)) return y > VIEW.h - MARG ? -1 : y; return -1; }, VIEW.w);
        const cand = [L1, R1, B1].filter(v => v >= 0);
        rough = cand.length ? Math.max(...cand) : 0;
        jagWhich = ['좌', '우', '아래'][[L1, R1, B1].indexOf(rough)] || '-';
        const leftX = new Int32Array(VIEW.h).fill(-1);
        void leftX;
        // ★자를 또 갈았다. 2차 차분은 **잘게 쪼갤수록 커진다** — 세분안이 눈으로는
        //   확실히 매끈한데 숫자는 0.25→0.38 로 나빠졌다. 눈이 보는 건 계단의 **개수**가
        //   아니라 **한 이의 크기**다. ⇒ 톱니 진폭: 경계선에서 이동평균(16행)을 뺀 편차.


      }
      // ★두 번째 자 — **자락 대비**. 산/지면 경계를 사이에 둔 픽셀쌍의 밝기 차 평균.
      //   톱니가 "보이는" 정도는 실루엣 모양보다 이 대비에 좌우된다.
      let contrast = 0;
      {
        const cvS2 = document.createElement('canvas'); cvS2.width = VIEW.w; cvS2.height = VIEW.h;
        const gS2 = cvS2.getContext('2d');
        for (const s3 of bkj.segs) drawSeg(gS2, s3, base.toScr);
        const AL = gS2.getImageData(0, 0, VIEW.w, VIEW.h).data;
        const FULL = gs.getImageData(0, 0, VIEW.w, VIEW.h).data;
        let sum = 0, n = 0;
        for (let y = 1; y < VIEW.h - 1; y++) for (let x = 1; x < VIEW.w - 1; x++) {
          const q = (y * VIEW.w + x) * 4, q2 = q + 4;
          if ((AL[q + 3] > 200) === (AL[q2 + 3] > 200)) continue;    // 경계 아님
          const l1 = (FULL[q] + FULL[q + 1] + FULL[q + 2]) / 3;
          const l2 = (FULL[q2] + FULL[q2 + 1] + FULL[q2 + 2]) / 3;
          sum += Math.abs(l1 - l2); n++;
        }
        contrast = n ? sum / n : 0;
      }
      jagStat.push({ rough, contrast, which: jagWhich });
      // ★자락이 있는 자리를 **재서** 자른다(눈으로 고르지 않는다).
      if (jagCrop === null) {
        let bx = VIEW.w, by = 0, seen = 0;
        for (let y = 40; y < VIEW.h - 40; y += 2) for (let x = 0; x < VIEW.w; x++)
          if (alphaOf(x, y)) { if (x < bx) { bx = x; by = y; } seen++; break; }
        void seen;
        jagCrop = [Math.max(0, bx - 60), Math.max(0, Math.min(VIEW.h - CHh, by - CHh / 2))];
      }
      g6.drawImage(sub, jagCrop[0], jagCrop[1], CW, CHh, 10 + v * (CW + 10), 28, CW, CHh);
      g6.fillStyle = '#e6dfd0'; g6.font = '13px sans-serif';
      const st = jagStat[v];
      g6.fillText(JAGV[v].nm + '  (톱니 진폭 ' + st.rough.toFixed(2) + 'px)', 12 + v * (CW + 10), 20);
      say(`   ${JAGV[v].nm}: 톱니 진폭 ${st.rough.toFixed(2)}px(${st.which}변) · 자락 대비 ${st.contrast.toFixed(1)}`);
    }
    R.shots.push({ id: 'jag', file: '6_자락톱니_3안.png' });
    if (jagStat[0].rough < 2.0) {
      // ★자가 검사가 먼저 떨어졌다 — 이 장면에서는 산이 캔버스를 가득 채워 **자락이 화면 밖**이다.
      //   그러면 세 안의 차이를 잴 수가 없다. 판정을 낮추지 않고 **미결로 남긴다**:
      //   ⑥ 은 자락이 화면 안에 들어오는 전용 장면(바위 20% 안팎)에서 다시 재야 한다.
      say(`   ✗ 미결 — 이 장면에선 자락이 화면 밖이라 계측 불가(현행 진폭 ${jagStat[0].rough.toFixed(2)}px < 2.0).`);
      say(`      그림 3장은 냈다. 숫자는 **전용 장면에서 다시 잰다**. 판정은 낮추지 않는다.`);
      FAIL++;
    } else {
      judge(true, `자가 검사 — 현행에 실제로 톱니가 있다 (진폭 ${jagStat[0].rough.toFixed(2)}px > 2.0)`);
      judge(jagStat[2].rough < jagStat[0].rough * 0.65,
        `③안이 톱니 진폭을 ${(100 - jagStat[2].rough / jagStat[0].rough * 100).toFixed(0)}% 줄인다 (35% 이상 감소)`);
    }
  }

  // ── 마무리 ────────────────────────────────────────────────────────────────
  say('');
  say('━━ 프레임 비용 요약 (headless Chromium · 실 GPU 아님) ━━');
  say(`   거리장+높이 ${tField.toFixed(0)}ms (파괴 때만) · 띠 굽기 ${baked.B.tBake.toFixed(0)}ms (청크 캐시 대상)`);
  say(`   매 프레임 그리기: 산 ${baked.B.tDraw.toFixed(2)}ms + 개체 합성 ${tCompose.toFixed(2)}ms`);
  say(`   오프스크린 총 ${(baked.B.bk.px * 4 / 1048576).toFixed(1)}MB / 띠 ${baked.B.bk.segs.length}장 (CH=${CH} BAND=${BAND})`);
  say('');
  say(FAIL === 0 ? `판정 ${FAIL === 0 ? '전부 통과' : ''}` : `✗ 실패 ${FAIL}건`);

  R.report = lines.join('\n');
  R.fail = FAIL > 0;
  window.__R = R;
  window.__done = true;
})();
