import os
import base64
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

load_dotenv()

_raw_key = os.getenv("ENCRYPTION_KEY", "cortex_default_integration_secret_key_2026")

# Derive a valid 32-byte Fernet key deterministically from _raw_key
kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=b"cortex_integration_salt_v1",
    iterations=100000,
)
_fernet_key = base64.urlsafe_b64encode(kdf.derive(_raw_key.encode("utf-8")))
_fernet = Fernet(_fernet_key)


def encrypt_string(plain_text: str | None) -> str | None:
    if not plain_text:
        return None
    try:
        return _fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")
    except Exception as e:
        print(f"[Encryption] Error encrypting data: {e}")
        return plain_text


def decrypt_string(cipher_text: str | None) -> str | None:
    if not cipher_text:
        return None
    try:
        return _fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except Exception as e:
        print(f"[Encryption] Error decrypting data (fallback to raw): {e}")
        return cipher_text
