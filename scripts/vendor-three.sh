#!/usr/bin/env bash
# scripts/vendor-three.sh — ★[T522 2026-09-29] three.js 한 판을 `public/vendor/` 에 고정한다(정본 명령 · CDN 0).
#   three@0.186.1 코어 + 덧붙이 둘(GLTFLoader · SkeletonUtils)을 esbuild 0.25.10 으로 **전역 THREE 하나**(IIFE)로 묶는다.
#   클라는 고전 스크립트라 ES 모듈을 못 부른다 — 그래서 묶는다. 판을 올릴 때만 돈다(배포·굽기 경로엔 없다).
#   라이선스: three.js MIT(전문 `public/vendor/three.LICENSE.txt`) · esbuild MIT(도구 — 배포 안 한다).
#   같은 판·같은 명령이면 같은 바이트다(T522 실측: 두 번 묶어 sha1 같음). 판·머리 줄·라이선스 전문은 `scripts/e2e-char3d.js` ⓐ 가 잰다.
set -euo pipefail
VER=0.186.1
ESB=0.25.10
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund "three@${VER}" "esbuild@${ESB}" >/dev/null
cat > entry.js <<'JS'
// three.js 코어 + 들어 쓰는 덧붙이 둘(GLTFLoader · SkeletonUtils)을 전역 THREE 하나로 묶는다.
export * from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
JS
BANNER="/*! three.js ${VER} (https://threejs.org) — MIT License · Copyright © 2010-2026 three.js authors. 코어 + examples/jsm GLTFLoader·SkeletonUtils 를 esbuild ${ESB} IIFE(전역 THREE)로 묶음 — 정본 명령: scripts/vendor-three.sh */"
./node_modules/.bin/esbuild entry.js --bundle --format=iife --global-name=THREE --minify --target=es2020 --legal-comments=none "--banner:js=${BANNER}" --outfile="three.${VER}.min.js"
cp "three.${VER}.min.js" "$ROOT/public/vendor/"
cp node_modules/three/LICENSE "$ROOT/public/vendor/three.LICENSE.txt"
echo "→ public/vendor/three.${VER}.min.js $(wc -c < "three.${VER}.min.js")B · $(sha1sum "three.${VER}.min.js" | cut -c1-16)"
