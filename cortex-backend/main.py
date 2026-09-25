from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal, engine
from models import Base, User
from dependencies import get_current_user
from routers import auth, projects, documents, teams, folder, inbox, user_profiles, agents, chats_messages, audit, integrations
from routers.teams.discussions.router import router as discussions_router
from routers.teams.chats.router import router as discussion_chats_router
from migrations.migrate_audit_logs import init_audit_logs_table_and_migrate


@asynccontextmanager
async def lifespan(app: FastAPI):

    from agentic.checkpointer import init_checkpointer
    await init_checkpointer()

    from agentic.main_graph import build_workflow
    import agentic.main_graph as mg

    mg.workflow = build_workflow()

    print("[Startup] Async workflow compiled successfully.")

    yield

    from agentic.checkpointer import close_checkpointer
    await close_checkpointer()
app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Has-More"],
)

app.include_router(projects.router)
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(folder.router)
app.include_router(inbox.router)
app.include_router(documents.router)
app.include_router(user_profiles.router)
app.include_router(chats_messages.router)
app.include_router(agents.router)
app.include_router(audit.router)
app.include_router(integrations.router)
app.include_router(discussions_router)
app.include_router(discussion_chats_router)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"message": "Cortex Backend is running!"}


# ── Temporary WebSocket Endpoint for Team Discussions Testing ──
connections: list[WebSocket] = []

@app.websocket("/ws/test")
async def websocket_test(websocket: WebSocket):
    await websocket.accept()
    connections.append(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            for connection in list(connections):
                try:
                    await connection.send_text(message)
                except Exception:
                    pass
    except WebSocketDisconnect:
        if websocket in connections:
            connections.remove(websocket)


@app.get("/me")
def get_me(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        return {"user_id": user_id}
    return {
        "user_id": user.user_id,
        "name": user.name,
        "email": user.email,
        "created_at": user.created_at
    }
