class ModelClientFactory:
    """Builds OpenAI-compatible / Ollama / Azure clients for AutoGen."""
    def create(self, settings):
        # TODO: return OpenAIChatCompletionClient(model=..., base_url=..., api_key=...)
        return {'provider': settings.get('provider', 'mock')}
