from django.contrib import admin
from .models import BillingCheckout, PaymentEvent, Plan, StripeWebhookEvent, Subscription

admin.site.register(Plan)


class ReadOnlyBillingAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# Financial state changes go through audited services, never direct admin edits.
for model in (Subscription, BillingCheckout, PaymentEvent, StripeWebhookEvent):
    admin.site.register(model, ReadOnlyBillingAdmin)
