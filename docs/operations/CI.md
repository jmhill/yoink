# CI images

GitHub Actions and the Fly deploy build pull container images. Anonymous
Docker Hub (`registry-1.docker.io`) pulls are rate-limited and have 429'd
the `Build Docker image` step, so we do not use Docker Hub for base images.

## API image (`apps/api/Dockerfile`)

Both stages use **`node:24-alpine`**, pulled from Google's Docker Hub
mirror and pinned by digest (ECR Public 429'd CI with a data-limit
exceeded):

```
mirror.gcr.io/library/node:24-alpine@sha256:…
```

The `# syntax=docker/dockerfile:1` frontend line is omitted on purpose: it
also pulled from Docker Hub. GitHub Actions Buildx already provides a
BuildKit frontend that supports `--mount=type=cache`.

`docker-compose.test.yml` has no extra service images; it builds this
Dockerfile (or runs a pre-built `IMAGE`).

### Bump the Node digest

1. Resolve the current index digest for `24-alpine` from the GCR mirror:

   ```bash
   curl -fsSI \
     -H 'Accept: application/vnd.oci.image.index.v1+json' \
     https://mirror.gcr.io/v2/library/node/manifests/24-alpine \
     | tr -d '\r' \
     | awk -F': ' 'tolower($1)=="docker-content-digest" { print $2 }'
   ```

   Or, with Docker: `docker buildx imagetools inspect mirror.gcr.io/library/node:24-alpine --format '{{.Manifest.Digest}}'`

2. Replace `ARG NODE_IMAGE=...` in `apps/api/Dockerfile` (both `FROM` stages
   use that ARG). Keep the `node:24-alpine` comment in sync with the same digest.
3. Leave the tag as `24-alpine` unless we intentionally change major/OS.

## Buildx / BuildKit (`pr.yml`, `trunk.yml`)

`docker/setup-buildx-action` defaults to `moby/buildkit` on Docker Hub.
We pin the GCR mirror instead:

```
mirror.gcr.io/moby/buildkit:buildx-stable-1@sha256:…
```

Bump the digest the same way against
`https://mirror.gcr.io/v2/moby/buildkit/manifests/buildx-stable-1`.

## Other Docker Hub pulls

`scripts/download-prod-db.sh` (local ops, not CI) pulls Litestream from
`mirror.gcr.io/litestream/litestream:0.3.13` pinned by digest.
