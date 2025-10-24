from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Meeting Transcription API",
    description="API for meeting transcription, summarization, and action item extraction",
    version="2.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://your-frontend-domain.com"  # Add your production domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from app.routes import transcription, email, jira, admin_edit

# Include routers
app.include_router(transcription.router)
app.include_router(email.router)
app.include_router(jira.router)
app.include_router(admin_edit.router)

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Meeting Transcription API",
        "version": "2.0.0",
        "status": "healthy",
        "endpoints": {
            "transcription": "/transcription",
            "email": "/email",
            "jira": "/jira",
            "docs": "/docs"
        }
    }

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "supabase_configured": bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY")),
        "email_configured": bool(os.getenv("SMTP_EMAIL") and os.getenv("SMTP_PASSWORD")),
        "jira_configured": bool(os.getenv("JIRA_EMAIL") and os.getenv("JIRA_API_TOKEN"))
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )