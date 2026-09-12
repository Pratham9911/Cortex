import sys
import os
import time

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database import SessionLocal, engine
from models import Base, User, UserIntegration
from agentic.email.encryption import encrypt_string, decrypt_string
from agentic.email.oauth_state import create_oauth_state, get_and_pop_user_id_for_state
from agentic.email.gmail_service import send_email_via_gmail


def test_encryption_module():
    print("\n--- Test 1: Fernet Token Encryption ---")
    raw_token = "ya29.a0ARW5m7_dummy_access_token_12345"
    encrypted = encrypt_string(raw_token)
    decrypted = decrypt_string(encrypted)

    print(f"Raw Token:       {raw_token}")
    print(f"Encrypted Token: {encrypted}")
    print(f"Decrypted Token: {decrypted}")

    assert encrypted != raw_token, "Token should be encrypted!"
    assert decrypted == raw_token, "Decrypted token must match original!"
    print("SUCCESS: Token encryption & decryption working cleanly.")


def test_oauth_state_manager():
    print("\n--- Test 2: OAuth State Storage & TTL ---")
    user_id = 42
    state_token = create_oauth_state(user_id)
    print(f"Generated OAuth State Token: {state_token}")

    recovered_user = get_and_pop_user_id_for_state(state_token)
    print(f"Recovered user_id from state: {recovered_user}")
    assert recovered_user == user_id, "State recovery failed!"

    # Consume again should return None (one-time use)
    second_attempt = get_and_pop_user_id_for_state(state_token)
    assert second_attempt is None, "State should be consumed after first lookup!"
    print("SUCCESS: OAuth state manager working cleanly.")


def test_multi_user_db_isolation():
    print("\n--- Test 3: Multi-User Integration Database Isolation ---")
    db = SessionLocal()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    try:
        # User A & User B
        u_a = db.query(User).filter_by(email="user_a_test@corp.com").first()
        if not u_a:
            u_a = User(name="User A", email="user_a_test@corp.com")
            db.add(u_a)

        u_b = db.query(User).filter_by(email="user_b_test@corp.com").first()
        if not u_b:
            u_b = User(name="User B", email="user_b_test@corp.com")
            db.add(u_b)

        db.commit()

        # Clean existing test integrations
        db.query(UserIntegration).filter(UserIntegration.user_id.in_([u_a.user_id, u_b.user_id])).delete()
        db.commit()

        # Create integration for User A
        integ_a = UserIntegration(
            user_id=u_a.user_id,
            provider="google",
            integration_type="gmail",
            account_email="usera@gmail.com",
            access_token=encrypt_string("token_a"),
            refresh_token=encrypt_string("refresh_a"),
            is_active=True,
        )
        db.add(integ_a)

        # Create integration for User B
        integ_b = UserIntegration(
            user_id=u_b.user_id,
            provider="google",
            integration_type="gmail",
            account_email="userb@gmail.com",
            access_token=encrypt_string("token_b"),
            refresh_token=encrypt_string("refresh_b"),
            is_active=True,
        )
        db.add(integ_b)
        db.commit()

        # Verify separation
        rec_a = db.query(UserIntegration).filter_by(user_id=u_a.user_id, provider="google", integration_type="gmail").first()
        rec_b = db.query(UserIntegration).filter_by(user_id=u_b.user_id, provider="google", integration_type="gmail").first()

        assert rec_a.account_email == "usera@gmail.com"
        assert rec_b.account_email == "userb@gmail.com"
        assert decrypt_string(rec_a.access_token) == "token_a"
        assert decrypt_string(rec_b.access_token) == "token_b"

        print(f"User A ({u_a.user_id}): {rec_a.account_email} -> token_a")
        print(f"User B ({u_b.user_id}): {rec_b.account_email} -> token_b")
        print("SUCCESS: Multi-user DB isolation verified!")

        # Test Disconnect behavior for User A
        rec_a.is_active = False
        db.commit()

        try:
            send_email_via_gmail(u_a.user_id, "to@example.com", "Test", "Body", db)
            assert False, "Should have raised ValueError for disconnected user!"
        except ValueError as ve:
            print(f"Expected Disconnected Error for User A: {ve}")

        # Cleanup
        db.query(UserIntegration).filter(UserIntegration.user_id.in_([u_a.user_id, u_b.user_id])).delete()
        db.query(User).filter(User.user_id.in_([u_a.user_id, u_b.user_id])).delete()
        db.commit()

    finally:
        db.close()


if __name__ == "__main__":
    test_encryption_module()
    test_oauth_state_manager()
    test_multi_user_db_isolation()
    print("\n========================================================")
    print("ALL USER INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("========================================================")
