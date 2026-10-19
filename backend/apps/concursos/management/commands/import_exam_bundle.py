"""Cadastro conferido de concursos, cargos e PDFs locais; simulação por padrão."""
import hashlib
import json
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.backoffice.audit import audited_command, log
from apps.backoffice.backup_storage import operation_lock
from apps.concursos.files import validate_pdf
from apps.concursos.models import Concurso, ConcursoResource
from apps.questions.models import BancaCatalog, Exam, Question, QuestionSource, SearchRun, SupportText
from apps.questions.naming import resolve_banca_catalog
from apps.questions.ingest.base import QuestionItem
from apps.questions.ingest.duplicates import DuplicateChecker
from apps.questions.ingest.pipeline import PipelineCounts, ingest_item, validate


class Command(BaseCommand):
    help = "Valida manifesto de provas locais; grava apenas com --apply, sem aprovar questões."

    def add_arguments(self, parser):
        parser.add_argument("manifest")
        parser.add_argument("--apply", action="store_true")

    @audited_command("import_exam_bundle")
    def handle(self, *args, **options):
        saved_files = []
        try:
            path = Path(options["manifest"]).resolve()
            bundle = json.loads(path.read_text())
            source_slug = bundle["source_slug"]
            if not source_slug or len(source_slug) > 60:
                raise ValueError("Identificador da fonte inválido.")
            contests = bundle["contests"]
            if not contests:
                raise ValueError("Manifesto sem concursos.")
            seen_keys = set()
            for contest in contests:
                key = contest["key"]
                if key in seen_keys:
                    raise ValueError("Concurso repetido no manifesto.")
                seen_keys.add(key)
                for exam in contest["exams"]:
                    for question in exam.get("questions", []):
                        if question.get("support_key"):
                            question["support_text"] = bundle["support_texts"][question["support_key"]]
                        validate(self.question_item(contest, exam, question))
                    numbers = [q["number"] for q in exam.get("questions", [])]
                    if len(set(numbers)) != len(numbers):
                        raise ValueError("Número de questão repetido na prova.")
                for resource in contest["resources"]:
                    target = (path.parent / resource["path"]).resolve()
                    if not target.is_relative_to(path.parent):
                        raise ValueError("PDF fora da pasta do manifesto.")
                    with target.open("rb") as stream:
                        upload = File(stream, name=target.name)
                        upload.content_type = "application/pdf"
                        metadata = validate_pdf(upload)
                    if metadata["file_sha256"] != resource["sha256"]:
                        raise ValueError(f"PDF alterado: {target.name}")
                    if resource.get("exam") and resource["exam"] not in {x["key"] for x in contest["exams"]}:
                        raise ValueError("Material vinculado a cargo inexistente.")
                    if resource["kind"] not in ConcursoResource.Kind.values:
                        raise ValueError("Tipo de material inválido.")
                    resource["_path"], resource["_metadata"] = target, metadata
            report = {"apply": options["apply"], "contests": len(contests),
                      "exams": sum(len(c["exams"]) for c in contests),
                      "resources": sum(len(c["resources"]) for c in contests),
                      "questions": sum(len(e.get("questions", [])) for c in contests for e in c["exams"])}
            if not options["apply"]:
                self.stdout.write(json.dumps(report, ensure_ascii=False))
                return
            with operation_lock(settings.BACKUP_DIR), transaction.atomic():
                source, _ = QuestionSource.objects.get_or_create(slug=source_slug, defaults={
                    "name": bundle["name"], "kind": "local_file", "is_active": False,
                    "notes": "Arquivos fornecidos pelo administrador. Questões extraídas aguardam revisão editorial."})
                run = SearchRun.objects.create(source=source, name=bundle["name"], filters={"manifest_sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
                counts = PipelineCounts()
                checker = DuplicateChecker()
                ids = []
                support_cache = {}
                for data in contests:
                    banca = resolve_banca_catalog(data["banca"])
                    if banca is None:
                        banca = BancaCatalog.objects.create(name=data["banca"], description=data.get("banca_description", ""))
                        log(action="banca.created", resource_type="banca", resource_id=banca.pk, context={"entrypoint": "import_exam_bundle"})
                    contest, created = Concurso.objects.get_or_create(source="local_bundle", external_id=data["key"], defaults={
                        "title": data["title"], "organization": data["organization"], "banca": banca,
                        "origin": "manual", "status": "closed", "state": data["state"],
                        "description": data.get("description", ""), "roles": [x["role"] for x in data["exams"]],
                        "editorial_status": "published"})
                    if not created and (contest.title != data["title"] or contest.banca_id != banca.pk):
                        raise ValueError("Concurso existente diverge do manifesto; nenhuma sobrescrita foi feita.")
                    exams = {}
                    for spec in data["exams"]:
                        exam, created_exam = Exam.objects.get_or_create(title=spec["title"], banca=banca.name, year=spec["year"], defaults={
                            "role": spec["role"], "institution": data["organization"], "level": spec["level"],
                            "state": data["state"], "concurso": contest, "is_published": True})
                        if not created_exam and (exam.concurso_id != contest.pk or exam.role != spec["role"]):
                            raise ValueError("Prova existente diverge do manifesto; confira o vínculo.")
                        exams[spec["key"]] = exam
                        for question in spec.get("questions", []):
                            item = self.question_item(data, spec, question)
                            item.banca = banca.name
                            # Reexecução não altera questões já revisadas nem seus vínculos.
                            if Question.objects.filter(source=source, external_id=item.external_id).exists():
                                counts.bump("unchanged")
                                continue
                            stored = ingest_item(source, item, checker, counts, search_run=run, match_by_statement=False)
                            if stored:
                                stored.review_note += "\nTranscrição local: conferir OCR, formatação, figuras e gabarito no PDF original."
                                stored.save(update_fields=["review_note"])
                            if stored and question.get("support_text"):
                                support = question["support_text"]
                                support_key = hashlib.sha256(json.dumps(support, sort_keys=True).encode()).hexdigest()
                                text = support_cache.get(support_key)
                                if text is None:
                                    text, _ = SupportText.objects.get_or_create(title=support["title"], content=support["content"], defaults={"reference": spec["title"]})
                                    support_cache[support_key] = text
                                stored.support_text = text
                                stored.save(update_fields=["support_text"])
                    for resource in data["resources"]:
                        exam = exams.get(resource.get("exam"))
                        existing = ConcursoResource.objects.filter(concurso=contest, exam=exam, file_sha256=resource["sha256"], kind=resource["kind"]).first()
                        if existing:
                            continue
                        record = ConcursoResource(concurso=contest, exam=exam, title=resource["title"], kind=resource["kind"],
                                                  description=resource.get("description", ""), is_published=True, **resource["_metadata"])
                        with resource["_path"].open("rb") as stream:
                            record.file.save(resource["_path"].name, File(stream), save=False)
                        saved_files.append((record.file.storage, record.file.name))
                        record.full_clean()
                        record.save()
                        log(action="concurso.resource_created", resource_type="concurso_resource", resource_id=record.pk,
                            after={"concurso": contest.pk, "exam": exam.pk if exam else None, "sha256": record.file_sha256})
                    ids.append({"concurso": contest.pk, "exams": [e.pk for e in exams.values()]})
                    log(action="concurso.bundle_imported", resource_type="concurso", resource_id=contest.pk, context={"source": source_slug})
                run.status = "done"
                run.finished_at = timezone.now()
                run.counts = counts.as_dict()
                run.save(update_fields=["status", "finished_at", "counts"])
                report.update(ids=ids, counts=counts.as_dict())
            self.stdout.write(json.dumps(report, ensure_ascii=False))
        except Exception as exc:
            for storage, name in saved_files:
                storage.delete(name)
            raise CommandError(str(exc)) from exc

    @staticmethod
    def question_item(contest, exam, question):
        return QuestionItem(statement=question["statement"], options=question["options"], correct_answer=question["correct_answer"],
                            banca=contest["banca"], year=exam["year"], discipline=question["discipline"],
                            external_id=f'{exam["key"]}:{question["number"]}', exam_title=exam["title"], institution=contest["organization"],
                            role=exam["role"], level=exam["level"], state=contest["state"], number=question["number"])
