#!/usr/bin/env python3
"""Copy template comments without parsing or rewriting production values."""
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

SETTING = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")
QUOTED = re.compile(r'''(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(?:[ \t]*(?:#.*)?)$''')


def render(template, original):
    comments = {}
    block = []
    for line in template.decode("utf-8-sig").splitlines():
        match = SETTING.fullmatch(line)
        if match:
            comments[match[1]] = block
        block = block + [line] if line.startswith("#") else []

    bom = b"\xef\xbb\xbf" if original.startswith(b"\xef\xbb\xbf") else b""
    lines = original[len(bom):].decode("utf-8").splitlines(keepends=True)
    newline = "\r\n" if b"\r\n" in original else "\n"
    output, preceding, count = [], [], 0
    for line in lines:
        text = line.rstrip("\r\n")
        match = SETTING.fullmatch(text)
        if match:
            # Refuse multiline quoted values rather than mistake their contents for keys.
            value = match[2].lstrip(" \t")
            if value.startswith(("'", '"')) and not QUOTED.fullmatch(value):
                raise ValueError("Unsupported quoted value; no file changed.")
            addition = comments.get(match[1], [])
            if addition and preceding[-len(addition):] != addition:
                output.extend(comment + newline for comment in addition)
                count += 1
        elif text.strip() and not text.lstrip().startswith("#"):
            raise ValueError("Unsupported dotenv syntax; no file changed.")
        output.append(line)
        preceding = preceding + [text] if text.startswith("#") else []
    return bom + "".join(output).encode("utf-8"), count


def install(target, original, content, backup_dir):
    if target.is_symlink() or target.read_bytes() != original:
        raise ValueError("Target changed or is a symlink; stopped without writing.")
    metadata = target.stat()
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    if backup_dir.is_symlink() or backup_dir.stat().st_mode & 0o077:
        raise ValueError("Backup directory must be private; no file changed.")
    fd, backup = tempfile.mkstemp(prefix="env-before-comments-", dir=backup_dir)
    with os.fdopen(fd, "wb") as stream:
        stream.write(original)
        stream.flush()
        os.fsync(stream.fileno())
    fd, name = tempfile.mkstemp(prefix=".env-comments-", dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
        if target.is_symlink() or target.read_bytes() != original:
            raise ValueError("Target changed during preparation; stopped without writing.")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return backup


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise ValueError("Usage: sudo python3 sync-env-comments.py [--apply]")
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise ValueError("Run on the Linux server using sudo.")
    target = Path("/opt/love-notes/.env")
    if target.is_symlink() or not target.is_file():
        raise ValueError("Expected an existing regular /opt/love-notes/.env file.")
    original = target.read_bytes()
    content, count = render(Path("/tmp/love-notes-env.example").read_bytes(), original)
    if not count:
        print("NO_CHANGE: comments already synchronized or no matching settings.")
    elif sys.argv[1:] == ["--apply"]:
        backup = install(target, original, content, Path("/root/love-notes-backups"))
        print(f"APPLIED: added comments for {count} settings; values unchanged. Backup: {backup}")
    else:
        print(f"DRY_RUN_OK: would add comments for {count} settings; values unchanged. Run with --apply to write.")


if __name__ == "__main__":
    try:
        main()
    except UnicodeError:
        print("Invalid UTF-8 input; no file changed.", file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Stopped. Check file access locally; secret diagnostics are suppressed.", file=sys.stderr)
        sys.exit(1)
