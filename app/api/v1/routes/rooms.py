from fastapi import APIRouter, HTTPException
from livekit.api import LiveKitAPI, CreateRoomRequest, ListRoomsRequest
from livekit.api.room_service import SendDataRequest
from app.core.config import settings
from app.models.room import CreateRoomBody
from app.services.room_service import (
    get_all_rooms, get_room_by_name,
    create_room_record, delete_room_record
)
import json

router = APIRouter()


@router.post("/rooms/create")
async def create_room(body: CreateRoomBody):
    # Check Supabase — not memory
    existing = await get_room_by_name(body.room_name)
    if existing:
        raise HTTPException(status_code=400, detail="Room already exists")

    api = LiveKitAPI(
        settings.LIVEKIT_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET
    )
    try:
        await api.room.create_room(CreateRoomRequest(name=body.room_name))
    finally:
        await api.aclose()

    label = body.label or body.room_name.replace("-", " ").title()
    room = await create_room_record(body.room_name, label)
    return {"message": f"Room {body.room_name} created", "room": room}


@router.get("/rooms")
async def list_rooms():
    rooms = await get_all_rooms()
    return {"rooms": rooms}


@router.delete("/rooms/{room_name}")
async def delete_room(room_name: str):
    existing = await get_room_by_name(room_name)
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")
    await delete_room_record(room_name)
    return {"message": f"Room {room_name} deleted"}


@router.post("/rooms/broadcast")
async def broadcast_to_all():
    rooms = await get_all_rooms()
    if not rooms:
        return {"message": "No rooms available", "rooms_notified": 0}

    api = LiveKitAPI(
        settings.LIVEKIT_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET
    )
    errors = []
    notified = 0

    try:
        for room in rooms:
            try:
                await api.room.send_data(SendDataRequest(
                    room=room["name"],
                    data=json.dumps({"type": "broadcast"}).encode(),
                    reliable=True,
                    destination_identities=[],
                ))
                notified += 1
            except Exception as e:
                errors.append(f"{room['name']}: {str(e)}")
    finally:
        await api.aclose()

    return {
        "message": "Broadcast sent" if not errors else "Partial broadcast",
        "rooms_notified": notified,
        "errors": errors
    }


@router.post("/rooms/emergency-override")
async def emergency_override():
    rooms = await get_all_rooms()
    if not rooms:
        return {"message": "No rooms available", "rooms_notified": 0}

    api = LiveKitAPI(
        settings.LIVEKIT_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET
    )
    errors = []
    notified = 0

    try:
        for room in rooms:
            try:
                await api.room.send_data(SendDataRequest(
                    room=room["name"],
                    data=json.dumps({
                        "type": "emergency_override",
                        "priority": "high"
                    }).encode(),
                    reliable=True,
                    destination_identities=[],
                ))
                notified += 1
            except Exception as e:
                errors.append(f"{room['name']}: {str(e)}")
    finally:
        await api.aclose()

    return {
        "message": "Emergency activated" if not errors else "Partial emergency",
        "rooms_notified": notified,
        "errors": errors
    }