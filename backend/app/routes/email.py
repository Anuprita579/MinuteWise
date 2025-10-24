# backend/app/routes/email.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import List
import os
import logging
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

from ..services.email_service import email_service

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["email"])

# Initialize Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("Supabase credentials missing!")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class SendActionItemEmailRequest(BaseModel):
    action_item_id: str
    meeting_id: str


class SendMeetingSummaryRequest(BaseModel):
    meeting_id: str
    recipient_emails: List[EmailStr]


@router.post("/send-action-item")
async def send_action_item_email(request: SendActionItemEmailRequest):
    """Send email for a specific action item"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Get action item - FIXED
        action_response = supabase.table('action_items').select('*').eq('id', request.action_item_id).execute()
        
        if not action_response.data or len(action_response.data) == 0:
            raise HTTPException(status_code=404, detail="Action item not found")
        
        action_item = action_response.data[0]
        
        if not action_item.get('assignee_email'):
            raise HTTPException(status_code=400, detail="Action item has no assignee email")
        
        # Get meeting details - FIXED
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data or len(meeting_response.data) == 0:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting = meeting_response.data[0]
        
        # Send email
        email_service.send_action_items_email(
            to_email=action_item['assignee_email'],
            meeting_title=meeting['title'],
            action_items=[action_item]
        )
        
        # Mark as sent
        supabase.table('action_items').update({
            'email_sent_to': action_item['assignee_email'],
            'email_sent_at': datetime.utcnow().isoformat(),
            'email_sent': True,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request.action_item_id).execute()
        
        return {
            "success": True,
            "message": f"Email sent to {action_item['assignee_email']}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending action item email: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send-meeting-summary")
async def send_meeting_summary(request: SendMeetingSummaryRequest):
    """Send meeting summary to multiple recipients"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Get meeting with action items - FIXED
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data or len(meeting_response.data) == 0:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting = meeting_response.data[0]
        
        # Get action items
        action_items_response = supabase.table('action_items').select('*').eq('meeting_id', request.meeting_id).execute()
        action_items = action_items_response.data if action_items_response.data else []
        
        # Send emails
        results = email_service.send_meeting_summary_email(
            to_emails=request.recipient_emails,
            meeting_title=meeting['title'],
            summary=meeting.get('summary', 'No summary available'),
            action_items=action_items
        )
        
        success_count = sum(1 for r in results if r["success"])
        
        return {
            "success": True,
            "total": len(request.recipient_emails),
            "success_count": success_count,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending meeting summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-config")
async def test_email_config():
    """Test email configuration"""
    try:
        if not email_service.configured:
            return {
                "success": False,
                "error": "Email service not configured. Set SMTP_EMAIL and SMTP_PASSWORD in .env"
            }
        
        return {
            "success": True,
            "message": "Email configuration is valid",
            "smtp_email": os.getenv("SMTP_EMAIL"),
            "smtp_server": os.getenv("SMTP_SERVER")
        }
        
    except Exception as e:
        logger.error(f"Email config test failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }