#!/usr/bin/env bash
# Builds the SPA and assembles build/ ready to upload:
#   build/public/       -> the subdomain web root (SPA + .htaccess + api shim)
#   build/public/_app/  -> backend, denied by .htaccess (shared hosting cannot write above the web root)
set -euo pipefail
cd "$(dirname "$0")/.."

(cd web && npm ci && npm run build)

rm -rf build
mkdir -p build/public/api build/public/_app/public build/public/_app/config

cp -R web/dist/. build/public/
cp deploy/.htaccess build/public/.htaccess
cp deploy/api/index.php build/public/api/index.php

cp -R api/src api/bin api/database build/public/_app/
cp api/public/index.php build/public/_app/public/index.php
cp api/config/config.example.php build/public/_app/config/config.example.php
cp deploy/_app.htaccess build/public/_app/.htaccess

echo "Done. Upload build/public/ to the web root and create _app/config/config.php on the server (see README)."
