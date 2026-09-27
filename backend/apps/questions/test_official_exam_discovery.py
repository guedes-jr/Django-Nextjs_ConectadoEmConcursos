from pathlib import Path

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "official_exam"

from unittest.mock import Mock, patch

from django.test import TestCase

from apps.questions.models import OfficialExamDocument, OfficialExamPortal
from apps.questions.official_exam_discovery import CNU_ORGANIZATION, discover


class CnuDiscoveryTests(TestCase):
    def setUp(self):
        self.portal, _ = OfficialExamPortal.objects.update_or_create(
            slug="cnu", defaults={"name": "CNU", "catalog_url": "https://www.gov.br/cnu", "allowed_hosts": ["www.gov.br"]}
        )

    @patch("apps.questions.official_exam_discovery.requests.get")
    def test_cnu_preview_classifies_blocks_and_excludes_external_links(self, get):
        response = Mock()
        response.headers = {"Content-Type": "text/html"}
        response.text = (FIXTURE_DIR / "cnu_catalog.html").read_text(encoding="utf-8")
        response.raise_for_status = Mock()
        get.return_value = response

        result = discover(self.portal)

        self.assertEqual(result["created"], 0)
        self.assertEqual(len(result["candidates"]), 2)
        proof, answer_key = result["candidates"]
        self.assertEqual(proof["kind"], OfficialExamDocument.Kind.EXAM)
        self.assertEqual(proof["organization"], CNU_ORGANIZATION)
        self.assertEqual(proof["role"], "Bloco temático 1")
        self.assertEqual(answer_key["kind"], OfficialExamDocument.Kind.ANSWER_KEY_FINAL)

    @patch("apps.questions.official_exam_discovery.requests.get")
    def test_cnu_persist_keeps_metadata(self, get):
        response = Mock()
        response.headers = {"Content-Type": "text/html"}
        response.headers = {"Content-Type": "text/html"}
        response.text = '<a href="/arquivos/bloco-2-prova-2024.pdf">Bloco 2 prova 2024</a>'
        response.raise_for_status = Mock()
        get.return_value = response

        result = discover(self.portal, persist=True)

        self.assertEqual(result["created"], 1)
        document = OfficialExamDocument.objects.get()
        self.assertEqual(document.organization, CNU_ORGANIZATION)
        self.assertEqual(document.role, "Bloco temático 2")

class PfDiscoveryTests(TestCase):
    def setUp(self):
        self.portal, _ = OfficialExamPortal.objects.update_or_create(
            slug="pf", defaults={"name": "PF", "catalog_url": "https://www.gov.br/pf", "allowed_hosts": ["www.gov.br"]}
        )

    @patch("apps.questions.official_exam_discovery.requests.get")
    def test_pf_preview_extracts_official_metadata(self, get):
        response = Mock()
        response.headers = {"Content-Type": "text/html"}
        response.text = (FIXTURE_DIR / "pf_catalog.html").read_text(encoding="utf-8")
        response.raise_for_status = Mock()
        get.return_value = response

        result = discover(self.portal)

        self.assertEqual(len(result["candidates"]), 2)
        proof, answer_key = result["candidates"]
        self.assertEqual(proof["kind"], OfficialExamDocument.Kind.EXAM)
        self.assertEqual(proof["organization"], "Polícia Federal")
        self.assertEqual(proof["role"], "Agente de Polícia Federal")
        self.assertEqual(answer_key["kind"], OfficialExamDocument.Kind.ANSWER_KEY_PRELIMINARY)

class EnemDiscoveryTests(TestCase):
    def setUp(self):
        self.portal, _ = OfficialExamPortal.objects.update_or_create(
            slug="enem", defaults={"name": "ENEM", "catalog_url": "https://www.gov.br/inep/enem", "allowed_hosts": ["www.gov.br", "download.inep.gov.br"]}
        )

    @patch("apps.questions.official_exam_discovery.requests.get")
    def test_enem_preview_detects_day_and_final_answer_key(self, get):
        response = Mock()
        response.headers = {"Content-Type": "text/html"}
        response.text = (FIXTURE_DIR / "enem_catalog.html").read_text(encoding="utf-8")
        response.raise_for_status = Mock()
        get.return_value = response

        result = discover(self.portal)

        self.assertEqual(len(result["candidates"]), 2)
        proof, answer_key = result["candidates"]
        self.assertEqual(proof["kind"], OfficialExamDocument.Kind.EXAM)
        self.assertEqual(proof["organization"], "INEP")
        self.assertEqual(proof["role"], "Dia 1")
        self.assertEqual(answer_key["kind"], OfficialExamDocument.Kind.ANSWER_KEY_FINAL)

class EnadeDiscoveryTests(TestCase):
    def setUp(self):
        self.portal, _ = OfficialExamPortal.objects.update_or_create(
            slug="enade", defaults={"name": "ENADE", "catalog_url": "https://www.gov.br/inep/enade", "allowed_hosts": ["www.gov.br", "download.inep.gov.br"]}
        )

    @patch("apps.questions.official_exam_discovery.requests.get")
    def test_enade_preview_extracts_course_and_answer_key(self, get):
        response = Mock()
        response.headers = {"Content-Type": "text/html"}
        response.text = (FIXTURE_DIR / "enade_catalog.html").read_text(encoding="utf-8")
        response.raise_for_status = Mock()
        get.return_value = response

        result = discover(self.portal)

        self.assertEqual(len(result["candidates"]), 2)
        proof, answer_key = result["candidates"]
        self.assertEqual(proof["kind"], OfficialExamDocument.Kind.EXAM)
        self.assertEqual(proof["organization"], "INEP")
        self.assertEqual(proof["role"], "Administração")
        self.assertEqual(answer_key["kind"], OfficialExamDocument.Kind.ANSWER_KEY_FINAL)
