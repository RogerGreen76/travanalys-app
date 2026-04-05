from fastapi import FastAPI, APIRouter, Query
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import requests as http_requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

@api_router.get("/atg/calendar")
def atg_calendar(date: str = Query(..., description="Date in YYYY-MM-DD format")):
    url = f"https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/calendar/day/{date}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/game")
def atg_game(gameId: str = Query(..., description="ATG game ID")):
    url = f"https://horse-betting-info.prod.c1.atg.cloud/api-public/v0/games/{gameId}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/race")
def atg_race(
    gameType: str = Query(..., description="ATG game type, e.g. V85"),
    raceId: str = Query(..., description="ATG race ID"),
):
    url = f"https://www.atg.se/services/racinginfo/v1/api/games/{gameType}_{raceId}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@api_router.get("/atg/result")
def atg_result(
    gameType: str = Query(..., description="ATG game type, e.g. V85"),
    raceId: str = Query(..., description="ATG race ID"),
):
    url = f"https://www.atg.se/services/racinginfo/v1/api/games/{gameType}_{raceId}"
    resp = http_requests.get(url, timeout=15)
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()