# Holy Songs Nomad Deploy

This deploys the single production image from `Dockerfile`. The container serves
both the frontend and backend on port `8000`, which is what the Nomad job exposes
behind Traefik for `holy-songs.bcgen.ie`.

GitHub Actions publishes the image, joins the Headscale tailnet, and deploys it
directly to Nomad with a Nomad token. The workflow uses the same Nomad API
address as Accounta: `http://100.64.0.5:4646`.

Required GitHub Actions secrets:

- `NOMAD_TOKEN`: Nomad token with permission to plan/run the `holy-songs` job
- `HEADSCALE_AUTHKEY`: Headscale/Tailscale auth key for joining the tailnet
- `CONTENT_REPO_GITHUB_TOKEN`: token used by the running app to sync song content

The workflow preserves the currently registered Nomad job and only updates the
`holy-songs` task image, so app runtime secrets stay in Nomad.

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
- `HOLY_SONGS_DOMAIN`: defaults to `holy-songs.bcgen.ie`
- `TRAEFIK_ENTRYPOINT`: defaults to `websecure`
- `TRAEFIK_CERT_RESOLVER`: defaults to `letsencrypt`
- `PLATFORMS`: defaults to `linux/amd64`
- `BUILD_ONLY=1`: build and push images without running Nomad
- `SKIP_TESTS=1`: skip local test checks
- `SKIP_GHCR_LOGIN=1`: assume Docker is already logged in to GHCR
