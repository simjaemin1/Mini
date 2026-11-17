#!/bin/bash
# (@regress 없음 — 러너 밖 · T1335 맥 긴 판 러너 정본 · 제품 무변)
# === scripts/mac-long-run/make-pack.sh — 맥 본체 긴 판에 보낼 **판 코드 tgz**(+ sha256)를 git 커밋에서 만든다 ===
#   쓰는 법: bash scripts/mac-long-run/make-pack.sh <커밋> <내보낼 폴더> [더 실을 파일 …]
#     tgz = `git archive <커밋>` 에서 판이 안 읽는 기록 폴더(계측 · 보고 · 증거_* · 문서)를 뺀 것
#           + 더 실을 파일(같은 커밋의 글자 — 계측 폴더의 관찰 훅 등 · 제 경로 그대로)
#           + `REV`(커밋 해시 한 줄 — 판 러너가 판 코드 판을 이걸로 가른다)
#     ⇒ <폴더>/code-<짧은 해시>.tgz · code-<짧은 해시>.tgz.sha256(`shasum -a 256 -c` 로 맥에서 검사)
#   GNU tar 가 있는 곳(클라우드 · 리눅스)에서 부른다(맥 bsdtar 는 tar 잇기 `--concatenate` 가 없다).
#   맥 `~/Mini/durango-mini` 클론은 쓰지 않는다 — 판 코드는 언제나 이 tgz 사본이다(T1335 지키기).
set -eu
[ $# -ge 2 ] || { sed -n 3,10p "$0"; exit 2; }
REV=$(git rev-parse "$1^{commit}"); OUTD="$2"; shift 2
S=$(git rev-parse --short=9 "$REV")
mkdir -p "$OUTD"; T=$(mktemp -d)
git archive --format=tar "$REV" -- . ':(exclude)계측' ':(exclude)보고' ':(exclude)증거_*' ':(exclude)문서' > "$T/src.tar"
if [ $# -gt 0 ]; then
  git archive --format=tar "$REV" -- "$@" > "$T/extra.tar"
  tar --concatenate -f "$T/src.tar" "$T/extra.tar"
fi
echo "$REV" > "$T/REV"; tar --append -f "$T/src.tar" -C "$T" REV
gzip -6 -c "$T/src.tar" > "$OUTD/code-$S.tgz"
( cd "$OUTD" && { command -v sha256sum >/dev/null && sha256sum "code-$S.tgz" || shasum -a 256 "code-$S.tgz"; } > "code-$S.tgz.sha256" )
N=$(tar tf "$T/src.tar" | wc -l | tr -d ' ')
rm -rf "$T"
echo "판 코드 tgz: $OUTD/code-$S.tgz · 파일 $N · $(wc -c < "$OUTD/code-$S.tgz" | tr -d ' ') 바이트 · REV $REV"
cat "$OUTD/code-$S.tgz.sha256"
