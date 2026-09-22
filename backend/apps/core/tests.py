import shutil
import tempfile
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.core import mail
from rest_framework.test import APIClient

from apps.core.models import Profile


class ProfileTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="profile-user",
            email="profile@example.com",
            password="test-password-123",
        )

    def test_profile_is_created_with_user(self):
        self.assertTrue(Profile.objects.filter(user=self.user).exists())

    def test_profile_is_deleted_with_user(self):
        profile_id = self.user.profile.id
        self.user.delete()
        self.assertFalse(Profile.objects.filter(id=profile_id).exists())


class ProfileAPITests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="api-user",
            email="api@example.com",
            password="test-password-123",
        )
        self.other_user = user_model.objects.create_user(
            username="existing-user",
            email="existing@example.com",
            password="test-password-123",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_get_profile_returns_user_and_profile_fields(self):
        response = self.client.get("/api/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["username"], self.user.username)
        self.assertEqual(response.data["study_hours_per_day"], 0)
        self.assertEqual(response.data["disciplines"], [])

    def test_patch_profile_updates_user_and_profile(self):
        response = self.client.patch(
            "/api/me/",
            {
                "username": "updated-user",
                "first_name": "Maria",
                "last_name": "Silva",
                "phone": "85999999999",
                "state": "ce",
                "city": "Fortaleza",
                "profession": "Estudante",
                "target_role": "Técnico Judiciário",
                "study_hours_per_day": 4,
                "disciplines": ["Português", "Matemática"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.username, "updated-user")
        self.assertEqual(self.user.first_name, "Maria")
        self.assertEqual(self.user.profile.state, "CE")
        self.assertEqual(self.user.profile.study_hours_per_day, 4)
        self.assertEqual(
            self.user.profile.disciplines, ["Português", "Matemática"]
        )

    def test_patch_rejects_duplicate_username(self):
        response = self.client.patch(
            "/api/me/", {"username": "EXISTING-USER"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.data)

    def test_patch_validates_study_hours(self):
        response = self.client.patch(
            "/api/me/", {"study_hours_per_day": 25}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("study_hours_per_day", response.data)


class AvatarUploadTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()

        self.user = get_user_model().objects.create_user(
            username="avatar-user",
            email="avatar@example.com",
            password="test-password-123",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_upload_recreates_a_missing_profile(self):
        Profile.objects.filter(user=self.user).delete()
        avatar = SimpleUploadedFile("avatar.png", b"image-content", "image/png")

        response = self.client.post(
            "/api/profile/avatar/",
            {"avatar": avatar},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Profile.objects.filter(user=self.user).exists())
        self.assertIn("avatar", response.data)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="password-user", email="password@example.com", password="old-password-123"
        )
        self.client = APIClient()

    def test_reset_request_and_confirmation_change_password(self):
        response = self.client.post("/api/password/reset/", {"email": self.user.email}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        reset_url = mail.outbox[0].body.rsplit(" ", 1)[-1]
        query = parse_qs(urlparse(reset_url).query)

        confirmed = self.client.post(
            "/api/password/reset/confirm/",
            {"uid": query["uid"][0], "token": query["token"][0], "new_password": "R7!vQ2#kL9@pT4"},
            format="json",
        )

        self.assertEqual(confirmed.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("R7!vQ2#kL9@pT4"))

    def test_reset_does_not_reveal_unknown_email(self):
        response = self.client.post("/api/password/reset/", {"email": "unknown@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_authenticated_user_can_change_password(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/password/change/",
            {"current_password": "old-password-123", "new_password": "changed-password-789"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("changed-password-789"))
