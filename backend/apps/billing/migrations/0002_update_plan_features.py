from django.db import migrations


def update_features(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    features = {
        "gratis": ["20 questões por dia", "5 mensagens locais por dia", "Estatísticas básicas"],
        "padrao": ["Questões ilimitadas", "50 mensagens de IA por dia", "Estatísticas completas"],
        "avancado": ["Questões ilimitadas", "200 mensagens de IA por dia", "Contexto de provas e questões no chat"],
    }
    for slug, values in features.items():
        Plan.objects.filter(slug=slug).update(features=values)


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(update_features, migrations.RunPython.noop)]
