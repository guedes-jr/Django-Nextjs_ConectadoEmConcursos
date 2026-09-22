from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.sketches.models import Sketch
from apps.sketches.serializers import SketchSerializer


class SketchViewSet(viewsets.ModelViewSet):
    serializer_class = SketchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Sketch.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"])
    def recent(self, request):
        sketches = self.get_queryset()[:10]
        return Response(self.get_serializer(sketches, many=True).data)
