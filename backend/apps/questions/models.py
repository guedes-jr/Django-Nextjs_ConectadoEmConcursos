from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify
from django.utils import timezone

from apps.questions.naming import banca_key
from .storages import official_exam_storage

# Fonte usada para o conteúdo que já existia antes das Questões/Fontes e para o
# `import_content`. Nasce inativa: a licença do conteúdo pré-existente precisa ser
# verificada antes de a fonte passar a ser usada em busca.
LEGACY_SOURCE_SLUG = "legacy"


class Exam(models.Model):
    title = models.CharField(max_length=200)
    banca = models.CharField(max_length=100, db_index=True)
    institution = models.CharField(max_length=160, blank=True, db_index=True)
    role = models.CharField(max_length=160, blank=True, db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    level = models.CharField(max_length=40, blank=True, db_index=True)
    state = models.CharField(max_length=2, blank=True, db_index=True)
    is_published = models.BooleanField(default=True, db_index=True)
    concurso = models.ForeignKey("concursos.Concurso", null=True, blank=True, on_delete=models.SET_NULL, related_name="exams")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_exams")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_exams")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "banca", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["title", "banca", "year"], name="unique_exam_title_banca_year"
            )
        ]

    def __str__(self):
        return f"{self.banca} - {self.title} ({self.year})"


class BancaCatalog(models.Model):
    """Catálogo editorial de bancas, sem substituir os campos textuais existentes."""

    name = models.CharField(max_length=100)
    normalized_name = models.CharField(max_length=120, unique=True, editable=False)
    slug = models.SlugField(max_length=120, unique=True)
    official_url = models.URLField(max_length=600, blank=True)
    description = models.TextField(blank=True)
    image_url = models.URLField(max_length=600, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_banca_catalogs",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="updated_banca_catalogs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def clean(self):
        self.name = " ".join((self.name or "").split())
        if not self.name:
            raise ValidationError({"name": "Informe o nome canônico da banca."})
        self.normalized_name = banca_key(self.name)
        if BancaAlias.objects.filter(
            normalized_alias=self.normalized_name
        ).exists():
            raise ValidationError({"name": "Este nome já está cadastrado como alias de outra banca."})

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120]
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class BancaAlias(models.Model):
    """Grafia alternativa que resolve para uma banca canônica."""

    banca = models.ForeignKey(BancaCatalog, on_delete=models.CASCADE, related_name="aliases")
    alias = models.CharField(max_length=100)
    normalized_alias = models.CharField(max_length=120, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["alias"]

    def clean(self):
        self.alias = " ".join((self.alias or "").split())
        if not self.alias:
            raise ValidationError({"alias": "Informe uma grafia alternativa."})
        self.normalized_alias = banca_key(self.alias)
        catalog_match = BancaCatalog.objects.exclude(pk=self.banca_id).filter(
            normalized_name=self.normalized_alias
        ).exists()
        if catalog_match:
            raise ValidationError({"alias": "Este alias coincide com o nome canônico de outra banca."})
        if self.banca_id and self.normalized_alias == self.banca.normalized_name:
            raise ValidationError({"alias": "O alias não pode repetir o nome canônico da própria banca."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.alias} → {self.banca.name}"


class QuestionSource(models.Model):
    """Base de conteúdo de onde as questões são importadas.

    A fonte é a unidade de proveniência: uma execução de busca (`SearchRun`) usa
    exatamente uma fonte, e toda questão importada guarda de onde veio.
    """

    class Kind(models.TextChoices):
        OPEN_DATASET = "open_dataset", "Dataset aberto"
        PUBLIC_API = "public_api", "API pública"
        OFFICIAL_INDEX = "official_index", "Índice oficial"
        LOCAL_FILE = "local_file", "Arquivo local"

    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(
        max_length=20, choices=Kind.choices, default=Kind.LOCAL_FILE, db_index=True
    )
    home_url = models.URLField(max_length=600, blank=True)
    license_name = models.CharField(max_length=120, blank=True)
    license_url = models.URLField(max_length=600, blank=True)
    attribution = models.CharField(max_length=300, blank=True)
    requires_attribution = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False, db_index=True)
    cached_facets = models.JSONField(default=dict, blank=True)
    facets_at = models.DateTimeField(null=True, blank=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SearchRun(models.Model):
    """Uma execução de busca em uma fonte, com os filtros usados e o resultado.

    É ao mesmo tempo o histórico dos filtros (permite repetir ou continuar a
    mesma busca) e a trilha de auditoria da importação.
    """

    class Status(models.TextChoices):
        RUNNING = "running", "Em execução"
        DONE = "done", "Concluída"
        PARTIAL = "partial", "Parcial"
        FAILED = "failed", "Falhou"
        CANCELLED = "cancelled", "Cancelada"

    name = models.CharField(max_length=200, blank=True)
    source = models.ForeignKey(
        QuestionSource, on_delete=models.PROTECT, related_name="runs"
    )
    filters = models.JSONField(default=dict, blank=True)
    fingerprint = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.RUNNING, db_index=True
    )
    next_page = models.PositiveIntegerField(null=True, blank=True)
    limit = models.PositiveIntegerField(default=500)
    counts = models.JSONField(default=dict, blank=True)
    duplicates_preview = models.JSONField(default=list, blank=True)
    log_path = models.CharField(max_length=300, blank=True)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="runs"
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="question_search_runs",
    )
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(
                fields=["fingerprint", "-started_at"],
                name="questions_run_fingerprint_idx",
            )
        ]

    def __str__(self):
        return self.name or f"{self.source_id} · {self.started_at:%d/%m/%Y %H:%M}"


