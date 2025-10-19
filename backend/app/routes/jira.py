from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os
import logging
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv

# CRITICAL: Load environment variables FIRST!
load_dotenv()

from ..utils.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Jira Configuration - These will now have values
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL", "https://your-domain.atlassian.net")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
JIRA_PROJECT_KEY = os.getenv("JIRA_PROJECT_KEY", "MIN")

# Debug: Log what we loaded (remove in production)
logger.info(f"Jira Config Loaded - Email: {JIRA_EMAIL}, Token exists: {bool(JIRA_API_TOKEN)}, Base URL: {JIRA_BASE_URL}")


class JiraIssueCreate(BaseModel):
    meeting_id: str
    action_item_index: int
    project_key: Optional[str] = None
    issue_type: Optional[str] = "Task"


class JiraIssueBulkCreate(BaseModel):
    meeting_id: str
    action_item_indices: List[int]
    project_key: Optional[str] = None
    issue_type: Optional[str] = "Task"


class JiraConfigUpdate(BaseModel):
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_base_url: Optional[str] = None
    jira_project_key: Optional[str] = None


def get_jira_auth():
    """Get Jira authentication credentials"""
    if not JIRA_EMAIL or not JIRA_API_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="Jira credentials not configured. Please set JIRA_EMAIL and JIRA_API_TOKEN"
        )
    return (JIRA_EMAIL, JIRA_API_TOKEN)


def map_priority_to_jira(priority: str) -> str:
    """Map internal priority to Jira priority"""
    priority_map = {
        "high": "High",
        "medium": "Medium",
        "low": "Low"
    }
    return priority_map.get(priority.lower(), "Medium")


async def get_default_issue_type(project_key: str) -> str:
    """Get the first available non-subtask issue type for the project"""
    auth = get_jira_auth()
    url = f"{JIRA_BASE_URL}/rest/api/3/issue/createmeta"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url,
            params={"projectKeys": project_key},
            auth=auth,
            timeout=10.0
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('projects'):
                issue_types = data['projects'][0].get('issuetypes', [])
                # Try to find Story, Task, or Idea (common types)
                for preferred in ['Story', 'Task', 'Idea']:
                    for it in issue_types:
                        if it['name'] == preferred and not it.get('subtask'):
                            logger.info(f"Using issue type: {it['name']} (id: {it['id']})")
                            return it['name']
                
                # Fallback to first non-subtask type
                for it in issue_types:
                    if not it.get('subtask'):
                        logger.info(f"Using fallback issue type: {it['name']} (id: {it['id']})")
                        return it['name']
        
        # Ultimate fallback
        logger.warning(f"Could not determine issue type for project {project_key}, using 'Task'")
        return "Task"


async def get_jira_field_info(project_key: str) -> dict:
    """Get custom field IDs and types for Impact, Effort, and Roadmap"""
    auth = get_jira_auth()
    url = f"{JIRA_BASE_URL}/rest/api/3/issue/createmeta"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url,
            params={"projectKeys": project_key, "expand": "projects.issuetypes.fields"},
            auth=auth,
            timeout=10.0
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('projects'):
                for issue_type in data['projects'][0].get('issuetypes', []):
                    if issue_type['name'] == 'Idea':
                        fields = issue_type.get('fields', {})
                        field_info = {}
                        
                        for field_key, field_data in fields.items():
                            field_name = field_data.get('name', '').lower()
                            schema_type = field_data.get('schema', {}).get('type')
                            custom_type = field_data.get('schema', {}).get('custom', '')
                            
                            # Only get the main Impact field (not Impact score which is calculated)
                            if field_name == 'impact' and 'formula' not in custom_type:
                                field_info['impact'] = {
                                    'id': field_key,
                                    'type': schema_type,
                                    'name': field_data.get('name'),
                                    'allowedValues': field_data.get('allowedValues', [])
                                }
                            # Effort field
                            elif field_name == 'effort':
                                field_info['effort'] = {
                                    'id': field_key,
                                    'type': schema_type,
                                    'name': field_data.get('name'),
                                    'allowedValues': field_data.get('allowedValues', [])
                                }
                            # Roadmap field
                            elif field_name == 'roadmap':
                                field_info['roadmap'] = {
                                    'id': field_key,
                                    'type': schema_type,
                                    'name': field_data.get('name'),
                                    'allowedValues': field_data.get('allowedValues', [])
                                }
                        
                        logger.info(f"Found field info: {field_info}")
                        return field_info
        
        return {}


