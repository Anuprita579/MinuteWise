from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

from app.routes import auth, meetings, transcription

load_dotenv()

app = FastAPI(
    title="Meeting Transcription API",
    description="API for transcribing meeting audio files and extracting insights",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI available at /docs
    redoc_url="/redoc"  # ReDoc available at /redoc
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# MongoDB connection
@app.on_event("startup")
async def startup_db_client():
    app.mongodb_client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    app.mongodb = app.mongodb_client[os.getenv("DB_NAME", "meeting_transcription")]
    print(f"Connected to MongoDB: {os.getenv('DB_NAME', 'meeting_transcription')}")

@app.on_event("shutdown")
async def shutdown_db_client():
    app.mongodb_client.close()
    print("Disconnected from MongoDB")

# Health check endpoint
@app.get("/", tags=["health"])
async def health_check():
    return {"status": "healthy", "message": "Meeting Transcription API is running"}

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(transcription.router, prefix="/api/transcription", tags=["Transcription"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        reload=True,  # Enable auto-reload for development
        log_level="info"
    )