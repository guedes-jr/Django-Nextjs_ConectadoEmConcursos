from django.contrib import admin
from apps.chat.models import ChatUsage, Conversation, Message

admin.site.register(Conversation)
admin.site.register(Message)
admin.site.register(ChatUsage)
