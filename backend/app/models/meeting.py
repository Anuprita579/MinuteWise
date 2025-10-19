from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

class Participant(BaseModel):
    user_id: Optional[PyObjectId] = None
    email: str
    name: str
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None

class ActionItem(BaseModel):
    text: str
    assignee: Optional[str] = None
    priority: str = "medium"  # low, medium, high
    completed: bool = False
    due_date: Optional[datetime] = None
    # Jira integration fields
    jira_issue_key: Optional[str] = None
    jira_issue_url: Optional[str] = None
    jira_synced_at: Optional[datetime] = None

class Meeting(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    title: Optional[str] = None
    audio_file: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    participants: List[Participant] = []
    action_items: List[ActionItem] = []
    status: str = "processing"  # processing, completed, failed
    created_by: PyObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}