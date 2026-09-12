import secrets
import time
import threading
from typing import Optional

_lock = threading.Lock()
_state_store: dict[str, dict] = {}
STATE_TTL_SECONDS = 600  # 10 minutes


def create_oauth_state(user_id: int, code_verifier: Optional[str] = None, custom_state: Optional[str] = None) -> str:
    """
    Associates user_id and optional PKCE code_verifier with an OAuth state token.
    Returns the state token string.
    """
    state_token = custom_state or secrets.token_urlsafe(32)
    now = time.time()

    with _lock:
        # Cleanup expired states
        expired_keys = [k for k, v in _state_store.items() if v["expires_at"] < now]
        for k in expired_keys:
            del _state_store[k]

        _state_store[state_token] = {
            "user_id": user_id,
            "code_verifier": code_verifier,
            "expires_at": now + STATE_TTL_SECONDS,
        }

    return state_token


def get_and_pop_state_data(state_token: str) -> Optional[dict]:
    """
    Validates and consumes an OAuth state token.
    Returns state dict containing user_id and code_verifier if valid and non-expired, otherwise None.
    """
    if not state_token:
        return None

    now = time.time()
    with _lock:
        data = _state_store.pop(state_token, None)
        if not data:
            return None

        if data["expires_at"] < now:
            print(f"[OAuthState] State {state_token[:8]}... expired")
            return None

        return data


def get_and_pop_user_id_for_state(state_token: str) -> Optional[int]:
    """
    Backwards-compatible helper returning user_id for state.
    """
    data = get_and_pop_state_data(state_token)
    return data["user_id"] if data else None
