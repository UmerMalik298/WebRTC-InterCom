# app/api/v1/routes/token.py
from fastapi import APIRouter, HTTPException
from app.models.token import TokenRequest, TokenResponse
from app.services.livekit_service import generate_token
from app.core.config import settings

router = APIRouter()

@router.post("/token", response_model=TokenResponse)
async def get_token(request: TokenRequest):
    if not request.room_name or not request.participant_name:
        raise HTTPException(status_code=400, detail="room_name and participant_name required")
    token = generate_token(request.room_name, request.participant_name, request.is_technician)
    return TokenResponse(token=token, livekit_url=settings.LIVEKIT_URL)