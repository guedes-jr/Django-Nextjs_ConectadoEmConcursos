import json
from types import SimpleNamespace
from uuid import UUID

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from .observability import RequestObservabilityMiddleware


class ObservabilityTests(SimpleTestCase):
    def test_generated_id_is_valid_and_success_is_not_logged(self):
        request = RequestFactory().get("/api/me/?token=private")
        with self.assertNoLogs("conectado.errors", "ERROR"):
            response = RequestObservabilityMiddleware(lambda request: HttpResponse("ok"))(request)
        self.assertEqual(str(UUID(response["X-Request-ID"])), request.request_id)

    def test_valid_incoming_id_is_preserved(self):
        value = "9aa46ef6-4642-4d43-a9e8-0e86cdf55cf4"
        request = RequestFactory().get("/api/me/", HTTP_X_REQUEST_ID=value)
        response = RequestObservabilityMiddleware(lambda request: HttpResponse("ok"))(request)
        self.assertEqual(response["X-Request-ID"], value)

    def test_invalid_id_is_replaced_and_failure_metadata_has_no_payload_or_url(self):
        request = RequestFactory().post("/api/users/private-person/?token=secret-token", data={"password": "secret-password"}, HTTP_X_REQUEST_ID="untrusted-value")
        request.resolver_match = SimpleNamespace(route="api/users/<slug>/")
        with self.assertLogs("conectado.errors", "ERROR") as logs:
            response = RequestObservabilityMiddleware(lambda request: HttpResponse("secret-response", status=503))(request)
        event = json.loads(logs.records[0].message)
        self.assertEqual(event["status"], 503)
        self.assertEqual(event["route"], "api/users/<slug>/")
        self.assertEqual(event["request_id"], response["X-Request-ID"])
        self.assertNotIn("secret", str(event))
        self.assertNotIn("private-person", str(event))
        self.assertNotIn("untrusted-value", str(event))
