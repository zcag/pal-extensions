#!/usr/bin/env bash
# Vendors Ruffle's self-hosted build into surface/ruffle/ from npm, pinned by
# version and checked against its integrity. `make ruffle` runs it.
set -euo pipefail
VERSION=0.7.1
INTEGRITY=sha512-6ZWxx/cfX3RoNyQ1AVimECSae4gKqMxdPimOD+chiIcOFiJS0ATGKcjkretxNT03lqNUpiSyJjF55AuvvZ+QeA==

cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-$VERSION.tgz" -o "$tmp/ruffle.tgz"
got="sha512-$(openssl dgst -sha512 -binary "$tmp/ruffle.tgz" | base64 | tr -d '\n')"
[ "$got" = "$INTEGRITY" ] || { echo "ruffle-$VERSION.tgz: integrity $got, want $INTEGRITY" >&2; exit 1; }
tar -xzf "$tmp/ruffle.tgz" -C "$tmp"
rm -rf surface/ruffle && mkdir -p surface/ruffle
cp "$tmp"/package/{ruffle.js,core.ruffle.*.js,*.wasm,LICENSE_MIT,LICENSE_APACHE} surface/ruffle/
rm -f surface/ruffle/*.map
echo "$VERSION" > surface/ruffle/VERSION
ls -l surface/ruffle
