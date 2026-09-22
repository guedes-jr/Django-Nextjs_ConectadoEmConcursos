from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from datetime import timedelta

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, UserAnswer


class QuestionAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("student", password="test-password")
        self.other_user = get_user_model().objects.create_user("other", password="test-password")
        self.question = Question.objects.create(
            discipline="Português",
            banca="CEBRASPE",
            year=2025,
            statement="Qual alternativa está correta?",
            options=["Errada", "Correta", "Também errada"],
            correct_answer=1,
            explanation="A alternativa B é a correta.",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_list_does_not_expose_correct_answer(self):
        response = self.client.get("/api/questions/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("correct_answer", response.data[0])

    def test_filters_questions(self):
        Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        response = self.client.get("/api/questions/?discipline=Português")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_answer_records_attempt_and_returns_correction(self):
        response = self.client.post(
            f"/api/questions/{self.question.id}/answer/",
            {"selected_answer": 1}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["is_correct"])
        self.assertEqual(response.data["correct_answer"], 1)
        self.assertTrue(UserAnswer.objects.filter(user=self.user).exists())

    def test_free_plan_daily_question_limit_is_enforced(self):
        UserAnswer.objects.bulk_create([
            UserAnswer(user=self.user, question=self.question, selected_answer=1, is_correct=True)
            for _ in range(20)
        ])
        response = self.client.post(
            f"/api/questions/{self.question.id}/answer/", {"selected_answer": 1}, format="json"
        )
        self.assertEqual(response.status_code, 429)

    def test_favorite_is_toggled(self):
        url = f"/api/questions/{self.question.id}/favorite/"
        self.assertTrue(self.client.post(url).data["is_favorite"])
        self.assertFalse(self.client.post(url).data["is_favorite"])
        self.assertFalse(Favorite.objects.filter(user=self.user).exists())

    def test_note_is_private_and_upserted(self):
        url = f"/api/questions/{self.question.id}/note/"
        response = self.client.put(url, {"content": "Minha anotação"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(QuestionNote.objects.get(user=self.user).content, "Minha anotação")

    def test_comment_owner_can_update_comment(self):
        create_response = self.client.post(
            f"/api/questions/{self.question.id}/comments/",
            {"content": "Comentário"}, format="json",
        )
        comment_id = create_response.data["id"]
        response = self.client.patch(
            f"/api/comments/{comment_id}/", {"content": "Editado"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Comment.objects.get(pk=comment_id).content, "Editado")

    def test_user_cannot_edit_another_users_comment(self):
        comment = Comment.objects.create(
            user=self.other_user, question=self.question, content="Outro"
        )
        response = self.client.patch(
            f"/api/comments/{comment.id}/", {"content": "Invadido"}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_report_requires_meaningful_description(self):
        url = f"/api/questions/{self.question.id}/report/"
        self.assertEqual(self.client.post(url, {"description": "curto"}).status_code, 400)
        response = self.client.post(
            url, {"description": "O enunciado contém informação incorreta."}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ErrorReport.objects.filter(user=self.user).exists())


class ExamAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("exam-user", password="test-password")
        self.exam = Exam.objects.create(
            title="Analista Administrativo",
            banca="FGV",
            institution="Tribunal Regional",
            role="Analista",
            year=2025,
        )
        self.question = Question.objects.create(
            exam=self.exam,
            discipline="Português",
            banca=self.exam.banca,
            year=self.exam.year,
            statement="Questão da prova",
            options=["A", "B"],
            correct_answer=0,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_list_exams_includes_count_and_disciplines(self):
        response = self.client.get("/api/exams/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["question_count"], 1)
        self.assertEqual(response.data[0]["disciplines"], ["Português"])

    def test_exam_filters(self):
        self.assertEqual(len(self.client.get("/api/exams/?banca=FGV").data), 1)
        self.assertEqual(len(self.client.get("/api/exams/?banca=Outra").data), 0)
        self.assertEqual(len(self.client.get("/api/exams/?discipline=Português").data), 1)

    def test_exam_questions_only_returns_linked_questions(self):
        Question.objects.create(
            discipline="Matemática", banca="Outra", year=2024,
            statement="Questão sem prova", options=["A", "B"], correct_answer=1,
        )
        response = self.client.get(f"/api/exams/{self.exam.id}/questions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.question.id])


class StatisticsAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("stats-user", password="password")
        self.other_user = get_user_model().objects.create_user("other-stats", password="password")
        self.portuguese = Question.objects.create(
            discipline="Português", banca="FGV", year=2025,
            statement="Português", options=["A", "B"], correct_answer=0,
        )
        self.math = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2025,
            statement="Matemática", options=["A", "B"], correct_answer=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create_answer(self, question, is_correct, days_ago=0):
        answer = UserAnswer.objects.create(
            user=self.user,
            question=question,
            selected_answer=question.correct_answer if is_correct else 1 - question.correct_answer,
            is_correct=is_correct,
        )
        UserAnswer.objects.filter(pk=answer.pk).update(
            created_at=timezone.now() - timedelta(days=days_ago)
        )
        return answer

    def test_statistics_aggregate_only_authenticated_user(self):
        self.create_answer(self.portuguese, True)
        self.create_answer(self.portuguese, False)
        self.create_answer(self.math, True, days_ago=1)
        UserAnswer.objects.create(
            user=self.other_user, question=self.math, selected_answer=1, is_correct=True
        )

        response = self.client.get("/api/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 3)
        self.assertEqual(response.data["correct"], 2)
        self.assertEqual(response.data["accuracy"], 67)
        self.assertEqual(response.data["today_total"], 2)
        self.assertEqual(response.data["streak"], 2)
        self.assertEqual(len(response.data["daily"]), 7)
        self.assertEqual(response.data["disciplines"][0]["discipline"], "Português")

    def test_empty_statistics_have_zero_values(self):
        response = self.client.get("/api/statistics/")
        self.assertEqual(response.data["total"], 0)
        self.assertEqual(response.data["accuracy"], 0)
        self.assertEqual(response.data["streak"], 0)
