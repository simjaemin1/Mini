// =============================================================================
// bench/walk-kernel/walk.c — T352 ② 걸음 커널 한 파일 (WASM · N-API 공용)
// =============================================================================
// ⚠**계측기다. 제품이 아니다.** `server/zone.js` 는 한 글자도 안 바뀐다.
//   이 파일은 그 걸음 문의 **산술을 그대로 옮긴 것**이고, 게이트는 "1,000틱 뒤 좌표 바이트 동일"이다.
//
// ★무엇이 여기 있고 무엇이 없나
//   있다: 목표를 향한 한 걸음(속도 · 적분) · 지형 비트 판정 · 셀 경계 스냅 · 벽 격자 · 나무 원 콜라이더 · 클램프
//   없다: **결정**(`decideNpcBehavior`) · A* 경로 · 청크 활성 판정의 Set 조회
//         — 결정은 JS 에 남는다(카드 §1). 커널은 "정해진 목표로 한 걸음" 뿐이다.
//
// ★산술 규약 — JS 와 **같은 식·같은 순서**
//   · `Math.floor` → `floor` · `Math.hypot` → `hypot`(libm 없는 wasm 에선 아래 `js_hypot` 이 **같은 식**을 쓴다)
//   · 모든 좌표는 `double`(JS `number` 와 같은 IEEE754 binary64) — 게이트가 바이트 동일이라 축약 금지
//   · 곱셈·덧셈 순서를 바꾸지 않는다(결합법칙은 부동소수에서 성립하지 않는다)
//
// ★열(SoA) — `설계/설계_주민_SoA_계약.md` 초안 그대로. JS 가 typed array 를 넘기고 여기서 **공유**한다(복사 0).

#define NULLPTR ((void *)0)

// ── libm 없이 쓰는 셋(wasm32 -nostdlib) ──────────────────────────────────────
// ⚠`sqrt` 는 wasm 명령이 있다(`f64.sqrt`) — clang 이 내장으로 편다.
static inline double k_sqrt(double x) { return __builtin_sqrt(x); }
static inline double k_floor(double x) { return __builtin_floor(x); }
// ★`Math.hypot` 은 오버플로를 피하려고 스케일링을 한다. 그런데 이 커널의 입력은 한 걸음(≤수십 px)과
//   자원 거리(≤28px)뿐이라 `x*x + y*y` 가 절대 넘치지 않는다. **그래도** 바이트가 갈릴 수 있어서
//   JS 쪽 팔도 `Math.sqrt(dx*dx+dy*dy)` 를 쓰도록 맞췄다(보고 §2-ⓑ 에 그 줄을 적는다).
static inline double k_hyp(double x, double y) { return k_sqrt(x * x + y * y); }

// ── 지형 비트 ────────────────────────────────────────────────────────────────
// bit0 = 물 · bit1 = 바위. (다리·환호는 이 벤치 격자에 없다 — 있으면 비트를 늘린다: 계약 §3)
static const unsigned char *TB; static int TX0, TY0, TW, TH;
static inline int terr_blocked(double x, double y) {
  int tx = (int)k_floor(x / 32.0) - TX0, ty = (int)k_floor(y / 32.0) - TY0;
  if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) return 0;   // 격자 밖 = 안 막힘(JS 쪽도 같다)
  return TB[ty * TW + tx] != 0;
}

