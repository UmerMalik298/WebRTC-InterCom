from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit.api import LiveKitAPI
from livekit.api import CreateRoomRequest
import os
from livekit.api import RoomServiceClient, SendDataRequest
import json
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


    
@router.post("/rooms/broadcast")
async def broadcast_to_all(body: dict):
    """Technician sends audio signal + data message to ALL rooms"""
    message = body.get("message", "broadcast")
    
    api = LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    try:
        for room_name in created_rooms:
            await api.room.send_data(SendDataRequest(
                room=room_name,
                data=json.dumps({"type": "broadcast", "message": message}).encode(),
                reliable=True
            ))
    finally:
        await api.aclose()

    return {"message": "Broadcast sent to all rooms"}


@router.post("/rooms/emergency-override")
async def emergency_override(body: dict):
    """
    Emergency override:
    - Sends high-priority data message to ALL rooms
    - Mutes all non-technician participants
    """
    api = LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    try:
        for room_name in created_rooms:
            # Send emergency signal to all room UIs
            await api.room.send_data(SendDataRequest(
                room=room_name,
                data=json.dumps({"type": "emergency_override", "priority": "high"}).encode(),
                reliable=True
            ))
            # Mute all participants in the room (except technician)
            participants = await api.room.list_participants(room=room_name)
            for p in participants.participants:
                if "technician" not in p.identity.lower():
                    await api.room.mute_published_track(
                        room=room_name,
                        identity=p.identity,
                        track_sid=next((t.sid for t in p.tracks if t.type == 0), None),  # type 0 = audio
                        muted=True
                    )
    finally:
        await api.aclose()

    return {"message": "Emergency override activated — all rooms notified, patients muted"}