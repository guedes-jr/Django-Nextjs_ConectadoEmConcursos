from datetime import timedelta

from django.utils import timezone

from apps.questions.models import QuestionReview


REVIEW_INTERVALS = (1, 3, 7, 14, 30)


def schedule_review(user, question, is_correct):
    review, _ = QuestionReview.objects.get_or_create(user=user, question=question)
    review.repetitions = min(review.repetitions + 1, len(REVIEW_INTERVALS)) if is_correct else 0
    review.interval_days = REVIEW_INTERVALS[review.repetitions - 1] if is_correct else 1
    review.next_review_at = timezone.now() + timedelta(days=review.interval_days)
    review.is_marked = False
    review.save(update_fields=["repetitions", "interval_days", "next_review_at", "is_marked", "updated_at"])
    return review
