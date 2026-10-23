#!/usr/bin/env bash
# Vendors xterm.js and the two addons the terminal page uses into
# surface/vendor/ from npm, pinned by version and checked against their
# integrity. The page loads the UMD builds as plain scripts (a surface page
# cannot import a package).
set -euo pipefail
PKGS=(
  "xterm 6.0.0 sha512-TQwDdQGtwwDt+2cgKDLn0IRaSxYu1tSUjgKarSDkUM0ZNiSRXFpjxEsvc/Zgc5kq5omJ+V0a8/kIM2WD3sMOYg=="
  "addon-fit 0.11.0 sha512-jYcgT6xtVYhnhgxh3QgYDnnNMYTcf8ElbxxFzX0IZo+vabQqSPAjC3c1wJrKB5E19VwQei89QCiZZP86DCPF7g=="
  "addon-unicode11 0.9.0 sha512-FxDnYcyuXhNl+XSqGZL/t0U9eiNb/q3EWT5rYkQT/zuig8Gz/VagnQANKHdDWFM2lTMk9ly0EFQxxxtZUoRetw=="
)

cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rm -rf surface/vendor && mkdir -p surface/vendor
for p in "${PKGS[@]}"; do
  read -r name version integrity <<<"$p"
  curl -fsSL "https://registry.npmjs.org/@xterm/$name/-/$name-$version.tgz" -o "$tmp/$name.tgz"
  got="sha512-$(openssl dgst -sha512 -binary "$tmp/$name.tgz" | base64 | tr -d '\n')"
  [ "$got" = "$integrity" ] || { echo "$name-$version.tgz: integrity $got, want $integrity" >&2; exit 1; }
  mkdir -p "$tmp/$name" && tar -xzf "$tmp/$name.tgz" -C "$tmp/$name"
  cp "$tmp/$name/package/lib/$name.js" surface/vendor/
  echo "@xterm/$name $version" >> surface/vendor/VERSIONS
done
cp "$tmp/xterm/package/css/xterm.css" "$tmp/xterm/package/LICENSE" surface/vendor/
ls -l surface/vendor
