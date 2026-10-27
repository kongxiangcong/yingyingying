"""The normal local launcher must prefer an installed, stronger recognizer."""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_launcher', PROJECT/'scripts/start_local.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LocalAlignmentSelectionTest(unittest.TestCase):
    def exercise(self, models):
        scratch = PROJECT/'.scratch/peppa-library'
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            root = Path(directory)
            (root/'.local-tools/alignment').mkdir(parents=True)
            for model in models:
                snapshot = root/f'.local-tools/models/models--Systran--faster-whisper-{model}/snapshots/cached'
                snapshot.mkdir(parents=True)
                (snapshot/'model.bin').write_bytes(b'config-selection-only')
            original = launcher.ROOT
            launcher.ROOT = root
            try:
                config = launcher.configure(argparse.Namespace(use_local_codex=False,model=None,local_alignment=True))
                return json.loads(config['SCENE_ALIGNMENT_COMMAND'])[-1]
            finally:
                launcher.ROOT = original

    def test_prefers_installed_base_for_normal_learning(self):
        self.assertIn('faster-whisper-base.en', self.exercise(['tiny.en','base.en']))

    def test_still_supports_tiny_only_installations(self):
        self.assertIn('faster-whisper-tiny.en', self.exercise(['tiny.en']))

    def test_generation_effort_is_local_to_the_child_command(self):
        with tempfile.TemporaryDirectory(dir=PROJECT/'.scratch/peppa-library') as directory:
            with mock.patch.dict(launcher.os.environ, {'CODEX_HOME': directory}), mock.patch.object(launcher.shutil,'which',return_value='C:/codex/codex.exe'):
                args=argparse.Namespace(use_local_codex=True,model='gpt-6.1-sol',local_alignment=False,generation_effort='low')
                config=launcher.configure(args)
            command=json.loads(config['SCENE_CODEX_COMMAND'])
            self.assertIn('model_reasoning_effort="low"',command)
            self.assertEqual(config['SCENE_MODEL_MODEL'],'gpt-6.1-sol')


if __name__ == '__main__':
    unittest.main()
