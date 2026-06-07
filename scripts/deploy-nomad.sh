#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

render_template() {
  local template="$1"
  local output="$2"

  cp "$template" "$output"
  for name in \
    NOMAD_DATACENTERS \
    HOLY_SONGS_DOMAIN \
    TRAEFIK_ENTRYPOINT \
    TRAEFIK_CERT_RESOLVER \
    DEPLOY_REF \
    CONTENT_REPO_HOST_PATH \
    HOLY_SONGS_ADMIN_TOKEN \
    GITHUB_TOKEN \
    CONTENT_REPO_GIT_USER_NAME \
    CONTENT_REPO_GIT_USER_EMAIL \
    CONTENT_REPO_PUSH_REMOTE \
    CONTENT_REPO_PUSH_BRANCH
  do
    local value
    value="$(escape_sed_replacement "${!name:-}")"
    sed -i.bak "s/\${${name}}/${value}/g" "$output"
  done
  rm -f "${output}.bak"
}

require_cmd docker
require_cmd git

if [[ "${BUILD_ONLY:-0}" != "1" ]]; then
  require_cmd nomad
  [[ -n "${NOMAD_ADDR:-}" ]] || die "NOMAD_ADDR is not set"
fi

GHCR_OWNER="${GHCR_OWNER:-loyyd}"
IMAGE_NAME="${IMAGE_NAME:-holy-songs}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_REPO="${IMAGE_REPO:-${REGISTRY}/${GHCR_OWNER}/${IMAGE_NAME}}"
GIT_SHA="$(git rev-parse --short=12 HEAD)"
IMAGE_REF="${IMAGE_REF:-${IMAGE_REPO}:${GIT_SHA}}"
LATEST_REF="${LATEST_REF:-${IMAGE_REPO}:latest}"
DEPLOY_REF="${DEPLOY_REF:-${IMAGE_REF}}"
PLATFORMS="${PLATFORMS:-linux/amd64}"

NOMAD_DATACENTERS="${NOMAD_DATACENTERS:-dc1}"
HOLY_SONGS_DOMAIN="${HOLY_SONGS_DOMAIN:-holysongs.bcgen.ie}"
TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-websecure}"
TRAEFIK_CERT_RESOLVER="${TRAEFIK_CERT_RESOLVER:-letsencrypt}"
CONTENT_REPO_HOST_PATH="${CONTENT_REPO_HOST_PATH:-/srv/holy-songs-content}"
CONTENT_REPO_GIT_USER_NAME="${CONTENT_REPO_GIT_USER_NAME:-Holy Songs Bot}"
CONTENT_REPO_GIT_USER_EMAIL="${CONTENT_REPO_GIT_USER_EMAIL:-holy-songs-bot@local}"
CONTENT_REPO_PUSH_REMOTE="${CONTENT_REPO_PUSH_REMOTE:-origin}"
CONTENT_REPO_PUSH_BRANCH="${CONTENT_REPO_PUSH_BRANCH:-main}"
HOLY_SONGS_ADMIN_TOKEN="${HOLY_SONGS_ADMIN_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  require_cmd npm
  require_cmd python3
  npm run test
  python3 -m pytest backend/test_main.py backend/test_auth.py
fi

if [[ "${SKIP_GHCR_LOGIN:-0}" != "1" ]]; then
  if [[ -n "${GHCR_TOKEN:-}" ]]; then
    printf '%s' "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_OWNER" --password-stdin
  elif command -v gh >/dev/null 2>&1; then
    gh auth token | docker login "$REGISTRY" -u "$GHCR_OWNER" --password-stdin
  else
    printf 'No GHCR_TOKEN or gh CLI found; assuming docker is already logged in to %s.\n' "$REGISTRY"
  fi
fi

printf 'Building and pushing %s and %s\n' "$IMAGE_REF" "$LATEST_REF"
docker buildx build \
  --platform "$PLATFORMS" \
  --build-arg "VCS_REF=${GIT_SHA}" \
  --build-arg "IMAGE_REF=${IMAGE_REF}" \
  --tag "$IMAGE_REF" \
  --tag "$LATEST_REF" \
  --push \
  -f Dockerfile .

JOB_FILE="$(mktemp "${TMPDIR:-/tmp}/holy-songs.nomad.XXXXXX.hcl")"
cleanup_job_file() {
  if [[ "${KEEP_JOB_FILE:-0}" != "1" ]]; then
    rm -f "$JOB_FILE"
  fi
}
trap cleanup_job_file EXIT

render_template "deploy/holy-songs.nomad.hcl.tpl" "$JOB_FILE"

printf 'Rendered Nomad job: %s\n' "$JOB_FILE"

if [[ "${BUILD_ONLY:-0}" == "1" ]]; then
  printf 'BUILD_ONLY=1 set; skipping nomad deploy.\n'
  exit 0
fi

nomad job plan "$JOB_FILE" || true
nomad job run "$JOB_FILE"

printf 'Deployed %s to https://%s\n' "$IMAGE_REF" "$HOLY_SONGS_DOMAIN"
