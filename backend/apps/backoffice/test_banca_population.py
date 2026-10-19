from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from apps.concursos.models import Concurso
from apps.questions.models import BancaAlias, BancaCatalog, Exam, Question
from .banca_catalog import populate_catalog


class BancaPopulationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('banca-editor', is_staff=True)
        self.user.groups.add(Group.objects.get(name='Editor'))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_full_catalog_is_idempotent_and_preserves_history_and_editorial_fields(self):
        exam = Exam.objects.create(title='Prova histórica', banca='Fundação Carlos Chagas - FCC', year=2025)
        report = populate_catalog(apply=True)
        self.assertEqual(report['created'], 53)
        exam.refresh_from_db()
        self.assertEqual(exam.banca, 'Fundação Carlos Chagas - FCC')
        self.assertEqual(exam.banca_catalog.name, 'FCC')
        bank = exam.banca_catalog
        bank.description = 'Descrição editorial preservada'
        bank.save()
        second = populate_catalog(apply=True)
        self.assertEqual(second['created'], 0)
        self.assertEqual(second['aliases_created'], 0)
        self.assertEqual(second['exams_linked'], 0)
        bank.refresh_from_db()
        self.assertEqual(bank.description, 'Descrição editorial preservada')

    def test_dry_run_rolls_back_catalog_and_links(self):
        exam = Exam.objects.create(title='Histórica', banca='CESPE/UnB', year=2020)
        report = populate_catalog()
        self.assertEqual(report['exams_linked'], 1)
        self.assertFalse(BancaCatalog.objects.exists())
        self.assertFalse(BancaAlias.objects.exists())
        exam.refresh_from_db()
        self.assertIsNone(exam.banca_catalog_id)

    def test_future_exam_saves_resolve_alias_and_partial_updates_follow_banca(self):
        first = BancaCatalog.objects.create(name='FCC')
        second = BancaCatalog.objects.create(name='FGV')
        BancaAlias.objects.create(banca=first, alias='Carlos Chagas')
        exam = Exam.objects.create(title='Teste', banca='carlos chagas', year=2026)
        self.assertEqual(exam.banca_catalog_id, first.id)
        exam.banca = 'FGV'
        exam.save(update_fields=['banca'])
        exam.refresh_from_db()
        self.assertEqual(exam.banca_catalog_id, second.id)

    def test_banca_payload_counts_aliases_and_actual_relations(self):
        bank = BancaCatalog.objects.create(name='FCC')
        BancaAlias.objects.create(banca=bank, alias='Fundação Carlos Chagas')
        Exam.objects.create(title='Histórica', banca='Fundação Carlos Chagas', year=2025)
        Question.objects.create(statement='Enunciado', banca='Fundação Carlos Chagas', year=2025, discipline='Português', options=['a','b'], correct_answer=0)
        Concurso.objects.create(title='Concurso', source='manual', external_id='1', banca=bank)
        row = self.client.get(f'/api/backoffice/content/bancas/{bank.id}/').data
        self.assertEqual((row['questions_count'],row['exams_count'],row['concursos_count']), (1,1,1))
        options = self.client.get('/api/backoffice/content/bancas/', {'options':'1'}).data
        self.assertEqual(options['results'][0]['aliases'], ['Fundação Carlos Chagas'])

    def test_editorial_link_on_imported_concurso_and_filtered_lists(self):
        bank = BancaCatalog.objects.create(name='FCC')
        concurso = Concurso.objects.create(title='Importado', source='pci', external_id='1', origin='imported')
        response = self.client.patch(f'/api/backoffice/content/editorial/concursos/{concurso.id}/', {'banca':bank.id}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['banca_name'], 'FCC')
        denied = self.client.patch(f'/api/backoffice/content/editorial/concursos/{concurso.id}/', {'title':'Alterado','banca':bank.id}, format='json')
        self.assertEqual(denied.status_code, 409)
        response = self.client.post('/api/backoffice/content/editorial/provas/', {'title':'Prova', 'year':2026, 'banca_catalog':bank.id,'concurso':concurso.id}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['banca_catalog'], bank.id)
        self.assertEqual(self.client.get('/api/backoffice/content/editorial/provas/', {'banca_catalog':bank.id,'page':1}).data['count'], 1)
        other = BancaCatalog.objects.create(name='Outra')
        mismatch = self.client.post('/api/backoffice/content/editorial/provas/', {'title':'Outra', 'year':2026, 'banca_catalog':other.id,'concurso':concurso.id}, format='json')
        self.assertEqual(mismatch.status_code, 400)

    def test_concurso_without_evidence_is_not_inferred_from_title(self):
        concurso = Concurso.objects.create(title='Concurso FGV hipotético', source='manual', external_id='unverified')
        populate_catalog(apply=True)
        concurso.refresh_from_db()
        self.assertIsNone(concurso.banca_id)

    def test_reviewed_source_links_are_exact_and_do_not_overwrite_editorial_assignment(self):
        import json
        from .banca_catalog import DEFAULT_CATALOG
        link = json.loads(DEFAULT_CATALOG.read_text())['concurso_links'][0]
        concurso = Concurso.objects.create(title='Prefeitura de Cruzeta - RN', source='pci', external_id='reviewed', source_url=link['source_url'])
        report = populate_catalog(apply=True)
        concurso.refresh_from_db()
        self.assertEqual(concurso.banca.name, 'IDIB')
        self.assertEqual(report['concursos_linked'], 1)
        other = BancaCatalog.objects.get(name='FGV')
        concurso.banca = other
        concurso.save()
        report = populate_catalog(apply=True)
        concurso.refresh_from_db()
        self.assertEqual(concurso.banca, other)
        self.assertTrue(any(row['reason']=='existing_editorial_assignment' for row in report['conflicts']))

    def test_alias_duplicate_is_rejected_and_inactive_bank_cannot_be_assigned(self):
        bank = BancaCatalog.objects.create(name='FCC')
        BancaAlias.objects.create(banca=bank, alias='Carlos Chagas')
        Exam.objects.create(title='Mesma prova', banca='Carlos Chagas', year=2026)
        duplicate = self.client.post('/api/backoffice/content/editorial/provas/', {'title':'Mesma prova','year':2026,'banca_catalog':bank.id}, format='json')
        self.assertEqual(duplicate.status_code, 400)
        bank.is_active=False
        bank.save()
        inactive = self.client.post('/api/backoffice/content/editorial/provas/', {'title':'Outra prova','year':2026,'banca_catalog':bank.id}, format='json')
        self.assertEqual(inactive.status_code, 400)

    def test_unanimous_exam_links_require_complete_evidence(self):
        concurso = Concurso.objects.create(title='Concurso', source='manual', external_id='derived')
        Exam.objects.create(title='Uma', banca='FCC', year=2025, concurso=concurso)
        Exam.objects.create(title='Outra', banca='', year=2025, concurso=concurso)
        populate_catalog(apply=True)
        concurso.refresh_from_db()
        self.assertIsNone(concurso.banca_id)
