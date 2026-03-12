'''
 this file is used to verify the token and get the current user id from the token 
 
'''


from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt_utils import verify_token

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    user_id = verify_token(token)

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user_id