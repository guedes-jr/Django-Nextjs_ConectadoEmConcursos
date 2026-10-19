"""Playwright-owned server with a disposable database and synthetic fixtures."""
import os
from pathlib import Path
import sys
import signal
import tempfile

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.ci"

signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(0))

with tempfile.TemporaryDirectory(prefix="conectado-e2e-") as temporary:
    os.environ["E2E_TMP_DIR"] = temporary
    import django
    django.setup()
    from django.core.management import call_command
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Group
    from django.utils import timezone
    from allauth.account.models import EmailAddress
    from apps.billing.models import PaymentEvent
    from apps.questions.models import Question

    call_command("migrate", verbosity=0, interactive=False)
    for name, staff, superuser in [("student", False, False), ("limited", True, False), ("admin", True, True)]:
        user = get_user_model().objects.create_user(name, email=f"{name}@example.test", password="E2e-only!Password-482", is_staff=staff, is_superuser=superuser)
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        if staff:
            user.groups.add(Group.objects.get(name="Administrador"))
    PaymentEvent.objects.create(event_id="evt_synthetic", invoice_id="in_synthetic", type="payment.succeeded",
                                amount_minor=12345, currency="brl", paid_at=timezone.now(),
                                plan_slug="padrao", plan_name="Padrão E2E", billing_cycle="mensal")
    Question.objects.create(discipline="Português", banca="FGV", year=2026,
                            statement="Concordância verbal: qual alternativa está correta?",
                            options=["Os candidatos estudam.", "Os candidatos estuda."], correct_answer=0,
                            explanation="O verbo concorda com o sujeito no plural.", status="approved")
    from apps.concursos.models import NewsArticle
    NewsArticle.objects.create(source="e2e", external_id="news", origin="imported", slug="noticia-automatica",
                               title="Notícia automática de concurso", category="Prazos", body="Atualização da fonte.",
                               source_url="https://example.test/noticia", editorial_status="published", is_published=True)
    try:
        call_command("runserver", "127.0.0.1:8100", use_reloader=False, verbosity=0)
    finally:
        from django.db import connections
        connections.close_all()
