from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Boolean,
    UniqueConstraint
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
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
    role = Column(String, nullable=False)   # admin | member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user"),
    )




class Document(Base):
    __tablename__ = "documents"

    document_id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)

    title = Column(String, nullable=False)
    description = Column(String)

    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    tags = Column(ARRAY(String))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    download_access_level = Column(
    String,
    default="member"
)

    search_access_level = Column(
    String,
    default="member"
)
    allowed_team_ids = Column(
    ARRAY(Integer),
    nullable=True
)
    folder_id = Column(
    Integer,
    ForeignKey("folders.folder_id"),
    nullable=True
)
    __table_args__ = (
        UniqueConstraint("project_id", "title", name="uq_project_document_title"),
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    version_id = Column(Integer, primary_key=True, index=True)

    document_id = Column(Integer, ForeignKey("documents.document_id"), nullable=False)

    version_number = Column(Integer, nullable=False)

    storage_path = Column(String, nullable=False)

    file_name = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True)

    uploaded_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


    activated_by = Column(
    Integer,
    ForeignKey("users.user_id"),
    nullable=True
    )

    activated_at = Column(
        DateTime(timezone=True),
        nullable=True
    )
   
    is_deleted = Column(
        Boolean,
        default=False
    )
    
    deleted_at = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
    deleted_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )
    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_version"),
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    chunk_id = Column(Integer, primary_key=True, index=True)

    version_id = Column(
        Integer,
        ForeignKey("document_versions.version_id"),
        nullable=False
    )
    project_id = Column(
    Integer,
    ForeignKey("projects.project_id"),
    nullable=False
    )
    chunk_index = Column(Integer, nullable=False)

    content = Column(String, nullable=False)
    page_number = Column(Integer, nullable=True)
    embedding = Column(Vector(1024))
    

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Folder(Base):
    __tablename__ = "folders"

    folder_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.project_id"),
        nullable=False
    )

    name = Column(
        String,
        nullable=False
    )

    created_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "name",
            name="uq_project_folder_name"
        ),
    )
class ProjectAuditLog(Base):
    __tablename__ = "project_audit_logs"

    log_id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.project_id"),
        nullable=False
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    action = Column(String, nullable=False)

    detail = Column(String, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

class Team(Base):
    __tablename__ = "teams"

    team_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.project_id"),
        nullable=False
    )

    name = Column(
        String,
        nullable=False
    )

    description = Column(
        String,
        nullable=False
    )

    tags = Column(
        ARRAY(String),
        nullable=True
    )

    created_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "name",
            name="uq_project_team_name"
        ),
    )

class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    team_id = Column(
        Integer,
        ForeignKey("teams.team_id"),
        nullable=False
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    added_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    added_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "team_id",
            "user_id",
            name="uq_team_member"
        ),
    )



class InboxMessage(Base):
    __tablename__ = "inbox_messages"

    message_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    receiver_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    sender_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )

    type = Column(
        String,
        nullable=False
    )
    # invite
    # notice
    # system

    title = Column(
        String,
        nullable=False
    )

    message = Column(
        String,
        nullable=False
    )

    related_project_id = Column(
        Integer,
        ForeignKey("projects.project_id"),
        nullable=True
    )

    status = Column(
        String,
        default="unread"
    )
    # unread
    # read
    # accepted
    # rejected

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

