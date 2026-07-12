#!/usr/bin/env bash

set -euo pipefail

HOST="ubuntu@129.159.239.36"
DEFAULT_KEY_PATH="${HOME}/Downloads/oracle-vps.key"
KEY_PATH="${VPS_SSH_KEY:-$DEFAULT_KEY_PATH}"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "SSH key not found: $KEY_PATH" >&2
  echo "Set VPS_SSH_KEY or place the key at ${DEFAULT_KEY_PATH}." >&2
  exit 1
fi

exec ssh -i "$KEY_PATH" "$HOST"