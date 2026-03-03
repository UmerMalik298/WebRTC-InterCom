from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CreateRoomBody(BaseModel):
    room_name: str
    label: Optional[str] = None

class RoomSchema(BaseModel):
    id: Optional[str] = None
    name: str
    label: str
    status: str = "online"
    created_at: Optional[datetime] = None