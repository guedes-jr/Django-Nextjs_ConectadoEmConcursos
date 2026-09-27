from django.db import migrations

PORTALS = [
    ("cnu", "CNU — Ministério da Gestão", "https://www.gov.br/gestao/pt-br/concursonacional/caderno-de-provas-e-gabaritos", ["www.gov.br"]),
    ("pf", "Polícia Federal", "https://www.gov.br/pf/pt-br/acesso-a-informacao/servidores/concursos/provas-e-gabaritos-de-concursos-anteriores", ["www.gov.br"]),
    ("enem", "INEP — ENEM", "https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos", ["www.gov.br", "download.inep.gov.br"]),
    ("enade", "INEP — ENADE", "https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enade/provas-e-gabaritos", ["www.gov.br", "download.inep.gov.br"]),
]


def seed(apps, schema_editor):
    Portal = apps.get_model("questions", "OfficialExamPortal")
    Source = apps.get_model("questions", "QuestionSource")
    for slug, name, url, hosts in PORTALS:
        Portal.objects.update_or_create(slug=slug, defaults={"name": name, "catalog_url": url, "allowed_hosts": hosts, "notes": "Consulte e confira documentos antes de baixar.", "is_active": True})
    Source.objects.filter(slug__in=["cnu-provas-gabaritos", "pf-provas-gabaritos", "inep-enem-provas", "inep-enade-provas", "educapes-questoes"], questions__isnull=True, runs__isnull=True).delete()


def unseed(apps, schema_editor):
    Portal = apps.get_model("questions", "OfficialExamPortal")
    Portal.objects.filter(slug__in=[item[0] for item in PORTALS], documents__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("questions", "0016_official_exam_acervo")]
    operations = [migrations.RunPython(seed, unseed)]
