#!/bin/bash
set -e
cd "$(dirname "$0")"
git pull origin claude/elegant-bohr-zx67jk
echo "Updated. Restart with ./start.sh"
