import os
from livekit.api import LiveKitAPI, AccessToken, VideoGrants
from dotenv import load_dotenv

load_dotenv()

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

def generate_token(room_name: str, participant_name: str, is_technician: bool = False) -> str:
    """
    Generate a LiveKit JWT token for a participant.
    Technicians get publish + subscribe rights.
    Patients get subscribe-only by default (they only speak when triggered).
    """
    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    
    grants = VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,          # Allow audio publishing
        can_subscribe=True,        # Allow receiving audio
        can_publish_data=True      # Allow data messages (PTT signal)
    )
    
    token.with_grants(grants).with_name(participant_name).with_identity(participant_name)
    
    return token.to_jwt()