from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, User
from dependencies import get_current_user
from routers import auth , projects , invites , documents

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
app.include_router(projects.router)
app.include_router(invites.router)
app.include_router(auth.router)
app.include_router(documents.router)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


#




@app.get("/")
def read_root():
    return {"message": "Cortex Backend is running!"}



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


# @app.post("/projects/{project_id}/join")
# def join_project(
#     project_id: int,
#     user_id: int = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):

#     # Check if project exists
#     project = db.query(Project).filter(Project.project_id == project_id).first()

#     if not project:
#         raise HTTPException(status_code=404, detail="Project not found")

#     # Check if user already joined
#     existing_member = db.query(ProjectMember).filter(
#         ProjectMember.project_id == project_id,
#         ProjectMember.user_id == user_id
#     ).first()

#     if existing_member:
#         raise HTTPException(status_code=400, detail="User already in project")

#     # Add user as member
#     member = ProjectMember(
#         project_id=project_id,
#         user_id=user_id,
#         role="member"
#     )

#     db.add(member)
#     db.commit()

#     return {"message": "Joined project successfully"}



