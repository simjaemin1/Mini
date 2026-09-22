#!/usr/bin/env bash
# === bench/walk-kernel/build.sh — T352 ② 두 판을 굽는다 ========================
# ⚠산출물(`.wasm`·`.node`)은 **커밋하지 않는다**(`.gitignore`). 이 스크립트가 다시 굽는다.
# ⚠툴체인이 없으면 **없다고 말하고 건너뛴다** — 억지로 안 깐다(카드 §1).
set -uo pipefail
cd "$(dirname "$0")"
OUT=.; mkdir -p "$OUT"
echo "=== T352 커널 빌드 ==="
echo "  clang     $(command -v clang || echo '없음')  $(clang --version 2>/dev/null | head -1)"
echo "  wasm-ld   $(command -v wasm-ld || echo '없음')"
echo "  cc        $(command -v cc || echo '없음')"
echo "  node-gyp  $(command -v node-gyp || echo '없음')"
NODE_INC="$(node -p "require('path').join(require('path').dirname(require('path').dirname(process.execPath)),'include','node')" 2>/dev/null)"
echo "  node 헤더 ${NODE_INC}$([ -f "$NODE_INC/node_api.h" ] && echo '  (node_api.h 있음)' || echo '  ← 없음')"
echo

# ── WASM ─────────────────────────────────────────────────────────────────────
# `-nostdlib` · 자립 실행 아님(reactor) · 메모리는 **JS 가 import 로 넘긴다**(열을 그 위에 놓고 JS 도 같은 뷰를 쓴다 = 복사 0)
if command -v clang >/dev/null && command -v wasm-ld >/dev/null; then
  clang --target=wasm32 -O3 -nostdlib -ffreestanding -fno-builtin-memcpy \
        -Wl,--no-entry -Wl,--export-dynamic -Wl,--import-memory -Wl,--allow-undefined \
        -Wl,--export=walk_init -Wl,--export=walk_tick -Wl,--export=walk_ticks \
        -o walk.wasm walk.c && echo "  ✅ walk.wasm  $(stat -c%s walk.wasm) 바이트"
else
  echo "  ✗ WASM — clang/wasm-ld 없음(건너뜀)"
fi

# ── N-API ────────────────────────────────────────────────────────────────────
# ★`node-gyp` 없이 굽는다 — 헤더만 있으면 공유 라이브러리 한 줄이면 된다(억지 설치 0).
if command -v cc >/dev/null && [ -f "$NODE_INC/node_api.h" ]; then
  # ★★`-ffp-contract=off` 가 **게이트의 조건**이다. x86-64 는 `-O3` 에서 `a*b+c` 를 FMA 한 명령으로 접고,
  #   그러면 중간 반올림이 한 번 사라져 **마지막 비트가 갈린다**. 1,000틱을 쌓으면 눈에 보이는 좌표 차가 된다
  #   (실측: 켠 채로 10,000명 x 열의 93.7%가 달랐다 · 끄면 0). WASM 은 FMA 명령이 없어 이 문제가 **구조적으로 없다**.
  cc -O3 -ffp-contract=off -fno-fast-math -shared -fPIC -I"$NODE_INC" -o walk.node napi-shim.c
  [ -f walk.node ] && echo "  ✅ walk.node  $(stat -c%s walk.node) 바이트" || echo "  ✗ N-API — 빌드 실패"
else
  echo "  ✗ N-API — cc 또는 node 헤더 없음(건너뜀)"
fi
