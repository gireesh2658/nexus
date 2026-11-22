from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os

security = HTTPBearer()

def get_jwt_secret():
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise ValueError("FATAL: JWT_SECRET is not set.")
    return secret

def get_jwt_public_key():
    return os.getenv("JWT_PUBLIC_KEY")

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    secret = get_jwt_secret()
    public_key = get_jwt_public_key()
    
    try:
        if public_key:
            payload = jwt.decode(token, public_key, algorithms=["RS256"])
        else:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("typ") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type: access token required")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
