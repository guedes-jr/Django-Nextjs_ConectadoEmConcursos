from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.tokens import RefreshToken
from .tests import Base
from .models import AuditEvent


class UserPasswordTests(Base):
    def setUp(self):
        super().setUp()
        self.url = f'/api/backoffice/users/{self.user.pk}/password/'
        self.data = {'new_password': 'Local-Tests!Strong482', 'confirmation': 'Local-Tests!Strong482', 'reason': 'Suporte solicitado pelo aluno'}

    def test_reset_changes_hash_and_revokes_session_token_and_jwt_without_auditing_secrets(self):
        session = APIClient()
        session.force_login(self.user)
        self.assertEqual(session.get('/api/me/').status_code, 200)
        token = Token.objects.create(user=self.user)
        jwt = APIClient()
        jwt.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.user).access_token}')
        self.assertEqual(jwt.get('/api/me/').status_code, 200)
        response = self.client.post(self.url, self.data, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'ok': True, 'reauthenticate': False})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.data['new_password']))
        self.assertFalse(self.user.check_password('password'))
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())
        self.assertIn(session.get('/api/me/').status_code, (401, 403))
        self.assertIn(jwt.get('/api/me/').status_code, (401, 403))
        event = AuditEvent.objects.get(action='user.password_changed_by_admin')
        self.assertEqual(event.actor, self.staff)
        self.assertEqual(event.reason, self.data['reason'])
        self.assertNotIn(self.data['new_password'], str(event.after)+str(event.context)+str(response.data))
        self.assertNotIn(self.user.password, str(event.after))

    def test_invalid_password_confirmation_and_reason_do_not_change_password(self):
        for fields in [{'new_password': '123', 'confirmation': '123'}, {'confirmation': 'different'}, {'reason': ' '}]:
            self.assertEqual(self.client.post(self.url, {**self.data, **fields}, format='json').status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('password'))
        self.assertFalse(AuditEvent.objects.filter(action='user.password_changed_by_admin').exists())

    def test_students_and_editors_cannot_reset_and_admin_cannot_take_over_staff(self):
        editor = get_user_model().objects.create_user('password-editor', is_staff=True)
        editor.groups.add(Group.objects.get(name='Editor'))
        for actor in [self.user, editor]:
            self.client.force_authenticate(actor)
            self.assertEqual(self.client.post(self.url, self.data, format='json').status_code, 403)
        self.client.force_authenticate(self.staff)
        staff_url = f'/api/backoffice/users/{editor.pk}/password/'
        self.assertEqual(self.client.post(staff_url, self.data, format='json').status_code, 403)
        self.staff.is_superuser = True
        self.staff.save(update_fields=['is_superuser'])
        self.assertEqual(self.client.post(staff_url, self.data, format='json').status_code, 200)

    def test_failed_audit_rolls_back_password_change(self):
        with patch('apps.backoffice.user_password_api.log', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                self.client.post(self.url, self.data, format='json')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('password'))
