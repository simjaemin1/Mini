#!/bin/bash
# =============================================================================
# 푸시_번들 — 컨테이너에서 만든 커밋을 번들로 받아 origin/main 에 올린다 (범용판).
#   컨테이너는 못 민다: git 프록시가 simjaemin1/Mini 를 이 세션의 인가 저장소로 안 잡아
#   **자격증명과 무관하게** 쓰기를 403 으로 끊는다(읽기는 됨). 그래서 번들 → 맥에서 push.
#
#   ★해시를 안 박아 뒀다 — 번들이 들고 있는 값을 읽어 쓴다. 다음 배치에도 그대로 재사용.
#   작업 트리를 건드리지 않는다(임시 브랜치로만 받아 밀고 지운다).
#   인증: .git/claude-pat.txt 가 있으면 askpass 로 쓴다. **값을 화면·로그에 안 찍는다.**
#
# 쓰는 법:  bash ~/Mini/푸시_번들.command [번들경로]
#           (생략하면 ~/Mini/미푸시.bundle)
# =============================================================================
set -e
REPO="$HOME/Mini/durango-mini"
BUNDLE="${1:-$HOME/Mini/미푸시.bundle}"

[ -f "$BUNDLE" ] || { echo "번들이 없다: $BUNDLE"; exit 1; }
cd "$REPO"

echo "=== 0. 번들 지문 ==="
shasum -a 256 "$BUNDLE"

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
  echo "   (인증: .git/claude-pat.txt — 값은 출력하지 않는다)"
fi

echo
echo "=== 1. origin 최신화 ==="
git fetch origin

echo
echo "=== 2. 번들이 요구하는 부모 확인 ==="
BASE=$(git bundle verify "$BUNDLE" 2>&1 | awk '/requires this ref/{getline; print $1}')
[ -n "$BASE" ] || BASE=$(git rev-parse origin/main)   # 요구 부모가 없으면 자립 번들
echo "   부모 = $BASE"
git bundle verify "$BUNDLE" >/dev/null
echo "   ✓ 번들 무결성 OK"

echo
echo "=== 3. origin/main 이 그 부모인가(패스트포워드 가능?) ==="
CUR=$(git rev-parse origin/main)
echo "   origin/main = $CUR"
if [ "$CUR" != "$BASE" ]; then
  echo "   ⚠ 부모와 다르다 — 그 사이 다른 커밋이 올라갔다. 멈춘다(강제 푸시 금지)."
  exit 1
fi

echo
echo "=== 4. 임시 브랜치로 받기(작업 트리 무변) ==="
# ★번들의 ref 이름은 만든 명령에 따라 다르다(HEAD / main / …). 있는 것을 읽어 쓴다.
#   (2026-08-05 실측: `git bundle create f origin/main..HEAD` → HEAD, `…origin/main..main` → main.
#    HEAD 를 하드코딩했다가 main 번들에서 "couldn't find remote ref HEAD"로 멈췄다.)
REF=$(git bundle list-heads "$BUNDLE" | awk '$2=="HEAD"{print $2}' | head -1)
[ -n "$REF" ] || REF=$(git bundle list-heads "$BUNDLE" | head -1 | awk '{print $2}')
echo "   번들 ref = $REF"
git fetch "$BUNDLE" "$REF:refs/heads/bundle-import"
GOT=$(git rev-parse refs/heads/bundle-import)
git log --oneline "$BASE..refs/heads/bundle-import"

echo
echo "=== 5. 바뀐 파일 ==="
git diff --stat "$BASE" refs/heads/bundle-import

echo
echo "=== 6. 푸시 ==="
git push origin refs/heads/bundle-import:main

echo
echo "=== 7. 정리 ==="
git branch -D bundle-import
git fetch origin
git log --oneline -1 origin/main
echo "완료 — origin/main 이 $GOT 이면 성공."
