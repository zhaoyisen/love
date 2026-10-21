import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("migrate-production-env.py")
spec = importlib.util.spec_from_file_location("migration", SCRIPT)
migration = importlib.util.module_from_spec(spec)
if SCRIPT.exists():
    spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.template = (SCRIPT.parent.parent / "server/.env.example").read_text(encoding="utf-8-sig")
        values = dict(line.split("=", 1) for line in self.template.splitlines() if line and not line.startswith("#"))
        values.update(MYSQL_PASSWORD='live-$TOKEN-# "quote" \\path', INTERNAL_OPERATION_TOKEN_HASH="")
        self.info = {
            "State": {"Running": True, "Health": {"Status": "healthy"}},
            "Config": {"Env": [f"{key}={value}" for key, value in values.items()] + ["PATH=/ignored"]},
            "HostConfig": {"Memory": 805306368, "NanoCpus": 500000000,
                           "PortBindings": {"8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8181"}]},
                           "LogConfig": {"Type": "json-file", "Config": {"max-size": "12m", "max-file": "4"}}},
        }

    def test_live_values_and_deployment_limits_replace_examples_without_importing_image_env(self):
        result = migration.render(self.template, self.info)
        self.assertIn('MYSQL_PASSWORD="live-$$TOKEN-# \\"quote\\" \\\\path"\n', result)
        self.assertIn('SERVER_HTTP_PORT="8181"\n', result)
        self.assertIn('APP_MEMORY_LIMIT="805306368"\n', result)
        self.assertIn('APP_CPU_LIMIT="0.5"\n', result)
        self.assertIn('LOG_MAX_SIZE="12m"\n', result)
        self.assertIn('INTERNAL_OPERATION_TOKEN_HASH=""\n', result)
        self.assertNotIn("PATH=", result)
        self.assertNotIn("IMAGE_TAG=", result)

    def test_missing_real_secret_does_not_fall_back_to_template(self):
        self.info["Config"]["Env"] = [value for value in self.info["Config"]["Env"] if not value.startswith("MYSQL_PASSWORD=")]
        with self.assertRaisesRegex(ValueError, "MYSQL_PASSWORD"):
            migration.render(self.template, self.info)

    def test_absent_optional_redis_credentials_stay_blank(self):
        self.info["Config"]["Env"] = [value for value in self.info["Config"]["Env"]
                                      if not value.startswith(("REDIS_PASSWORD=", "REDIS_USERNAME="))]
        result = migration.render(self.template, self.info)
        self.assertIn('REDIS_PASSWORD=""\n', result)
        self.assertIn('REDIS_USERNAME=""\n', result)

    def test_ambiguous_profile_or_log_defaults_refuse_instead_of_guessing(self):
        self.info["HostConfig"]["LogConfig"]["Config"].pop("max-size")
        with self.assertRaisesRegex(ValueError, "log"):
            migration.render(self.template, self.info)
        self.info["HostConfig"]["LogConfig"]["Config"]["max-size"] = "12m"
        self.info["Config"]["Env"] = [value for value in self.info["Config"]["Env"]
                                      if not value.startswith("SPRING_PROFILES_ACTIVE=")]
        with self.assertRaisesRegex(ValueError, "prod"):
            migration.render(self.template, self.info)

    def test_unhealthy_or_unexpected_ports_refuse_migration(self):
        self.info["State"]["Health"]["Status"] = "unhealthy"
        with self.assertRaises(ValueError):
            migration.render(self.template, self.info)
        self.info["State"]["Health"]["Status"] = "healthy"
        self.info["HostConfig"]["PortBindings"]["8080/tcp"].append({"HostIp": "::", "HostPort": "8181"})
        with self.assertRaisesRegex(ValueError, "port"):
            migration.render(self.template, self.info)

    def test_modified_existing_config_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            target.write_text("operator-owned-config", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "differs"):
                migration.install(target, self.template, "replacement", 988)
            self.assertEqual(target.read_text(), "operator-owned-config")

    def test_template_is_replaced_atomically_and_original_survives_a_write_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            target.write_text(self.template, encoding="utf-8")
            with patch.object(migration.os, "chown", create=True), patch.object(migration.os, "replace", side_effect=OSError("fixture")):
                with self.assertRaises(OSError):
                    migration.install(target, self.template, "replacement", 988)
            self.assertEqual(target.read_text(encoding="utf-8"), self.template)
            self.assertEqual([file.name for file in target.parent.iterdir()], [".env"])
            with patch.object(migration.os, "chown", create=True):
                migration.install(target, self.template, "replacement", 988)
            self.assertEqual(target.read_text(), "replacement")


if __name__ == "__main__":
    unittest.main()
