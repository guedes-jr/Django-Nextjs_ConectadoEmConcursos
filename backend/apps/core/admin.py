from django.contrib import admin
from apps.core.models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "avatar")
    search_fields = ("user__username", "user__email")
