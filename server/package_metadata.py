"""Verifiable package source identity and an explicit non-secret config snapshot."""
import hashlib
import json
import os
import math
from pathlib import Path

PIPELINE_VERSION = 'scene-pipeline-v5'


def file_identity(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return {'sha256': digest.hexdigest(), 'size_bytes': path.stat().st_size}


def source_identity(material):
    from .app import DATA
    folder = DATA / 'media' / material['id']
    original = folder / 'subtitles.source'
    canonical = material['subtitles'].encode('utf-8')
    canonical_hash = hashlib.sha256(canonical).hexdigest()
    if original.is_file():
        subtitles = file_identity(original) | {'file_name': original.name, 'source_kind': 'uploaded-utf8', 'original_file_available': True}
    else:
        # Old versions discarded uploaded bytes. Preserve honest identity of the
        # canonical source actually available; never invent the original hash.
        reconstructed = folder / f'subtitles.canonical-{canonical_hash}.json'
        reconstructed.write_bytes(canonical)
        subtitles = file_identity(reconstructed) | {'file_name': reconstructed.name, 'source_kind': 'reconstructed-canonical-cues', 'original_file_available': False}
    subtitles['canonical_cues_sha256'] = canonical_hash
    return {'material_id': material['id'], 'media': file_identity(folder / 'video.mp4') | {'file_name': 'video.mp4'}, 'subtitles': subtitles}


def generation_snapshot(config=None):
    if config is None:
        return {'mode': 'imported-fixed-package', 'provider': 'local', 'model': None, 'prompt_version': None, 'alignment': {'configured': False, 'policy': 'trusted-fixed-package-import'}}
    from .model_adapter import PROMPT_VERSION
    from .timing import alignment_identity, MIN_CONFIDENCE, QUIET_DB
    alignment = alignment_identity()
    alignment = {key: alignment[key] for key in ('configured', 'policy', 'command_hash', 'sources', 'profile') if key in alignment}
    alignment.update(timeout_s=float(os.environ.get('SCENE_ALIGNMENT_TIMEOUT', '300')), min_word_confidence=MIN_CONFIDENCE, quiet_db=QUIET_DB)
    command = json.dumps(config['command'], separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    result = {'mode': 'generated', 'provider': config['provider'], 'model': config['model'], 'prompt_version': PROMPT_VERSION,
              'model_timeout_s': config['timeout'], 'context_chunk_size': config['chunk_size'], 'max_model_attempts': config['max_attempts'],
              'pipeline_version': PIPELINE_VERSION, 'command_sha256': hashlib.sha256(command).hexdigest(), 'alignment': alignment,
              'command_source_sha256s': [{'argument_index': index, 'sha256': file_identity(Path(argument))['sha256']} for index, argument in enumerate(config['command']) if Path(argument).suffix.lower() in ('.py', '.js') and Path(argument).is_file()]}
    if config['provider'] == 'deepseek':
        result.update(provider_id=config['model_provider'], harness_profile=config['profile'])
    return result


def public_provenance(payload):
    source = payload if isinstance(payload, dict) else {}
    strings = ('provider', 'model', 'prompt_version', 'provider_id', 'harness_profile', 'source_material_id', 'timing_method', 'alignment_engine')
    result = {key: source[key] for key in strings if isinstance(source.get(key), str)}
    if isinstance(source.get('source_cue_ids'), list):
        result['source_cue_ids'] = [value for value in source['source_cue_ids'] if isinstance(value, str)]
    if type(source.get('alignment_fixture_only')) is bool:
        result['alignment_fixture_only'] = source['alignment_fixture_only']
    if isinstance(source.get('timing_certificates'), list):
        numeric = ('first_word_ms', 'previous_word_end_ms', 'quiet_start_ms', 'quiet_end_ms', 'pause_ms', 'timestamp_padding_ms', 'min_word_confidence')
        result['timing_certificates'] = []
        for certificate in source['timing_certificates']:
            if isinstance(certificate, dict) and isinstance(certificate.get('question_id'), str):
                safe = {key: certificate[key] for key in numeric if type(certificate.get(key)) in (int, float) and math.isfinite(certificate[key])}
                result['timing_certificates'].append({'question_id': certificate['question_id'], **safe})
    return result
