from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    LIVEKIT_URL: str
    LIVEKIT_API_KEY: str
    LIVEKIT_API_SECRET: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    class Config:
        env_file = ".env"

settings = Settings()