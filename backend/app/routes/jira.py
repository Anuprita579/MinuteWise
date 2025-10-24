# backend/app/routes/jira.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import logging
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jira", tags=["jira"])

# Jira Configuration
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL", "https://your-domain.atlassian.net")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
JIRA_PROJECT_KEY = os.getenv("JIRA_PROJECT_KEY", "MIN")

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("Supabase credentials missing!")
    supabase = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class CreateJiraIssueRequest(BaseModel):
    action_item_id: str
    meeting_id: str
    project_key: Optional[str] = None


class CreateBulkJiraIssuesRequest(BaseModel):
    action_item_ids: List[str]
    meeting_id: str
    project_key: Optional[str] = None


class UpdateJiraStatusRequest(BaseModel):
    jira_issue_key: str
    status: str


def get_jira_auth():
    """Get Jira authentication credentials"""
    if not JIRA_EMAIL or not JIRA_API_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="Jira credentials not configured. Please set JIRA_EMAIL and JIRA_API_TOKEN"
        )
    return (JIRA_EMAIL, JIRA_API_TOKEN)


async def create_jira_issue_request(
    summary: str,
    description: str,
    project_key: str,
    priority: str = "medium",
    status: str = "pending"
):
    """Create a Jira issue via API"""
    auth = get_jira_auth()
    
    issue_type = "Idea" if project_key == "MIN" else "Task"
    url = f"{JIRA_BASE_URL}/rest/api/3/issue"
    
    # Map priority to impact score
    priority_to_impact = {"high": 8, "medium": 5, "low": 2}
    impact_score = priority_to_impact.get(priority.lower(), 5)
    
    # Map status to Roadmap
    status_to_roadmap = {
        "pending": ("Later", "10027"),
        "in_progress": ("Now", "10025"),
        "completed": ("Won't do", "10028")
    }
    roadmap_value, roadmap_id = status_to_roadmap.get(status, ("Later", "10027"))
    
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "issuetype": {"name": issue_type},
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": description}]
                }]
            }
        }
    }
    
    # Add custom fields for MIN project
    if project_key == "MIN":
        payload["fields"]["customfield_10040"] = impact_score
        payload["fields"]["customfield_10051"] = 5
        payload["fields"]["customfield_10042"] = {"id": roadmap_id}
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json=payload,
            headers=headers,
            auth=auth,
            timeout=30.0
        )
        
        if response.status_code == 201:
            result = response.json()
            logger.info(f"Successfully created Jira issue: {result.get('key')}")
            return result
        else:
            error_text = response.text
            logger.error(f"Jira API error: {response.status_code} - {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to create Jira issue: {error_text}"
            )


@router.post("/create-issue")
async def create_single_jira_issue(request: CreateJiraIssueRequest):
    """Create a single Jira issue from an action item"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Get action item
        action_response = supabase.table('action_items').select('*').eq('id', request.action_item_id).execute()
        
        if not action_response.data:
            raise HTTPException(status_code=404, detail="Action item not found")
        
        action_item = action_response.data[0]
        
        # Check if already synced
        if action_item.get('jira_issue_key'):
            return {
                "success": False,
                "message": "Action item already synced to Jira",
                "jira_issue_key": action_item['jira_issue_key']
            }
        
        # Get meeting details
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting = meeting_response.data[0]
        
        # Prepare Jira issue data
        summary = action_item.get('text', 'No description')
        description = f"""
Action Item from Meeting: {meeting['title']}
Meeting Date: {meeting.get('created_at', '')}
Priority: {action_item.get('priority', 'medium')}
Assignee: {action_item.get('assignee', 'Unassigned')}
Current Status: {action_item.get('status', 'pending')}

