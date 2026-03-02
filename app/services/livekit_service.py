# app/services/livekit_service.py
from livekit.api import AccessToken, VideoGrants
from app.core.config import settings  # ← clean import now

def generate_token(room_name: str, participant_name: str, is_technician: bool = False) -> str:
    token = AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    
    grants = VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True
    )
    
    token.with_grants(grants).with_name(participant_name).with_identity(participant_name)
    return token.to_jwt()