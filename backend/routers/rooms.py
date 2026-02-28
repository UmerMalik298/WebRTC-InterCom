from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit.api import LiveKitAPI
from livekit.api import CreateRoomRequest
import os

router = APIRouter()

# In-memory room storage (for POC — replace with DB later)
created_rooms: dict = {}  # room_name -> room metadata


class CreateRoomBody(BaseModel):
    room_name: str
    label: str = ""  # human-friendly name like "MRI Room 1"


@router.post("/rooms/create")
async def create_room(body: CreateRoomBody):
    """Admin calls this to create a room"""
    if body.room_name in created_rooms:
        raise HTTPException(status_code=400, detail="Room already exists")

    # Create in LiveKit
    api = LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    try:
        await api.room.create_room(CreateRoomRequest(name=body.room_name))
    finally:
        await api.aclose()

    # Save to our in-memory store
    created_rooms[body.room_name] = {
        "name": body.room_name,
        "label": body.label or body.room_name.replace("-", " ").title(),
        "status": "online"
    }

    return {"message": f"Room {body.room_name} created", "room": created_rooms[body.room_name]}


@router.get("/rooms")
async def list_rooms():
    """Technician dashboard calls this to get available rooms"""
    return {"rooms": list(created_rooms.values())}


@router.delete("/rooms/{room_name}")
async def delete_room(room_name: str):
    """Admin can remove a room"""
    if room_name not in created_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    created_rooms.pop(room_name)
    return {"message": f"Room {room_name} deleted"}