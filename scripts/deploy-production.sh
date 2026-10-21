#!/bin/sh
set -eu

DEPLOY_DIR=${DEPLOY_DIR:-/opt/love-notes}
: "${IMAGE_TAG:?IMAGE_TAG must be the Git commit hash}"
case "$IMAGE_TAG" in
    *[!0-9a-f]*) echo 'Invalid image tag: expected a Git commit hash.' >&2; exit 1 ;;
esac
if [ "${#IMAGE_TAG}" -lt 12 ] || [ "${#IMAGE_TAG}" -gt 40 ]; then
    echo 'Invalid image tag: expected 12 to 40 hexadecimal characters.' >&2
    exit 1
fi
for file in "$DEPLOY_DIR/.env" "$DEPLOY_DIR/compose.yml"; do
    if [ ! -f "$file" ] || [ ! -r "$file" ]; then
        echo "Production config missing or unreadable: $file. See the deployment guide; no files were generated." >&2
        exit 1
    fi
done
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?IMAGE_TAG[[:space:]]*=' "$DEPLOY_DIR/.env"; then
    echo 'Remove IMAGE_TAG from the server .env; releases select a commit and manual apply uses the production image alias.' >&2
    exit 1
fi

export IMAGE_TAG
APP_ENV_FILE="$DEPLOY_DIR/.env"
export APP_ENV_FILE
compose() {
    # dotenv parse errors can include raw secret values, even with config --quiet.
    if docker compose --project-name love-notes --project-directory "$DEPLOY_DIR" \
        --file "$DEPLOY_DIR/compose.yml" --env-file "$APP_ENV_FILE" "$@" 2>/dev/null; then
        return 0
    else
        result=$?
        echo "Production Compose failed (exit $result). Inspect configuration and Docker status securely on the server; diagnostics are suppressed in Jenkins." >&2
        return "$result"
    fi
}

# Quiet validation avoids printing resolved credentials into the build log.
compose config --quiet
compose up -d --no-deps --wait --wait-timeout 300 api
# Manual configuration applies must keep the last successfully deployed version.
docker image tag "love-notes-server:$IMAGE_TAG" love-notes-server:production
compose ps api
