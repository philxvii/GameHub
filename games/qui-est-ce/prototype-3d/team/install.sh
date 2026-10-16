#!/usr/bin/env bash
# Installe les agents de l'equipe du Qui est-ce ? dans .claude/agents/ (dossier non versionne).
# Usage (depuis n'importe ou dans le depot) : bash games/qui-est-ce/prototype-3d/team/install.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SRC="$ROOT/games/qui-est-ce/prototype-3d/team/agents"
DST="$ROOT/.claude/agents"
mkdir -p "$DST"
cp "$SRC"/*.md "$DST"/
echo "Agents installes dans $DST :"
ls "$DST" | sed 's/\.md$//'
echo "Relance la session Claude Code pour les charger (puis /model -> Opus pour l'orchestrateur)."
