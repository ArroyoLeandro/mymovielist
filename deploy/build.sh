#!/usr/bin/env bash
# Builds the SPA and assembles build/ ready to upload:
#   build/public/      -> the subdomain web root (SPA + .htaccess + api shim)
#   build/disney-app/  -> sits next to the web root (backend, never public)
set -euo pipefail
cd "$(dirname "$0")/.."

(cd web && npm ci && npm run build)

rm -rf build
mkdir -p build/public/api build/disney-app/public build/disney-app/config

cp -R web/dist/. build/public/
cp deploy/.htaccess build/public/.htaccess
cp deploy/api/index.php build/public/api/index.php

cp -R api/src api/bin api/database build/disney-app/
cp api/public/index.php build/disney-app/public/index.php
cp api/config/config.example.php build/disney-app/config/config.example.php

echo "Done. Upload build/public/* to the web root and build/disney-app/ next to the web root (see README)."
