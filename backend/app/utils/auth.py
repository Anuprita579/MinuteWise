from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer
from google.auth.transport import requests
from google.oauth2 import id_token
import jwt
import os
from datetime import datetime, timedelta

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)):
    try:
        # Verify JWT token
        payload = jwt.decode(
            token.credentials, 
            os.getenv("JWT_SECRET"), 
            algorithms=["HS256"]
        )
        user_id = payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # You might want to fetch user from database here
        return {"_id": user_id}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")