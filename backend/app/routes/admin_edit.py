# backend/app/routes/admin_edit.py

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import logging
from datetime import datetime
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

# Initialize Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("Supabase credentials missing!")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class UpdateTranscriptRequest(BaseModel):
    meeting_id: str
    transcript: str


class UpdateSummaryRequest(BaseModel):
    meeting_id: str
    summary: str


class CreateActionItemRequest(BaseModel):
    meeting_id: str
    text: str
    assignee: str
    assignee_email: str
    priority: str = "medium"
    category: str = "General"


class UpdateActionItemRequest(BaseModel):
    action_item_id: str
    text: Optional[str] = None
    assignee: Optional[str] = None
    assignee_email: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


class DeleteActionItemRequest(BaseModel):
    action_item_id: str


async def verify_admin_access(meeting_id: str, user_id: str) -> bool:
    """Verify if user has admin access to the meeting"""
    try:
        # Check if user is a participant with admin role
        response = supabase.table('participants').select('role').eq('meeting_id', meeting_id).eq('user_id', user_id).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0].get('role') == 'admin'
        
        # Also check if user is the meeting creator
        meeting_response = supabase.table('meetings').select('created_by').eq('id', meeting_id).execute()
        
        if meeting_response.data and len(meeting_response.data) > 0:
            return meeting_response.data[0].get('created_by') == user_id
        
        return False
    except Exception as e:
        logger.error(f"Error verifying admin access: {e}")
        return False


@router.put("/meeting/transcript")
async def update_transcript(request: UpdateTranscriptRequest):
    """
    Update meeting transcript (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Verify meeting exists
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Update transcript
        update_response = supabase.table('meetings').update({
            'transcript': request.transcript,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request.meeting_id).execute()
        
        if update_response.data:
            logger.info(f"Transcript updated for meeting {request.meeting_id}")
            return {
                "success": True,
                "message": "Transcript updated successfully",
                "transcript": request.transcript
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update transcript")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating transcript: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/meeting/summary")
async def update_summary(request: UpdateSummaryRequest):
    """
    Update meeting summary (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Verify meeting exists
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Update summary
        update_response = supabase.table('meetings').update({
            'summary': request.summary,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request.meeting_id).execute()
        
        if update_response.data:
            logger.info(f"Summary updated for meeting {request.meeting_id}")
            return {
                "success": True,
                "message": "Summary updated successfully",
                "summary": request.summary
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update summary")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/action-item/create")
async def create_action_item(request: CreateActionItemRequest):
    """
    Create a new action item manually (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Verify meeting exists
        meeting_response = supabase.table('meetings').select('id').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Create action item
        action_item_data = {
            'meeting_id': request.meeting_id,
            'text': request.text,
            'assignee': request.assignee,
            'assignee_email': request.assignee_email,
            'priority': request.priority,
            'category': request.category,
            'status': 'pending',
            'completed': False,
            'confidence': 1.0,  # Manual creation = 100% confidence
            'extraction_method': 'manual_admin',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        insert_response = supabase.table('action_items').insert(action_item_data).execute()
        
        if insert_response.data:
            logger.info(f"Action item created manually for meeting {request.meeting_id}")
            return {
                "success": True,
                "message": "Action item created successfully",
                "action_item": insert_response.data[0]
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create action item")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating action item: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/action-item/update")
async def update_action_item(request: UpdateActionItemRequest):
    """
    Update an existing action item (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Build update data
        update_data = {'updated_at': datetime.utcnow().isoformat()}
        
        if request.text is not None:
            update_data['text'] = request.text
        if request.assignee is not None:
            update_data['assignee'] = request.assignee
        if request.assignee_email is not None:
            update_data['assignee_email'] = request.assignee_email
        if request.priority is not None:
            update_data['priority'] = request.priority
        if request.category is not None:
            update_data['category'] = request.category
        if request.status is not None:
            update_data['status'] = request.status
            if request.status == 'completed':
                update_data['completed'] = True
                update_data['completed_at'] = datetime.utcnow().isoformat()
        
        # Update action item
        update_response = supabase.table('action_items').update(update_data).eq('id', request.action_item_id).execute()
        
        if update_response.data:
            logger.info(f"Action item {request.action_item_id} updated")
            return {
                "success": True,
                "message": "Action item updated successfully",
                "action_item": update_response.data[0]
            }
        else:
            raise HTTPException(status_code=404, detail="Action item not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating action item: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/action-item/delete")
async def delete_action_item(request: DeleteActionItemRequest):
    """
    Delete an action item (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Delete action item
        delete_response = supabase.table('action_items').delete().eq('id', request.action_item_id).execute()
        
        if delete_response.data:
            logger.info(f"Action item {request.action_item_id} deleted")
            return {
                "success": True,
                "message": "Action item deleted successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Action item not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting action item: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/action-items/bulk-create")
async def bulk_create_action_items(meeting_id: str, action_items: List[CreateActionItemRequest]):
    """
    Create multiple action items at once (Admin only)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Verify meeting exists
        meeting_response = supabase.table('meetings').select('id').eq('id', meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Prepare action items
        items_data = []
        for item in action_items:
            items_data.append({
                'meeting_id': meeting_id,
                'text': item.text,
                'assignee': item.assignee,
                'assignee_email': item.assignee_email,
                'priority': item.priority,
                'category': item.category,
                'status': 'pending',
                'completed': False,
                'confidence': 1.0,
                'extraction_method': 'manual_admin',
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            })
        
        # Insert all at once
        insert_response = supabase.table('action_items').insert(items_data).execute()
        
        if insert_response.data:
            logger.info(f"Bulk created {len(insert_response.data)} action items for meeting {meeting_id}")
            return {
                "success": True,
                "message": f"Created {len(insert_response.data)} action items",
                "action_items": insert_response.data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create action items")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk creating action items: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))