#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
exec fly deploy . --config Oauth/support-relay/fly.toml
