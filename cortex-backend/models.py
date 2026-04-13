# from narwhals import Boolean

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey , Boolean
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    project_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    role = Column(String, nullable=False)  # admin | member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

class ProjectInvite(Base):
    __tablename__ = "project_invites"

    invite_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)

    email = Column(String, nullable=False)

    token = Column(String, unique=True, nullable=False)

    invited_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    status = Column(String, default="pending")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    document_id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)

    title = Column(String, nullable=False)
    description = Column(String)

    source_team = Column(String)

    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    tags = Column(ARRAY(String))

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    version_id = Column(Integer, primary_key=True, index=True)

    document_id = Column(Integer, ForeignKey("documents.document_id"), nullable=False)

    version_number = Column(Integer, nullable=False)

    storage_path = Column(String, nullable=False)

    is_active = Column(Boolean, default=True)

    uploaded_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())