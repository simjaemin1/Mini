#!/usr/bin/env bash
# === scripts/split-verify2.sh — 2차 분할 결합 검사 ============================
#
# `split-verify.sh` 는 **1차 분할**(public/client.js → 조각 14개)을 증명한다.
# 그런데 그건 등록된 조각을 **전부** 이어 붙여 분할 전 `client.js` 와 바이트 비교하므로,
# 분할 이후 누가 조각에 한 줄만 더해도 `differ` 가 난다 — T18 이 그 주석을 이미 달아 뒀고
# 실제로 HEAD 에서 `differ` 다(T18 · 온보딩 v2 · T13 이 접촉 줄을 더했다).
# ⇒ **2차 분할은 그 검사기로 못 잰다.** 재는 대상이 다르다:
#     "부모 파일 하나가, 그 자리를 이어받은 조각들과 바이트 동일한가"
#
# 쓰는 법:
#   bash scripts/split-verify2.sh 32-m-render 32-m-render,33-m-conn,34-m-renderloop,35-x-war,36-r2-building
#   BASE=<rev> bash scripts/split-verify2.sh <부모> <자식,자식,…>     # 정본 커밋 지정(기본 HEAD)
#   bash scripts/split-verify2.sh --selftest <부모> <자식,…>          # ★검사기 자가 검사
#
# ★자명 통과 금지: --selftest 는 조각 하나에서 코드 한 글자를 바꿔 `differ` 가 나는지 먼저 보인다.
set -uo pipefail
cd "$(dirname "$0")/.."

SELF=0
if [ "${1:-}" = "--selftest" ]; then SELF=1; shift; fi
PARENT="${1:?부모 조각 이름(확장자 없이)}"
CHILDREN="${2:?자식 조각 이름들(쉼표 구분 · 등록 순서대로)}"
BASE="${BASE:-HEAD}"

if ! git rev-parse -q --verify "${BASE}:public/client/${PARENT}.js" >/dev/null 2>&1; then
  echo "정본을 못 찾았다: ${BASE}:public/client/${PARENT}.js" >&2; exit 2
fi

canon() {     # 정본(부모 조각) → 자기 머리 마커만 걷어낸 원문
  git show "${BASE}:public/client/${PARENT}.js" | grep -v '^// @@split:'
}

rebuild() {   # 자식 조각들 → 마커 걷어낸 재결합본
  IFS=',' read -r -a arr <<< "$CHILDREN"
  for n in "${arr[@]}"; do
    f="public/client/${n}.js"
    [ -f "$f" ] || { echo "조각 없음: $f" >&2; exit 2; }
    grep -v '^// @@split:' "$f"
  done
}

if [ "$SELF" = 1 ]; then
  echo "=== 검사기 자가 검사 — 한 글자 오염이 differ 를 내는가 ==="
  IFS=',' read -r -a arr <<< "$CHILDREN"
  V="public/client/${arr[0]}.js"
  cp "$V" /tmp/_sv2_backup.js
  perl -0pi -e 's/const /donst /' "$V"
  if rebuild | cmp -s - <(canon); then
    cp /tmp/_sv2_backup.js "$V"; echo "  ✗ ★검사기가 오염을 못 잡는다 — 믿지 마라"; exit 1
  fi
  cp /tmp/_sv2_backup.js "$V"
  echo "  ✓ 오염된 조각에서 differ — 검사기가 실패할 줄 안다 (원복 확인)"
fi

if rebuild | cmp -s - <(canon); then
  echo "identical — ${CHILDREN} 를 이어 붙이면 ${BASE} 의 ${PARENT}.js 와 바이트 동일"
  exit 0
fi
echo "differ — 아래는 첫 차이"
diff <(rebuild) <(canon) | head -20
exit 1
