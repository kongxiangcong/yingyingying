"""Shared exact-answer rules, independent of video/review persistence."""
from pydantic import BaseModel, Field


def normalize(text):
    return text.strip().lower().replace('’', "'").replace('‘', "'")


class Answer(BaseModel):
    inputs: list[str]
    errors: int = Field(default=0, ge=0)
    highest_hint: int = Field(default=0, ge=0, le=3)
    completed: bool = False
    revealed: bool = False


def validate_answer(question, record, previous=None):
    data = dict(record)
    if len(data['inputs']) != len(question['tokens']):
        raise ValueError('空位数量不符')
    old_hint = previous['highest_hint'] if previous else 0
    data['highest_hint'] = max(old_hint, data['highest_hint'])
    data['errors'] = max(previous['errors'] if previous else 0, data['errors'])
    if data['highest_hint'] == 2 and old_hint == 0:
        raise ValueError('请先使用 Tips，再使用 Tips Pro')
    if data['revealed']:
        data['highest_hint'] = 3
    if data['highest_hint'] == 3:
        if not data['completed']:
            raise ValueError('揭晓必须记为完成')
        data['revealed'] = True
    if data['completed'] and not data['revealed']:
        effective = [token['word'] if data['highest_hint'] > 0 and index in question['hint_indices'] else data['inputs'][index] for index, token in enumerate(question['tokens'])]
        if any(normalize(value) != normalize(token['word']) for value, token in zip(effective, question['tokens'])):
            raise ValueError('原句尚未还原正确')
    return data


def answer_identity(record):
    return {key: record.get(key, 0 if key == 'generation' else None) for key in ('inputs', 'errors', 'highest_hint', 'completed', 'revealed', 'generation')}
