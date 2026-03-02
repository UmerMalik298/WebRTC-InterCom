# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes import rooms, token

app = FastAPI(title="PTT Intercom Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(token.router, prefix="/api", tags=["Token"])
app.include_router(rooms.router, prefix="/api", tags=["Rooms"])

@app.get("/")
async def root():
    return {"status": "PTT Backend Running"}