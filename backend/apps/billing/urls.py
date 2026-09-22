from django.urls import path
from apps.billing.views import plans, subscription

urlpatterns = [path("plans/", plans), path("subscription/", subscription)]
