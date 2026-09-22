// === bench/walk-kernel/napi-shim.c — T352 ② N-API 판 껍데기 (walk.c 를 그대로 포함) ====
// ⚠계측기다. 커널 산술은 `walk.c` **한 파일**이고 여기는 배열을 넘겨 주기만 한다(사본 0).
#include <node_api.h>
#include "walk.c"

static void *ta(napi_env e, napi_value v) {
  napi_typedarray_type t; size_t len; void *data; napi_value ab; size_t off;
  if (napi_get_typedarray_info(e, v, &t, &len, &data, &ab, &off) != napi_ok) return NULLPTR;
  return data;
}
static int32_t i32(napi_env e, napi_value v) { int32_t r = 0; napi_get_value_int32(e, v, &r); return r; }
static double f64(napi_env e, napi_value v) { double r = 0; napi_get_value_double(e, v, &r); return r; }

// ★★[T352 실측] **N-API 는 포인터를 틱 사이에 들고 있을 수 없다.**
//   `napi_get_typedarray_info` 가 주는 주소는 **그 호출 동안만** 보장된다 — V8 이 GC 때 백킹 스토어를
//   옮기면 다음 틱의 쓰기가 옛 자리로 간다. 벤치에서 그게 그대로 났다: 한 틱씩 따로 부르면 멀쩡한데,
//   사이에 JS 팔이 10,000개 객체를 만들어 GC 가 돈 판에서는 x 열의 93.7% 가 갈렸다
//   — 곧 **산술이 아니라 수명** 문제다.
//   ⇒ 배열만 `napi_ref` 로 붙들고(원시값은 ref 대상이 아니다 — 그걸 ref 하면 널이 와서 **세그폴트**다 · 실측)
//     **틱마다 주소를 다시 받는다**. 그 되받는 값이 N-API 판의 고정 비용이다.
//   ⚠WASM 에는 이 문제가 **구조적으로 없다** — 열이 선형 메모리 안에 있고 그 메모리는 안 움직인다.
#define NARR 14
static const int ARR_IDX[NARR] = { 0, 5, 10, 11, 12, 13, 14, 19, 20, 21, 22, 23, 24, 25 };
static napi_ref AREF[NARR];
static int HAVE = 0;
// 원시값은 init 때 C 값으로 굳힌다(ref 아님)
static int S_tx0, S_ty0, S_tw, S_th, S_wx0, S_wy0, S_ww, S_wh, S_gx0, S_gy0, S_gw, S_gh, S_n;
static double S_zw, S_zh, S_dt;

static void bind(napi_env env) {
  napi_value v[NARR];
  for (int i = 0; i < NARR; i++) napi_get_reference_value(env, AREF[i], &v[i]);
  walk_init((const unsigned char *)ta(env, v[0]), S_tx0, S_ty0, S_tw, S_th,
            (const unsigned char *)ta(env, v[1]), S_wx0, S_wy0, S_ww, S_wh,
            (const double *)ta(env, v[2]), (const double *)ta(env, v[3]), (const double *)ta(env, v[4]),
            (const int *)ta(env, v[5]), (const int *)ta(env, v[6]),
            S_gx0, S_gy0, S_gw, S_gh,
            (double *)ta(env, v[7]), (double *)ta(env, v[8]), (double *)ta(env, v[9]), (double *)ta(env, v[10]),
            (double *)ta(env, v[11]), (double *)ta(env, v[12]), (double *)ta(env, v[13]),
            S_n, S_zw, S_zh, S_dt, 64.0);
}

static napi_value Init_(napi_env env, napi_callback_info info) {
  size_t argc = 30; napi_value a[30];
  napi_get_cb_info(env, info, &argc, a, NULLPTR, NULLPTR);
  if (HAVE) for (int i = 0; i < NARR; i++) napi_delete_reference(env, AREF[i]);
  for (int i = 0; i < NARR; i++) napi_create_reference(env, a[ARR_IDX[i]], 1, &AREF[i]);
  HAVE = 1;
  S_tx0 = i32(env, a[1]); S_ty0 = i32(env, a[2]); S_tw = i32(env, a[3]); S_th = i32(env, a[4]);
  S_wx0 = i32(env, a[6]); S_wy0 = i32(env, a[7]); S_ww = i32(env, a[8]); S_wh = i32(env, a[9]);
  S_gx0 = i32(env, a[15]); S_gy0 = i32(env, a[16]); S_gw = i32(env, a[17]); S_gh = i32(env, a[18]);
  S_n = i32(env, a[26]); S_zw = f64(env, a[27]); S_zh = f64(env, a[28]); S_dt = f64(env, a[29]);
  bind(env);
  return NULLPTR;
}
static napi_value Ticks_(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value a[1];
  napi_get_cb_info(env, info, &argc, a, NULLPTR, NULLPTR);
  bind(env);                    // ★주소를 다시 받는다 — 이 한 줄이 N-API 판의 고정 비용이다
  walk_ticks(i32(env, a[0]));
  return NULLPTR;
}
NAPI_MODULE_INIT() {
  napi_value f;
  napi_create_function(env, "init", NAPI_AUTO_LENGTH, Init_, NULLPTR, &f);
  napi_set_named_property(env, exports, "init", f);
  napi_create_function(env, "ticks", NAPI_AUTO_LENGTH, Ticks_, NULLPTR, &f);
  napi_set_named_property(env, exports, "ticks", f);
  return exports;
}
