#!/bin/sh
# Installs md Local (docs/local.md) from this checkout: builds the page and the binary, puts md in ~/.local/bin, loads the
# LaunchAgent, and offers the one line that tells your agents to use it. Nothing is downloaded except npm packages.
set -eu

bin_dir="$HOME/.local/bin"
claude_md="$HOME/.claude/CLAUDE.md"
line='After finishing a Markdown file for me to read, run `md <path>`.'

die() { echo "install: $*" >&2; exit 1; }

# One function per way of getting the binary, each leaving it at "$1". Only the source build exists. A release download belongs here
# as a second function, and must check a published SHA-256 before it installs anything; do not add one without that check.
build_from_source() {
  command -v go >/dev/null 2>&1 || die "go is needed to build from source (https://go.dev/dl/)"
  command -v node >/dev/null 2>&1 || die "node is needed to build from source (https://nodejs.org/)"
  cd "$(dirname "$0")"
  [ -d node_modules ] || npm ci
  npm run build:local
  cp local/md "$1"
}

tmp=$(mktemp "${TMPDIR:-/tmp}/md.XXXXXX")
trap 'rm -f "$tmp"' EXIT
build_from_source "$tmp"

mkdir -p "$bin_dir"
chmod 755 "$tmp"
mv "$tmp" "$bin_dir/md"
echo "installed $bin_dir/md"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "warning: $bin_dir is not on your PATH; add it to your shell profile or agents will not find md" >&2 ;;
esac
# oh-my-zsh and others define md as `mkdir -p`; an alias or function wins over the binary, in your shell and in agents that load it
case $(zsh -ic 'whence -w md' 2>/dev/null </dev/null || true) in
  *alias*|*function*) echo "warning: your zsh defines md as an alias or function, which hides this command; add 'unalias md 2>/dev/null' at the end of ~/.zshrc" >&2 ;;
esac

"$bin_dir/md" setup

if [ -f "$claude_md" ] && grep -qF "$line" "$claude_md"; then
  echo "$claude_md already has the line"
  exit 0
fi
echo
echo "For agents to open files for you, add this to $claude_md:"
echo "  $line"
printf 'Append it now? [y/N] '
answer=
if [ -r /dev/tty ]; then read -r answer </dev/tty || answer=; fi
case $answer in
  y|Y|yes|YES)
    mkdir -p "$(dirname "$claude_md")"
    [ -s "$claude_md" ] && [ -n "$(tail -c1 "$claude_md")" ] && echo >>"$claude_md"
    printf '%s\n' "$line" >>"$claude_md"
    echo "added to $claude_md"
    ;;
  *) echo "skipped" ;;
esac
