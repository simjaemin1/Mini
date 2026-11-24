// sim/det-math.js — 상자에 안 기대는 Math 초월 함수(하네스 · 머리 없는 자 한정) [T1413]
//
// 왜: `sim/hunt-check.js` H15 가 맥(arm64 · Node 20+)에서 사망 0 · 리눅스(x64 · PM 컨테이너 · GitHub CI)에서 사망 2 로 갈렸다.
//   첫 갈림 = 초원 판 lifeGM 438(07:18) 의 `Math.cos(1.0244218775948384)` — 맥 Node 22 는 0.5195929294807451 · 맥 Node 18 은 0.519592929480745
//   (끝자리 1 ulp · 맥 Node 18 은 리눅스와 같은 "사망 2" 를 낸다 — 보고 T1413 §0). V8 의 sin · cos · atan2 · pow 는 C++ 로 컴파일된 libm 이라
//   상자(CPU · 컴파일러의 곱셈-덧셈 묶기)마다 끝자리가 다를 수 있고, 랩의 떼 · 추격은 그 1 ulp 를 며칠 안에 사망 수까지 키운다.
// 무엇: 같은 함수를 **JS 사칙연산만으로** 다시 쓴다(FreeBSD msun / fdlibm 식 · 계수 그대로). JS 의 + − × ÷ 와 Math.sqrt 는 IEEE-754 가
//   비트까지 정하므로(V8 은 JS 곱셈-덧셈을 묶지 않는다) 어느 상자 · 어느 Node 판에서도 같은 비트가 나온다.
//   hypot 은 V8 Torque 의 식(최댓값으로 나눠 카한 합 → sqrt × 최댓값)을 그대로 옮겼다(값이 지금 V8 과 같다 · 상자 무관을 글로 못 박을 뿐).
//   pow 는 x > 0 만(랩이 부르는 꼴 셋 — pow(0.85, 숲m/4) · pow(hp, 0.7) · pow(3, 0.7)) = exp(y·log x) · 그 밖은 0 · 1 · 무한의 뻔한 칸만, 나머지는 던진다.
// 어디에: 하네스 · 자가 랩을 node 에서 돌릴 때만 `install(Math)`(vm 맥락이면 `vm.runInContext(SRC + '(Math)', C)`). 브라우저 랩 · 서버 · 랩 블록 글자 손 0.
// 큰 각(|x| ≥ 2^19·π/2 ≈ 82만)은 중간 줄이기(Cody-Waite 세 겹)가 못 맡아 던진다 — 랩 각은 60 밑(초원 · 협곡 · 미로 판 실측).
'use strict';
function detMathInstall(M) {
  const F = new Float64Array(1), U = new Uint32Array(F.buffer);   // 작은 끝(arm64 · x64 둘 다) — U[1] = 높은 낱말
  const hi = (x) => { F[0] = x; return U[1] | 0; };
  const lo = (x) => { F[0] = x; return U[0] >>> 0; };
  const withHi = (x, h) => { F[0] = x; U[1] = h >>> 0; return F[0]; };
  const sqrt = M.sqrt;
  // ── sin · cos (k_sin.c · k_cos.c · e_rem_pio2.c 중간 길) ──
  const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
    S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
    C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  const ksin = (x, y, iy) => { const z = x * x, w = z * z, r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6), v = z * x;
    return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1); };
  const kcos = (x, y) => { const z = x * x; let w = z * z; const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6)), hz = 0.5 * z;
    w = 1.0 - hz; return w + (((1.0 - w) - hz) + (z * r - x * y)); };
  const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
    pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;
  const RND = 6755399441055744.0;   // 1.5·2^52 — 가장 가까운 정수(짝수 쪽)
  const red = [0, 0];
  const remPio2 = (x) => {   // 돌려줌 n · red = [y0, y1]
    const ix = hi(x) & 0x7fffffff;
    if (ix >= 0x413921fb) throw new Error('det-math: 각이 너무 크다(|x| ≥ 2^19·π/2) — ' + x);
    const fn = (x * invpio2 + RND) - RND, n = fn | 0;
    let r = x - fn * pio2_1, w = fn * pio2_1t, y0 = r - w;
    const j = ix >> 20; let i = j - ((hi(y0) >> 20) & 0x7ff);
    if (i > 16) { let t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y0 = r - w; i = j - ((hi(y0) >> 20) & 0x7ff);
      if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y0 = r - w; } }
    red[0] = y0; red[1] = (r - y0) - w; return n;
  };
  const sin = (x) => { x = +x; const ix = hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) { if (ix < 0x3e500000) return x; return ksin(x, 0, 0); }
    if (ix >= 0x7ff00000) return NaN;
    const n = remPio2(x) & 3, y0 = red[0], y1 = red[1];
    return n === 0 ? ksin(y0, y1, 1) : n === 1 ? kcos(y0, y1) : n === 2 ? -ksin(y0, y1, 1) : -kcos(y0, y1); };
  const cos = (x) => { x = +x; const ix = hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) { if (ix < 0x3e46a09e) return 1.0; return kcos(x, 0); }
    if (ix >= 0x7ff00000) return NaN;
    const n = remPio2(x) & 3, y0 = red[0], y1 = red[1];
    return n === 0 ? kcos(y0, y1) : n === 1 ? -ksin(y0, y1, 1) : n === 2 ? -kcos(y0, y1) : ksin(y0, y1, 1); };
  // ── atan · atan2 (s_atan.c · e_atan2.c) ──
  const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
  const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
  const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
  const atan = (x) => { const hx = hi(x), ix = hx & 0x7fffffff; let id;
    if (ix >= 0x44100000) { if (x !== x) return x; return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3]; }
    if (ix < 0x3fdc0000) { if (ix < 0x3e400000) return x; id = -1; }
    else { x = x < 0 ? -x : x;
      if (ix < 0x3ff30000) { if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); } else { id = 1; x = (x - 1.0) / (x + 1.0); } }
      else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); } else { id = 3; x = -1.0 / x; } }
    const z = x * x, w = z * z;
    const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10]))))), s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
    if (id < 0) return x - x * (s1 + s2);
    const r = atanhi[id] - ((x * (s1 + s2) - atanlo[id]) - x); return hx < 0 ? -r : r; };
  const PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16, PI_O_2 = 1.5707963267948965580E+00, PI_O_4 = 7.8539816339744827900E-01;
  const atan2 = (y, x) => { y = +y; x = +x;
    if (x !== x || y !== y) return NaN;
    const ny = y < 0 || (y === 0 && 1 / y < 0), nx = x < 0 || (x === 0 && 1 / x < 0);
    if (x === 1.0) return atan(y);
    if (y === 0) return nx ? (ny ? -PI : PI) : y;
    if (x === 0) return ny ? -PI_O_2 : PI_O_2;
    const ax = nx ? -x : x, ay = ny ? -y : y;
    if (ax === Infinity) { if (ay === Infinity) return nx ? (ny ? -3 * PI_O_4 : 3 * PI_O_4) : (ny ? -PI_O_4 : PI_O_4); return nx ? (ny ? -PI : PI) : (ny ? -0 : 0); }
    if (ay === Infinity) return ny ? -PI_O_2 : PI_O_2;
    const k = ((hi(ay) & 0x7fffffff) - (hi(ax) & 0x7fffffff)) >> 20;
    let z;
    if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
    else if (nx && k < -60) z = 0.0;
    else z = atan(ay / ax);
    if (!nx) return ny ? -z : z;
    return ny ? (z - PI_LO) - PI : PI - (z - PI_LO); };
  // ── log · exp (e_log.c · e_exp.c) → pow(x > 0) ──
  const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16;
  const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
    Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
  const log = (x) => {   // x > 0 · 유한
    let hx = hi(x), k = 0;
    if (hx < 0x00100000) { k -= 54; x *= two54; hx = hi(x); }
    k += (hx >> 20) - 1023; hx &= 0x000fffff;
    const i0 = (hx + 0x95f64) & 0x100000;
    x = withHi(x, hx | (i0 ^ 0x3ff00000)); k += (i0 >> 20);
    const f = x - 1.0, dk = k;
    if ((0x000fffff & (2 + hx)) < 3) { if (f === 0) return k === 0 ? 0 : dk * ln2_hi + dk * ln2_lo;
      const R = f * f * (0.5 - 0.33333333333333333 * f); return k === 0 ? f - R : dk * ln2_hi - ((R - dk * ln2_lo) - f); }
    const s = f / (2.0 + f), z = s * s, w = z * z;
    let i = hx - 0x6147a; const j = 0x6b851 - hx;
    const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))), R = t2 + t1; i |= j;
    if (i > 0) { const hfsq = 0.5 * f * f; return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f); }
    return k === 0 ? f - s * (f - R) : dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f); };
  const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
  const invln2 = 1.44269504088896338700e+00, twom1000 = 9.33263618503218878990e-302;
  const exp = (x) => {
    const hx0 = hi(x), xsb = (hx0 >>> 31) & 1, hx = hx0 & 0x7fffffff;
    if (x !== x) return x;
    if (hx >= 0x40862E42) { if (x > 7.09782712893383973096e+02) return Infinity; if (x < -7.45133219101941108420e+02) return 0; }
    let hiP = 0, loP = 0, k = 0;
    if (hx > 0x3fd62e42) {
      if (hx < 0x3FF0A2B2) { hiP = x - (xsb ? -ln2_hi : ln2_hi); loP = xsb ? -ln2_lo : ln2_lo; k = 1 - xsb - xsb; }
      else { k = (invln2 * x + (xsb ? -0.5 : 0.5)) | 0; const t = k; hiP = x - t * ln2_hi; loP = t * ln2_lo; }
      x = hiP - loP;
    } else if (hx < 0x3e300000) return 1.0 + x;
    const t = x * x, c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
    const y = 1.0 - ((loP - (x * c) / (2.0 - c)) - hiP);
    if (k >= -1021) return withHi(y, hi(y) + (k << 20));
    return withHi(y, hi(y) + ((k + 1000) << 20)) * twom1000; };
  const pow = (x, y) => { x = +x; y = +y;
    if (y === 0) return 1;
    if (x !== x || y !== y) return NaN;
    if (x === 1) return 1;
    if (x === 0) return y > 0 ? 0 : Infinity;
    if (!(x > 0) || x === Infinity || !isFinite(y)) throw new Error('det-math: pow 는 x > 0 · 유한만 — pow(' + x + ', ' + y + ')');
    if (y === 1) return x;
    return exp(y * log(x)); };
  // ── hypot (V8 Torque MathHypot 식 그대로) ──
  const hypot = function () { const n = arguments.length; if (n === 0) return 0;
    const a = new Array(n); let max = 0, nan = false;
    for (let i = 0; i < n; i++) { const v = +arguments[i], av = v < 0 ? -v : v; if (av === Infinity) return Infinity; if (v !== v) nan = true; a[i] = av; if (av > max) max = av; }
    if (nan) return NaN; if (max === 0) return 0;
    let sum = 0, comp = 0;
    for (let i = 0; i < n; i++) { const q = a[i] / max, summand = q * q - comp, pre = sum + summand; comp = (pre - sum) - summand; sum = pre; }
    return sqrt(sum) * max; };
  M.sin = sin; M.cos = cos; M.atan2 = atan2; M.pow = pow; M.hypot = hypot;
  M.__detMath = 'T1413';
  return M;
}
module.exports = { install: detMathInstall, SRC: '(' + detMathInstall.toString() + ')' };
