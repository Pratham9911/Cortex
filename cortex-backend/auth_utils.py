import hashlib
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _pre_hash(password: str) -> str:
    # Convert password to SHA256 first (removes bcrypt 72-byte limit issue)
    return hashlib.sha256(password.encode()).hexdigest()


def hash_password(password: str):
    return pwd_context.hash(_pre_hash(password))


def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(_pre_hash(plain_password), hashed_password)