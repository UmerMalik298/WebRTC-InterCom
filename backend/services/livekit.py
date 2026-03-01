import os
from livekit.api import AccessToken, VideoGrants
from dotenv import load_dotenv

load_dotenv()

def generate_token(room_name: str, participant_name: str, is_technician: bool = False) -> str:
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    print("=== DEBUG ===")
    print(f"CWD: {os.getcwd()}")
    print(f"API KEY: {api_key}")
    print(f"API SECRET: {api_secret}")
    print("=============")
    if not api_key or not api_secret:
        raise ValueError(f"Env vars not loaded! CWD is: {os.getcwd()}")
    token = AccessToken(api_key, api_secret)
    
    grants = VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True
    )
    
    token.with_grants(grants).with_name(participant_name).with_identity(participant_name)
    
    return token.to_jwt()