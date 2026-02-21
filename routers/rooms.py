from fastapi import APIRouter
from livekit.api import LiveKitAPI
import os

router = APIRouter()

ROOMS = ["room-1", "room-2", "room-3", "room-4"]  # Your 3-4 patient rooms

@router.get("/rooms")
async def list_rooms():
    """Returns all configured rooms with their live status"""
    api = LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    
    active_rooms = []
    try:
        live_rooms = await api.room.list_rooms()
        active_room_names = [r.name for r in live_rooms.rooms]
    except:
        active_room_names = []
    finally:
        await api.aclose()
    
    result = []
    for room in ROOMS:
        result.append({
            "name": room,
            "status": "online" if room in active_room_names else "offline",
            "label": room.replace("-", " ").title()
        })
    
    return {"rooms": result}


@router.post("/rooms/{room_name}/create")
async def create_room(room_name: str):
    """Pre-create a room (optional — LiveKit auto-creates on join)"""
    api = LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    
    from livekit.api import CreateRoomRequest
    room = await api.room.create_room(CreateRoomRequest(name=room_name))
    await api.aclose()
    
    return {"message": f"Room {room_name} created", "room": room.name}