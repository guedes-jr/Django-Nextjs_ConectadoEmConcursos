from datetime import timedelta

from django.db import migrations


def backfill_reviews(apps, schema_editor):
    UserAnswer = apps.get_model("questions", "UserAnswer")
    QuestionReview = apps.get_model("questions", "QuestionReview")
    seen = set()
    rows = []
    for answer in UserAnswer.objects.order_by("-created_at", "-id").iterator():
        key = (answer.user_id, answer.question_id)
        if key in seen:
            continue
        seen.add(key)
        rows.append(QuestionReview(
            user_id=answer.user_id,
            question_id=answer.question_id,
            next_review_at=answer.created_at + timedelta(days=1),
            interval_days=1,
            repetitions=1 if answer.is_correct else 0,
        ))
    QuestionReview.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [("questions", "0004_questionreview")]
    operations = [migrations.RunPython(backfill_reviews, migrations.RunPython.noop)]
