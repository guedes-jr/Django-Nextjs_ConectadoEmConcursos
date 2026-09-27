from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateOfficialExamStorage(FileSystemStorage):
    """Storage local sem URL pública para PDFs oficiais."""

    def __init__(self):
        super().__init__(location=settings.OFFICIAL_EXAMS_ROOT, base_url="/private-official-exams/")

    def url(self, name):
        raise ValueError("Arquivos oficiais são privados e não possuem URL pública.")


official_exam_storage = PrivateOfficialExamStorage()
