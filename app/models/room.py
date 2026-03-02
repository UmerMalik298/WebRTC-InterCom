from pydantic import BaseModel

class CreateRoomBody(BaseModel):
    room_name: str
    label: str = ""

class RoomResponse(BaseModel):
    name: str
    label: str
    status: str