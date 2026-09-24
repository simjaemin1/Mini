#!/usr/bin/env bash
# Explicit WSL/RTX-friendly launcher for the R&D-only expressive-synthesis baseline.
# It has no implicit install, corpus discovery, training, or game-asset action.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
MODE="check"
MODE_SET=0
PROFILE="cuda124"
VENV_DIR="${REPO_ROOT}/.venv-expressive-synthesis"
MANIFEST_PATH=""
OUTPUT_DIR=""
ALLOW_INSTALL=0
CONFIRM_RND_ONLY=0

usage() {
  cat <<'USAGE'
Usage:
  setup_train_wsl.sh --check [--profile cuda124|cpu] [--venv PATH]
  setup_train_wsl.sh --setup --allow-install [--profile cuda124|cpu] [--venv PATH]
  setup_train_wsl.sh --smoke [--venv PATH]
  setup_train_wsl.sh --train --manifest PATH --output-dir PATH --confirm-rnd-only [--venv PATH]

Modes are mutually exclusive.  This R&D-only harness never touches default
assets, runtime BGM, game outputs, or public-release artifacts.
USAGE
}

fail() {
  printf 'expressive-synthesis: %s\n' "$*" >&2
  exit 2
}

set_mode() {
  if [[ "${MODE_SET}" -eq 1 ]]; then
    fail 'choose exactly one of --check, --setup, --smoke, or --train'
  fi
  MODE="$1"
  MODE_SET=1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) set_mode check ;;
    --setup) set_mode setup ;;
    --smoke) set_mode smoke ;;
    --train) set_mode train ;;
    --allow-install) ALLOW_INSTALL=1 ;;
    --confirm-rnd-only) CONFIRM_RND_ONLY=1 ;;
    --profile)
      [[ $# -ge 2 ]] || fail '--profile needs cuda124 or cpu'
      PROFILE="$2"
      shift
      ;;
    --venv)
      [[ $# -ge 2 ]] || fail '--venv needs an explicit path'
      VENV_DIR="$2"
      shift
      ;;
    --manifest)
      [[ $# -ge 2 ]] || fail '--manifest needs an explicit JSON path'
      MANIFEST_PATH="$2"
      shift
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || fail '--output-dir needs a new R&D-only path'
      OUTPUT_DIR="$2"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) fail "unknown argument: $1" ;;
  esac
  shift
done

[[ "${PROFILE}" == "cuda124" || "${PROFILE}" == "cpu" ]] || fail '--profile must be cuda124 or cpu'

is_wsl() {
  grep -qiE '(microsoft|wsl)' /proc/sys/kernel/osrelease 2>/dev/null
}

check_python() {
  local python_bin="$1"
  [[ -x "${python_bin}" ]] || fail "Python executable is unavailable: ${python_bin}"
  local version
  version="$("${python_bin}" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  case "${version}" in
    3.10|3.11|3.12) printf 'Python: %s (%s)\n' "${version}" "${python_bin}" ;;
    *) fail "Python 3.10–3.12 is required; found ${version}" ;;
  esac
}

check_gpu() {
  if [[ "${PROFILE}" != "cuda124" ]]; then
    printf 'GPU check: skipped for explicit CPU profile\n'
    return
  fi
  if is_wsl; then
    printf 'Host: WSL detected\n'
  else
    printf 'Host: WSL was not detected; continuing only if this Linux CUDA host is intentional\n' >&2
  fi
  command -v nvidia-smi >/dev/null 2>&1 || fail 'nvidia-smi is unavailable; update/install the NVIDIA WSL driver first'
  printf 'GPU inventory:\n'
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
}

check_torch() {
  local python_bin="$1"
  local desired_profile="$2"
  ES_SYNTHESIS_PROFILE="${desired_profile}" PYTORCH_NVML_BASED_CUDA_CHECK=1 "${python_bin}" -c '
import os
import torch
print("PyTorch:", torch.__version__, "CUDA wheel:", torch.version.cuda)
if os.environ["ES_SYNTHESIS_PROFILE"] == "cuda124":
    if not torch.cuda.is_available():
        raise SystemExit("PyTorch cannot access CUDA")
    print("CUDA device:", torch.cuda.get_device_name(0))
    print("CUDA memory MiB:", torch.cuda.get_device_properties(0).total_memory // (1024 * 1024))
else:
    print("CPU profile: CUDA availability is not required")
'
}

select_existing_venv_python() {
  PYTHON_BIN="${VENV_DIR}/bin/python"
  [[ -x "${PYTHON_BIN}" ]] || fail "virtual environment is absent: ${VENV_DIR}; run --setup --allow-install first"
}

case "${MODE}" in
  check)
    check_gpu
    if [[ -x "${VENV_DIR}/bin/python" ]]; then
      PYTHON_BIN="${VENV_DIR}/bin/python"
    else
      PYTHON_BIN="$(command -v python3 || true)"
      [[ -n "${PYTHON_BIN}" ]] || fail 'python3 is unavailable'
      printf 'Virtual environment absent; checking system Python only. Use --setup --allow-install to install explicitly.\n' >&2
    fi
    check_python "${PYTHON_BIN}"
    # ``--check`` is deliberately the pre-install diagnostic described in
    # the README.  It must be able to confirm WSL/Python/GPU readiness before
    # a venv exists; requiring an import that only --setup installs would
    # turn the documented first command into a false failure.  Smoke/train
    # still require PyTorch through their stricter paths below.
    if "${PYTHON_BIN}" -c 'import torch' >/dev/null 2>&1; then
      check_torch "${PYTHON_BIN}" "${PROFILE}"
    else
      printf 'PyTorch is not installed in this Python yet; environment readiness check continues without an install.\n' >&2
    fi
    printf 'Environment check passed. No install, corpus read, training, or output write occurred.\n'
    ;;
  setup)
    [[ "${ALLOW_INSTALL}" -eq 1 ]] || fail '--setup requires the explicit --allow-install acknowledgement'
    check_gpu
    SYSTEM_PYTHON="$(command -v python3 || true)"
    [[ -n "${SYSTEM_PYTHON}" ]] || fail 'python3 is unavailable'
    check_python "${SYSTEM_PYTHON}"
    [[ ! -e "${VENV_DIR}" ]] || fail "refusing to modify existing virtual environment: ${VENV_DIR}"
    "${SYSTEM_PYTHON}" -m venv "${VENV_DIR}"
    PYTHON_BIN="${VENV_DIR}/bin/python"
    "${PYTHON_BIN}" -m pip install --upgrade pip
    if [[ "${PROFILE}" == "cuda124" ]]; then
      "${PYTHON_BIN}" -m pip install \
        --index-url https://download.pytorch.org/whl/cu124 \
        --extra-index-url https://pypi.org/simple \
        -r "${SCRIPT_DIR}/requirements-cuda124.txt"
    else
      "${PYTHON_BIN}" -m pip install \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        -r "${SCRIPT_DIR}/requirements-cpu.txt"
    fi
    check_torch "${PYTHON_BIN}" "${PROFILE}"
    printf 'Explicit setup completed. No corpus, training, game asset, or runtime BGM was produced.\n'
    ;;
  smoke)
    select_existing_venv_python
    check_python "${PYTHON_BIN}"
    CUDA_VISIBLE_DEVICES="" "${PYTHON_BIN}" "${SCRIPT_DIR}/smoke_synthetic.py" --device cpu
    printf 'CPU-only synthetic smoke passed; no corpus/checkpoint/audio output was used or written.\n'
    ;;
  train)
    [[ -n "${MANIFEST_PATH}" ]] || fail '--train requires --manifest PATH'
    [[ -n "${OUTPUT_DIR}" ]] || fail '--train requires --output-dir PATH'
    [[ "${CONFIRM_RND_ONLY}" -eq 1 ]] || fail '--train requires --confirm-rnd-only'
    [[ "${PROFILE}" == "cuda124" ]] || fail '--train is GPU-only; the cpu profile supports --setup/--smoke checks only'
    check_gpu
    select_existing_venv_python
    check_python "${PYTHON_BIN}"
    check_torch "${PYTHON_BIN}" cuda124
    "${PYTHON_BIN}" "${SCRIPT_DIR}/validate_manifest.py" --manifest "${MANIFEST_PATH}" --verify-files
    "${PYTHON_BIN}" "${SCRIPT_DIR}/train_baseline.py" \
      --manifest "${MANIFEST_PATH}" \
      --output-dir "${OUTPUT_DIR}" \
      --confirm-rnd-only
    ;;
esac
