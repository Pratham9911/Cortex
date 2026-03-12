from fastapi import FastAPI, Depends
from database import SessionLocal, engine
from models import Base
from dependencies import get_current_user
from routers import auth , projects , invites

app = FastAPI()

Base.metadata.create_all(bind=engine)
app.include_router(projects.router)
app.include_router(invites.router)
app.include_router(auth.router)

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
def get_me(user_id: int = Depends(get_current_user)):
    return {"user_id": user_id}


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



