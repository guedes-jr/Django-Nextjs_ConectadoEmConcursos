from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from datetime import timedelta

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, QuestionReview, SimulationTemplate, UserAnswer
from apps.workspace.models import SimulationRun


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
        self.assertNotIn("correct_answer", response.data["results"][0])

    def test_filters_questions(self):
        Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        response = self.client.get("/api/questions/?discipline=Português")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_filter_facets_cover_the_full_question_bank(self):
        Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        response = self.client.get("/api/questions/facets/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["disciplines"], ["Matemática", "Português"])
        self.assertEqual(response.data["bancas"], ["CEBRASPE", "FGV"])
        self.assertEqual(response.data["years"], [2025, 2024])

    def test_list_is_paginated_and_filters_keep_total(self):
        Question.objects.bulk_create([
            Question(
                discipline="Português", banca="CEBRASPE", year=2025,
                statement=f"Questão extra {index}", options=["A", "B"], correct_answer=0,
            ) for index in range(12)
        ])
        first = self.client.get("/api/questions/?discipline=Português&page=1")
        second = self.client.get("/api/questions/?discipline=Português&page=2")
        self.assertEqual(first.data["count"], 13)
        self.assertEqual(len(first.data["results"]), 10)
        self.assertEqual(len(second.data["results"]), 3)
        self.assertNotEqual(first.data["results"][0]["id"], second.data["results"][0]["id"])
        self.assertEqual(self.client.get("/api/questions/disciplines/").data, ["Português"])

    def test_answer_records_attempt_and_returns_correction(self):
        response = self.client.post(
            f"/api/questions/{self.question.id}/answer/",
            {"selected_answer": 1}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["is_correct"])
        self.assertEqual(response.data["correct_answer"], 1)
        self.assertTrue(UserAnswer.objects.filter(user=self.user).exists())
        review = QuestionReview.objects.get(user=self.user, question=self.question)
        self.assertEqual(review.interval_days, 1)

    def test_progress_filters_and_review_queue(self):
        other = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        self.client.post(f"/api/questions/{self.question.id}/answer/", {"selected_answer": 0}, format="json")
        self.assertEqual(self.client.get("/api/questions/?progress=incorrect").data["count"], 1)
        self.assertEqual(self.client.get("/api/questions/?progress=unanswered").data["results"][0]["id"], other.id)
        self.assertEqual(self.client.get("/api/questions/?progress=review").data["count"], 0)
        self.client.post(f"/api/questions/{self.question.id}/review/")
        queued = self.client.get("/api/questions/?progress=review").data["results"]
        self.assertEqual([item["id"] for item in queued], [self.question.id])
        self.assertTrue(queued[0]["is_marked"])
        self.assertFalse(queued[0]["latest_is_correct"])

    def test_correct_retries_extend_review_interval_and_errors_reset_it(self):
        url = f"/api/questions/{self.question.id}/answer/"
        self.client.post(url, {"selected_answer": 1}, format="json")
        self.assertEqual(QuestionReview.objects.get(user=self.user, question=self.question).interval_days, 1)
        self.client.post(url, {"selected_answer": 1}, format="json")
        self.assertEqual(QuestionReview.objects.get(user=self.user, question=self.question).interval_days, 3)
        self.client.post(url, {"selected_answer": 0}, format="json")
        review = QuestionReview.objects.get(user=self.user, question=self.question)
        self.assertEqual((review.interval_days, review.repetitions), (1, 0))

    def test_simulation_submission_is_atomic_and_returns_feedback_at_end(self):
        other = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        url = "/api/questions/submit-simulation/"
        invalid = self.client.post(url, {"answers": [
            {"question_id": self.question.id, "selected_answer": 1},
            {"question_id": other.id, "selected_answer": 9},
        ]}, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(UserAnswer.objects.filter(user=self.user).exists())
        response = self.client.post(url, {"answers": [
            {"question_id": self.question.id, "selected_answer": 1},
            {"question_id": other.id, "selected_answer": 1},
        ]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(sum(item["is_correct"] for item in response.data["results"]), 1)
        self.assertEqual(UserAnswer.objects.filter(user=self.user).count(), 2)
        self.assertEqual(QuestionReview.objects.filter(user=self.user).count(), 2)

    def test_simulation_respects_daily_limit_without_partial_save(self):
        UserAnswer.objects.bulk_create([
            UserAnswer(user=self.user, question=self.question, selected_answer=1, is_correct=True)
            for _ in range(19)
        ])
        other = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        response = self.client.post("/api/questions/submit-simulation/", {"answers": [
            {"question_id": self.question.id, "selected_answer": 1},
            {"question_id": other.id, "selected_answer": 0},
        ]}, format="json")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(UserAnswer.objects.filter(user=self.user).count(), 19)

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

    def test_missing_explanation_can_be_requested_once(self):
        question = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Outra questão", options=["A", "B"], correct_answer=0,
        )
        url = f"/api/questions/{question.id}/request-explanation/"
        self.assertEqual(self.client.post(url).status_code, 201)
        self.assertEqual(self.client.post(url).status_code, 200)
        self.assertEqual(ErrorReport.objects.filter(question=question, user=self.user).count(), 1)
        self.assertEqual(self.client.post(f"/api/questions/{self.question.id}/request-explanation/").status_code, 400)


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


class SimulationSessionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("student", password="test-password")
        self.other_user = get_user_model().objects.create_user("other", password="test-password")
        self.exam = Exam.objects.create(
            title="Concurso TJ", banca="CEBRASPE", institution="TJ", role="Analista", year=2025
        )
        self.questions = [
            Question.objects.create(
                discipline="Português", banca="CEBRASPE", year=2025, exam=self.exam,
                statement=f"Questão {i}", options=["A", "B"], correct_answer=0,
            )
            for i in range(5)
        ]
        self.other_exam = Exam.objects.create(
            title="Outra", banca="FGV", institution="X", role="Técnico", year=2024
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def start(self, **overrides):
        data = {"discipline": "Português", "banca": "CEBRASPE", "year": 2025, "exam_ids": [self.exam.id], "count": 3}
        data.update(overrides)
        return self.client.post("/api/questions/simulations/start/", data, format="json")

    def test_start_creates_session_without_exposing_correct_answer(self):
        resp = self.start()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["question_count"], 3)
        self.assertEqual(len(resp.data["questions"]), 3)
        self.assertNotIn("correct_answer", resp.data["questions"][0])
        run = SimulationRun.objects.get(pk=resp.data["simulation_id"])
        self.assertEqual(run.status, SimulationRun.Status.IN_PROGRESS)
        self.assertEqual(set(run.question_ids), {q["id"] for q in resp.data["questions"]})
        self.assertIsNotNone(run.started_at)
        self.assertEqual(run.discipline, "Português")
        self.assertEqual(run.banca, "CEBRASPE")
        self.assertEqual(run.year, 2025)
        self.assertEqual(run.exam_ids, [self.exam.id])

    def test_start_prioritizes_unanswered_questions(self):
        self.client.post("/api/questions/submit-simulation/", {"answers": [
            {"question_id": self.questions[0].id, "selected_answer": 0}
        ]}, format="json")
        for _ in range(12):
            resp = self.start()
            picked = {q["id"] for q in resp.data["questions"]}
            self.assertNotIn(self.questions[0].id, picked)

    def test_start_falls_back_to_full_pool_when_unseen_is_insufficient(self):
        for q in self.questions[:4]:
            self.client.post("/api/questions/submit-simulation/", {"answers": [
                {"question_id": q.id, "selected_answer": 0}
            ]}, format="json")
        resp = self.start(count=4)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["question_count"], 4)

    def test_start_rejects_when_pool_is_smaller_than_requested(self):
        resp = self.start(count=6)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Apenas 5 questões", resp.data["detail"])
        self.assertFalse(SimulationRun.objects.filter(user=self.user).exists())

    def test_start_validates_count_range(self):
        self.assertEqual(self.start(count=0).status_code, 400)
        self.assertEqual(self.start(count=101).status_code, 400)

    def test_start_without_exam_uses_other_filters(self):
        resp = self.client.post("/api/questions/simulations/start/", {
            "discipline": "Português",
            "banca": "CEBRASPE",
            "year": 2025,
            "exam_ids": [],
            "count": 3,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["question_count"], 3)
        picked = {q["id"] for q in resp.data["questions"]}
        self.assertLessEqual(len(picked), 5)
        run = SimulationRun.objects.get(pk=resp.data["simulation_id"])
        self.assertEqual(run.exam_ids, [])

    def test_start_rejects_bogus_exam_ids(self):
        resp = self.start(exam_ids=[999999], count=3)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("disponíveis", resp.data["detail"])

    def test_full_exam_uses_all_questions_of_a_single_exam(self):
        resp = self.start(full_exam=True, count=None)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["question_count"], 5)
        self.assertSetEqual(
            {q["id"] for q in resp.data["questions"]},
            {q.id for q in self.questions},
        )

    def test_full_exam_requires_single_exam(self):
        resp = self.start(full_exam=True, count=None, exam_ids=[self.exam.id, self.other_exam.id])
        self.assertEqual(resp.status_code, 400)

    def test_submit_session_scoring_and_metadata(self):
        start = self.start()
        run = SimulationRun.objects.get(pk=start.data["simulation_id"])
        answers = [
            {"question_id": qid, "selected_answer": 1} for qid in run.question_ids
        ]
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.id, "answers": answers,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["results"]), 3)
        run.refresh_from_db()
        self.assertEqual(run.status, SimulationRun.Status.FINISHED)
        self.assertEqual(run.total, 3)
        self.assertIsNotNone(run.finished_at)
        self.assertIsNotNone(run.duration_seconds)
        self.assertEqual(sum(a["is_correct"] for a in resp.data["results"]), run.score)

    def test_submit_session_counts_unanswered_questions_as_incorrect(self):
        start = self.start()
        run = SimulationRun.objects.get(pk=start.data["simulation_id"])
        answered_id = run.question_ids[0]
        question = Question.objects.get(pk=answered_id)
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.id,
            "answers": [
                {"question_id": answered_id, "selected_answer": question.correct_answer},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["results"]), run.question_count)
        run.refresh_from_db()
        self.assertEqual(run.status, SimulationRun.Status.FINISHED)
        self.assertEqual(run.total, run.question_count)
        self.assertEqual(run.score, 1)
        self.assertEqual(len(run.answers), run.question_count)
        blanks = [item for item in resp.data["results"] if item["selected_answer"] is None]
        self.assertEqual(len(blanks), run.question_count - 1)
        self.assertTrue(all(item["is_correct"] is False for item in blanks))
        self.assertEqual(run.answers[1]["selected_answer"], None)

    def test_submit_session_allows_empty_answers(self):
        start = self.start()
        run = SimulationRun.objects.get(pk=start.data["simulation_id"])
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.id, "answers": [],
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["results"]), run.question_count)
        run.refresh_from_db()
        self.assertEqual(run.score, 0)
        self.assertEqual(run.total, run.question_count)
        self.assertTrue(all(item["is_correct"] is False for item in resp.data["results"]))

    def test_submit_session_rejects_questions_outside_session(self):
        outside = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Fora do simulado", options=["A", "B"], correct_answer=0,
        )
        start = self.start()
        run = SimulationRun.objects.get(pk=start.data["simulation_id"])
        answered = list(run.question_ids)
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.id,
            "answers": [
                {"question_id": answered[0], "selected_answer": 0},
                {"question_id": outside.id, "selected_answer": 0},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(SimulationRun.objects.get(pk=run.id).status, SimulationRun.Status.IN_PROGRESS)

    def test_submit_session_rejects_unknown_session(self):
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": 9999,
            "answers": [{"question_id": self.questions[0].id, "selected_answer": 0}],
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_expired_session_is_rejected_and_marked_expired(self):
        run = SimulationRun.objects.create(
            user=self.user, status=SimulationRun.Status.IN_PROGRESS,
            question_ids=[q.id for q in self.questions[:2]], question_count=2,
            time_limit_minutes=1,
            started_at=timezone.now() - timedelta(minutes=2),
        )
        resp = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.id, "answers": [
                {"question_id": self.questions[0].id, "selected_answer": 0},
                {"question_id": self.questions[1].id, "selected_answer": 0},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Tempo do simulado esgotado", resp.data["detail"])
        run.refresh_from_db()
        self.assertEqual(run.status, SimulationRun.Status.EXPIRED)

    def test_legacy_submit_still_works_without_session(self):
        resp = self.client.post("/api/questions/submit-simulation/", {"answers": [
            {"question_id": self.questions[0].id, "selected_answer": 0},
            {"question_id": self.questions[1].id, "selected_answer": 0},
        ]}, format="json")
        self.assertEqual(resp.status_code, 201)
        run = SimulationRun.objects.get(pk=resp.data["simulation_id"])
        self.assertEqual(run.status, SimulationRun.Status.FINISHED)
        self.assertEqual(run.question_count, 2)


class SimulationTemplateTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("student", password="test-password")
        self.other_user = get_user_model().objects.create_user("other", password="test-password")
        self.exam = Exam.objects.create(title="Concurso TJ", banca="CEBRASPE", year=2025)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_list_patch_delete(self):
        resp = self.client.post("/api/simulation-templates/", {
            "name": "Simulado TJ",
            "discipline": "Português",
            "exam_ids": [self.exam.id],
            "banca": "CEBRASPE",
            "year": 2025,
            "count": 20,
            "full_exam": False,
            "time_limit_minutes": 30,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        template = SimulationTemplate.objects.get(user=self.user)
        self.assertEqual(template.name, "Simulado TJ")
        self.assertEqual(template.exam_ids, [self.exam.id])
        self.assertEqual(template.count, 20)

        listed = self.client.get("/api/simulation-templates/")
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]["id"], resp.data["id"])

        patched = self.client.patch(
            f"/api/simulation-templates/{resp.data['id']}/", {"count": 40}, format="json"
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data["count"], 40)

        deleted = self.client.delete(f"/api/simulation-templates/{resp.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(SimulationTemplate.objects.filter(user=self.user).exists())

    def test_templates_are_isolated_per_user(self):
        template = SimulationTemplate.objects.create(
            user=self.other_user, name="Do outro", count=10
        )
        resp = self.client.get("/api/simulation-templates/")
        self.assertEqual(resp.data, [])
        self.assertEqual(self.client.get(f"/api/simulation-templates/{template.id}/").status_code, 404)
