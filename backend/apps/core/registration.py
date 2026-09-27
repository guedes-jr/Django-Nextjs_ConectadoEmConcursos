from dj_rest_auth.registration.serializers import RegisterSerializer
from rest_framework import serializers


class TermsRegisterSerializer(RegisterSerializer):
    """Require an explicit acceptance before an account can be created."""

    accepted_terms = serializers.BooleanField(write_only=True)

    def validate_accepted_terms(self, value):
        if value is not True:
            raise serializers.ValidationError(
                "Você precisa aceitar os Termos de Uso e a Política de Privacidade."
            )
        return value
