"""Start the local app with explicit, shell-free model and cached alignment entries.

Use --use-local-codex to reuse the user's existing Codex model and login.
This launcher never installs tools, downloads models, or creates credentials.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tomllib

ROOT = Path(__file__).resolve().parent.parent


def configure(args):
    environment = dict(os.environ)
    if args.use_local_codex:
        codex_home = Path(environment.get('CODEX_HOME', str(Path.home() / '.codex')))
        config_path = codex_home / 'config.toml'
        local = tomllib.loads(config_path.read_text(encoding='utf-8')) if config_path.is_file() else {}
        model = args.model or environment.get('SCENE_MODEL_MODEL') or local.get('model')
        if not model:
            raise ValueError('Specify --model or configure a model in the existing Codex installation.')
        native = shutil.which('codex.exe' if os.name == 'nt' else 'codex')
        if native and Path(native).suffix.lower() not in ('.cmd', '.bat', '.ps1'):
            command = [native]
        else:
            # npm installs a JS entry in addition to its Windows shell wrappers.
            node = shutil.which('node')
            js = Path(environment.get('APPDATA', '')) / 'npm/node_modules/@openai/codex/bin/codex.js'
            if not node or not js.is_file():
                raise ValueError('No native Codex or [node, codex.js] installation was found.')
            command = [node, str(js)]
        # Translation/cards are bounded structured-text tasks. Scope their effort
        # to this child process instead of inheriting a costly coding default.
        effort=getattr(args,'generation_effort','low')
        command += ['-c', 'model_reasoning_effort='+json.dumps(effort)]
        environment.update(SCENE_MODEL_PROVIDER='codex', SCENE_MODEL_MODEL=model,
                           SCENE_CODEX_COMMAND=json.dumps(command))
    elif args.model:
        environment['SCENE_MODEL_MODEL'] = args.model
    if args.local_alignment:
        library = ROOT / '.local-tools/alignment'
        candidates = []
        # Prefer the more accurate recognizer once explicitly installed. Keep
        # existing tiny-only installations usable, without downloading at launch.
        for name in ('base.en', 'tiny.en'):
            snapshots = ROOT / f'.local-tools/models/models--Systran--faster-whisper-{name}/snapshots'
            candidates = [p for p in snapshots.glob('*') if (p / 'model.bin').is_file()]
            if len(candidates) > 1:
                raise ValueError(f'Multiple cached {name} snapshots; configure SCENE_ALIGNMENT_COMMAND explicitly.')
            if candidates:
                break
        if not library.is_dir() or not candidates:
            raise ValueError('A cached base.en or tiny.en snapshot and the local alignment library are required.')
        environment['SCENE_ALIGNMENT_COMMAND'] = json.dumps([
            sys.executable, str(ROOT / 'scripts/align_local.py'),
            '--library-dir', str(library), '--model-dir', str(candidates[0])])
    environment.setdefault('SCENE_MODEL_TIMEOUT', '300')
    environment.setdefault('SCENE_DATA_DIR', str(ROOT / '.data'))
    environment['PYTHONUTF8'] = '1'
    return environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--use-local-codex', action='store_true')
    parser.add_argument('--local-alignment', action='store_true')
    parser.add_argument('--model')
    parser.add_argument('--generation-effort', choices=['low','medium','high','xhigh'], default='low')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--check', action='store_true', help='Validate settings without starting or calling a model.')
    args = parser.parse_args()
    try:
        environment = configure(args)
        os.environ.update(environment)
        sys.path.insert(0, str(ROOT))
        from server.model_adapter import settings
        from server.timing import alignment_identity
        model = settings()
        alignment = alignment_identity()
        if not alignment['configured']:
            raise ValueError('Configure SCENE_ALIGNMENT_COMMAND or use --local-alignment with the cached model.')
    except (ValueError, OSError) as error:
        parser.exit(2, f'Local service configuration failed: {error}\n')
    print(json.dumps({'provider': model['provider'], 'model': model['model'],
                      'executable': model['command'][0], 'alignment_configured': True,
                      'data_directory': environment['SCENE_DATA_DIR']}, ensure_ascii=False), flush=True)
    if not args.check:
        os.chdir(ROOT)
        os.execve(sys.executable, [sys.executable, '-m', 'uvicorn', 'server.app:app',
                                 '--host', '127.0.0.1', '--port', str(args.port)], environment)


if __name__ == '__main__':
    main()