async def create_jira_issue_request(
    summary: str,
    description: str,
    project_key: str,
    issue_type: Optional[str] = None,
    priority: str = "medium",
    status: str = "pending",
    assignee_email: Optional[str] = None
):
    """Create a Jira issue via API with Impact, Effort, and Roadmap"""
    auth = get_jira_auth()
    
    # For MIN project specifically, use "Idea" issue type
    if not issue_type:
        if project_key == "MIN":
            issue_type = "Idea"
            logger.info(f"Using 'Idea' issue type for MIN project")
        else:
            issue_type = await get_default_issue_type(project_key)
    
    url = f"{JIRA_BASE_URL}/rest/api/3/issue"
    
    # Basic payload
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "issuetype": {"name": issue_type}
        }
    }
    
    # Add description
    payload["fields"]["description"] = {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": description
                    }
                ]
            }
        ]
    }
    
    # For MIN project, add Impact, Effort, and Roadmap fields
    if project_key == "MIN":
        try:
            # Map priority to numeric score (1-10 scale)
            # High = 8, Medium = 5, Low = 2
            priority_to_impact = {"high": 8, "medium": 5, "low": 2}
            impact_score = priority_to_impact.get(priority.lower(), 5)
            
            # Map status to Roadmap
            status_to_roadmap = {
                "pending": "Later",     # id: 10027
                "in_progress": "Now",   # id: 10025
                "completed": "Won't do" # Using Won't do for completed (or you can map to a different value)
            }
            roadmap_value = status_to_roadmap.get(status, "Later")
            
            # Map roadmap value to ID
            roadmap_ids = {
                "Now": "10025",
                "Next": "10026",
                "Later": "10027",
                "Won't do": "10028"
            }
            roadmap_id = roadmap_ids.get(roadmap_value, "10027")
            
            # Add fields based on your Jira configuration
            # Impact (customfield_10040) - numeric rating 1-10
            payload["fields"]["customfield_10040"] = impact_score
            logger.info(f"Setting Impact (customfield_10040) to: {impact_score}")
            
            # Effort (customfield_10051) - numeric rating 1-10, default to 5 (medium)
            payload["fields"]["customfield_10051"] = 5
            logger.info(f"Setting Effort (customfield_10051) to: 5")
            
            # Roadmap (customfield_10042) - option field
            payload["fields"]["customfield_10042"] = {"id": roadmap_id}
            logger.info(f"Setting Roadmap (customfield_10042) to: {roadmap_value} (id: {roadmap_id})")
            
            # Note: customfield_10043 (Impact score) is a formula field and cannot be set manually
            # Note: customfield_10050 (Value) is also a rating, skipping for now
            
        except Exception as e:
            logger.error(f"Error setting custom fields: {e}", exc_info=True)
            # Continue without custom fields rather than failing
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    logger.info(f"Creating Jira issue: {summary[:50]}...")
    
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


