#!/usr/bin/env bash
# 악기 맵시 학습 한 줄 [T353] — `bash tools/ddsp/train.sh <inst> <wav폴더>`
#   GPU 있으면 학습 · 없으면 **30초 스모크**(전 과정이 돈다는 것만 · 모델 값 0)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INST="${1:-}"; SRC="${2:-}"
[ -z "$INST" ] && { echo "쓰기: bash tools/ddsp/train.sh <inst> <wav폴더>"; exit 2; }

# ── 의존성은 **핀한다**(판마다 달라지면 학습이 재현되지 않는다)
PINS="torch==2.4.1 torchaudio==2.4.1 librosa==0.10.2.post1 soundfile==0.12.1 numpy==1.26.4"
VENV="$HERE/venv"
PY="$VENV/bin/python"
# ★"폴더가 있다" 를 "다 깔렸다" 로 읽지 않는다 — 실제로 **import 되는지** 본다.
#   (1차 판은 폴더만 보고 건너뛰었는데, 설치가 중간에 끊긴 venv 로 계속 돌아
#    `ModuleNotFoundError: torch` 가 났다. 있음 ≠ 됨.)
ready() { [ -x "$PY" ] && "$PY" -c "import torch, librosa, soundfile" >/dev/null 2>&1; }
if ! ready; then
  echo "[1/4] 의존성이 안 서 있다 — venv 를 새로 만든다($VENV)"
  rm -rf "$VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" -q install --upgrade pip
  echo "[1/4] 핀 설치(받는 데 오래 걸린다 · torch 가 크다): $PINS"
  "$VENV/bin/pip" install $PINS 2>&1 | tail -3
  ready || { echo "★설치가 끝나도 import 가 안 된다 — 여기서 멈춘다(반쯤 된 환경으로 안 돈다)"; exit 1; }
fi
echo "[1/4] 의존성 OK"

# ── GPU 자동 감지. **못 찾으면 스모크** — 값을 지어내지 않는다.
GPU=$("$PY" - <<'P'
try:
    import torch; print("yes" if torch.cuda.is_available() else "no")
except Exception:
    print("no")
P
)
echo "[2/4] GPU: $GPU"

if [ "$GPU" = "no" ]; then
  echo "[3/4] ★GPU 가 없다 — **30초 스모크**로 돈다(학습 아님 · 모델 값 0)."
  SMOKE=1
else
  SMOKE=0
fi

# ── 다듬기
PREP="$HERE/prepared/$INST"
if [ -n "$SRC" ] && [ -d "$SRC" ]; then
  echo "[3/4] 다듬기 — $SRC → $PREP"
  "$PY" "$HERE/prep.py" "$SRC" "$PREP"
else
  echo "[3/4] wav 폴더가 없다 — 스모크는 **합성 톤**으로 돈다(관로만 확인)."
  mkdir -p "$PREP"
fi

echo "[4/4] 학습$([ "$SMOKE" = 1 ] && echo '(스모크 30초)')"
SMOKE=$SMOKE INST=$INST PREP=$PREP "$PY" "$HERE/train.py"
echo "끝. 모델이 나왔으면:  python3 tools/ddsp/export.py $INST $HERE/prepared/$INST/last.pt"
