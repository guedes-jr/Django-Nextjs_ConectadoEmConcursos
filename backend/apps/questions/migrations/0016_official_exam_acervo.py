from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("questions", "0015_question_search_run")]
    operations = [
        migrations.CreateModel(name="OfficialExamPortal", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("slug", models.SlugField(max_length=60, unique=True)), ("name", models.CharField(max_length=120)),
            ("catalog_url", models.URLField(max_length=600)), ("allowed_hosts", models.JSONField(default=list)),
            ("notes", models.TextField(blank=True)), ("is_active", models.BooleanField(default=True)),
            ("updated_at", models.DateTimeField(auto_now=True)),], options={"ordering": ["name"]}),
        migrations.CreateModel(name="OfficialExamDocument", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("title", models.CharField(max_length=300)), ("year", models.PositiveSmallIntegerField(blank=True, db_index=True, null=True)),
            ("organization", models.CharField(blank=True, max_length=150)), ("role", models.CharField(blank=True, max_length=180)),
            ("kind", models.CharField(choices=[("exam", "Prova"), ("answer_key_preliminary", "Gabarito preliminar"), ("answer_key_final", "Gabarito final")], max_length=28)),
            ("source_url", models.URLField(max_length=1000)), ("status", models.CharField(choices=[("discovered", "Descoberto"), ("review", "Aguardando conferência"), ("downloaded", "Baixado"), ("failed", "Falhou")], default="discovered", max_length=16)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("paired_with", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="paired_documents", to="questions.officialexamdocument")),
            ("portal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="documents", to="questions.officialexamportal")),], options={"ordering": ["-year", "title"]}),
        migrations.AddConstraint(model_name="officialexamdocument", constraint=models.UniqueConstraint(fields=("portal", "source_url"), name="official_exam_document_source_unique")),
    ]
