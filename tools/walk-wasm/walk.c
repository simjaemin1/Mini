// =============================================================================
// tools/walk-wasm/walk.c — T461 걸음 문 WASM 커널(제품 · 손잡이 `T461_WALK_WASM` · 기본 끔)
// =============================================================================
// ★무엇 — `server/zone.js` `movePlayerStep(p)` 의 **NPC 갈래**(입력 없음 · 1층 · 계단 밖)를 **글자 그대로의 산술**로 옮겼다.
//   정본은 여전히 JS 다. 이 커널은 **같은 입력 → 같은 비트**여야 하고, 그것이 게이트다
//   (`T461_WALK_WASM=verify` — 틱마다 커널과 JS 가 둘 다 돌고 전원 좌표·속도·갈래를 비트로 견준다 · `test-move-soa` ⑰).
// ★T352 ⓒ 판과 다른 점 — 벤치 픽스처가 아니라 **제품 세계**를 본다:
//   · 지형 — 타일당 2비트(구웠나 · 막혔나)를 이 메모리에 굽는다. 처음 보는 타일은 JS 정본 `_terrBlocked0` 을 **불러서** 굽는다
//            (import `terr_miss`) — 정본은 넷(바위·환호·물·다리) 그대로 · 비트는 유도(T356 ② `_BLK_BITS` 와 같은 규율).
//            환호가 바뀌면 JS 가 통째로 영점(`refreshDitchCells`).
//   · 벽   — 같은 셀 안 걸음(열에 아홉)은 여기서 끝낸다(`isBlockedByWall` 의 첫 조기 반환 그대로). 셀을 넘는 걸음만
//            JS 정본 `isBlockedByWall(…, 0, null)` 을 **부른다**(import `wall_q`) — 벽·문·울타리·계단 옆·유령 벽 전부 정본이 답한다.
//   · 나무·바위·광맥 — `qtResources` 가 **지금 든 항목**(마지막 재구축의 목록 · 현재 필드)을 틱마다 JS 가 열로 넘기고
//            여기서 64px 해시 격자로 묶는다. NPC 는 참/거짓만 쓴다(접선 미끄럼은 `inp` 가 있어야 돈다) ⇒ 첫 적중 순서 무관.
//   · `Math.hypot` — V8 의 식(최댓값으로 나눠 제곱 · 카한 합 · sqrt × 최댓값)을 **같은 순서로** 옮겼다(`js_hypot`).
//   · `Math.min`·`Math.max`(clamp) — ±0 규칙까지 JS 대로(`js_min`·`js_max`).
// ★WASM 엔 FMA 명령이 없다 ⇒ `a*b+c` 가 접히지 않는다(T352 가 N-API 에서 밟은 그 함정이 구조적으로 없다).
// 빌드(한 줄 · 산출물 `server/walk-wasm.wasm` 은 레포에 커밋한다):
//   clang --target=wasm32 -O3 -nostdlib -ffreestanding -Wl,--no-entry -Wl,--import-memory -Wl,--export=ww_step -Wl,--export=ww_trees -Wl,--export=ww_cfg -Wl,--export=ww_counts -Wl,--export=__heap_base -Wl,--allow-undefined -Wl,--strip-all -o server/walk-wasm.wasm tools/walk-wasm/walk.c
typedef unsigned char u8;
typedef unsigned int u32;

extern int terr_miss(double x, double y);                         // JS `_terrBlocked0(x, y) ? 1 : 0`
extern int wall_q(double nx, double ny, double ox, double oy);    // JS `isBlockedByWall(nx, ny, ox, oy, 0, null) ? 1 : 0`

static inline double k_floor(double x) { return __builtin_floor(x); }
static inline double k_sqrt(double x) { return __builtin_sqrt(x); }
static inline double k_abs(double x) { return __builtin_fabs(x); }
static inline int k_isnan(double x) { return x != x; }
static inline int k_signbit(double x) { return __builtin_signbit(x); }

