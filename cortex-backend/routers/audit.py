from models import ProjectAuditLog



def create_audit_log(
    db,
    project_id,
    user_id,
    action,
    detail
):

    log = ProjectAuditLog(
        project_id=project_id,
        user_id=user_id,
        action=action,
        detail=detail
    )

    db.add(log)
