"""Verify an already decrypted and extracted backup without connecting to any database."""
import hashlib
import json
from pathlib import Path
import sys


def verify(folder):
    root = Path(folder).resolve()
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('format') != 'teachers-math-backup-v1' or not manifest.get('files'):
        raise ValueError('Invalid backup manifest')
    for name, expected in manifest['files'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError('Missing or unsafe backup file')
        checksum = hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                checksum.update(block)
        if checksum.hexdigest() != expected:
            raise ValueError('Backup checksum mismatch')
    return len(manifest['files'])


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: python verify.py EXTRACTED_BACKUP_FOLDER')
        print(f'Verified {verify(sys.argv[1])} files. A separate restore drill is still required.')
    except (ValueError, OSError):
        print('Verification failed. Check the extracted folder and file integrity.', file=sys.stderr)
        sys.exit(1)
