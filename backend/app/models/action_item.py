from pydantic import BaseModel, Field
from typing import Optional
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

class ActionItem(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    meeting_id: PyObjectId
    text: str
    assignee: Optional[str] = None
    assignee_email: Optional[str] = None
    priority: str = "medium"  # low, medium, high
    status: str = "pending"  # pending, in_progress, completed
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class ActionItemCreate(BaseModel):
    text: str
    assignee: Optional[str] = None
    assignee_email: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime] = None

class ActionItemUpdate(BaseModel):
    text: Optional[str] = None
    assignee: Optional[str] = None
    assignee_email: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None