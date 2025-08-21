from fastapi import APIRouter, HTTPException, Depends, Request, Body

from google.auth.transport import requests
from google.oauth2 import id_token
import jwt
import os
from datetime import datetime, timedelta
from bson import ObjectId

from ..models.user import User, UserCreate, UserResponse

from ..utils.auth import get_current_user

router = APIRouter()

@router.post("/google", response_model=dict)
async def google_auth(request: Request, token_data: dict = Body(...)):
    try:
        token = token_data.get("token")
        if not token:
            raise HTTPException(status_code=400, detail="Token required")

        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            os.getenv("GOOGLE_CLIENT_ID")
        )

        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')

        user_data = await request.app.mongodb.users.find_one({"google_id": idinfo['sub']})
        
        if not user_data:
            user_create = UserCreate(
                email=idinfo['email'],
                name=idinfo['name'],
                google_id=idinfo['sub'],
                avatar=idinfo.get('picture')
            )
            result = await request.app.mongodb.users.insert_one(user_create.dict())
            user_data = await request.app.mongodb.users.find_one({"_id": result.inserted_id})

        jwt_payload = {
            "user_id": str(user_data["_id"]),
            "email": user_data["email"],
            "exp": datetime.utcnow() + timedelta(days=30)
        }
        
        jwt_token = jwt.encode(jwt_payload, os.getenv("JWT_SECRET"), algorithm="HS256")

        return {
            "token": jwt_token,
            "user": {
                "id": str(user_data["_id"]),
                "email": user_data["email"],
                "name": user_data["name"],
                "avatar": user_data.get("avatar")
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(request: Request, current_user=Depends(get_current_user)):
    try:
        user_data = await request.app.mongodb.users.find_one({"_id": ObjectId(current_user["_id"])})
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(
            id=str(user_data["_id"]),
            email=user_data["email"],
            name=user_data["name"],
            avatar=user_data.get("avatar")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user: {str(e)}")

