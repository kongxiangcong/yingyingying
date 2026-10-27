"""The real worker must not ask for cards for acoustically rejected dialogue."""
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from server import app, preprocessing, preprocess_worker as worker


class GenerationEligibilityTest(unittest.TestCase):
    def test_only_certified_sentences_reach_card_generation(self):
        scratch=Path(__file__).resolve().parents[1]/'.scratch/peppa-library'
        original_connect=app.connect
        @contextmanager
        def closed_connection():
            connection=original_connect()
            try:
                with connection:yield connection
            finally:connection.close()
        with tempfile.TemporaryDirectory(dir=scratch) as directory, patch.object(app,'DATA',Path(directory)),patch.object(app,'connect',closed_connection):
            folder=Path(directory)/'media'/'material';folder.mkdir(parents=True)
            (folder/'video.mp4').write_bytes(b'opaque-media-external-certifier-controls-eligibility')
            cues=[{'id':'1','start_ms':2200,'end_ms':2700,'text':'This cannot align.'},
                  {'id':'2','start_ms':5200,'end_ms':5700,'text':'Try it again.'}]
            (folder/'subtitles.source').write_text('existing source subtitle','utf-8')
            config={'provider':'codex','model':'controlled-transport','command':['controlled'], 'timeout':1,'chunk_size':10,'max_attempts':1}
            with app.connect() as db:
                preprocessing.initialize(db)
                db.execute('INSERT INTO materials VALUES(?,?,?,?,?)',('material','sample.mp4',10000,'imported',json.dumps(cues)))
                db.execute('INSERT INTO preprocessing_tasks(id,material_id,status,stage,config,stages,lease) VALUES(?,?,?,?,?,?,?)',('task','material','queued','check',json.dumps(config),'[]','lease'))
            generated=[]
            def transport(config,stage,units,context,directory):
                if stage=='select':return {'selected_ids':[u['id'] for u in units]}
                generated.extend(u['id'] for u in units)
                if any(u['english']=='This cannot align.' for u in units):
                    raise ValueError('Attempted card generation for rejected audio')
                return {'questions':[{'unit_id':u['id'],'english':u['english'],'chinese':'再试一次。','hint_indices':[0],
                    'card':{'usage':'鼓励重试','pattern':'Try + 宾语','explanation':'祈使句','example':'Try this.','translation':'试试这个。'}} for u in units]}
            identity={'configured':True,'policy':'controlled-recognition'}
            def certify(material,questions,directory):
                accepted=[{**q,'pause_ms':4500,'start_ms':5200,'end_ms':5700} for q in questions if q['english']=='Try it again.']
                return accepted,{'policy':'controlled-recognition','engine':'test-only-external-certifier','fixture_only':True,'certificates':[],'alignment_identity':identity}
            with patch.object(worker,'request_model',side_effect=transport),patch('server.timing.alignment_identity',return_value=identity),patch('server.timing.certify_questions',side_effect=certify):
                worker.run('task','lease')
            with app.connect() as db:
                task=dict(db.execute('SELECT status,error,package_id FROM preprocessing_tasks WHERE id=?',('task',)).fetchone())
            self.assertEqual(task['status'],'succeeded',task['error'])
            self.assertEqual(generated,['u2'])


if __name__=='__main__':unittest.main()
