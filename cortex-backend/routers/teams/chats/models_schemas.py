from typing import List, Optional
from pydantic import BaseModel, Field, validator


class CreateMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    parent_message_id: Optional[int] = Field(default=None)

    @validator("content")
    def content_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message content cannot be blank")
        return stripped


class EditMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)

    @validator("content")
    def content_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message content cannot be blank")
        return stripped


class ToggleReactionRequest(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=10)

    @validator("emoji")
    def emoji_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Emoji cannot be blank")
        return stripped


class ReactionGroupSchema(BaseModel):
    emoji: str
    count: int
    user_reacted: bool


class ParentMessageRefSchema(BaseModel):
    id: int
    sender_name: str
    content: str
    is_deleted: bool


class MessageResponse(BaseModel):
    id: int
    discussion_id: int
    sender_id: int
    sender_name: str
    sender_avatar_url: Optional[str] = None
    content: str
    parent_message_id: Optional[int] = None
    parent_message: Optional[ParentMessageRefSchema] = None
    is_deleted: bool
    created_at: str
    updated_at: Optional[str] = None
    reactions: List[ReactionGroupSchema] = []
