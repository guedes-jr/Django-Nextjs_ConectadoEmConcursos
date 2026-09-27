from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.questions.models import Question

class ManualQuestionsApiTests(TestCase):
 def setUp(self):
  user=get_user_model().objects.create_user('author',password='safe',is_staff=True); self.client=APIClient(); self.client.force_authenticate(user)
 def test_draft_then_submit_to_existing_queue(self):
  payload={'statement':'Questão manual completa','banca':'FGV','discipline':'Direito','year':2026,'options':['A','B'],'correct_answer':0,'source_url':'https://exemplo.gov.br/prova'}
  response=self.client.post('/api/backoffice/content/questions/manual/',payload,format='json'); self.assertEqual(response.status_code,201); self.assertEqual(response.data['status'],'draft')
  sent=self.client.post(f"/api/backoffice/content/questions/manual/{response.data['id']}/submit/",{},format='json'); self.assertEqual(sent.status_code,200); self.assertEqual(sent.data['status'],Question.Status.PENDING)
  self.assertEqual(self.client.get('/api/backoffice/content/questions/queue/').data['total'],1)
 def test_reference_is_required(self):
  response=self.client.post('/api/backoffice/content/questions/manual/',{'statement':'x','banca':'FGV','discipline':'D','year':2026,'options':['A','B'],'correct_answer':0},format='json'); self.assertEqual(response.status_code,400); self.assertIn('source_url',response.data)
