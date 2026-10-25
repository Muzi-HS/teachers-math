"""Read-only Supabase backup. Requires pg_dump, pg_restore, rclone and age on PATH."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlparse, unquote
from uuid import uuid4


class BackupError(Exception):
    pass


def required(env, name):
    value = env.get(name, "").strip()
    if not value:
        raise BackupError(f"Missing setting: {name}")
    return value


def database_env(env):
    """Keep the DB password out of process arguments and require encrypted transport."""
    result = env.copy()
    url = urlparse(required(env, "BACKUP_DB_URL"))
    if url.scheme not in ("postgres", "postgresql") or not url.hostname or not url.username or not url.password:
        raise BackupError("BACKUP_DB_URL must be a PostgreSQL connection URL with credentials")
    if url.port == 6543:
        raise BackupError("Use the session pooler (5432), not the transaction pooler (6543)")
    result.update(PGHOST=url.hostname, PGPORT=str(url.port or 5432),
                  PGUSER=unquote(url.username), PGPASSWORD=unquote(url.password),
                  PGDATABASE=unquote(url.path.lstrip("/")) or "postgres",
                  PGSSLMODE="require", PGCONNECT_TIMEOUT="30")
    # Parameters from the URL are deliberately not passed to libpq.
    return result


def storage_env(env):
    result = env.copy()
    endpoint = required(env, "BACKUP_STORAGE_ENDPOINT")
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise BackupError("BACKUP_STORAGE_ENDPOINT must be an HTTPS S3 endpoint")
    result.update(RCLONE_CONFIG_SOURCE_TYPE="s3", RCLONE_CONFIG_SOURCE_PROVIDER="Other",
                  RCLONE_CONFIG_SOURCE_ENDPOINT=endpoint,
                  RCLONE_CONFIG_SOURCE_REGION=required(env, "BACKUP_STORAGE_REGION"),
                  RCLONE_CONFIG_SOURCE_ACCESS_KEY_ID=required(env, "BACKUP_STORAGE_ACCESS_KEY"),
                  RCLONE_CONFIG_SOURCE_SECRET_ACCESS_KEY=required(env, "BACKUP_STORAGE_SECRET_KEY"),
                  RCLONE_CONFIG_SOURCE_FORCE_PATH_STYLE="true")
    return result


def google_env(env):
    result = env.copy()
    token = required(env, "BACKUP_GOOGLE_TOKEN")
    try:
        if not json.loads(token).get("refresh_token"):
            raise ValueError()
    except (ValueError, AttributeError):
        raise BackupError("BACKUP_GOOGLE_TOKEN must contain an rclone OAuth refresh token") from None
    folder = required(env, "BACKUP_GOOGLE_FOLDER_ID")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", folder):
        raise BackupError("Invalid Google Drive folder ID")
    result.update(RCLONE_CONFIG_GOOGLE_TYPE="drive", RCLONE_CONFIG_GOOGLE_SCOPE="drive.file",
                  RCLONE_CONFIG_GOOGLE_TOKEN=token,
                  RCLONE_CONFIG_GOOGLE_ROOT_FOLDER_ID=folder,
                  RCLONE_CONFIG_GOOGLE_CLIENT_ID=required(env, "BACKUP_GOOGLE_CLIENT_ID"),
                  RCLONE_CONFIG_GOOGLE_CLIENT_SECRET=required(env, "BACKUP_GOOGLE_CLIENT_SECRET"))
    return result


def run(args, env, capture=False):
    # Child stderr can contain credentials or file/student names. Never publish it in logs.
    try:
        process = subprocess.run(args, env=env, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, check=False)
    except OSError:
        raise BackupError(f"Cannot start {args[0]}; check installation and PATH") from None
    if process.returncode:
        raise BackupError(f"{args[0]} failed (exit {process.returncode}); no complete backup was published")
    return process.stdout if capture else None


def rclone(args, env, capture=False):
    # Ignore any machine-wide rclone config; only use the selected environment credentials.
    return run(["rclone", "--config", os.devnull, "--retries", "3", *args], env, capture)


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def create_backup(target, env, output):
    if target not in ("local", "mybox", "google"):
        raise BackupError("Unknown backup destination")
    recipient = required(env, "BACKUP_AGE_RECIPIENT")
    if not re.fullmatch(r"age1[0-9a-z]+", recipient):
        raise BackupError("BACKUP_AGE_RECIPIENT must be an age public recipient")
    for binary in ("pg_dump", "pg_dumpall", "pg_restore", "rclone", "age"):
        if not shutil.which(binary):
            raise BackupError(f"Install {binary} and add it to PATH first")
    pg_env = database_env(env)
    source_env = storage_env(env)
    cloud_env = google_env(env) if target == "google" else None
    mybox = None
    if target == "mybox":
        mybox = Path(required(env, "BACKUP_MYBOX_DIR")).expanduser().resolve()
        # Never create a guessed MYBOX root; it must already exist and be configured by the user.
        if not mybox.is_dir():
            raise BackupError("BACKUP_MYBOX_DIR must be an existing MYBOX sync folder")
    output = Path(output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = f"teachers-math-{stamp}-{uuid4().hex[:8]}"
    final = output / f"{name}.tar.gz.age"
    partial = output / f".{name}.partial"
    try:
        with tempfile.TemporaryDirectory(prefix="teachers-backup-") as temporary:
            work = Path(temporary)
            bundle = work / name
            bundle.mkdir()
            archive = bundle / "database.dump"
            # One pg_dump gives a single consistent database snapshot, including Auth and RLS.
            run(["pg_dump", "--format=custom", "--no-password", "--file", str(archive)], pg_env)
            run(["pg_restore", "--list", str(archive)], pg_env)
            run(["pg_dumpall", "--roles-only", "--no-role-passwords", "--no-password",
                 "--file", str(bundle / "roles-reference.sql")], pg_env)
            buckets = json.loads(rclone(["lsjson", "source:", "--dirs-only"], source_env, True))
            for bucket in buckets:
                bucket_name = bucket.get("Name", "")
                if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", bucket_name) or bucket_name in (".", ".."):
                    raise BackupError("Unsupported bucket name; backup stopped")
                destination = bundle / "storage" / bucket_name
                destination.mkdir(parents=True)
                rclone(["copy", f"source:{bucket_name}", str(destination)], source_env)
                # Verify downloaded object size/content where the provider supplies hashes.
                rclone(["check", f"source:{bucket_name}", str(destination), "--one-way"], source_env)
            guide = Path(__file__).with_name("backup-recovery.md")
            if guide.exists():
                shutil.copyfile(guide, bundle / "backup-recovery.md")
            manifest = {
                "format": "teachers-math-backup-v1", "startedAt": stamp,
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "database": "database.dump", "databaseConsistency": "single-pg-dump-snapshot",
                "storageConsistency": "sequential-copy-not-atomic-with-database",
                "buckets": [b["Name"] for b in buckets],
                "files": {str(p.relative_to(bundle)).replace(os.sep, "/"): digest(p)
                          for p in bundle.rglob("*") if p.is_file()},
                "restore": "Read backup-recovery.md. Roles reference is not an automatic restore script. Never restore over production first.",
            }
            (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            packed = work / "backup.tar.gz"
            with tarfile.open(packed, "w:gz") as tar:
                tar.add(bundle, arcname=name)
            run(["age", "--recipient", recipient, "--output", str(partial), str(packed)], env)
            partial.replace(final)
        checksum = digest(final)
        checksum_path = output / f"{final.name}.sha256"
        checksum_path.write_text(f"{checksum}  {final.name}\n", encoding="ascii")
        if target == "mybox":
            for path in (final, checksum_path):
                # Copy to a temporary name, then publish; do not propagate deletions.
                temporary_copy = mybox / f".{path.name}.partial"
                shutil.copyfile(path, temporary_copy)
                temporary_copy.replace(mybox / path.name)
        elif target == "google":
            for path in (final, checksum_path):
                rclone(["copyto", str(path), f"google:{path.name}", "--immutable"], cloud_env)
            rclone(["check", str(output), "google:", "--one-way", "--include", final.name,
                    "--include", checksum_path.name], cloud_env)
        # This receipt contains no DB URL, OAuth token, bucket names, or student data.
        receipt = {"completedAt": datetime.now(timezone.utc).isoformat(), "target": target,
                   "file": final.name, "sha256": checksum,
                   "delivery": "sync-folder-written-cloud-sync-unverified" if target == "mybox" else "verified"}
        (output / "last-backup.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        return receipt
    finally:
        partial.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("local", "mybox", "google"), default="local")
    parser.add_argument("--config", help="Private JSON configuration file (never commit this file)")
    parser.add_argument("--output", default="backups")
    args = parser.parse_args()
    env = os.environ.copy()
    try:
        if args.config:
            values = json.loads(Path(args.config).read_text(encoding="utf-8-sig"))
            if not isinstance(values, dict) or any(not isinstance(k, str) or not k.startswith("BACKUP_")
                                                   or not isinstance(v, str) for k, v in values.items()):
                raise BackupError("Config must contain only BACKUP_* string settings")
            env.update(values)
        receipt = create_backup(args.target, env, args.output)
        print(json.dumps(receipt))
    except (BackupError, OSError, ValueError):
        # Configuration errors are safe only when raised by our explicit validation.
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, BackupError) else "Backup failed; check configuration, permissions and free disk space.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