async def update_jira_issue_status(issue_key: str, status: str) -> bool:
    """Update Jira issue roadmap based on kanban status"""
    auth = get_jira_auth()
    
    # Map internal status to Jira roadmap values and IDs
    roadmap_map = {
        "pending": ("Later", "10027"),
        "in_progress": ("Now", "10025"),
        "completed": ("Won't do", "10028")  # Or use "Next" (10026) if you prefer
    }
    
    roadmap_value, roadmap_id = roadmap_map.get(status, ("Later", "10027"))
    
    try:
        url = f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}"
        
        # Update Roadmap field (customfield_10042)
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
                logger.info(f"Updated {issue_key} roadmap to: {roadmap_value}")
                return True
            else:
                logger.error(f"Failed to update {issue_key}: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"Error updating Jira status for {issue_key}: {e}")
        return False


@router.post("/create-issue")
async def create_single_jira_issue(
    issue_data: JiraIssueCreate,
    request: Request,
    current_user=Depends(get_current_user)
):
    """Create a single Jira issue from an action item"""
    try:
        # Fetch meeting
        meeting = await request.app.mongodb.meetings.find_one(
            {"_id": ObjectId(issue_data.meeting_id)}
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check access
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) 
                for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get action item
        action_items = meeting.get("action_items", [])
        if issue_data.action_item_index >= len(action_items):
            raise HTTPException(status_code=404, detail="Action item not found")
        
        action_item = action_items[issue_data.action_item_index]
        
        # Check if already synced
        if action_item.get("jira_issue_key"):
            return {
                "success": False,
                "message": "Action item already synced to Jira",
                "jira_issue_key": action_item["jira_issue_key"]
            }
        
        # Prepare Jira issue data
        summary = action_item.get("text", "No description")
        
        # Create a unique description with meeting title to avoid duplicates
        meeting_title = meeting.get('title', 'Untitled')
        meeting_date = meeting.get('created_at', datetime.utcnow()).strftime('%Y-%m-%d %H:%M')
        
        description = f"""
Action Item from Meeting: {meeting_title}
Meeting Date: {meeting_date}
Priority: {action_item.get('priority', 'medium')}
Assignee: {action_item.get('assignee', 'Unassigned')}
Current Status: {action_item.get('status', 'pending')}

---
This action item was automatically created from the meeting transcription system.
        """.strip()
        
        project_key = issue_data.project_key or JIRA_PROJECT_KEY
        
        # Use "Idea" for MIN project, otherwise use specified type
        if project_key == "MIN":
            issue_type = "Idea"
        else:
            issue_type = issue_data.issue_type
        
        logger.info(f"Creating Jira issue for action item {issue_data.action_item_index} with type '{issue_type}'")
        
        # Create Jira issue with current status and priority
        jira_response = await create_jira_issue_request(
            summary=summary,
            description=description,
            project_key=project_key,
            issue_type=issue_type,
            priority=action_item.get('priority', 'medium'),
            status=action_item.get('status', 'pending')
        )
        
        jira_issue_key = jira_response.get("key")
        jira_issue_url = f"{JIRA_BASE_URL}/browse/{jira_issue_key}"
        
        # Update action item with Jira information
        update_path = f"action_items.{issue_data.action_item_index}"
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(issue_data.meeting_id)},
            {
                "$set": {
                    f"{update_path}.jira_issue_key": jira_issue_key,
                    f"{update_path}.jira_issue_url": jira_issue_url,
                    f"{update_path}.jira_synced_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Created Jira issue {jira_issue_key} for action item {issue_data.action_item_index}")
        
        return {
            "success": True,
            "jira_issue_key": jira_issue_key,
            "jira_issue_url": jira_issue_url,
            "message": f"Successfully created Jira issue: {jira_issue_key}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Jira issue: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create Jira issue: {str(e)}")


@router.post("/create-bulk-issues")
async def create_bulk_jira_issues(
    bulk_data: JiraIssueBulkCreate,
    request: Request,
    current_user=Depends(get_current_user)
):
    """Create multiple Jira issues from action items"""
    try:
        meeting = await request.app.mongodb.meetings.find_one(
            {"_id": ObjectId(bulk_data.meeting_id)}
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) 
                for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        action_items = meeting.get("action_items", [])
        results = []
        
        for index in bulk_data.action_item_indices:
            if index >= len(action_items):
                results.append({
                    "index": index,
                    "success": False,
                    "error": "Action item not found"
                })
                continue
            
            action_item = action_items[index]
            
            # Skip if already synced
            if action_item.get("jira_issue_key"):
                results.append({
                    "index": index,
                    "success": False,
                    "error": "Already synced to Jira",
                    "jira_issue_key": action_item["jira_issue_key"]
                })
                continue
            
            try:
                summary = action_item.get("text", "No description")
                
                # Create unique description with meeting details
                meeting_title = meeting.get('title', 'Untitled')
                meeting_date = meeting.get('created_at', datetime.utcnow()).strftime('%Y-%m-%d %H:%M')
                
                description = f"""
Action Item from Meeting: {meeting_title}
Meeting Date: {meeting_date}
Priority: {action_item.get('priority', 'medium')}
Assignee: {action_item.get('assignee', 'Unassigned')}
Current Status: {action_item.get('status', 'pending')}

---
This action item was automatically created from the meeting transcription system.
                """.strip()
                
                project_key = bulk_data.project_key or JIRA_PROJECT_KEY
                
                # Use "Idea" for MIN project
                issue_type = "Idea" if project_key == "MIN" else bulk_data.issue_type
                
                logger.info(f"Creating Jira issue for action item {index} with type '{issue_type}'")
                
                jira_response = await create_jira_issue_request(
                    summary=summary,
                    description=description,
                    project_key=project_key,
                    issue_type=issue_type,
                    priority=action_item.get('priority', 'medium'),
                    status=action_item.get('status', 'pending')
                )
                
                jira_issue_key = jira_response.get("key")
                jira_issue_url = f"{JIRA_BASE_URL}/browse/{jira_issue_key}"
                
                # Update action item
                update_path = f"action_items.{index}"
                await request.app.mongodb.meetings.update_one(
                    {"_id": ObjectId(bulk_data.meeting_id)},
                    {
                        "$set": {
                            f"{update_path}.jira_issue_key": jira_issue_key,
                            f"{update_path}.jira_issue_url": jira_issue_url,
                            f"{update_path}.jira_synced_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
                results.append({
                    "index": index,
                    "success": True,
                    "jira_issue_key": jira_issue_key,
                    "jira_issue_url": jira_issue_url
                })
                
                logger.info(f"Successfully created {jira_issue_key} for action item {index}")
                
            except HTTPException as he:
                error_msg = str(he.detail)
                logger.error(f"HTTP error creating Jira issue for index {index}: {error_msg}")
                results.append({
                    "index": index,
                    "success": False,
                    "error": error_msg
                })
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error creating Jira issue for index {index}: {error_msg}", exc_info=True)
                results.append({
                    "index": index,
                    "success": False,
                    "error": error_msg
                })
        
        success_count = sum(1 for r in results if r.get("success"))
        
        return {
            "success": True,
            "total": len(bulk_data.action_item_indices),
            "success_count": success_count,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk Jira creation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create Jira issues: {str(e)}")


@router.get("/test-connection")
async def test_jira_connection(current_user=Depends(get_current_user)):
    """Test Jira API connection"""
    try:
        auth = get_jira_auth()
        url = f"{JIRA_BASE_URL}/rest/api/3/myself"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                auth=auth,
                timeout=10.0
            )
            
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
        logger.error(f"Jira connection test failed: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }