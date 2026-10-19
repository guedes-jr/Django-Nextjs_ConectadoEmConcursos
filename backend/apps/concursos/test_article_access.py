from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.concursos.models import ArticleView, NewsArticle


class ArticleAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user('reader'))

    def article(self, slug, **changes):
        return NewsArticle.objects.create(source='manual', external_id=slug, origin='manual', slug=slug,
                                         title=slug, body='<p>Conteúdo <strong>formatado</strong>.</p>', **changes)

    def test_common_user_reads_published_article_without_external_url(self):
        item = self.article('publicado', editorial_status='published', is_published=True)
        response = self.client.get('/api/articles/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['slug'], item.slug)
        self.assertEqual(response.data['results'][0]['source_url'], '')
        response = self.client.get(f'/api/articles/{item.slug}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['body'], item.body)
        self.assertEqual(ArticleView.objects.filter(article=item).count(), 1)
        self.assertEqual(self.client.get('/api/backoffice/content/editorial/artigos/').status_code, 403)

    def test_nonpublished_states_and_disabled_article_are_not_available(self):
        for state in ['draft', 'scheduled', 'archived']:
            item = self.article(state, editorial_status=state, is_published=True)
            self.assertEqual(self.client.get(f'/api/articles/{item.slug}/').status_code, 404)
        self.article('disabled', editorial_status='published', is_published=False)
        self.assertEqual(self.client.get('/api/articles/').data['count'], 0)
        self.assertEqual(ArticleView.objects.count(), 0)

    def test_imported_news_remains_available(self):
        item = NewsArticle.objects.create(source='pci', external_id='imported', slug='imported', title='Importada',
                                         source_url='https://example.test/noticia', is_published=True)
        response = self.client.get(f'/api/news/{item.slug}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['source_url'], item.source_url)

    def test_origins_are_separate_in_search_facets_and_details(self):
        article = self.article('manual', editorial_status='published', category='Estudos')
        news = NewsArticle.objects.create(source='pci', external_id='news', slug='news', title='Atualização', category='Prazos')
        for endpoint, own, other in [('articles', article, news), ('news', news, article)]:
            response = self.client.get(f'/api/{endpoint}/?facets=1')
            self.assertEqual(response.data['count'], 1)
            self.assertEqual(response.data['results'][0]['slug'], own.slug)
            self.assertEqual(response.data['facets']['categories'], [{'category': own.category, 'count': 1}])
            self.assertEqual(self.client.get(f'/api/{endpoint}/{other.slug}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/{endpoint}/', {'search': other.title}).data['count'], 0)
        self.assertEqual(ArticleView.objects.count(), 0)
