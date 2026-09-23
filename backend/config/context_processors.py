from django.conf import settings


def app_globals(request):
    return {
        "APP_NAME": "Conectado em Concursos",
        "FRONTEND_URL": settings.FRONTEND_URL,
    }