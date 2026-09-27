from hashlib import sha256
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from apps.questions.models import OfficialExamDocument, OfficialExamDownload, OfficialExamPortal
from apps.questions.official_exam_downloads import create_download, run


class OfficialExamDownloadTests(TestCase):
    def setUp(self):
        self.portal, _ = OfficialExamPortal.objects.update_or_create(
            slug="download-test",
            defaults={"name": "Portal teste", "catalog_url": "https://www.gov.br/teste", "allowed_hosts": ["www.gov.br"]},
        )
        self.document = OfficialExamDocument.objects.create(
            portal=self.portal, title="Prova teste", year=2025,
            kind=OfficialExamDocument.Kind.EXAM, source_url="https://www.gov.br/arquivo/prova.pdf",
        )

    def _private_storage(self):
        storage = OfficialExamDownload._meta.get_field("file").storage
        directory = TemporaryDirectory()
        previous = storage._location
        storage._location = directory.name
        storage.__dict__.pop("location", None)
        self.addCleanup(directory.cleanup)
        self.addCleanup(self._restore_storage, storage, previous)
        return storage

    @staticmethod
    def _restore_storage(storage, location):
        storage._location = location
        storage.__dict__.pop("location", None)

    @patch("apps.questions.official_exam_downloads.requests.get")
    def test_worker_saves_valid_pdf_with_hash_and_final_url(self, get):
        self._private_storage()
        response = Mock(status_code=200, url="https://www.gov.br/arquivo/prova.pdf")
        response.headers = {"Content-Type": "application/pdf", "Content-Length": "9"}
        response.iter_content.return_value = [b"%PDF-test"]
        get.return_value = response
        record = create_download(self.document, None)

        run(record.id)

        record.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(record.status, OfficialExamDownload.Status.DONE)
        self.assertEqual(record.sha256, sha256(b"%PDF-test").hexdigest())
        self.assertEqual(record.final_url, response.url)
        self.assertTrue(record.file.storage.exists(record.file.name))
        self.assertEqual(self.document.status, OfficialExamDocument.Status.DOWNLOADED)

    @patch("apps.questions.official_exam_downloads.requests.get")
    def test_worker_rejects_redirect_outside_allowlist(self, get):
        response = Mock(status_code=200, url="https://outside.invalid/prova.pdf")
        response.headers = {"Content-Type": "application/pdf"}
        get.return_value = response
        record = create_download(self.document, None)

        run(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, OfficialExamDownload.Status.FAILED)
        self.assertIn("domínios oficiais", record.error_message)
        self.assertEqual(record.final_url, response.url)

    @patch("apps.questions.official_exam_downloads.requests.get")
    def test_worker_rejects_html_even_with_pdf_url(self, get):
        response = Mock(status_code=200, url="https://www.gov.br/arquivo/prova.pdf")
        response.headers = {"Content-Type": "text/html"}
        get.return_value = response
        record = create_download(self.document, None)

        run(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, OfficialExamDownload.Status.FAILED)
        self.assertIn("Content-Type inválido", record.error_message)

    def test_create_download_rejects_parallel_attempt(self):
        create_download(self.document, None)

        with self.assertRaisesMessage(ValueError, "download em andamento"):
            create_download(self.document, None)

    @override_settings(OFFICIAL_EXAM_DOWNLOAD_LIMIT=1, OFFICIAL_EXAM_DOWNLOAD_WINDOW_SECONDS=3600)
    def test_create_download_applies_portal_rate_limit(self):
        create_download(self.document, None)
        other_document = OfficialExamDocument.objects.create(
            portal=self.portal, title="Outra prova", year=2025,
            kind=OfficialExamDocument.Kind.EXAM, source_url="https://www.gov.br/arquivo/outra-prova.pdf",
        )

        with self.assertRaisesMessage(ValueError, "Limite de downloads"):
            create_download(other_document, None)

    @patch("apps.questions.official_exam_downloads.requests.get")
    def test_worker_records_network_timeout(self, get):
        from requests import Timeout

        get.side_effect = Timeout("tempo esgotado")
        record = create_download(self.document, None)

        run(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, OfficialExamDownload.Status.FAILED)
        self.assertIn("tempo esgotado", record.error_message)
