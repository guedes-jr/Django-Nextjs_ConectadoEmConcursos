import hashlib
from pathlib import Path
import tempfile
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .models import Concurso, ConcursoResource
from .files import concurso_file_storage
from apps.questions.models import Exam

PDF=b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'


class ResourceUploadTests(TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name)
        isolated=override_settings(OFFICIAL_EXAMS_ROOT=self.root/'private',MEDIA_ROOT=self.root/'public',BACKUP_DIR=self.root/'backups')
        isolated.enable();self.addCleanup(isolated.disable)
        self.editor=get_user_model().objects.create_user('upload-editor',is_staff=True)
        self.editor.groups.add(Group.objects.get(name='Editor'))
        self.student=get_user_model().objects.create_user('upload-student')
        self.client=APIClient();self.client.force_authenticate(self.editor)
        self.contest=Concurso.objects.create(source='manual',external_id='uploads',title='Concurso com arquivos')
        self.base=f'/api/backoffice/content/editorial/concursos/{self.contest.pk}/resources/'

    def create(self,**changes):
        data={'title':'Edital enviado','kind':'notice','file':SimpleUploadedFile('edital.pdf',PDF,content_type='application/pdf'),**changes}
        return self.client.post(self.base,data,format='multipart')

    def file_url(self,pk):return f'/api/concursos/{self.contest.pk}/resources/{pk}/file/'

    def test_upload_private_preview_publish_and_download_for_student(self):
        response=self.create()
        self.assertEqual(response.status_code,201,response.data)
        item=ConcursoResource.objects.get(pk=response.data['id'])
        self.assertFalse(item.is_published)
        self.assertEqual(item.file_sha256,hashlib.sha256(PDF).hexdigest())
        self.assertEqual(item.file_size,len(PDF))
        self.assertEqual(item.file_name,'edital.pdf')
        self.assertNotIn('file',response.data)
        self.assertNotIn(item.file.name,str(response.data))
        self.assertTrue(item.file.name.startswith('concurso-materials/'))
        with self.assertRaises(ValueError):_ = item.file.url
        self.assertEqual(Path(item.file.path).stat().st_mode & 0o777,0o600)
        download=self.client.get(self.file_url(item.pk));self.assertEqual(download.status_code,200);download.close()
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.file_url(item.pk)).status_code,404)
        self.client.force_authenticate(self.editor)
        changed=self.client.patch(f'{self.base}{item.pk}/',{'is_published':True,'updated_at':response.data['updated_at']},format='json')
        self.assertEqual(changed.status_code,200,changed.data)
        self.client.force_authenticate(self.student)
        public=self.client.get(f'/api/concursos/{self.contest.pk}/').data['resources'][0]
        self.assertEqual(public['url'],self.file_url(item.pk));self.assertTrue(public['has_file'])
        download=self.client.get(public['url']);self.assertEqual(download.status_code,200)
        self.assertIn('attachment;',download['Content-Disposition']);self.assertEqual(download['Cache-Control'],'private, no-store')
        self.assertEqual(b''.join(download.streaming_content),PDF);download.close()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(public['url']).status_code,403)

    def test_rejects_invalid_empty_large_and_conflicting_sources(self):
        for name,content,mime in [('file.txt',PDF,'application/pdf'),('fake.pdf',b'<html>fake</html>','application/pdf'),('empty.pdf',b'','application/pdf'),('bad.pdf',PDF,'text/html')]:
            self.assertEqual(self.create(file=SimpleUploadedFile(name,content,content_type=mime)).status_code,400)
        with patch('apps.concursos.files.MAX_UPLOAD_BYTES',4):self.assertEqual(self.create().status_code,400)
        self.assertEqual(self.create(url='https://example.test/also.pdf').status_code,400)
        self.assertFalse(ConcursoResource.objects.exists())
        self.assertEqual(list(self.root.rglob('*.pdf')),[])

    def test_replacement_stale_update_and_removal_clean_files_after_commit(self):
        response=self.create();item=ConcursoResource.objects.get(pk=response.data['id']);old=Path(item.file.path)
        stale=self.client.patch(f'{self.base}{item.pk}/',{'updated_at':'old','file':SimpleUploadedFile('novo.pdf',PDF,content_type='application/pdf')},format='multipart')
        self.assertEqual(stale.status_code,409);self.assertEqual(len(list(self.root.rglob('*.pdf'))),1)
        with self.captureOnCommitCallbacks(execute=True):
            changed=self.client.patch(f'{self.base}{item.pk}/',{'updated_at':response.data['updated_at'],'file':SimpleUploadedFile('novo.pdf',PDF+b'\n',content_type='application/pdf')},format='multipart')
        self.assertEqual(changed.status_code,200,changed.data);self.assertFalse(old.exists())
        item.refresh_from_db();new=Path(item.file.path)
        with self.captureOnCommitCallbacks(execute=True):
            changed=self.client.patch(f'{self.base}{item.pk}/',{'updated_at':changed.data['updated_at'],'url':'https://example.test/link','remove_file':True},format='json')
        self.assertEqual(changed.status_code,200,changed.data);self.assertFalse(new.exists());item.refresh_from_db();self.assertFalse(item.file)

    def test_rollback_does_not_leave_new_file_or_lose_previous_file(self):
        response=self.create();item=ConcursoResource.objects.get(pk=response.data['id']);old=item.file.name
        with patch('apps.backoffice.concurso_resources_api.audit_log',side_effect=RuntimeError('audit failed')):
            with self.assertRaises(RuntimeError):
                self.client.patch(f'{self.base}{item.pk}/',{'updated_at':response.data['updated_at'],'file':SimpleUploadedFile('novo.pdf',PDF,content_type='application/pdf')},format='multipart')
        item.refresh_from_db();self.assertEqual(item.file.name,old)
        self.assertEqual(len(list(self.root.rglob('*.pdf'))),1)

    def test_archived_contest_hidden_exam_and_other_contest_cannot_download(self):
        exam=Exam.objects.create(title='Cargo',banca='FCC',year=2026,concurso=self.contest)
        response=self.create(exam=exam.pk,is_published=True);self.assertEqual(response.status_code,201,response.data)
        self.client.force_authenticate(self.student)
        other=Concurso.objects.create(source='manual',external_id='other',title='Outro')
        self.assertEqual(self.client.get(f'/api/concursos/{other.pk}/resources/{response.data["id"]}/file/').status_code,404)
        exam.is_published=False;exam.save()
        self.assertEqual(self.client.get(self.file_url(response.data['id'])).status_code,404)
        exam.is_published=True;exam.save();self.contest.editorial_status='archived';self.contest.save()
        self.assertEqual(self.client.get(self.file_url(response.data['id'])).status_code,404)


    def test_backup_lock_prevents_writes_without_creating_an_orphan(self):
        from apps.backoffice.backup_storage import operation_lock
        with operation_lock(self.root/'backups'):
            response=self.create()
        self.assertEqual(response.status_code,503)
        self.assertFalse(ConcursoResource.objects.exists())
        self.assertEqual(list(self.root.rglob('*.pdf')),[])

    def test_delete_uploaded_material_removes_file_after_commit(self):
        response=self.create();item=ConcursoResource.objects.get(pk=response.data['id']);path=Path(item.file.path)
        with self.captureOnCommitCallbacks(execute=True):
            deleted=self.client.delete(f'{self.base}{item.pk}/',{'updated_at':response.data['updated_at']},format='json')
        self.assertEqual(deleted.status_code,204);self.assertFalse(path.exists())


    def test_storage_failure_cleans_partial_upload_and_keeps_existing_pdf(self):
        response=self.create();item=ConcursoResource.objects.get(pk=response.data['id']);old=Path(item.file.path)
        def fail(storage,name,content):
            target=Path(storage.path(name));target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(b'partial')
            raise OSError('disk failure')
        with patch('django.core.files.storage.FileSystemStorage._save',new=fail):
            with self.assertRaises(OSError):
                self.client.patch(f'{self.base}{item.pk}/',{'updated_at':response.data['updated_at'],'file':SimpleUploadedFile('novo.pdf',PDF,content_type='application/pdf')},format='multipart')
        self.assertTrue(old.exists());self.assertEqual(len(list(self.root.rglob('*.pdf'))),1)
