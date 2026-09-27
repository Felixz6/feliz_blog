#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
target=${1:-"$repo_root/public/themes/fuyukawa-kagari/assets/about"}

mkdir -p "$target/responsive"
cp "$script_dir/original/clannad.webp" "$target/clannad.webp"
cp "$script_dir/original/clannad-640.webp" "$target/responsive/clannad-640.webp"
cp "$script_dir/original/clannad-320.webp" "$target/responsive/clannad-320.webp"
printf 'Restored CLANNAD original images in %s\n' "$target"
