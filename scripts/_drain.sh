#!/usr/bin/env bash
# === scripts/_drain.sh — 하네스 사이 서버 정리(러너와 같은 규약) ================
#
# ★왜 따로 파일인가 [T10 2026-09-01 · 이 세션이 세 번 데였다]
#   `pkill -f "server/zon[e].js"` 를 **부르는 쪽 명령줄에** 적으면, 그 명령줄 자체가
#   패턴에 걸려 **자기 셸을 죽인다**(exit 144). 대괄호 관용구는 "리터럴 파일명"만 피할 뿐,
#   같은 줄에 패턴 문자열이 있으면 소용이 없다.
#   ⇒ 패턴을 **별도 파일 안에** 가둔다. 부르는 쪽 명령줄엔 `bash scripts/_drain.sh` 만 남는다.
#
# 사용: bash scripts/_drain.sh [대기초 기본 6]
set -u
pkill -f "server/zon[e].js" 2>/dev/null || true
pkill -f "server/centra[l].js" 2>/dev/null || true
sleep "${1:-6}"
exit 0