// ── 벽 격자 ──────────────────────────────────────────────────────────────────
// 셀당 1바이트: bit0 = 이 셀의 N 변이 막혔다 · bit1 = E 변이 막혔다 (zone.js `edgeBlockedStep` 의 그 둘)
static const unsigned char *WB; static int WX0, WY0, WW, WH;
static inline int wall_edge(int cx, int cy, int bit) {
  int x = cx - WX0, y = cy - WY0;
  if (x < 0 || y < 0 || x >= WW || y >= WH) return 0;
  return (WB[y * WW + x] & bit) != 0;
}
// zone.js `edgeBlockedStep(cx,cy,sx,sy)` 와 **같은 네 갈래**
static inline int edge_step(int cx, int cy, int sx, int sy) {
  if (sx ==  1) return wall_edge(cx,     cy,     2);
  if (sx == -1) return wall_edge(cx - 1, cy,     2);
  if (sy ==  1) return wall_edge(cx,     cy + 1, 1);
  if (sy == -1) return wall_edge(cx,     cy,     1);
  return 0;
}
// zone.js `isBlockedByWall` — 같은 조기 반환, 같은 셀 추적(대각 L-경로 둘 중 하나)
#define BUILDING_SIZE 32.0
#define MAX_STEPS 64
static int wall_blocked(double nx, double ny, double ox, double oy) {
  int ocx = (int)k_floor(ox / BUILDING_SIZE), ocy = (int)k_floor(oy / BUILDING_SIZE);
  int ncx = (int)k_floor(nx / BUILDING_SIZE), ncy = (int)k_floor(ny / BUILDING_SIZE);
  if (ocx == ncx && ocy == ncy) return 0;        // ★열에 아홉은 여기서 끝난다(T345 주석)
  int cx = ocx, cy = ocy, steps = 0;
  while (cx != ncx || cy != ncy) {
    if (++steps > MAX_STEPS) return 1;
    int dx = ncx - cx, dy = ncy - cy;
    int sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    int sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    int nxc = cx, nyc = cy;
    if (sx != 0 && sy != 0) {
      int viaX = !edge_step(cx, cy, sx, 0) && !edge_step(cx + sx, cy, 0, sy);
      int viaY = !edge_step(cx, cy, 0, sy) && !edge_step(cx, cy + sy, sx, 0);
      if (!viaX && !viaY) return 1;
      nxc = cx + sx; nyc = cy + sy;
    } else if (sx != 0) {
      if (edge_step(cx, cy, sx, 0)) return 1;
      nxc = cx + sx;
    } else {
      if (edge_step(cx, cy, 0, sy)) return 1;
      nyc = cy + sy;
    }
    cx = nxc; cy = nyc;
  }
  return 0;
}

// ── 나무·바위 원 콜라이더 ────────────────────────────────────────────────────
// 균일 격자 버킷(64px) — JS 쪽 팔도 **같은 격자**를 쓴다(쿼드트리 대신 · 답은 같다: 반경 28 조회)
static const double *TRX, *TRY, *TRR;   // 중심과 충돌 반경(= 줄기/바위 반경 + PLAYER_BODY_R)
static const int *GCELL, *GSTART;       // CSR: GSTART[i]..GSTART[i+1] 이 셀 i 의 개체 색인
static int GX0, GY0, GW, GH;
#define GRID 64.0
static const double *tree_blocker(double x, double y) {
  int gx = (int)k_floor(x / GRID) - GX0, gy = (int)k_floor(y / GRID) - GY0;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    int cx = gx + dx, cy = gy + dy;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
    int i = cy * GW + cx;
    for (int k = GSTART[i]; k < GSTART[i + 1]; k++) {
      int t = GCELL[k];
      double ddx = TRX[t] - x, ddy = TRY[t] - y;
      if (k_hyp(ddx, ddy) < TRR[t]) return &TRX[t];
    }
  }
  return NULLPTR;
}
static inline int tree_blocked(double x, double y) { return tree_blocker(x, y) != NULLPTR; }

// ── 열(SoA) ──────────────────────────────────────────────────────────────────
static double *NX, *NY, *NTX, *NTY, *NVX, *NVY, *NSPD;
static int N_COUNT;
static double ZW, ZH, MOVE_DT, MOVE_SPEED_C;

__attribute__((visibility("default")))
void walk_init(const unsigned char *tb, int tx0, int ty0, int tw, int th,
               const unsigned char *wb, int wx0, int wy0, int ww, int wh,
               const double *trx, const double *tryy, const double *trr,
               const int *gcell, const int *gstart, int gx0, int gy0, int gw, int gh,
               double *nx, double *ny, double *ntx, double *nty, double *nvx, double *nvy, double *nspd,
               int n, double zw, double zh, double dt, double speed) {
  TB = tb; TX0 = tx0; TY0 = ty0; TW = tw; TH = th;
  WB = wb; WX0 = wx0; WY0 = wy0; WW = ww; WH = wh;
  TRX = trx; TRY = tryy; TRR = trr; GCELL = gcell; GSTART = gstart;
  GX0 = gx0; GY0 = gy0; GW = gw; GH = gh;
  NX = nx; NY = ny; NTX = ntx; NTY = nty; NVX = nvx; NVY = nvy; NSPD = nspd;
  N_COUNT = n; ZW = zw; ZH = zh; MOVE_DT = dt; MOVE_SPEED_C = speed;
}