// V8 `MathHypot`(builtins/math.tq) 두 인수판 — 같은 식 · 같은 순서
static double js_hypot(double a, double b) {
  int nan = 0; double max = 0.0, aa = 0.0, ab = 0.0;
  if (k_isnan(a)) nan = 1; else { aa = k_abs(a); if (aa > max) max = aa; }
  if (k_isnan(b)) nan = 1; else { ab = k_abs(b); if (ab > max) max = ab; }
  if (max == __builtin_inf()) return __builtin_inf();
  if (nan) return __builtin_nan("");
  if (max == 0.0) return 0.0;
  double sum = 0.0, comp = 0.0, n, summand, pre;
  n = aa / max; summand = n * n - comp; pre = sum + summand; comp = (pre - sum) - summand; sum = pre;
  n = ab / max; summand = n * n - comp; pre = sum + summand; comp = (pre - sum) - summand; sum = pre;
  return k_sqrt(sum) * max;
}
// JS `Math.min(a, b)` · `Math.max(a, b)` — NaN 전파 · ±0(−0 < +0)
static double js_min(double a, double b) {
  if (k_isnan(a) || k_isnan(b)) return __builtin_nan("");
  if (a < b) return a; if (b < a) return b;
  if (a == 0.0) return (k_signbit(a) || k_signbit(b)) ? -0.0 : 0.0;   // ±0 끼리: 하나라도 −0 이면 −0
  return a;
}
static double js_max(double a, double b) {
  if (k_isnan(a) || k_isnan(b)) return __builtin_nan("");
  if (a > b) return a; if (b > a) return b;
  if (a == 0.0) return (!k_signbit(a) || !k_signbit(b)) ? 0.0 : -0.0;   // ±0 끼리: 하나라도 +0 이면 +0
  return a;
}

// ── 설정(존마다 한 번) ────────────────────────────────────────────────────────
static double ZW, ZH, ICE_BAND, MOVE_SPEED_C; static int ICE_N, ICE_S;   // ICE_N = !hasNorth · ICE_S = !hasSouth
static u8 *TB; static int TW;                                         // 지형 2비트(타일마다 · 4타일/바이트)
static double *NX, *NY, *NVX, *NVY, *NRD; static u8 *NST;             // 주민 열
static double *RX, *RY, *RR; static int *RNEXT, *RHEAD; static u32 RMASK; static int RM;   // 나무 열 + 해시
static u32 CNT[8];                                                    // 관측 계수: 0 걸음 · 1 탈출 · 2 탈출 질의 · 3 탈출 실패 · 4 지형 질의 · 5 벽(같은 셀)
__attribute__((visibility("default")))
void ww_cfg(double zw, double zh, int iceN, int iceS, double iceBand, double speed,
            u8 *tb, int tw, double *nx, double *ny, double *nvx, double *nvy, double *nrd, u8 *nst,
            double *rx, double *ry, double *rr, int *rnext, int *rhead, u32 rmask) {
  ZW = zw; ZH = zh; ICE_N = iceN; ICE_S = iceS; ICE_BAND = iceBand; MOVE_SPEED_C = speed;
  TB = tb; TW = tw; NX = nx; NY = ny; NVX = nvx; NVY = nvy; NRD = nrd; NST = nst;
  RX = rx; RY = ry; RR = rr; RNEXT = rnext; RHEAD = rhead; RMASK = rmask; RM = 0;
}
__attribute__((visibility("default"))) u32 *ww_counts(void) { return CNT; }

// ── 지형 — `isTerrainBlockedLocal` 그대로(가드 자리 같음 · 범위 밖은 정본을 매번 부른다) ──────────────
static int terr(double x, double y) {
  CNT[4]++;
  if (x >= 0.0 && y >= 0.0 && x < ZW && y < ZH) {
    int b = ((int)k_floor(y / 32.0) * TW + (int)k_floor(x / 32.0)) << 1;
    int i = b >> 3, sh = b & 7, v = TB[i] >> sh;
    if (v & 1) return (v & 2) != 0;
    int r = terr_miss(x, y);
    TB[i] |= (u8)((r ? 3 : 1) << sh);
    return r;
  }
  return terr_miss(x, y);
}
// ── 벽 — 같은 셀이면 여기서 끝 · 넘으면 정본 ──────────────────────────────────────────────
static int wall(double nx, double ny, double ox, double oy) {
  if (k_floor(ox / 32.0) == k_floor(nx / 32.0) && k_floor(oy / 32.0) == k_floor(ny / 32.0)) { CNT[5]++; return 0; }
  return wall_q(nx, ny, ox, oy);
}
// ── 나무 — 64px 해시 격자(틱마다 JS 가 넘긴 항목으로 다시 묶는다) ───────────────────────────────
static inline u32 hkey(int cx, int cy) { return ((u32)cx * 73856093u) ^ ((u32)cy * 19349663u); }
__attribute__((visibility("default")))
void ww_trees(int m) {
  RM = m;
  for (u32 h = 0; h <= RMASK; h++) RHEAD[h] = -1;
  for (int k = 0; k < m; k++) {
    u32 h = hkey((int)k_floor(RX[k] / 64.0), (int)k_floor(RY[k] / 64.0)) & RMASK;
    RNEXT[k] = RHEAD[h]; RHEAD[h] = k;
  }
}
static int tree(double x, double y) {
  if (!RM) return 0;
  int gx = (int)k_floor(x / 64.0), gy = (int)k_floor(y / 64.0);
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    int cx = gx + dx, cy = gy + dy;
    for (int k = RHEAD[hkey(cx, cy) & RMASK]; k >= 0; k = RNEXT[k]) {
      if ((int)k_floor(RX[k] / 64.0) != cx || (int)k_floor(RY[k] / 64.0) != cy) continue;   // 해시 충돌
      if (js_hypot(RX[k] - x, RY[k] - y) < RR[k]) return 1;
    }
  }
  return 0;
}
static inline int ice(double y) { return (ICE_N && y < ICE_BAND) || (ICE_S && y > ZH - ICE_BAND); }

