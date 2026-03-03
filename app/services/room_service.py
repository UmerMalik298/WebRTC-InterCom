from app.db.supabase_client import supabase

TABLE = "rooms"

async def get_all_rooms():
    res = supabase.table(TABLE).select("*").execute()
    return res.data

async def get_room_by_name(room_name: str):
    res = supabase.table(TABLE).select("*").eq("name", room_name).execute()
    return res.data[0] if res.data else None

async def create_room_record(room_name: str, label: str):
    res = supabase.table(TABLE).insert({
        "name": room_name,
        "label": label,
        "status": "online"
    }).execute()
    return res.data[0] if res.data else None

async def delete_room_record(room_name: str):
    res = supabase.table(TABLE).delete().eq("name", room_name).execute()
    return res.data

async def update_room_status(room_name: str, status: str):
    res = supabase.table(TABLE).update({"status": status}).eq("name", room_name).execute()
    return res.data[0] if res.data else None