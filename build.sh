#!/usr/bin/env bash
set -euo pipefail

UUID="intel-gputop@kai"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.local/share/cinnamon/applets/${UUID}"

REQUIRED_FILES=(
  "metadata.json"
  "applet.js"
)

OPTIONAL_FILES=(
  "stylesheet.css"
)

echo "Installing Cinnamon applet: ${UUID}"
echo "Source: ${SRC_DIR}"
echo "Target: ${TARGET_DIR}"

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${SRC_DIR}/${file}" ]]; then
    echo "Missing required file: ${file}" >&2
    exit 1
  fi
done

rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"

for file in "${REQUIRED_FILES[@]}"; do
  cp "${SRC_DIR}/${file}" "${TARGET_DIR}/${file}"
done

for file in "${OPTIONAL_FILES[@]}"; do
  if [[ -f "${SRC_DIR}/${file}" ]]; then
    cp "${SRC_DIR}/${file}" "${TARGET_DIR}/${file}"
  fi
done

chmod 755 "${TARGET_DIR}"
chmod 644 "${TARGET_DIR}"/*

echo
echo "Install complete."
echo "1) Restart Cinnamon (logout/login) or run: cinnamon --replace"
echo "2) Right-click panel -> Applets -> add 'Intel GPU Top'"
echo "3) Ensure intel-gpu-tools is installed for intel_gpu_top."
