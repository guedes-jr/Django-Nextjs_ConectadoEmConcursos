from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.questions.models import Question

class ManualQuestionsApiTests(TestCase):
 def setUp(self):
  user=get_user_model().objects.create_user('author',password='safe',is_staff=True); user.groups.add(Group.objects.get(name="Administrador")); self.client=APIClient(); self.client.force_authenticate(user)
 def test_draft_then_submit_to_existing_queue(self):
  payload={'statement':'Questão manual completa','banca':'FGV','discipline':'Direito','year':2026,'options':['A','B'],'correct_answer':0,'source_url':'https://exemplo.gov.br/prova'}
  response=self.client.post('/api/backoffice/content/questions/manual/',payload,format='json'); self.assertEqual(response.status_code,201); self.assertEqual(response.data['status'],'draft')
  sent=self.client.post(f"/api/backoffice/content/questions/manual/{response.data['id']}/submit/",{},format='json'); self.assertEqual(sent.status_code,200); self.assertEqual(sent.data['status'],Question.Status.PENDING)
  self.assertEqual(self.client.get('/api/backoffice/content/questions/queue/').data['total'],1)
 def test_reference_is_optional_and_admin_can_publish(self):
  response=self.client.post('/api/backoffice/content/questions/manual/',{'statement':'x','banca':'FGV','discipline':'D','year':2026,'options':['A','B'],'correct_answer':0},format='json'); self.assertEqual(response.status_code,201); self.assertEqual(response.data['status'], Question.Status.DRAFT)
  published=self.client.post(f"/api/backoffice/content/questions/manual/{response.data['id']}/publish/",{},format='json'); self.assertEqual(published.status_code,200); self.assertEqual(published.data['status'],Question.Status.APPROVED)
  self.assertTrue(Question.objects.filter(pk=response.data['id'],status=Question.Status.APPROVED).exists())

 def test_filter_imported_pending_questions_by_exam_and_source(self):
  from apps.questions.models import Exam, QuestionSource
  source=QuestionSource.objects.create(slug='local-exams-test',name='Provas locais')
  first=Exam.objects.create(title='Cargo A',banca='FGV',year=2010)
  second=Exam.objects.create(title='Cargo B',banca='FGV',year=2010)
  for exam in [first,second]:
   Question.objects.create(source=source,exam=exam,status='pending',statement=f'Questão do cargo {exam.pk}',discipline='Português',banca='FGV',year=2010,options=['A','B'],correct_answer=0)
  url='/api/backoffice/content/questions/manual/'
  response=self.client.get(url,{'source':source.slug,'exam':first.pk,'status':'pending','page':1})
  self.assertEqual(response.status_code,200)
  self.assertEqual(response.data['count'],1)
  self.assertEqual(response.data['results'][0]['exam_id'],first.pk)
  self.assertEqual(self.client.get(url,{'exam':'invalid'}).status_code,400)
