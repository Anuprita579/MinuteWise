from fastapi import APIRouter, HTTPException, Depends, Request, Query
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from ..models.meeting import Meeting
from ..models.action_item import ActionItem, ActionItemCreate, ActionItemUpdate
from ..utils.auth import get_current_user
import secrets

router = APIRouter()

@router.get("/", response_model=List[dict])
async def get_user_meetings(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user=Depends(get_current_user)
):
    try:
        cursor = request.app.mongodb.meetings.find({
            "$or": [
                {"created_by": ObjectId(current_user["_id"])},
                {"participants.user_id": ObjectId(current_user["_id"])}
            ]
        }).sort("created_at", -1).skip(skip).limit(limit)
        
        meetings = []
        async for meeting in cursor:
            meeting["_id"] = str(meeting["_id"])
            meeting["created_by"] = str(meeting["created_by"])
            meetings.append(meeting)
        
        return meetings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching meetings: {str(e)}")

@router.post("/start")
async def start_meeting(request: Request, payload: dict, current_user=Depends(get_current_user)):
    title = payload.get("title", "Untitled")
    room_name = f"mw-{secrets.token_hex(8)}"

    doc = {
        "title": title,
        "room_name": room_name,
        "created_by": ObjectId(current_user["_id"]),
        "participants": [],
        "live_transcript": [],  # Store live transcript chunks
        "created_at": datetime.utcnow(),
        "ended_at": None,
        "transcript_id": None
    }
    result = await request.app.mongodb.meetings.insert_one(doc)
    return {"id": str(result.inserted_id), "roomName": room_name}

@router.post("/{meeting_id}/participants")
async def participant_event(meeting_id: str, payload: dict, request: Request):
    meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    ptype = payload.get("type")
    pid = payload.get("participantId")
    display = payload.get("displayName")

    if ptype == "joined":
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {"$push": {"participants": {
                "participantId": pid,
                "displayName": display,
                "joinedAt": datetime.utcnow(),
                "leftAt": None
            }}}
        )
    elif ptype == "left":
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id), "participants.participantId": pid},
            {"$set": {"participants.$.leftAt": datetime.utcnow()}}
        )

    return {"ok": True}

@router.post("/{meeting_id}/transcript")
async def save_transcript_chunk(meeting_id: str, payload: dict, request: Request):
    """Save live transcript chunks"""
    meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    transcript_chunk = {
        "text": payload.get("text"),
        "timestamp": payload.get("timestamp"),
        "created_at": datetime.utcnow()
    }

    await request.app.mongodb.meetings.update_one(
        {"_id": ObjectId(meeting_id)},
        {"$push": {"live_transcript": transcript_chunk}}
    )

    return {"ok": True}

@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, request: Request):
    # When meeting ends, compile live transcript into final transcript
    meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
    
    if meeting and meeting.get("live_transcript"):
        # Compile all transcript chunks into final transcript
        final_transcript = "\n".join([
            f"{chunk.get('timestamp', '')}: {chunk.get('text', '')}" 
            for chunk in meeting["live_transcript"]
        ])
        
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {
                "$set": {
                    "ended_at": datetime.utcnow(),
                    "transcript": final_transcript,
                    "status": "completed"
                }
            }
        )
    else:
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {"$set": {"ended_at": datetime.utcnow()}}
        )
    
    return {"ok": True}

@router.get("/{meeting_id}/action-items", response_model=List[dict])
async def get_meeting_action_items(
    meeting_id: str,
    request: Request,
    current_user=Depends(get_current_user)
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
        
        action_items = meeting.get("action_items", [])
        return action_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching action items: {str(e)}")

@router.put("/{meeting_id}/action-items/{item_index}")
async def update_action_item(
    meeting_id: str,
    item_index: int,
    update_data: ActionItemUpdate,
    request: Request,
    current_user=Depends(get_current_user)
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
        
        action_items = meeting.get("action_items", [])
        if item_index >= len(action_items):
            raise HTTPException(status_code=404, detail="Action item not found")
        
        update_dict = update_data.dict(exclude_unset=True)
        if update_data.status == "completed" and "completed_at" not in update_dict:
            update_dict["completed_at"] = datetime.utcnow()
        
        for key, value in update_dict.items():
            action_items[item_index][key] = value
        
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(meeting_id)},
            {"$set": {"action_items": action_items, "updated_at": datetime.utcnow()}}
        )
        
        return {"message": "Action item updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating action item: {str(e)}")

@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    request: Request,
    current_user=Depends(get_current_user)
):
    try:
        meeting = await request.app.mongodb.meetings.find_one({"_id": ObjectId(meeting_id)})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        if meeting["created_by"] != ObjectId(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Only meeting creator can delete")
        
        await request.app.mongodb.meetings.delete_one({"_id": ObjectId(meeting_id)})
        return {"message": "Meeting deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting meeting: {str(e)}")