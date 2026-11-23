#!/usr/bin/env bash
# T1436 작은 자료 모으기 — 판 폴더(/tmp/t1436)에서 이 폴더로: 판 자 로그(줄 · 판) · 판마다 t1436-boot.json(부팅 초 · RSS · 멈춘 때) · 멈춤 줄(마디 로그에서 [t1436] · [t722] · T728 종료 저장 · T731 창 닫음 줄만)
cd "$(dirname "$0")" || exit 2
W=/tmp/t1436
tar -czf logs.tar.gz -C "$W" logs
mkdir -p boot
for d in "$W"/*/; do n=$(basename "$d"); [ -f "$d/t1436-boot.json" ] && gzip -9c "$d/t1436-boot.json" > "boot/$n.json.gz"; done
for n in a1020-day a1020-mid a1020-night b1020-day b1020-mid b1020-night; do
  for f in $(ls "$W/$n"/seg-*.log | sort -t- -k2 -n); do echo "## $(basename "$f")"; grep -a -E '^\[t1436\]|^\[t722\]|\[T728\] 종료 저장|\[T731\] 창 .* 닫음|마을 econ day [0-9]+:' "$f" | cut -c1-220; done | gzip -9 > "stoplines-$n.txt.gz"
done
ls -la boot | wc -l; ls -la *.gz | awk '{s+=$5} END {print s" bytes"}'
