import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("comments", Path(__file__).with_name("sync-env-comments.py"))
comments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comments)


class CommentSyncTests(unittest.TestCase):
    def test_values_unknown_keys_and_operator_comments_are_preserved(self):
        template = '# 密码说明\nMYSQL_PASSWORD=example\n# 用户名\nMYSQL_USERNAME=example\n'.encode()
        original = b"# operator note\r\nMYSQL_PASSWORD='live-$#= with space' # retained\r\nCUSTOM=keep\r\n"
        result, count = comments.render(template, original)
        self.assertEqual(count, 1)
        self.assertEqual(result, b"# operator note\r\n" + '# 密码说明\r\n'.encode() + original.split(b'\r\n', 1)[1])
        self.assertNotIn(b'MYSQL_USERNAME=', result)
        self.assertNotIn(b'example', result)
        self.assertEqual(comments.render(template, result), (result, 0))

    def test_bom_quotes_dollars_backslashes_and_no_final_newline_survive(self):
        template = '# 中文说明\nKEY=example\n'.encode()
        for value in [b'"live-$$TOKEN-# \\"quote\\" \\\\path"', b"'it\\'s secret'", b'', b'no-quotes']:
            with self.subTest(value=value):
                original = b'\xef\xbb\xbfKEY=' + value
                result, count = comments.render(template, original)
                self.assertEqual(count, 1)
                self.assertEqual(result, b'\xef\xbb\xbf' + '# 中文说明\n'.encode() + original[3:])

    def test_multiline_and_unsupported_syntax_refuse(self):
        for original in [b"KEY='first\nOTHER=inside\nlast'\n", b'export KEY=value\n', b'KEY="unterminated\n']:
            with self.assertRaises(ValueError):
                comments.render(b'# comment\nKEY=example\n', original)

    def test_real_template_adds_only_comments(self):
        template = (Path(__file__).parent.parent / 'server/.env.example').read_bytes()
        original = b'\n'.join(line for line in template.splitlines() if not line.startswith(b'#')) + b'\n'
        result, count = comments.render(template, original)
        self.assertEqual(count, 56)
        self.assertEqual(b'\n'.join(line for line in result.splitlines() if not line.startswith(b'#')) + b'\n', original)

    @unittest.skipUnless(os.name == 'posix', 'Requires Linux file ownership and permission semantics')
    def test_backup_metadata_and_failed_replace(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '.env'
            backup_dir = Path(directory) / 'backups'
            original = b'KEY=secret\n'
            content = b'# comment\n' + original
            target.write_bytes(original)
            target.chmod(0o640)
            metadata = target.stat()
            with patch.object(comments.os, 'chown', create=True) as chown:
                backup = comments.install(target, original, content, backup_dir)
            self.assertEqual(target.read_bytes(), content)
            self.assertEqual(Path(backup).read_bytes(), original)
            chown.assert_called_once_with(unittest.mock.ANY, metadata.st_uid, metadata.st_gid)
            if os.name != 'nt':
                self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o640)
                self.assertEqual(stat.S_IMODE(Path(backup).stat().st_mode), 0o600)
            with patch.object(comments.os, 'chown', create=True), patch.object(comments.os, 'replace', side_effect=OSError):
                with self.assertRaises(OSError):
                    comments.install(target, content, b'# new\n' + content, backup_dir)
            self.assertEqual(target.read_bytes(), content)
            self.assertFalse(list(target.parent.glob('.env-comments-*')))

    def test_modified_target_refuses_write(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '.env'
            target.write_bytes(b'KEY=operator-change\n')
            with self.assertRaises(ValueError):
                comments.install(target, b'KEY=old\n', b'# comment\nKEY=old\n', Path(directory) / 'backups')
            self.assertEqual(target.read_bytes(), b'KEY=operator-change\n')


if __name__ == '__main__':
    unittest.main()
