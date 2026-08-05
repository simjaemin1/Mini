#!/bin/bash
# =============================================================================
# 배치 17 푸시 — 컨테이너에서 만든 커밋 5d4f253 을 origin/main 으로 올린다.
#   (컨테이너는 못 민다: git 프록시가 simjaemin1/Mini 를 이 세션의 인가 저장소로 안 잡아
#    **자격증명과 무관하게** 쓰기를 403 으로 끊는다. 읽기는 되고 쓰기만 막힌다.)
#
# 작업 트리를 **건드리지 않는다** — 번들에서 임시 브랜치로 받아 그대로 origin/main 에 밀어 넣는다.
#   로컬 main(f75e815)은 그대로 두고, 나중에 편할 때 `git pull` 하면 된다.
#
# 인증: 있으면 .git/claude-pat.txt 를 쓴다. **값을 화면·로그에 찍지 않는다**(askpass 경유).
#       파일이 없으면 평소 쓰던 방식(키체인·수동 입력)으로 넘어간다.
#
# 쓰는 법: 터미널에서  bash ~/Mini/배치17_푸시.command
# =============================================================================
set -e
REPO="$HOME/Mini/durango-mini"
BUNDLE="$HOME/Mini/배치17.bundle"
WANT=5d4f2535d4beef250596c1b278a7a33a6b9f4ebe
BASE=724c9dbaf5ad9e0db6e06e0ec134bcd7ecdee48f

echo "=== 0. 번들 지문 ==="
shasum -a 256 "$BUNDLE"
echo "   기대값: 612b366077006a65381596fec45f3065d6da324e7b24bac785721969fb0bf3d3"

cd "$REPO"

# ── 토큰이 있으면 askpass 로만 넘긴다(명령줄·환경 어디에도 값이 안 남는다) ──
PATF="$REPO/.git/claude-pat.txt"
if [ -f "$PATF" ]; then
  AP=$(mktemp); chmod 700 "$AP"
  cat > "$AP" <<EOF
#!/bin/sh
case "\$1" in
  *[Uu]sername*) echo "x-access-token" ;;
  *) tr -d '\r\n' < "$PATF" ;;
esac
EOF
  export GIT_ASKPASS="$AP" GIT_TERMINAL_PROMPT=1
  trap 'rm -f "$AP"' EXIT
  echo "   (인증: .git/claude-pat.txt 사용 — 값은 출력하지 않는다)"
fi

echo
echo "=== 1. origin 최신화(번들의 부모 $BASE 가 있어야 검증이 된다) ==="
git fetch origin

echo
echo "=== 2. 번들 무결성 ==="
git bundle verify "$BUNDLE"

echo
echo "=== 3. origin/main 이 번들의 부모와 같은가(패스트포워드 가능?) ==="
HEADSHA=$(git rev-parse origin/main)
echo "   origin/main = $HEADSHA"
if [ "$HEADSHA" != "$BASE" ]; then
  echo "   ⚠ origin/main 이 $BASE 가 아니다 — 그 사이 다른 커밋이 올라갔다."
  echo "     그러면 아래 push 는 거부된다. 이 스크립트를 멈추고 상황을 확인하라."
  exit 1
fi

echo
echo "=== 4. 번들에서 임시 브랜치로 받기(작업 트리 무변) ==="
git fetch "$BUNDLE" HEAD:refs/heads/batch17-import
git log --oneline -1 refs/heads/batch17-import

echo
echo "=== 5. 받은 커밋이 기대한 그 커밋인가 ==="
GOT=$(git rev-parse refs/heads/batch17-import)
[ "$GOT" = "$WANT" ] || { echo "   ✗ 해시 불일치: $GOT ≠ $WANT"; exit 1; }
echo "   ✓ $GOT"

echo
echo "=== 6. 바뀐 파일 ==="
git diff --stat "$BASE" refs/heads/batch17-import

echo
echo "=== 7. 푸시 ==="
git push origin refs/heads/batch17-import:main

echo
echo "=== 8. 정리 ==="
git branch -D batch17-import
git fetch origin
git log --oneline -1 origin/main
echo "완료 — origin/main 이 5d4f253 이면 성공."
