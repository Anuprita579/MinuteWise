from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.requests import Request
from typing import Optional
import aiofiles
import os
import asyncio
from datetime import datetime
from bson import ObjectId
import logging
import tempfile
from pathlib import Path
from pydantic import BaseModel
from typing import List, Dict, Any

from ..models.meeting import Meeting, Participant, ActionItem
from ..services.transcription_service import get_transcription_service
from ..services.summary_service import summary_service
from ..services.action_item_service import action_item_service
from ..utils.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/live/{meeting_id}")
async def live_transcription(
    meeting_id: str,
    request: Request,
    audio: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    temp_path = None
    try:
        # Verify meeting exists and user has access
        meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check access permissions
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")

        # Read audio content
        content = await audio.read()
        if len(content) < 100:  # Too small to be meaningful audio
            return {"transcript": ""}

        # Create temp directory
        temp_dir = "temp"
        os.makedirs(temp_dir, exist_ok=True)
        
        # Save audio to temp file
        file_ext = Path(audio.filename).suffix or ".webm"
        timestamp = datetime.utcnow().timestamp()
        temp_path = os.path.join(temp_dir, f"live_chunk_{timestamp}{file_ext}")

        async with aiofiles.open(temp_path, 'wb') as f:
            await f.write(content)

        # Transcribe audio in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        service = get_transcription_service()
        transcript = await loop.run_in_executor(
            None, service.transcribe_audio, temp_path
        )

        # Clean and validate transcript
        clean_transcript = transcript.strip() if transcript else ""
        
        if clean_transcript:
            # Save to database as live transcript entry
            transcript_entry = {
                "participant": current_user.get("name", "Unknown"),
                "user_id": current_user["_id"],
                "text": clean_transcript,
                "timestamp": datetime.utcnow(),
                "final": True
            }
            
            # Update meeting with live transcript
            await request.app.mongodb.meetings.update_one(
                {"_id": ObjectId(meeting_id)},
                {
                    "$push": {
                        "live_transcript": transcript_entry
                    },
                    "$set": {
                        "last_activity": datetime.utcnow()
                    }
                }
            )
            
            logger.info(f"Live transcript saved for meeting {meeting_id}: {len(clean_transcript)} chars")

        return {"transcript": clean_transcript}

    except Exception as e:
        logger.error(f"Live transcription error for meeting {meeting_id}: {str(e)}")
        return {"transcript": "", "error": str(e)}
    
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                logger.debug(f"Cleaned up temp file: {temp_path}")
            except Exception as e:
                logger.error(f"Failed to clean up temp file {temp_path}: {e}")

@router.get("/{meeting_id}/live")
async def get_live_transcript(
    meeting_id: str,
    request: Request,
    current_user = Depends(get_current_user),
    since: Optional[str] = None  # ISO timestamp to get transcripts since
):
    """Get the live transcript for a meeting"""
    try:
        meeting = await request.app.mongodb.meetings.find_one(
            {"_id": ObjectId(meeting_id)},
            {"live_transcript": 1, "created_by": 1, "participants": 1}
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        live_transcript = meeting.get("live_transcript", [])
        
        # Filter by timestamp if requested
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
                live_transcript = [
                    entry for entry in live_transcript
                    if entry.get("timestamp", datetime.min) > since_dt
                ]
            except ValueError:
                logger.warning(f"Invalid since parameter: {since}")
        
        return {"live_transcript": live_transcript}
        
    except Exception as e:
        logger.error(f"Error fetching live transcript for meeting {meeting_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching live transcript: {str(e)}")

@router.post("/upload")
async def upload_audio(
    request: Request,
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
    title: Optional[str] = Form(None),
    participants: Optional[str] = Form("[]"),
    current_user = Depends(get_current_user)
):
    try:
        # Create upload directory using Path for cross-platform compatibility
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.utcnow().timestamp()
        safe_filename = f"{timestamp}_{audio.filename}"
        file_path = upload_dir / safe_filename
        
        logger.info(f"Uploading file to: {file_path}")
        
        # Save uploaded file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await audio.read()
            await f.write(content)
        
        # Verify file was saved
        if not file_path.exists():
            logger.error(f"Failed to save file: {file_path}")
            raise HTTPException(status_code=500, detail="Failed to save uploaded file")
            
        file_size = file_path.stat().st_size
        logger.info(f"File saved successfully: {file_path} ({file_size} bytes)")
        
        # Create meeting record
        meeting_data = {
            "title": title or f"Meeting {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            "audio_file": str(file_path),  # Convert Path to string for MongoDB
            "created_by": ObjectId(current_user["_id"]),
            "status": "processing",
            "created_at": datetime.utcnow(),
            "live_transcript": []  # Initialize empty live transcript
        }
        
        result = await request.app.mongodb.meetings.insert_one(meeting_data)
        meeting_id = str(result.inserted_id)
        
        logger.info(f"Created meeting {meeting_id}, starting background processing")
        
        # Start background processing
        background_tasks.add_task(process_audio_file, request.app.mongodb, meeting_id, str(file_path))
        
        return {"meeting_id": meeting_id, "message": "Upload successful, processing started"}
        
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/{meeting_id}")
async def get_meeting(
    meeting_id: str,
    request: Request,
    current_user = Depends(get_current_user)
):
    try:
        meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        meeting["_id"] = str(meeting["_id"])
        meeting["created_by"] = str(meeting["created_by"])
        
        # Convert ObjectIds in live transcript
        if "live_transcript" in meeting:
            for entry in meeting["live_transcript"]:
                if "user_id" in entry and isinstance(entry["user_id"], ObjectId):
                    entry["user_id"] = str(entry["user_id"])
        
        return meeting
        
    except Exception as e:
        logger.error(f"Error fetching meeting {meeting_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching meeting: {str(e)}")

# Test endpoints (keep existing ones)
@router.get("/test-whisper")
async def test_whisper_model():
    """Test if Whisper model loads correctly"""
    try:
        service = get_transcription_service()
        # Simple test - just check if model loads
        test_result = {
            "model_loaded": True,
            "model_name": "base"  # Assuming base model
        }
        
        return {
            "success": True,
            **test_result
        }
    except Exception as e:
        logger.error(f"Whisper test failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def process_audio_file(mongodb, meeting_id: str, audio_path: str):
    """Background task to process uploaded audio files"""
    try:
        logger.info(f"Processing audio file for meeting {meeting_id}: {audio_path}")
        audio_path = Path(audio_path).resolve()
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Use thread pool for CPU-intensive transcription
        loop = asyncio.get_event_loop()
        service = get_transcription_service()
        transcript = await loop.run_in_executor(
            None, service.transcribe_audio, str(audio_path)
        )

        summary = await summary_service.generate_summary(transcript)
        action_items = await action_item_service.extract_action_items(transcript)

        await mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {
                "$set": {
                    "transcript": transcript,
                    "summary": summary,
                    "action_items": action_items,
                    "status": "completed",
                    "updated_at": datetime.utcnow()
                }
            }
        )
        logger.info(f"Successfully processed audio for meeting {meeting_id}")

    except Exception as e:
        logger.error(f"Audio processing failed for meeting {meeting_id}: {str(e)}")
        await mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {
                "$set": {
                    "status": "failed",
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                }
            }
        )