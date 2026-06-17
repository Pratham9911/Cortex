from typing import Iterable


def is_document_owner(document, user_id: int) -> bool:
    return document.owner_id == user_id


def is_project_owner(project, user_id: int) -> bool:
    return bool(project and project.created_by == user_id)


def is_project_admin(membership) -> bool:
    return bool(membership and membership.role == "admin")


def is_owner_override(project, document, user_id: int) -> bool:
    return (
        is_project_owner(project, user_id)
        or is_document_owner(document, user_id)
    )


def has_team_access(document, user_team_ids: Iterable[int]) -> bool:
    return bool(
        set(document.allowed_team_ids or [])
        &
        set(user_team_ids or [])
    )


def can_search_document(
    project,
    membership,
    document,
    user_id: int,
    user_team_ids: Iterable[int]
) -> bool:
    if is_owner_override(project, document, user_id):
        return True

    if document.search_access_level == "none":
        return False

    if document.search_access_level == "admin":
        return is_project_admin(membership)

    if document.search_access_level == "member":
        if is_project_admin(membership):
            return True
        return has_team_access(document, user_team_ids)

    return False


def can_download_document(
    project,
    membership,
    document,
    user_id: int,
    user_team_ids: Iterable[int]
) -> bool:
    if is_owner_override(project, document, user_id):
        return True

    if not can_search_document(
        project=project,
        membership=membership,
        document=document,
        user_id=user_id,
        user_team_ids=user_team_ids
    ):
        return False

    if document.download_access_level == "none":
        return False

    if document.download_access_level == "admin":
        return is_project_admin(membership)

    if document.download_access_level == "member":
        if is_project_admin(membership):
            return True
        return has_team_access(document, user_team_ids)

    return False
