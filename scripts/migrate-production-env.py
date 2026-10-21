#!/usr/bin/env python3
"""One-time, local-only migration from the healthy API container to the server .env."""
import json
import os
import subprocess
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

REQUIRED = (
    "MYSQL_URL", "MYSQL_USERNAME", "MYSQL_PASSWORD", "REDIS_HOST",
    "WECHAT_APP_ID", "WECHAT_APP_SECRET", "COS_BUCKET", "COS_REGION",
    "COS_SECRET_ID", "COS_SECRET_KEY", "TIMELINE_CURSOR_SECRET",
)


def render(template, info):
    state = info.get("State", {})
    if not state.get("Running") or state.get("Health", {}).get("Status") != "healthy":
        raise ValueError("The existing API must be running and healthy.")
    live = dict(item.split("=", 1) for item in info["Config"]["Env"] if "=" in item)
    for key in REQUIRED:
        if not live.get(key):
            raise ValueError(f"Required live setting is missing: {key}; no file changed.")
    if live.get("SPRING_PROFILES_ACTIVE") != "prod":
        raise ValueError("Existing API is not using prod; inspect its configuration first.")
    host = info["HostConfig"]
    port = live.get("SERVER_PORT", "8080")
    bindings = host.get("PortBindings", {}).get(f"{port}/tcp", []) or []
    if len(bindings) != 1:
        raise ValueError("Expected one published API port; inspect port bindings first.")
    live.update(SERVER_BIND_ADDRESS=bindings[0]["HostIp"] or "0.0.0.0",
                SERVER_HTTP_PORT=bindings[0]["HostPort"], SERVER_PORT=port,
                COMPOSE_PROJECT_NAME="love-notes", SPRING_PROFILES_ACTIVE="prod",
                APP_MEMORY_LIMIT=str(host.get("Memory", 0)),
                REDIS_USERNAME=live.get("REDIS_USERNAME", ""),
                REDIS_PASSWORD=live.get("REDIS_PASSWORD", ""),
                INTERNAL_OPERATION_TOKEN_HASH=live.get("INTERNAL_OPERATION_TOKEN_HASH", ""))
    if host.get("NanoCpus", 0):
        cpus = Decimal(host["NanoCpus"]) / Decimal(1000000000)
    elif host.get("CpuQuota", 0) > 0 and host.get("CpuPeriod", 0) > 0:
        cpus = Decimal(host["CpuQuota"]) / Decimal(host["CpuPeriod"])
    else:
        cpus = Decimal(0)
    live["APP_CPU_LIMIT"] = str(cpus)
    log = host.get("LogConfig", {})
    if log.get("Type") != "json-file":
        raise ValueError("Existing log driver differs from the Compose template; inspect it first.")
    for source, key in (("max-size", "LOG_MAX_SIZE"), ("max-file", "LOG_MAX_FILES")):
        if source not in log.get("Config", {}):
            raise ValueError("Existing log limits are unspecified; inspect them before migrating.")
        live[key] = log["Config"][source]
    lines = []
    for line in template.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            lines.append(line)
            continue
        key, default = line.split("=", 1)
        value = live.get(key, default)
        if "\0" in value:
            raise ValueError("An environment value contains an unsupported NUL character.")
        # Compose dotenv decodes JSON-compatible quotes; $$ preserves literal dollars.
        lines.append(f"{key}={json.dumps(value, ensure_ascii=False).replace('$', '$$')}")
    return "\n".join(lines) + "\n"


def ensure_template(target, template):
    if target.is_symlink() or (target.exists() and target.read_text(encoding="utf-8-sig") != template):
        raise ValueError("Existing .env differs from the uploaded template; refusing to overwrite it.")


def install(target, template, content, gid):
    ensure_template(target, template)
    descriptor, name = tempfile.mkstemp(prefix=".env-migration-", dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o640)
        os.chown(temporary, 0, gid)
        ensure_template(target, template)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise ValueError("Usage: sudo python3 migrate-production-env.py [--apply]")
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise ValueError("Run this migration on the Linux server using sudo.")
    import grp
    gid = grp.getgrnam("love-notes-ops").gr_gid
    uploaded = Path("/tmp/love-notes-env.example")
    if not uploaded.is_file():
        raise ValueError("Missing /tmp/love-notes-env.example; upload the new template first.")
    template = uploaded.read_text(encoding="utf-8-sig")
    target = Path("/opt/love-notes/.env")
    ensure_template(target, template)
    result = subprocess.run(["docker", "inspect", "love-notes-api-1"], capture_output=True, text=True, check=True)
    content = render(template, json.loads(result.stdout)[0])
    if sys.argv[1:] == ["--apply"]:
        install(target, template, content, gid)
        print("Migrated live API settings to /opt/love-notes/.env (root:love-notes-ops, 0640). No container was restarted.")
    else:
        print("Dry run passed. Live settings are available; .env is still unchanged. Run again with --apply to migrate.")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Migration stopped. Check server files, group permissions and Docker access locally; no secret diagnostics are printed.", file=sys.stderr)
        sys.exit(1)