---
This action item was automatically created from the meeting transcription system.
        """.strip()
        
        project_key = request.project_key or JIRA_PROJECT_KEY
        
        # Create Jira issue
        jira_response = await create_jira_issue_request(
            summary=summary,
            description=description,
            project_key=project_key,
            priority=action_item.get('priority', 'medium'),
            status=action_item.get('status', 'pending')
        )
        
        jira_issue_key = jira_response.get("key")
        jira_issue_url = f"{JIRA_BASE_URL}/browse/{jira_issue_key}"
        
        # Update action item with Jira information
        supabase.table('action_items').update({
            'jira_issue_key': jira_issue_key,
            'jira_issue_url': jira_issue_url,
            'jira_synced_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request.action_item_id).execute()
        
        logger.info(f"Created Jira issue {jira_issue_key} for action item {request.action_item_id}")
        
        return {
            "success": True,
            "jira_issue_key": jira_issue_key,
            "jira_issue_url": jira_issue_url,
            "message": f"Successfully created Jira issue: {jira_issue_key}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Jira issue: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-bulk-issues")
async def create_bulk_jira_issues(request: CreateBulkJiraIssuesRequest):
    """Create multiple Jira issues from action items"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    try:
        # Get meeting
        meeting_response = supabase.table('meetings').select('*').eq('id', request.meeting_id).execute()
        
        if not meeting_response.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting = meeting_response.data[0]
        results = []
        
        for action_item_id in request.action_item_ids:
            try:
                # Get action item
                action_response = supabase.table('action_items').select('*').eq('id', action_item_id).execute()
                
                if not action_response.data:
                    results.append({
                        "id": action_item_id,
                        "success": False,
                        "error": "Action item not found"
                    })
                    continue
                
                action_item = action_response.data[0]
                
                # Skip if already synced
                if action_item.get('jira_issue_key'):
                    results.append({
                        "id": action_item_id,
                        "success": False,
                        "error": "Already synced",
                        "jira_issue_key": action_item['jira_issue_key']
                    })
                    continue
                
                # Create Jira issue
                summary = action_item.get('text', 'No description')
                description = f"""
Action Item from Meeting: {meeting['title']}
Priority: {action_item.get('priority', 'medium')}
Assignee: {action_item.get('assignee', 'Unassigned')}
                """.strip()
                
                project_key = request.project_key or JIRA_PROJECT_KEY
                
                jira_response = await create_jira_issue_request(
                    summary=summary,
                    description=description,
                    project_key=project_key,
                    priority=action_item.get('priority', 'medium'),
                    status=action_item.get('status', 'pending')
                )
                
                jira_issue_key = jira_response.get("key")
                jira_issue_url = f"{JIRA_BASE_URL}/browse/{jira_issue_key}"
                
                # Update action item
                supabase.table('action_items').update({
                    'jira_issue_key': jira_issue_key,
                    'jira_issue_url': jira_issue_url,
                    'jira_synced_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }).eq('id', action_item_id).execute()
                
                results.append({
                    "id": action_item_id,
                    "success": True,
                    "jira_issue_key": jira_issue_key,
                    "jira_issue_url": jira_issue_url
                })
                
            except Exception as e:
                logger.error(f"Error creating Jira issue for {action_item_id}: {e}")
                results.append({
                    "id": action_item_id,
                    "success": False,
                    "error": str(e)
                })
        
        success_count = sum(1 for r in results if r.get("success"))
        
        return {
            "success": True,
            "total": len(request.action_item_ids),
            "success_count": success_count,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk Jira creation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-status")
async def update_jira_status(request: UpdateJiraStatusRequest):
    """Update Jira issue roadmap based on status"""
    try:
        auth = get_jira_auth()
        
        # Map status to roadmap
        roadmap_map = {
            "pending": ("Later", "10027"),
            "in_progress": ("Now", "10025"),
            "completed": ("Won't do", "10028")
        }
        
        roadmap_value, roadmap_id = roadmap_map.get(request.status, ("Later", "10027"))
        
        url = f"{JIRA_BASE_URL}/rest/api/3/issue/{request.jira_issue_key}"
        
        payload = {
            "fields": {
                "customfield_10042": {"id": roadmap_id}
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                auth=auth,
                timeout=10.0
            )
            
            if response.status_code == 204:
                logger.info(f"Updated {request.jira_issue_key} roadmap to: {roadmap_value}")
                return {"success": True, "message": f"Updated to {roadmap_value}"}
            else:
                logger.error(f"Failed to update {request.jira_issue_key}: {response.status_code}")
                return {"success": False, "error": response.text}
                
    except Exception as e:
        logger.error(f"Error updating Jira status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-connection")
async def test_jira_connection():
    """Test Jira API connection"""
    try:
        auth = get_jira_auth()
        url = f"{JIRA_BASE_URL}/rest/api/3/myself"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, auth=auth, timeout=10.0)
            
            if response.status_code == 200:
                user_data = response.json()
                return {
                    "success": True,
                    "message": "Jira connection successful",
                    "user": user_data.get("displayName"),
                    "email": user_data.get("emailAddress")
                }
            else:
                return {
                    "success": False,
                    "error": f"Connection failed: {response.status_code}"
                }
                
    except Exception as e:
        logger.error(f"Jira connection test failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }