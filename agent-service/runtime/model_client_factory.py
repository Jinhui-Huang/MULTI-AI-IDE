from runtime.model_settings import ModelSettings


class ModelClientFactory:
    """Creates AutoGen model clients from safe runtime settings."""

    SUPPORTED_PROVIDER = "openai_compatible"

    def create_openai_compatible_client(self, settings: ModelSettings):
        if settings.provider != self.SUPPORTED_PROVIDER:
            raise ValueError("MODEL_PROVIDER_NOT_SUPPORTED")

        from autogen_ext.models.openai import OpenAIChatCompletionClient

        return OpenAIChatCompletionClient(
            model=settings.model,
            api_key=settings.api_key,
            base_url=settings.base_url,
            model_info={
                "vision": False,
                "function_calling": False,
                "json_output": False,
                "family": "unknown",
                "structured_output": False,
            },
        )
