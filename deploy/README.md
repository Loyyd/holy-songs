# Holy Songs Nomad Deploy

This deploys the single production image from `Dockerfile`. The container serves
both the frontend and backend on port `8000`, which is what the Nomad job exposes
behind Traefik for `holysongs.bcgen.ie`.

GitHub Actions publishes the image and deploys it directly to Nomad with a Nomad
token. It does not join a Headscale/Tailscale network, so `NOMAD_ADDR` must be an
address that GitHub-hosted runners can reach.

Required GitHub Actions secrets:

- `NOMAD_ADDR`: reachable Nomad API address, for example `https://nomad.example.com`
- `NOMAD_TOKEN`: Nomad token with permission to plan/run the `holy-songs` job
- `HOLY_SONGS_ADMIN_TOKEN`: admin token exposed to the running app
- `CONTENT_REPO_GITHUB_TOKEN`: token used by the running app to sync song content

Run from the repo root:

```bash
export NOMAD_ADDR="https://your-nomad.example.com"
export GHCR_TOKEN="..." # token with write:packages, or use an existing docker login
export GITHUB_TOKEN="..." # optional, for content repo push/pull from the running app
export HOLY_SONGS_ADMIN_TOKEN="..."
export CONTENT_REPO_HOST_PATH="/srv/holy-songs-content"

npm run deploy:nomad
```

The script builds and pushes:

- `ghcr.io/loyyd/holy-songs:<git-sha>`
- `ghcr.io/loyyd/holy-songs:latest`

Nomad deploys the immutable SHA tag by default. To force the job to reference the
literal `latest` tag instead:

```bash
DEPLOY_REF="ghcr.io/loyyd/holy-songs:latest" npm run deploy:nomad
```

Useful overrides:

- `NOMAD_DATACENTERS`: defaults to `dc1`
- `HOLY_SONGS_DOMAIN`: defaults to `holysongs.bcgen.ie`
- `TRAEFIK_ENTRYPOINT`: defaults to `websecure`
- `TRAEFIK_CERT_RESOLVER`: defaults to `letsencrypt`
- `PLATFORMS`: defaults to `linux/amd64`
- `BUILD_ONLY=1`: build and push images without running Nomad
- `SKIP_TESTS=1`: skip local test checks
- `SKIP_GHCR_LOGIN=1`: assume Docker is already logged in to GHCR
