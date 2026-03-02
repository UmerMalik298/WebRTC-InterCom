# app/api/v1/routes/rooms.py
from fastapi import APIRouter, HTTPException
from livekit.api import LiveKitAPI, CreateRoomRequest, SendDataRequest
from app.core.config import settings
from app.models.room import CreateRoomBody
from app.db.memory_store import created_rooms
import json

router = APIRouter()

@router.post("/rooms/create")
async def create_room(body: CreateRoomBody):
    if body.room_name in created_rooms:
        raise HTTPException(status_code=400, detail="Room already exists")
    api = LiveKitAPI(settings.LIVEKIT_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    try:
        await api.room.create_room(CreateRoomRequest(name=body.room_name))
    finally:
        await api.aclose()
    created_rooms[body.room_name] = {
        "name": body.room_name,
        "label": body.label or body.room_name.replace("-", " ").title(),
        "status": "online"
    }
    return {"message": f"Room {body.room_name} created", "room": created_rooms[body.room_name]}

@router.get("/rooms")
async def list_rooms():
    return {"rooms": list(created_rooms.values())}

@router.delete("/rooms/{room_name}")
async def delete_room(room_name: str):
    if room_name not in created_rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    created_rooms.pop(room_name)
    return {"message": f"Room {room_name} deleted"}

@router.post("/rooms/broadcast")
async def broadcast_to_all():
    api = LiveKitAPI(settings.LIVEKIT_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    try:
        for room_name in created_rooms:
            await api.room.send_data(SendDataRequest(
                room=room_name,
                data=json.dumps({"type": "broadcast"}).encode(),
                reliable=True
            ))
    finally:
        await api.aclose()
    return {"message": "Broadcast sent to all rooms"}

@router.post("/rooms/emergency-override")
async def emergency_override():
    api = LiveKitAPI(settings.LIVEKIT_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    try:
        for room_name in created_rooms:
            await api.room.send_data(SendDataRequest(
                room=room_name,
                data=json.dumps({"type": "emergency_override", "priority": "high"}).encode(),
                reliable=True
            ))
    finally:
        await api.aclose()
    return {"message": "Emergency override activated"}