// ── 한 사람의 한 걸음 — `movePlayerStep(p)` NPC 갈래 그대로 · 갈래 번호를 NST 에 ─────────────────
//   0 탈출(못 찾음) · 1 탈출(밀림 · dirty) · 2 존 안 이동(답압 스탬프) · 3 클램프(nextDecisionAt = 0)
static void step_one(int i, double dt) {
  CNT[0]++;
  double x = NX[i], y = NY[i];
  if (terr(x, y)) {
    static const int D[8][2] = {{1,0},{-1,0},{0,1},{0,-1},{1,1},{-1,1},{1,-1},{-1,-1}};
    CNT[1]++;
    int ejx = 0, ejy = 0, found = 0; u32 q = 0;
    for (int r = 32; r <= 32 * 16 && !found; r += 32) {
      for (int d = 0; d < 8; d++) {
        q++;
        if (!terr(x + D[d][0] * r, y + D[d][1] * r)) { ejx = D[d][0]; ejy = D[d][1]; found = 1; break; }
      }
    }
    CNT[2] += q; if (!found) CNT[3]++;
    if (found) {
      double len = js_hypot((double)ejx, (double)ejy); if (len == 0.0 || k_isnan(len)) len = 1.0;
      double push = MOVE_SPEED_C * dt * 1.8;
      NX[i] = x + ((double)ejx / len) * push;
      NY[i] = y + ((double)ejy / len) * push;
    }
    NVX[i] = 0.0; NVY[i] = 0.0; NST[i] = (u8)found;
    return;
  }
  double svx = NVX[i], svy = NVY[i], rd = NRD[i];
  if (rd != 1.0) { svx *= rd; svy *= rd; }                  // JS: `p._rdMul && p._rdMul !== 1` — 거짓값은 JS 가 1 로 넘긴다
  double nx = x + svx * dt;
  double ny = y + svy * dt;
  if (wall(nx, y, x, y)) nx = x;
  if (wall(x, ny, x, y)) ny = y;
  if (wall(nx, ny, x, y)) { nx = x; ny = y; }
  if (!tree(x, y)) {
    int bx = tree(nx, y), by = tree(x, ny);
    if (bx) nx = x;
    if (by) ny = y;
    if (tree(nx, ny)) { nx = x; ny = y; }
  }
  if (ice(ny) && !ice(y)) ny = y;
  if (terr(nx, y) && !terr(x, y)) {
    double tx = k_floor(x / 32.0);
    if (nx > x) nx = (tx + 1.0) * 32.0 - 1.0;
    else if (nx < x) nx = tx * 32.0;
    else nx = x;
  }
  if (terr(x, ny) && !terr(x, y)) {
    double ty = k_floor(y / 32.0);
    if (ny > y) ny = (ty + 1.0) * 32.0 - 1.0;
    else if (ny < y) ny = ty * 32.0;
    else ny = y;
  }
  if (terr(nx, ny) && !terr(x, y)) { nx = x; ny = y; }
  double mo = js_max(js_max(js_max(-nx, nx - ZW), -ny), ny - ZH);   // JS `Math.max(outW, outE, outN, outS)`
  if (mo <= 0.0) { NX[i] = nx; NY[i] = ny; NST[i] = 2; }
  else { NX[i] = js_max(0.0, js_min(ZW, nx)); NY[i] = js_max(0.0, js_min(ZH, ny)); NST[i] = 3; }
}
__attribute__((visibility("default")))
void ww_step(int n, double dt) {
  for (int k = 0; k < 8; k++) CNT[k] = 0;
  for (int i = 0; i < n; i++) step_one(i, dt);
}
