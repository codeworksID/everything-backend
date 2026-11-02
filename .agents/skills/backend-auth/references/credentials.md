# Passwords, Recovery and MFA

Read this when building signup, login, password reset, or MFA. For language-specific library setup, see the matching file in `<shared>/stacks/`.

## Password Hashing

- Use **argon2id** first. OWASP's baseline is m=19 MiB, t=2, p=1 (or an equivalent stronger setting); tune so a hash takes roughly 100-500 ms on production hardware.
- **scrypt** is acceptable (OWASP baseline N=2^17, r=8, p=1).
- **bcrypt** only for existing systems: cost 10 or higher. bcrypt ignores input past 72 bytes, so reject longer passwords or pre-hash with HMAC-SHA-256 under a pepper and encode the result (base64) before bcrypt. Never pre-hash with a bare digest.
- Never MD5, SHA-1, or a plain SHA-256 for passwords. Never roll your own.
- Hash on the server, before the value is persisted or logged. Never log plaintext passwords.
- **Rehash on login**: after a successful verify, if the stored hash uses old parameters, rehash with current ones and save.
- **Constant work for unknown users**: when the account does not exist, verify against a fixed dummy hash so response time does not reveal whether the email is registered.
- Treat a verify mismatch as a normal `false`, not an unhandled exception (some libraries raise on mismatch).

```python
# argon2id with argon2-cffi; library defaults meet the OWASP baseline
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

ph = PasswordHasher()
DUMMY_HASH = ph.hash("dummy-password-for-timing")

def verify_login(stored_hash: str | None, password: str) -> tuple[bool, str | None]:
    """Return (ok, new_hash_if_rehash_needed)."""
    try:
        ph.verify(stored_hash or DUMMY_HASH, password)
    except (VerifyMismatchError, InvalidHashError):
        return False, None
    if stored_hash is None:
        return False, None
    return True, ph.hash(password) if ph.check_needs_rehash(stored_hash) else None
```

## Password Policy (NIST SP 800-63B rev. 4)

- Minimum length: 15 characters when the password is the only factor; 8 when it is used with MFA.
- Accept at least 64 characters, all printable characters, spaces, and Unicode. Normalize Unicode (NFKC) before hashing.
- Reject passwords found in breached-password lists (e.g. the Have I Been Pwned range API with k-anonymity) and obvious context words (service name, username).
- No composition rules (forced symbols or digits) and no periodic forced rotation. Force a change only on evidence of compromise.
- Allow paste and password managers. Show strength feedback at signup.

## Signup and Login Responses

- Signup: validate and normalize the email (trim, lowercase the domain), hash the password, then create the user and issue a session or tokens.

- Return the same error and status for "unknown user" and "wrong password" (e.g. 401 "Invalid email or password").
- Signup and reset should not reveal whether an email is registered where that matters: respond "If the address can be used, we sent an email" and send the details by email.
- Brute-force controls are in `security-defaults.md` -> Rate limiting.

## Account Recovery

- Send a random, single-use, time-limited token (at least 128 bits; not a JWT).
- Store only a hash of the token; invalidate older tokens when a new one is issued.
- Confirm the reset only after the user submits a new password; then revoke all sessions and refresh tokens.
- Notify the user by email that the password changed.
- Recovery must not bypass MFA: require the second factor or a backup code, or a slower supervised process.

## MFA

- Offer TOTP (authenticator apps) and WebAuthn/passkeys. Prefer passkeys for admin and high-value accounts. Avoid SMS as the only second factor.
- TOTP: store the secret encrypted (KMS or app-level key), never return it after enrollment, accept a +-1 step window, and reject reuse of the same code within its window.
- Backup codes: generate about 10, show once, store hashes, invalidate each after use.
- Require recent authentication (step-up) before enabling or disabling MFA, changing email or password, or viewing backup codes.
- Rate-limit MFA verification separately from password login.

## Identity Tables (handed to backend-db-design / backend-migrate)

Typical shapes; this skill describes them, it does not write migrations:

- `users`: id, email (unique, normalized, verified_at), password_hash, mfa_enabled, failed_login_count, locked_until, tokens_valid_after, timestamps.
- `refresh_tokens` or `sessions`: id, user_id, family_id, token_hash, expires_at, revoked_at, created_ip, user_agent.
- `password_reset_tokens` / `email_verification_tokens`: token_hash, user_id, expires_at, used_at.
- `mfa_factors`: user_id, type, secret_encrypted or public_key, created_at, last_used_at.
- `backup_codes`: user_id, code_hash, used_at.
- `api_keys`: id, prefix, key_hash, owner, scopes, expires_at, last_used_at, revoked_at.
- Memberships for tenancy and roles: `tenant_memberships(user_id, tenant_id, role)`.

Index lookups used during login (email, token_hash).
