import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / 'backup' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'backup.py')
verify = load('verify', 'verify.py')


class BackupTests(unittest.TestCase):
    def env(self):
        return {
            'BACKUP_DB_URL': 'postgresql://postgres.test:p%40ss@db.example.com:5432/postgres',
            'BACKUP_STORAGE_ENDPOINT': 'https://example.supabase.co/storage/v1/s3',
            'BACKUP_STORAGE_REGION': 'ap-northeast-2', 'BACKUP_STORAGE_ACCESS_KEY': 'access',
            'BACKUP_STORAGE_SECRET_KEY': 'secret', 'BACKUP_AGE_RECIPIENT': 'age1testpublickey',
            'BACKUP_GOOGLE_TOKEN': '{"refresh_token":"refresh"}',
            'BACKUP_GOOGLE_CLIENT_ID': 'client', 'BACKUP_GOOGLE_CLIENT_SECRET': 'client-secret',
            'BACKUP_GOOGLE_FOLDER_ID': 'only-backup-folder',
        }

    def test_connection_password_is_not_in_arguments_and_ssl_is_required(self):
        result = backup.database_env(self.env())
        self.assertEqual(result['PGPASSWORD'], 'p@ss')
        self.assertEqual(result['PGSSLMODE'], 'require')
        env = self.env()
        env['BACKUP_DB_URL'] = env['BACKUP_DB_URL'].replace(':5432', ':6543')
        with self.assertRaises(backup.BackupError):
            backup.database_env(env)

    def test_invalid_settings_fail_before_any_remote_copy(self):
        env = self.env()
        env['BACKUP_STORAGE_ENDPOINT'] = 'http://insecure/storage'
        with self.assertRaises(backup.BackupError):
            backup.storage_env(env)
        env['BACKUP_GOOGLE_TOKEN'] = '{"access_token":"no-refresh"}'
        with self.assertRaises(backup.BackupError):
            backup.google_env(env)

    def external(self, calls, fail=None):
        def run(args, env, capture=False):
            calls.append(args)
            if fail and fail(args):
                raise backup.BackupError('Injected tool failure')
            if args[0] in ('pg_dump', 'pg_dumpall'):
                Path(args[args.index('--file') + 1]).write_bytes(b'consistent-dump')
                self.assertNotIn('p@ss', ' '.join(args))
            elif args[0] == 'age':
                # Test-only pass-through lets us inspect the archive. Production uses real age.
                Path(args[args.index('--output') + 1]).write_bytes(Path(args[-1]).read_bytes())
            elif 'lsjson' in args:
                return b'[{"Name":"attachments"},{"Name":"empty"}]'
            elif 'copy' in args:
                if 'source:attachments' in args:
                    (Path(args[-1]) / 'lesson.png').write_bytes(b'image-bytes')
            return b'' if capture else None
        return run

    def test_local_bundle_includes_auth_archive_files_hashes_and_no_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            with patch.object(backup.shutil, 'which', return_value='/tool'), patch.object(backup, 'run', self.external(calls)):
                receipt = backup.create_backup('local', self.env(), directory)
            output = Path(directory)
            archive = output / receipt['file']
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), receipt['sha256'])
            with tarfile.open(archive, 'r:gz') as tar:
                names = tar.getnames()
                manifest = json.load(tar.extractfile(next(n for n in names if n.endswith('/manifest.json'))))
                self.assertEqual(manifest['buckets'], ['attachments', 'empty'])
                self.assertTrue(any(n.endswith('/database.dump') for n in names))
                self.assertTrue(any(n.endswith('/roles-reference.sql') for n in names))
                self.assertTrue(any(n.endswith('/storage/attachments/lesson.png') for n in names))
                self.assertFalse(any('private' in n for n in names))
                self.assertEqual(manifest['files']['storage/attachments/lesson.png'], hashlib.sha256(b'image-bytes').hexdigest())
            self.assertEqual(json.loads((output / 'last-backup.json').read_text())['delivery'], 'verified')
            self.assertTrue(any('check' in args and 'source:attachments' in args for args in calls))

    def test_storage_failure_never_publishes_encrypted_archive_or_success_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(backup.shutil, 'which', return_value='/tool'), patch.object(backup, 'run', self.external([], lambda a: 'check' in a)):
                with self.assertRaises(backup.BackupError):
                    backup.create_backup('local', self.env(), directory)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_cloud_failure_does_not_claim_delivery_success(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(backup.shutil, 'which', return_value='/tool'), patch.object(backup, 'run', self.external([], lambda a: 'copyto' in a)):
                with self.assertRaises(backup.BackupError):
                    backup.create_backup('google', self.env(), directory)
            self.assertFalse((Path(directory) / 'last-backup.json').exists())

    def test_mybox_copies_only_encrypted_files_and_does_not_claim_remote_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            env = self.env()
            mybox = Path(directory) / 'mybox'
            mybox.mkdir()
            env['BACKUP_MYBOX_DIR'] = str(mybox)
            with patch.object(backup.shutil, 'which', return_value='/tool'), patch.object(backup, 'run', self.external([])):
                receipt = backup.create_backup('mybox', env, Path(directory) / 'local')
            self.assertEqual(receipt['delivery'], 'sync-folder-written-cloud-sync-unverified')
            self.assertEqual(sorted(p.suffix for p in mybox.iterdir()), ['.age', '.sha256'])

    def test_google_is_scoped_to_folder_and_only_publishes_encrypted_files(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            with patch.object(backup.shutil, 'which', return_value='/tool'), patch.object(backup, 'run', self.external(calls)):
                receipt = backup.create_backup('google', self.env(), directory)
            uploaded = [a for a in calls if 'copyto' in a]
            self.assertEqual(len(uploaded), 2)
            self.assertTrue(all(a[-1] == '--immutable' for a in uploaded))
            self.assertEqual(backup.google_env(self.env())['RCLONE_CONFIG_GOOGLE_SCOPE'], 'drive.file')
            self.assertEqual(receipt['target'], 'google')

    def test_verify_rejects_corruption_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'database.dump').write_bytes(b'data')
            manifest = {'format': 'teachers-math-backup-v1', 'files': {'database.dump': hashlib.sha256(b'data').hexdigest()}}
            (root / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(verify.verify(root), 1)
            (root / 'database.dump').write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                verify.verify(root)
            manifest['files'] = {'../outside': 'bad'}
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                verify.verify(root)


if __name__ == '__main__':
    unittest.main()
