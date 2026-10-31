from functools import wraps

from flask import session, jsonify, redirect, url_for, request

from utils.db import get_db, now_utc

HISTORY_TYPES = ("disease", "chat", "weather", "guidebook", "economics", "schemes")


def current_user_id():
    return session.get("user_id")


def login_required(view):
    """Pages redirect to /login; API routes get a 401 JSON error."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            if request.path.startswith("/api/"):
                return jsonify({"error": "Please log in to continue."}), 401
            return redirect(url_for("login_page"))
        return view(*args, **kwargs)
    return wrapper


def save_history(entry_type, title, inputs, output):
    """Store a generated result for the logged-in user and return its id (or None).
    Never raises — history must not break the feature."""
    try:
        return str(get_db().history.insert_one({
            "user_id": current_user_id(),
            "type": entry_type,
            "title": title,
            "inputs": inputs,
            "output": output,
            "created_at": now_utc(),
        }).inserted_id)
    except Exception as e:
        print(f"Failed to save history: {e}")
        return None
