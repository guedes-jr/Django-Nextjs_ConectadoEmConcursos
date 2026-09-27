from datetime import timedelta
from io import StringIO
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.concursos.models import NewsArticle

class EditorialNewsTests(TestCase):
 def setUp(self):
  user=get_user_model().objects.create_user('editor',password='safe',is_staff=True); self.client=APIClient(); self.client.force_authenticate(user)
 def test_manual_article_starts_draft_and_can_publish(self):
  r=self.client.post('/api/backoffice/content/editorial/artigos/',{'title':'Artigo manual','body':'Conteúdo editorial'},format='json'); self.assertEqual(r.status_code,201); self.assertEqual(r.data['editorial_status'],'draft')
  r=self.client.patch(f"/api/backoffice/content/editorial/artigos/{r.data['id']}/",{'editorial_status':'published'},format='json'); self.assertEqual(r.status_code,200); self.assertTrue(r.data['is_published'])
 def test_scheduled_article_is_published_by_command(self):
  article=NewsArticle.objects.create(source='manual',external_id='manual:1',origin='manual',slug='agendado',title='Agendado',body='x',is_published=False,editorial_status='scheduled',scheduled_for=timezone.now()-timedelta(minutes=1))
  call_command('publish_scheduled_news',stdout=StringIO()); article.refresh_from_db(); self.assertEqual(article.editorial_status,'published'); self.assertTrue(article.is_published)
