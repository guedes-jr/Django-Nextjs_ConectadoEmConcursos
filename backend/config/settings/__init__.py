import os


environment = os.getenv("DJANGO_ENV", "development").lower()

if environment in {"production", "prod"}:
    from .prod import *  # noqa: F401,F403
elif environment in {"development", "dev"}:
    from .dev import *  # noqa: F401,F403
else:
    raise RuntimeError(
        "DJANGO_ENV must be one of: development, dev, production, prod."
    )
