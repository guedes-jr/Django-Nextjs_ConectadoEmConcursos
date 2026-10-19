import hashlib
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.questions.models import Exam, Question, BancaCatalog
from .models import Concurso, ConcursoResource
from .test_resource_uploads import PDF


class ExamBundleTests(TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        isolated = override_settings(OFFICIAL_EXAMS_ROOT=self.root/'private', BACKUP_DIR=self.root/'backups')
        isolated.enable()
        self.addCleanup(isolated.disable)
        (self.root/'prova.pdf').write_bytes(PDF)
        self.manifest = self.root/'bundle.json'
        self.data = {'source_slug': 'local-test', 'name': 'Provas locais', 'contests': [{
            'key': 'test-2010', 'title': 'Concurso 2010', 'organization': 'Órgão', 'banca': 'Banca local', 'state': 'PI',
            'exams': [{'key': 'vigia-2010', 'title': 'Prova de Vigia', 'role': 'Vigia', 'year': 2010, 'level': 'Fundamental',
                       'questions': [{'number': 1, 'statement': 'Qual a alternativa correta?', 'options': ['Uma', 'Outra'],
                                      'correct_answer': 0, 'discipline': 'Português'}]}],
            'resources': [{'path': 'prova.pdf', 'title': 'Prova de Vigia', 'kind': 'exam', 'exam': 'vigia-2010',
                           'sha256': hashlib.sha256(PDF).hexdigest()}]}]}

    def run_import(self, apply=False):
        self.manifest.write_text(json.dumps(self.data))
        output = io.StringIO()
        call_command('import_exam_bundle', str(self.manifest), apply=apply, stdout=output)
        return json.loads(output.getvalue())

    def test_dry_run_no_writes_then_apply_and_repeat_preserve_review(self):
        self.assertFalse(self.run_import()['apply'])
        self.assertFalse(Concurso.objects.exists())
        self.assertFalse(BancaCatalog.objects.exists())
        self.assertEqual(self.run_import(True)['counts']['created'], 1)
        question = Question.objects.get()
        self.assertEqual(question.status, 'pending')
        self.assertEqual(question.exam.concurso, Concurso.objects.get())
        question.status = 'approved'
        question.save(update_fields=['status'])
        self.run_import(True)
        question.refresh_from_db()
        self.assertEqual(question.status, 'approved')
        self.assertEqual(Exam.objects.count(), 1)
        self.assertEqual(ConcursoResource.objects.count(), 1)
        self.assertEqual(len(list((self.root/'private').rglob('*.pdf'))), 1)

    def test_hash_mismatch_never_creates_content(self):
        self.data['contests'][0]['resources'][0]['sha256'] = 'wrong'
        with self.assertRaises(CommandError):
            self.run_import(True)
        self.assertFalse(Concurso.objects.exists())

    def test_failure_rolls_back_database_and_saved_files(self):
        def fail_after_file(**event):
            if event['action'] == 'concurso.resource_created':
                raise RuntimeError('audit failure')
        with patch('apps.concursos.management.commands.import_exam_bundle.log', side_effect=fail_after_file):
            with self.assertRaises(CommandError):
                self.run_import(True)
        self.assertFalse(Concurso.objects.exists())
        self.assertFalse(Question.objects.exists())
        self.assertEqual(list((self.root/'private').rglob('*.pdf')), [])

    def test_same_short_stem_with_different_options_keeps_both_question_numbers(self):
        questions = self.data['contests'][0]['exams'][0]['questions']
        questions.append({**questions[0], 'number': 2, 'options': ['Terceira', 'Quarta']})
        self.assertEqual(self.run_import(True)['counts']['created'], 2)
        self.assertEqual(set(Question.objects.values_list('number', flat=True)), {1, 2})