static inline double k_clamp(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ★한 사람의 한 걸음 — `followNpcPath` + `movePlayerStep`(NPC 갈래)의 산술 그대로
static void step_one(int i) {
  double x = NX[i], y = NY[i];
  // ① 속도 — 목표를 향해(도착 10px 안이면 멈춘다: `followNpcPath` 의 그 판정)
  double dx = NTX[i] - x, dy = NTY[i] - y;
  double dd = k_hyp(dx, dy);
  double vx, vy;
  if (dd < 10.0) { vx = 0.0; vy = 0.0; }
  else { double sp = MOVE_SPEED_C * NSPD[i]; vx = (dx / dd) * sp; vy = (dy / dd) * sp; }
  NVX[i] = vx; NVY[i] = vy;
  // ② 탈출 — 지금 자리가 막혔으면 밀어낸다(일반 이동 skip)
  if (terr_blocked(x, y)) {
    static const int D[8][2] = {{1,0},{-1,0},{0,1},{0,-1},{1,1},{-1,1},{1,-1},{-1,-1}};
    int ejx = 0, ejy = 0, found = 0;
    for (int r = 32; r <= 32 * 16 && !found; r += 32) {
      for (int d = 0; d < 8; d++) {
        if (!terr_blocked(x + D[d][0] * r, y + D[d][1] * r)) { ejx = D[d][0]; ejy = D[d][1]; found = 1; break; }
      }
    }
    if (found) {
      double len = k_hyp((double)ejx, (double)ejy); if (len == 0.0) len = 1.0;
      double push = MOVE_SPEED_C * MOVE_DT * 1.8;
      NX[i] = x + ((double)ejx / len) * push;
      NY[i] = y + ((double)ejy / len) * push;
    }
    NVX[i] = 0.0; NVY[i] = 0.0;
    return;
  }
  // ③ 적분
  double nx = x + vx * MOVE_DT;
  double ny = y + vy * MOVE_DT;
  // ④ 벽 — 축별 슬라이드(같은 순서)
  if (wall_blocked(nx, y, x, y)) nx = x;
  if (wall_blocked(x, ny, x, y)) ny = y;
  if (wall_blocked(nx, ny, x, y)) { nx = x; ny = y; }
  // ⑤ 나무 — NPC 는 접선 슬라이드 갈래를 안 탄다(`inp` 가 없다 · zone.js:11473)
  if (!tree_blocked(x, y)) {
    int bx = tree_blocked(nx, y), by = tree_blocked(x, ny);
    if (bx) nx = x;
    if (by) ny = y;
    if (tree_blocked(nx, ny)) { nx = x; ny = y; }
  }
  // ⑥ 지형 — 셀 경계 스냅(동/서·남/북) 뒤 둘 다 막히면 제자리
  if (terr_blocked(nx, y) && !terr_blocked(x, y)) {
    double tx = k_floor(x / 32.0);
    if (nx > x) nx = (tx + 1.0) * 32.0 - 1.0;
    else if (nx < x) nx = tx * 32.0;
    else nx = x;
  }
  if (terr_blocked(x, ny) && !terr_blocked(x, y)) {
    double ty = k_floor(y / 32.0);
    if (ny > y) ny = (ty + 1.0) * 32.0 - 1.0;
    else if (ny < y) ny = ty * 32.0;
    else ny = y;
  }
  if (terr_blocked(nx, ny) && !terr_blocked(x, y)) { nx = x; ny = y; }
  // ⑦ NPC 는 핸드오프가 없다 — 존 밖이면 클램프(zone.js:11528 갈래)
  double outW = -nx, outE = nx - ZW, outN = -ny, outS = ny - ZH;
  double mo = outW; if (outE > mo) mo = outE; if (outN > mo) mo = outN; if (outS > mo) mo = outS;
  if (mo <= 0.0) { NX[i] = nx; NY[i] = ny; }
  else { NX[i] = k_clamp(nx, 0.0, ZW); NY[i] = k_clamp(ny, 0.0, ZH); }
}

__attribute__((visibility("default")))
void walk_tick(void) { for (int i = 0; i < N_COUNT; i++) step_one(i); }

__attribute__((visibility("default")))
void walk_ticks(int n) { for (int t = 0; t < n; t++) walk_tick(); }
