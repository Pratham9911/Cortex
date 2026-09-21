from typing import Optional
from pydantic import BaseModel, Field, validator


# ---------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------

class CreateDiscussionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    is_pinned: Optional[bool] = Field(default=False)


    @validator("name")
    def name_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Discussion name cannot be blank")
        if len(stripped) > 50:
            raise ValueError("Discussion name cannot exceed 50 characters")
        return stripped

    @validator("description")
    def description_stripped(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        return stripped if stripped else None


class UpdateDiscussionRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    is_pinned: Optional[bool] = Field(default=None)

    @validator("name")
    def name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Discussion name cannot be blank")
        if len(stripped) > 50:
            raise ValueError("Discussion name cannot exceed 50 characters")
        return stripped

    @validator("description")
    def description_stripped(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        return stripped if stripped else None
