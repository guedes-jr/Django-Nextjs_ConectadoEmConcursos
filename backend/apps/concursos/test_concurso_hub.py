from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from apps.questions.models import Exam, Question, OfficialExamDocument, OfficialExamPortal
from apps.workspace.models import SimulationRun
from .models import Concurso, ConcursoResource


class ConcursoHubTests(TestCase):
    def setUp(self):
        self.student = get_user_model().objects.create_user('hub-student')
        self.editor = get_user_model().objects.create_user('hub-editor', is_staff=True)
        self.editor.groups.add(Group.objects.get(name='Editor'))
        self.client = APIClient()
        self.client.force_authenticate(self.student)
        self.contest = Concurso.objects.create(source='manual', external_id='hub', title='Concurso integrado', official_url='https://example.test/concurso')
        self.exam = Exam.objects.create(title='Prova integrada', banca='FCC', year=2026, concurso=self.contest)
        self.other_exam = Exam.objects.create(title='Outro cargo', banca='FCC', year=2026, concurso=self.contest)
        self.url = f'/api/backoffice/content/editorial/concursos/{self.contest.pk}/resources/'

    def resource(self, title='Edital', **changes):
        return ConcursoResource.objects.create(concurso=self.contest, title=title, kind='notice', url='https://example.test/edital.pdf', **changes)

    def question(self, number, **changes):
        return Question.objects.create(exam=self.exam, number=number, statement=f'Questão {number}', banca='FCC', discipline='Português', year=2026, options=['A','B'], correct_answer=0, **changes)

    def test_student_reads_hub_only_with_published_resources_and_exams(self):
        common = self.resource(is_published=True)
        private = self.resource('Rascunho', is_published=False)
        own = self.resource('Arquivo da prova', exam=self.exam, is_published=True)
        other = self.resource('Outro cargo', exam=self.other_exam, is_published=True)
        hidden = Exam.objects.create(title='Oculta', banca='FCC', year=2026, concurso=self.contest, is_published=False)
        self.resource('Material oculto', exam=hidden, is_published=True)
        response = self.client.get(f'/api/concursos/{self.contest.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({x['id'] for x in response.data['resources']}, {common.pk, own.pk, other.pk})
        self.assertNotIn(hidden.pk, [x['id'] for x in response.data['exams']])
        response = self.client.get(f'/api/exams/{self.exam.pk}/materials/')
        self.assertEqual({x['id'] for x in response.data['results']}, {common.pk, own.pk})
        self.assertNotIn(private.pk, [x['id'] for x in response.data['results']])
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.contest.editorial_status = 'archived'
        self.contest.save()
        self.assertEqual(self.client.get(f'/api/concursos/{self.contest.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/concursos/').data['count'], 0)
        self.assertEqual(self.client.get(f'/api/exams/{self.exam.pk}/materials/').data['results'], [])
        self.assertIsNone(self.client.get(f'/api/exams/{self.exam.pk}/').data['concurso'])

    def test_full_exam_uses_approved_questions_in_number_order_and_preserves_history(self):
        second = self.question(2, status='approved')
        first = self.question(1, status='approved')
        self.question(3, status='pending')
        response = self.client.post('/api/questions/simulations/start/', {'full_exam': True, 'exam_ids': [self.exam.pk], 'discipline': 'Filtro incompatível', 'banca': 'Outra', 'year': 2000}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([x['id'] for x in response.data['questions']], [first.pk, second.pk])
        self.assertNotIn('correct_answer', response.data['questions'][0])
        run = SimulationRun.objects.get(pk=response.data['simulation_id'])
        self.assertEqual(run.question_ids, [first.pk, second.pk])
        self.assertEqual(run.exam_ids, [self.exam.pk])
        response = self.client.post('/api/questions/submit-simulation/', {'simulation_id': run.pk, 'answers': [{'question_id': first.pk,'selected_answer':0},{'question_id':second.pk,'selected_answer':0}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finished')
        self.assertEqual(self.client.get(f'/api/exams/{self.exam.pk}/').data['question_count'], 2)

    def test_editor_resource_crud_rejects_cross_contest_and_stale_changes(self):
        self.client.force_authenticate(self.editor)
        other = Concurso.objects.create(source='manual', external_id='other', title='Outro concurso')
        foreign = Exam.objects.create(title='Externa', banca='FCC', year=2026, concurso=other)
        data = {'title':'Edital publicado','kind':'notice','url':'https://example.test/edital.pdf','exam':foreign.pk}
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 400)
        data['exam'] = self.exam.pk
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['is_published'])
        item = response.data
        detail = f"{self.url}{item['id']}/"
        self.assertEqual(self.client.patch(detail, {'is_published': True,'updated_at':'old'}, format='json').status_code,409)
        changed = self.client.patch(detail, {'is_published':True,'updated_at':item['updated_at']}, format='json')
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.client.patch(f'/api/backoffice/content/editorial/provas/{self.exam.pk}/', {'concurso':other.pk}, format='json').status_code,400)
        self.assertEqual(self.client.delete(detail, {'updated_at':changed.data['updated_at']}, format='json').status_code,204)
        self.assertTrue(Exam.objects.filter(pk=self.exam.pk).exists())

    def test_acervo_link_is_explicit_and_does_not_expose_private_files(self):
        portal = OfficialExamPortal.objects.create(slug='hub',name='Portal',catalog_url='https://example.test/')
        doc = OfficialExamDocument.objects.create(portal=portal,title='Caderno oficial',kind='exam',source_url='https://example.test/prova.pdf')
        self.assertEqual(self.client.get(f'/api/exams/{self.exam.pk}/materials/').data['results'], [])
        self.client.force_authenticate(self.editor)
        data={'title':'Prova original','kind':'exam','official_document':doc.pk,'exam':self.exam.pk,'is_published':True}
        response=self.client.post(self.url,data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.client.post(self.url,{**data,"kind":"notice"},format="json").status_code,400)
        self.assertEqual(self.client.post(self.url,{**data,"url":"https://example.test/outro.pdf"},format="json").status_code,400)
        self.client.force_authenticate(self.student)
        payload=self.client.get(f'/api/exams/{self.exam.pk}/materials/').data['results'][0]
        self.assertEqual(payload['url'],doc.source_url)
        self.assertNotIn('official_document',payload)
        self.assertNotIn('file',payload)

    def test_imported_contest_allows_enrichment_without_rewriting_source(self):
        self.contest.origin='imported';self.contest.source_url='https://example.test/noticia';self.contest.save()
        self.client.force_authenticate(self.editor)
        response=self.client.patch(f'/api/backoffice/content/editorial/concursos/{self.contest.pk}/',{'official_url':'https://example.test/oficial','description':'Apresentação editorial'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.contest.refresh_from_db()
        self.assertEqual(self.contest.source_url,'https://example.test/noticia')
        self.assertEqual(self.contest.description,'Apresentação editorial')
        self.assertEqual(self.client.patch(f'/api/backoffice/content/editorial/concursos/{self.contest.pk}/',{'source_url':'https://example.test/novo'},format='json').status_code,409)
