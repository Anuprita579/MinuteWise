# backend/app/routes/transcription.py - DEBUGGING VERSION

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import os
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

from ..services.transcription_service import get_transcription_service
from ..services.summary_service import summary_service
from ..services.action_item_service import action_item_service
from ..services.email_service import email_service

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transcription", tags=["transcription"])

# Initialize Supabase client with service key
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("Supabase credentials missing!")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Supabase client initialized")
    # Log which key is being used (first 10 chars only for security)
    logger.info(f"Using service key starting with: {SUPABASE_SERVICE_KEY[:10]}...")


class ProcessAudioRequest(BaseModel):
    meeting_id: str
    audio_url: str


@router.post("/process-audio")
async def process_audio_from_url(
    request: ProcessAudioRequest,
    background_tasks: BackgroundTasks
):
    """
    Process audio from Supabase storage URL
    Called by frontend after upload
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        logger.info(f"Received processing request for meeting {request.meeting_id}")
        logger.info(f"Audio URL: {request.audio_url}")
        
        # Add a small delay to ensure database consistency
        import asyncio
        await asyncio.sleep(0.5)
        
        # Try to fetch ALL meetings first to see if we can access the table
        try:
            all_meetings = supabase.table('meetings').select('id, title, created_by, status').execute()
            logger.info(f"Total meetings in database: {len(all_meetings.data) if all_meetings.data else 0}")
            if all_meetings.data:
                logger.info(f"Sample meeting IDs: {[m['id'] for m in all_meetings.data[:3]]}")
        except Exception as e:
            logger.error(f"Error fetching all meetings: {e}")
        
        # Now try to fetch the specific meeting
        meeting_response = supabase.table('meetings')\
            .select('*')\
            .eq('id', request.meeting_id)\
            .execute()
        
        logger.info(f"Meeting query response: {meeting_response}")
        logger.info(f"Meeting data: {meeting_response.data}")
        logger.info(f"Meeting count: {meeting_response.count if hasattr(meeting_response, 'count') else 'N/A'}")
        
        if not meeting_response.data or len(meeting_response.data) == 0:
            logger.error(f"Meeting not found: {request.meeting_id}")
            logger.error("This could be due to:")
            logger.error("1. Row Level Security (RLS) policies blocking access")
            logger.error("2. Meeting was not committed to database yet")
            logger.error("3. Wrong service key being used")
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting = meeting_response.data[0]
        logger.info(f"Meeting found: {meeting.get('title')} (Status: {meeting.get('status')})")
        
        # Get participants
        participants_response = supabase.table('participants').select('*').eq('meeting_id', request.meeting_id).execute()
        participants = participants_response.data if participants_response.data else []
        
        logger.info(f"Processing meeting {request.meeting_id} with {len(participants)} participants")
        
        # Start background processing
        background_tasks.add_task(
            process_audio_task,
            meeting_id=request.meeting_id,
            audio_url=request.audio_url,
            participants=participants
        )
        
        return {
            "success": True,
            "message": "Processing started",
            "meeting_id": request.meeting_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting audio processing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def process_audio_task(meeting_id: str, audio_url: str, participants: list):
    """
    Background task to process audio file
    """
    temp_file = None
    try:
        logger.info(f"Starting audio processing for meeting {meeting_id}")
        
        # Update status to processing
        update_response = supabase.table('meetings').update({
            'status': 'processing',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', meeting_id).execute()
        
        logger.info(f"Updated meeting status to processing: {update_response.data}")
        
        # Download audio from Supabase storage
        # Extract file path from URL
        if '/object/public/recordings/' in audio_url:
            file_path = audio_url.split('/object/public/recordings/')[1]
        elif '/recordings/' in audio_url:
            file_path = audio_url.split('/recordings/')[1]
        else:
            raise ValueError(f"Invalid audio URL format: {audio_url}")
        
        logger.info(f"Downloading audio from: {file_path}")
        
        # Download file from Supabase storage
        response = supabase.storage.from_('recordings').download(file_path)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as f:
            f.write(response)
            temp_file = f.name
        
        logger.info(f"Downloaded audio to temp file: {temp_file} ({os.path.getsize(temp_file)} bytes)")
        
        # Step 1: Transcribe
        logger.info("Starting transcription...")
        transcription_service = get_transcription_service()
        transcript = transcription_service.transcribe_audio(temp_file)
        
        logger.info(f"Transcription complete: {len(transcript)} characters")
        
        # Step 2: Generate summary
        logger.info("Generating summary...")
        summary = await summary_service.generate_summary(transcript)
        logger.info("Summary generated")
        
        # Step 3: Extract action items with participant matching
        logger.info("Extracting action items...")
        action_items = action_item_service.extract_action_items_with_participants(
            transcript=transcript,
            participants=participants
        )
        
        logger.info(f"Extracted {len(action_items)} action items")
        
        # Update meeting with results
        supabase.table('meetings').update({
            'transcript': transcript,
            'summary': summary,
            'status': 'completed',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', meeting_id).execute()
        
        # Insert action items
        inserted_items = []
        if action_items:
            action_items_with_meeting_id = [
                {
                    **item,
                    'meeting_id': meeting_id,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }
                for item in action_items
            ]
            
            result = supabase.table('action_items').insert(action_items_with_meeting_id).execute()
            inserted_items = result.data if result.data else []
            logger.info(f"Inserted {len(inserted_items)} action items")
        
        # Send email notifications to assignees
        if inserted_items:
            await send_action_item_emails(meeting_id, inserted_items)
        
        logger.info(f"Successfully completed processing for meeting {meeting_id}")
        
    except Exception as e:
        logger.error(f"Error processing audio: {e}", exc_info=True)
        
        # Update meeting status to failed
        try:
            supabase.table('meetings').update({
                'status': 'failed',
                'error': str(e),
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', meeting_id).execute()
        except Exception as db_error:
            logger.error(f"Failed to update meeting status: {db_error}")
        
    finally:
        # Clean up temp file
        if temp_file and Path(temp_file).exists():
            try:
                Path(temp_file).unlink()
                logger.debug(f"Cleaned up temp file: {temp_file}")
            except Exception as e:
                logger.warning(f"Failed to clean up temp file: {e}")


async def send_action_item_emails(meeting_id: str, action_items: list):
    """
    Send email notifications to assignees
    """
    try:
        # Get meeting details
        meeting_response = supabase.table('meetings').select('*').eq('id', meeting_id).execute()
        if not meeting_response.data:
            return
        
        meeting = meeting_response.data[0]
        meeting_title = meeting.get('title', 'Meeting')
        
        # Group action items by assignee email
        items_by_assignee = {}
        for item in action_items:
            email = item.get('assignee_email')
            if email:
                if email not in items_by_assignee:
                    items_by_assignee[email] = []
                items_by_assignee[email].append(item)
        
        # Send emails
        for email, items in items_by_assignee.items():
            try:
                email_service.send_action_items_email(
                    to_email=email,
                    meeting_title=meeting_title,
                    action_items=items
                )
                logger.info(f"Sent email to {email} with {len(items)} action items")
                
                # Mark action items as emailed in database
                for item in items:
                    if item.get('id'):
                        supabase.table('action_items').update({
                            'email_sent_to': email,
                            'email_sent_at': datetime.utcnow().isoformat(),
                            'email_sent': True
                        }).eq('id', item['id']).execute()
                    
            except Exception as e:
                logger.error(f"Failed to send email to {email}: {e}")
        
    except Exception as e:
        logger.error(f"Error sending action item emails: {e}")


@router.get("/meeting/{meeting_id}/status")
async def get_meeting_status(meeting_id: str):
    """Get processing status of a meeting"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        response = supabase.table('meetings').select('status, error, updated_at').eq('id', meeting_id).execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting meeting status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "supabase_configured": supabase is not None,
        "timestamp": datetime.utcnow().isoformat()
    }