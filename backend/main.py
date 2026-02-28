from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import token, rooms

app = FastAPI(title="PTT Intercom Backend")

from fastapi.responses import HTMLResponse

from fastapi.responses import HTMLResponse


# Allow frontend to call your API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(token.router, prefix="/api", tags=["Token"])
app.include_router(rooms.router, prefix="/api", tags=["Rooms"])

@app.get("/")
async def root():
    return {"status": "PTT Backend Running"}