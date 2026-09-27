import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from apps.questions.ingest.sources import OfficialIndexAdapter, OpenDatasetAdapter


class SourceAdapterTests(SimpleTestCase):
    def test_open_dataset_uses_its_configured_path_without_file_filter(self):
        payload = [
            {
                "id": "reference-1",
                "statement": "Questão de referência sobre administração pública.",
                "options": ["Alternativa A", "Alternativa B"],
                "correct_answer": 1,
                "banca": "CEBRASPE",
                "year": 2024,
                "discipline": "Direito Administrativo",
                "exam_title": "Prova de referência",
            }
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "questions.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            adapter = OpenDatasetAdapter(config={"path": str(path)})
            self.assertNotIn("file", {spec.key for spec in adapter.filters()})

            result = adapter.fetch_questions({}, limit=20, page=1)

        self.assertEqual(result.total, 1)
        self.assertIsNone(result.next_page)
        self.assertEqual(result.items[0].external_id, "reference-1")

    @patch("apps.questions.ingest.sources.requests.get")
    def test_official_index_stops_when_response_has_no_next_page(self, get):
        response = Mock(status_code=200)
        response.json.return_value = {
            "results": [
                {
                    "id": "official-1",
                    "statement": "Questão oficial de referência.",
                    "options": ["A", "B"],
                    "correct_answer": 0,
                    "banca": "Órgão",
                    "year": 2024,
                    "discipline": "Conhecimentos Gerais",
                    "source_url": "https://example.test/prova/1",
                }
            ],
            "total": 1,
        }
        get.return_value = response
        adapter = OfficialIndexAdapter(
            source=SimpleNamespace(home_url="https://example.test/indice"),
            config={"item_url": "https://example.test/{banca}/{exam}"},
        )

        result = adapter.fetch_questions({"banca": "Órgão", "exam": "Prova"}, limit=20, page=1)

        self.assertIsNone(result.next_page)
        self.assertEqual(result.total, 1)
        self.assertEqual(result.warnings, [])
