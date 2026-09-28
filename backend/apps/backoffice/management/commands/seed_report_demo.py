from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.billing.models import PaymentEvent, Plan, Subscription
from apps.questions.models import Question, UserAnswer
from apps.studies.models import StudySession
from apps.workspace.models import SimulationRun


class Command(BaseCommand):
    help = "Cria dados locais de demonstração para validar relatórios. Nunca use em produção."

    def add_arguments(self, parser):
        parser.add_argument("--users", type=int, default=12)
        parser.add_argument("--clear", action="store_true", help="Remove apenas registros DEMO criados por este comando.")

    def handle(self, *args, **options):
        if not settings_debug():
            raise CommandError("Este comando só pode rodar com DEBUG=True.")
        User = get_user_model()
        if options["clear"]:
            users = User.objects.filter(username__startswith="demo-report-")
            PaymentEvent.objects.filter(user__in=users).delete()
            Subscription.objects.filter(user__in=users).delete()
            users.delete()
            self.stdout.write(self.style.WARNING("Dados DEMO removidos."))
            return
        monthly, _ = Plan.objects.get_or_create(slug="demo-mensal", defaults={"name":"Demo mensal", "monthly_price":Decimal("29.90"), "annual_price":Decimal("299.00")})
        question = Question.objects.first()
        now = timezone.now(); created = 0
        for index in range(options["users"]):
            user, made = User.objects.get_or_create(username=f"demo-report-{index+1}", defaults={"email":f"demo{index+1}@local.test", "is_active":True})
            if made: user.set_password("demo-local-only"); user.save(); created += 1
            status = Subscription.Status.ACTIVE if index % 3 else Subscription.Status.PENDING
            sub, _ = Subscription.objects.update_or_create(user=user, defaults={"plan":monthly,"status":status,"cycle":Subscription.Cycle.MONTHLY})
            if status == Subscription.Status.ACTIVE:
                PaymentEvent.objects.get_or_create(event_id=f"demo-payment-{user.id}", defaults={"type":PaymentEvent.Type.SUCCEEDED,"subscription":sub,"user":user,"payload":{"demo":True}})
            if question:
                UserAnswer.objects.get_or_create(user=user, question=question, defaults={"selected_answer":0,"is_correct":index % 2 == 0})
            SimulationRun.objects.get_or_create(user=user, discipline="Demo", defaults={"status":SimulationRun.Status.FINISHED,"score":7,"total":10,"finished_at":now-timedelta(days=index)})
        self.stdout.write(self.style.SUCCESS(f"{created} usuário(s) DEMO criado(s)."))


def settings_debug():
    from django.conf import settings
    return bool(settings.DEBUG)
