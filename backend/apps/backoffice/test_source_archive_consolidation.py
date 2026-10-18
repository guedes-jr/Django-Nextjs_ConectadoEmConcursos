from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from apps.questions.models import OfficialExamDocument, OfficialExamPortal, QuestionSource

BASE = '/api/backoffice/content/official-exams'


class SourceArchiveConsolidationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('archive-editor', is_staff=True)
        self.user.groups.add(Group.objects.get(name='Editor'))
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.portal = OfficialExamPortal.objects.create(slug='archive-test', name='Portal', catalog_url='https://www.gov.br')

    def document(self, index, kind='exam'):
        return OfficialExamDocument.objects.create(portal=self.portal, title=f'Documento {index:03}', kind=kind, source_url=f'https://www.gov.br/{index}.pdf', year=2026)

    def test_archive_paginates_beyond_legacy_limit_and_clamps_page(self):
        OfficialExamDocument.objects.bulk_create([OfficialExamDocument(portal=self.portal, title=f'Prova {i}', kind='exam', source_url=f'https://www.gov.br/{i}.pdf') for i in range(205)])
        response = self.client.get(f'{BASE}/documents/', {'page': 99, 'page_size': 12})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 205)
        self.assertEqual(response.data['page'], 18)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['overview']['pending'], 205)
        self.assertTrue(response.data['can_manage'])

    def test_filtered_export_matches_list_and_global_overview(self):
        self.document(1)
        key = self.document(2, 'answer_key_final')
        params = {'category': 'keys', 'search': '002'}
        listing = self.client.get(f'{BASE}/documents/', {**params, 'page': 1})
        exported = self.client.get(f'{BASE}/export/', params)
        self.assertEqual([r['id'] for r in listing.data['results']], [key.id])
        self.assertEqual([r['id'] for r in exported.data['documents']], [key.id])
        self.assertEqual(listing.data['overview']['total'], 2)
        self.assertEqual(self.client.get(f'{BASE}/documents/', {'page': 1, 'year': 'invalid'}).status_code, 400)

    def test_pair_candidates_are_searchable_and_exclude_taken_and_other_portals(self):
        proof = self.document(1)
        key = self.document(2, 'answer_key_final')
        taken = self.document(3, 'answer_key_final')
        taken.paired_with = self.document(4)
        taken.save()
        response = self.client.get(f'{BASE}/documents/', {'page': 1, 'compatible_with': proof.id})
        self.assertEqual([r['id'] for r in response.data['results']], [key.id])
        self.assertEqual(self.client.get(f'{BASE}/documents/', {'page': 1, 'compatible_with': 'invalid'}).status_code, 400)

    def test_source_catalog_filters_preserve_legacy_contract(self):
        QuestionSource.objects.create(name='Pronta', slug='ready-test', is_active=True, license_name='CC BY')
        QuestionSource.objects.create(name='Inativa', slug='inactive-test', is_active=False)
        response = self.client.get('/api/backoffice/content/sources/catalog/', {'page': 1, 'availability': 'ready', 'search': 'Pronta'})
        self.assertEqual(response.data['count'], 1)
        self.assertGreaterEqual(response.data['overview']['total'], 2)
        self.assertFalse(response.data['can_configure'])
        self.assertTrue(response.data['can_manage'])
        legacy = self.client.get('/api/backoffice/content/sources/catalog/')
        self.assertIn('results', legacy.data)
        self.assertNotIn('page', legacy.data)

    def test_reader_can_browse_but_cannot_register(self):
        self.user.groups.clear()
        self.document(1)
        self.assertFalse(self.client.get(f'{BASE}/documents/', {'page': 1}).data['can_manage'])
        self.assertEqual(self.client.post(f'{BASE}/documents/', {}, format='json').status_code, 403)
