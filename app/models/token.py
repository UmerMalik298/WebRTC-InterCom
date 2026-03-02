from pydantic import BaseModel

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str
    is_technician: bool = False

class TokenResponse(BaseModel):
    token: str
    livekit_url: str