class Question(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        PENDING = "pending", "Na fila de aprovação"
        APPROVED = "approved", "Aprovada"
        REJECTED = "rejected", "Rejeitada"

    external_id = models.CharField(max_length=64, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_questions",
    )
    source = models.ForeignKey(
        QuestionSource,
        on_delete=models.SET_NULL,
        related_name="questions",
        null=True,
        blank=True,
    )
    search_run = models.ForeignKey(
        SearchRun,
        on_delete=models.SET_NULL,
        related_name="questions",
        null=True,
        blank=True,
    )
    exam = models.ForeignKey(
        Exam,
        on_delete=models.SET_NULL,
        related_name="questions",
        null=True,
        blank=True,
    )
    discipline = models.CharField(max_length=100, db_index=True)
    banca = models.CharField(max_length=100, db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    number = models.PositiveSmallIntegerField(null=True, blank=True)
    statement = models.TextField()
    options = models.JSONField(default=list)
    correct_answer = models.PositiveSmallIntegerField()
    explanation = models.TextField(blank=True)
    content_hash = models.CharField(max_length=64, blank=True, db_index=True)
    source_url = models.URLField(max_length=600, blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_questions",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    rejection_reason_code = models.CharField(max_length=40, blank=True)
    review_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"], name="unique_question_source_external"
            )
        ]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="questions_queue_idx"),
        ]

    def __str__(self):
        return f"{self.banca} {self.year} - {self.discipline} ({self.pk})"


class QuestionStemToken(models.Model):
    """Token raro do enunciado, índice de candidatos para a busca de duplicatas.

    Guardar só os `SIGNATURE_SIZE` tokens mais raros de cada enunciado mantém o
    índice pequeno e faz o candidato a duplicata aparecer por consulta indexada,
    sem varrer a base inteira a cada item importado.
    """

    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="stem_tokens"
    )
    token = models.CharField(max_length=40, db_index=True)
    df = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["question", "token"], name="unique_question_stem_token"
            )
        ]
        indexes = [
            models.Index(fields=["token", "df"], name="questions_token_df_idx"),
            models.Index(
                fields=["question", "token"], name="questions_question_token_idx"
            ),
        ]

    def __str__(self):
        return f"{self.question_id}:{self.token}"


class UserAnswer(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="answers"
    )
    selected_answer = models.PositiveSmallIntegerField()
    is_correct = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "question", "-created_at"],
                name="questions_answer_user_idx",
            )
        ]


class QuestionReview(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="reviews"
    )
    next_review_at = models.DateTimeField(null=True, blank=True, db_index=True)
    interval_days = models.PositiveSmallIntegerField(default=0)
    repetitions = models.PositiveSmallIntegerField(default=0)
    is_marked = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"], name="unique_question_review"
            )
        ]


class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="favorites"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"], name="unique_question_favorite"
            )
        ]


class QuestionNote(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="notes"
    )
    content = models.TextField(blank=True, max_length=250)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"], name="unique_question_note"
            )
        ]


class Comment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="comments"
    )
    content = models.TextField(max_length=250)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]


class SimulationTemplate(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="simulation_templates",
    )
    name = models.CharField(max_length=120)
    discipline = models.CharField(max_length=100, blank=True, default="")
    exam_ids = models.JSONField(default=list)
    banca = models.CharField(max_length=100, blank=True, default="")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    count = models.PositiveSmallIntegerField(null=True, blank=True)
    full_exam = models.BooleanField(default=False)
    time_limit_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class ErrorReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Aberto"
        RESOLVED = "resolved", "Resolvido"
        REJECTED = "rejected", "Rejeitado"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="error_reports"
    )
    description = models.TextField(max_length=5000)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.OPEN
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class OfficialExamPortal(models.Model):
    """Portal institucional usado apenas para localizar documentos oficiais."""
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    catalog_url = models.URLField(max_length=600)
    allowed_hosts = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class OfficialExamDocument(models.Model):
    class Kind(models.TextChoices):
        EXAM = "exam", "Prova"
        ANSWER_KEY_PRELIMINARY = "answer_key_preliminary", "Gabarito preliminar"
        ANSWER_KEY_FINAL = "answer_key_final", "Gabarito final"

    class Status(models.TextChoices):
        DISCOVERED = "discovered", "Descoberto"
        REVIEW = "review", "Aguardando conferência"
        DOWNLOADED = "downloaded", "Baixado"
        FAILED = "failed", "Falhou"

    portal = models.ForeignKey(OfficialExamPortal, on_delete=models.PROTECT, related_name="documents")
    title = models.CharField(max_length=300)
    year = models.PositiveSmallIntegerField(null=True, blank=True, db_index=True)
    organization = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=180, blank=True)
    kind = models.CharField(max_length=28, choices=Kind.choices)
    source_url = models.URLField(max_length=1000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DISCOVERED)
    paired_with = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="paired_documents")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "title"]
        constraints = [models.UniqueConstraint(fields=["portal", "source_url"], name="official_exam_document_source_unique")]

    def __str__(self):
        return self.title

class OfficialExamDownload(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "Baixando"
        DONE = "done", "Baixado"
        FAILED = "failed", "Falhou"
    document = models.ForeignKey(OfficialExamDocument, on_delete=models.CASCADE, related_name="downloads")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    file = models.FileField(storage=official_exam_storage, upload_to="official-exams/%Y/%m/", blank=True)
    sha256 = models.CharField(max_length=64, blank=True)
    bytes_count = models.PositiveBigIntegerField(default=0)
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    final_url = models.URLField(max_length=1000, blank=True)
    error_message = models.CharField(max_length=300, blank=True)
    started_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
