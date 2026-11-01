import csv
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from .models import NewsArticle


class ArticleCSVTests(TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        isolated=override_settings(BACKUP_DIR=self.root/'backups'); isolated.enable(); self.addCleanup(isolated.disable)
        self.path=self.root/'articles.csv'
        self.rows=[{'id':'abc123','title':'Uso dos porquês','subject':'portugues','category':'teoria','tags':'["guia"]',
                    'content':'<p>Texto formatado.</p>'+('<p>Conteúdo extenso.</p>'*10000),'is_published':'true',
                    'is_featured':'true','created_date':'2026-02-01T12:00:00','author':'Autora original','reading_time':'5'}]

    def run_import(self, apply=False):
        with self.path.open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=self.rows[0]);writer.writeheader();writer.writerows(self.rows)
        out=io.StringIO();call_command('import_articles_csv',str(self.path),apply=apply,stdout=out)
        return json.loads(out.getvalue())

    def test_preserves_large_body_metadata_publication_and_idempotency(self):
        self.assertEqual(self.run_import()['created'],1)
        self.assertFalse(NewsArticle.objects.exists())
        self.run_import(True)
        item=NewsArticle.objects.get()
        self.assertEqual(item.body,self.rows[0]['content'])
        self.assertEqual(item.origin,'manual')
        self.assertEqual(item.source_metadata['author'],'Autora original')
        self.assertTrue(item.is_published)
        self.assertEqual(self.run_import(True)['unchanged'],1)
        self.assertEqual(NewsArticle.objects.count(),1)
        item.title='Edição posterior';item.save()
        with self.assertRaises(CommandError):self.run_import(True)
        item.refresh_from_db();self.assertEqual(item.title,'Edição posterior')

    def test_duplicate_titles_keep_distinct_external_ids_and_drafts_stay_private(self):
        self.rows.append({**self.rows[0],'id':'def456','content':'<p>Outro conteúdo.</p>','is_published':'false'})
        self.run_import(True)
        self.assertEqual(NewsArticle.objects.count(),2)
        client=APIClient();client.force_authenticate(get_user_model().objects.create_user('csv-reader'))
        listing=client.get('/api/articles/').data
        self.assertEqual(listing['count'],1)
        self.assertEqual(listing['results'][0]['body'],'')
        self.assertEqual(listing['results'][0]['author_name'],'Autora original')
        self.assertEqual(listing['results'][0]['reading_time'],5)
        item=NewsArticle.objects.get(external_id='abc123')
        self.assertEqual(client.get(f'/api/articles/{item.slug}/').data['body'],self.rows[0]['content'])
        self.assertEqual(client.get('/api/news/').data['count'],0)

    def test_audit_failure_rolls_back_entire_import(self):
        with patch('apps.concursos.management.commands.import_articles_csv.log',side_effect=RuntimeError('audit failure')):
            with self.assertRaises(CommandError):self.run_import(True)
        self.assertFalse(NewsArticle.objects.exists())
