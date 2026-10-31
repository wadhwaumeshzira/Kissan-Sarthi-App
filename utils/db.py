import os
from datetime import datetime, timezone

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import OperationFailure

# Reports/history are kept for at most this many days; MongoDB's TTL monitor deletes them after that.
HISTORY_TTL_DAYS = 30
HISTORY_TTL_SECONDS = HISTORY_TTL_DAYS * 24 * 60 * 60

_db = None


class DatabaseNotConfigured(Exception):
    pass


def get_db():
    """Return the Mongo database, connecting (and creating indexes) on first use."""
    global _db
    if _db is not None:
        return _db

    uri = os.environ.get("MONGODB_URI", "")
    if not uri:
        raise DatabaseNotConfigured("Database not configured. Please set MONGODB_URI in .env")

    client = MongoClient(uri, serverSelectionTimeoutMS=10000, tz_aware=True)
    db = client[os.environ.get("MONGODB_DB_NAME", "kissan_sarthi")]
    _ensure_indexes(db)
    _db = db
    return _db


def _ensure_indexes(db):
    db.users.create_index([("phone", ASCENDING)], unique=True)
    db.history.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    # Followed crop plans are NOT auto-deleted (crops run longer than 30 days); the farmer removes them.
    db.plans.create_index([("user_id", ASCENDING), ("source_history_id", ASCENDING)], unique=True)

    # TTL index: each history document is removed HISTORY_TTL_SECONDS after its created_at
    try:
        db.history.create_index([("created_at", ASCENDING)], expireAfterSeconds=HISTORY_TTL_SECONDS, name="history_ttl")
    except OperationFailure:
        # Index already exists with a different expiry — update it in place
        db.command("collMod", "history", index={"name": "history_ttl", "expireAfterSeconds": HISTORY_TTL_SECONDS})


def now_utc():
    return datetime.now(timezone.utc)
