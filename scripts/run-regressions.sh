#!/usr/bin/env bash
# === scripts/run-regressions.sh — **위임 전용**(2026-08-26 러너 통합) ============
#
# 이 파일에는 이제 목록이 없다. 정본은 `scripts/run-regress.sh` 하나다.
#
# ★왜 합쳤나: 두 러너가 각자 목록을 들고 있었고 그 목록이 갈렸다 —
#   `run-regress.sh` 만 돌리면 mtcut·mtfoot·mtfuzz·tilestate·waterperf 5종을,
#   `run-regressions.sh` 만 돌리면 events·fishing·body·save-periodic·guest 계열 7종을
#   **통째로 빼먹었다**. "전원 통과"라는 보고가 그때마다 절반만 참이었다.
#   ⇒ 호출처(문서·습관)가 남아 있으므로 지우지 않고 **위임**한다.
#
# 옛 규약 메모(보존): 이 러너는 순차 전용이었고 로그를 /tmp/reg/*.log 로 남겼다.
#   지금은 `run-regress.sh` 가 종료코드를 파이프 앞에서 잡고 ✗ 줄을 먼저 찍는다.
exec bash "$(dirname "$0")/run-regress.sh" "$@"
