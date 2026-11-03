#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Get it from https://nodejs.org"; read -r; exit 1; fi
[ -d node_modules ] || { echo "Installing, please wait..."; npm install --omit=dev; }
(sleep 2; open http://localhost:3000) &
node server.js
