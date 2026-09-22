from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.models import SocialAccount


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Customized adapter to skip the signup form and auto-create users
    from social login providers (e.g., Google).
    """

    def is_auto_signup_allowed(self, request, sociallogin):
        """
        Enable auto signup - skip the signup page entirely.
        """
        return True

    def pre_social_login(self, request, sociallogin):
        """
        Called after social login is successful but before creating the user.
        """
        # If the user already exists, connect the social account automatically
        if sociallogin.is_existing:
            return

        # Try to find an existing user with the same email
        try:
            user = sociallogin.user.__class__.objects.get(
                email=sociallogin.email_addresses[0].email
                if sociallogin.email_addresses
                else sociallogin.user.email
            )
            # Connect the social account to the existing user
            sociallogin.connect(request, user)
        except sociallogin.user.__class__.DoesNotExist:
            # User doesn't exist, will be created automatically
            pass
