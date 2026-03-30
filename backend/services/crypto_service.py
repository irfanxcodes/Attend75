import os

from cryptography.fernet import Fernet, InvalidToken

# Development-only fallback key. Override with CREDENTIAL_ENCRYPTION_KEY in production.
_DEFAULT_DEV_KEY = "4D4BAQv4ai8ujln1Q0x6u6Nvh6v7Gc0Je6gVVO5jvMg="


class CredentialCryptoError(Exception):
    pass


class CredentialCryptoService:
    def __init__(self, key: str | None = None):
        encryption_key = (key or os.getenv("CREDENTIAL_ENCRYPTION_KEY") or _DEFAULT_DEV_KEY).strip()
        self._fernet = Fernet(encryption_key.encode("utf-8"))

    def encrypt(self, plain_text: str) -> str:
        cleaned = (plain_text or "").strip()
        if not cleaned:
            raise CredentialCryptoError("password must not be empty")

        encrypted = self._fernet.encrypt(cleaned.encode("utf-8"))
        return encrypted.decode("utf-8")

    def decrypt(self, encrypted_text: str) -> str:
        token = (encrypted_text or "").strip()
        if not token:
            raise CredentialCryptoError("encrypted password must not be empty")

        try:
            decrypted = self._fernet.decrypt(token.encode("utf-8"))
        except InvalidToken as exc:
            raise CredentialCryptoError("unable to decrypt credentials") from exc

        return decrypted.decode("utf-8")


credential_crypto_service = CredentialCryptoService()
