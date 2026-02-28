from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.livekit import generate_token

router = APIRouter()

class TokenRequest(BaseModel):
    room_name: str        # e.g., "room-1", "room-2"
    participant_name: str # e.g., "technician-1", "patient-room1"
    is_technician: bool = False

class TokenResponse(BaseModel):
    token: str
    livekit_url: str

@router.post("/token", response_model=TokenResponse)
async def get_token(request: TokenRequest):
    """
    Frontend calls this endpoint to get a token before joining a LiveKit room.
    The technician dashboard calls this when selecting a room.
    """
    import os
    
    if not request.room_name or not request.participant_name:
        raise HTTPException(status_code=400, detail="room_name and participant_name required")
    
    token = generate_token(
        room_name=request.room_name,
        participant_name=request.participant_name,
        is_technician=request.is_technician
    )
    
    return TokenResponse(
        token=token,
        livekit_url=os.getenv("LIVEKIT_URL")
    )