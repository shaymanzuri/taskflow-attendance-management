"""
API לנוכחות ומשימות ביחידה (Flask + MongoDB).

הרצה:
    python -m pip install -r requirements.txt
    (העתק את .env.example ל-.env ומלא את MONGO_URI)
    python app.py

משתמש המפקד נוצר אוטומטית: bensimon / Aa123456
ניתן להירשם כמשתמש רגיל חדש או להוסיף חיילים דרך המפקד. הכל נשמר ב-MongoDB.
"""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from functools import wraps
from flask_cors import CORS

from bson import ObjectId
from bson.errors import InvalidId
from flask import Flask, g, jsonify, request
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_env(path):
    """טוען משתנים מקובץ .env (ללא חבילות חיצוניות)."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


load_env(os.path.join(BASE_DIR, ".env"))

MONGO_URI = os.environ.get("MONGO_URI")
MONGO_DB = os.environ.get("MONGO_DB", "unit_attendance")
TOKEN_HOURS = 12
MIN_PASSWORD = 6
UTC = dt.timezone.utc

ATT_STATUSES = {
    "base": "בבסיס",
    "sick": "מחלה",
    "vacation": "חופשה",
    "duty_out": "מחוץ לבסיס בתפקיד",
}
MAX_PHOTO_CHARS = 400_000
PHOTO_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")

COMMANDER_USERNAME = "bensimon"
COMMANDER_DEFAULT_PASSWORD = "Aa123456"

if not MONGO_URI:
    raise SystemExit("חסר MONGO_URI. העתק את .env.example ל-.env ומלא את הכתובת.")

app = Flask(__name__)
# כתובות שמורשות לפנות ל-API (ה-frontend ב-Render + פיתוח מקומי)
FRONTEND_URL = "https://taskflow-attendance-management-1.onrender.com"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS", f"{FRONTEND_URL},http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]
CORS(app, origins=ALLOWED_ORIGINS)
app.config["MAX_CONTENT_LENGTH"] = 1_000_000

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
mdb = client[MONGO_DB]
users_c = mdb["users"]
attendance_c = mdb["attendance"]
tasks_c = mdb["tasks"]
audit_c = mdb["audit_log"]
settings_c = mdb["settings"]

SECRET_KEY = None  # נקבע ב-init_db


# ---------------------------------------------------------------- helpers
def utcnow():
    return dt.datetime.now(UTC).replace(microsecond=0)


def now_iso():
    return utcnow().isoformat()


def parse_iso(value):
    d = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d.astimezone(UTC).replace(microsecond=0)


def oid(value):
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def error(message, status=400):
    return jsonify({"error": message}), status


def audit(action, target_type, target_id, details=""):
    audit_c.insert_one(
        {
            "actor_id": g.user["_id"] if hasattr(g, "user") and g.user else None,
            "action": action,
            "target_type": target_type,
            "target_id": str(target_id) if target_id else None,
            "details": details,
            "created_at": now_iso(),
        }
    )


def public_user(row):
    return {
        "id": str(row["_id"]),
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
        "active": bool(row["active"]),
        "photo": row.get("photo"),
    }


def names_map():
    return {u["_id"]: u["full_name"] for u in users_c.find({}, {"full_name": 1})}


def init_db():
    global SECRET_KEY
    try:
        client.admin.command("ping")
    except PyMongoError as e:
        raise SystemExit(
            "אין חיבור ל-MongoDB. בדוק את MONGO_URI ושה-IP שלך מאושר ב-Atlas "
            f"(Network Access).\n{e}"
        )

    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        doc = settings_c.find_one({"_id": "secret"})
        if doc is None:
            try:
                settings_c.insert_one({"_id": "secret", "value": secrets.token_hex(32)})
            except DuplicateKeyError:
                pass
            doc = settings_c.find_one({"_id": "secret"})
        SECRET_KEY = doc["value"]

    users_c.create_index("username", unique=True)
    attendance_c.create_index([("user_id", 1), ("check_in", -1)])
    attendance_c.create_index(
        "user_id", unique=True, partialFilterExpression={"open": True}, name="one_open_per_user"
    )
    tasks_c.create_index("assigned_to")

    if users_c.find_one({"username": COMMANDER_USERNAME}) is None:
        users_c.insert_one(
            {
                "username": COMMANDER_USERNAME,
                "full_name": "מפקד",
                "password_hash": generate_password_hash(COMMANDER_DEFAULT_PASSWORD),
                "role": "commander",
                "active": True,
                "created_at": now_iso(),
            }
        )
        print(f"נוצר משתמש מפקד: {COMMANDER_USERNAME}")
    elif os.environ.get("RESET_COMMANDER") == "1":
        # שחזור סיסמה: מחזיר את המפקד לסיסמת ברירת המחדל ומוודא שהוא פעיל
        users_c.update_one(
            {"username": COMMANDER_USERNAME},
            {
                "$set": {
                    "password_hash": generate_password_hash(COMMANDER_DEFAULT_PASSWORD),
                    "role": "commander",
                    "active": True,
                }
            },
        )
        print(f"סיסמת המפקד {COMMANDER_USERNAME} אופסה לברירת המחדל")


# ------------------------------------------------------------------- auth
def _b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(body):
    return _b64(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())


def make_token(user_id):
    payload = {"sub": str(user_id), "exp": int(time.time()) + TOKEN_HOURS * 3600}
    body = _b64(json.dumps(payload).encode())
    return f"{body}.{_sign(body)}"


def read_token(token):
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return data if data["exp"] > time.time() else None
    except (ValueError, KeyError, TypeError):
        return None


def auth_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return error("נדרשת התחברות", 401)
            data = read_token(header[7:])
            if data is None:
                return error("ההתחברות פגה, יש להתחבר מחדש", 401)
            user_id = oid(data.get("sub"))
            user = users_c.find_one({"_id": user_id, "active": True}) if user_id else None
            if user is None:
                return error("המשתמש אינו פעיל", 401)
            if roles and user["role"] not in roles:
                return error("אין הרשאה לפעולה הזו", 403)
            g.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


_failed = {}
MAX_FAILS, LOCK_SECONDS = 5, 300


@app.post("/api/login")
def login():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip().lower()
    password = str(body.get("password", ""))
    entrance = body.get("as") if body.get("as") in ("user", "commander") else "user"
    if not username or not password:
        return error("יש להזין שם משתמש וסיסמה")

    key = f"{request.remote_addr}|{username}"
    count, since = _failed.get(key, (0, 0))
    if count >= MAX_FAILS and time.time() - since < LOCK_SECONDS:
        return error("יותר מדי ניסיונות. נסה שוב בעוד כמה דקות", 429)

    user = users_c.find_one({"username": username, "active": True})
    if user is None or not check_password_hash(user["password_hash"], password):
        _failed[key] = (count + 1 if time.time() - since < LOCK_SECONDS else 1, time.time())
        return error("שם משתמש או סיסמה שגויים", 401)

    if user["role"] != entrance:
        if user["role"] == "commander":
            return error("זהו משתמש מפקד. יש להיכנס דרך 'כניסת מפקד'", 403)
        return error("זהו משתמש חייל. יש להיכנס דרך 'כניסת חייל'", 403)

    _failed.pop(key, None)
    return jsonify({"token": make_token(user["_id"]), "user": public_user(user)})


@app.post("/api/register")
def register():
    """נתיב חדש להרשמה עצמית של משתמש/חייל חדש ישירות מהממשק."""
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip().lower()
    full_name = str(body.get("full_name", "")).strip()
    password = str(body.get("password", ""))
    
    if not username or not full_name or not password:
        return error("יש להזין שם מלא, שם משתמש וסיסמה")
    if any(c.isspace() for c in username):
        return error("שם משתמש לא יכול להכיל רווחים")
    if len(password) < MIN_PASSWORD:
        return error(f"הסיסמה חייבת להכיל לפחות {MIN_PASSWORD} תווים")
        
    try:
        res = users_c.insert_one(
            {
                "username": username,
                "full_name": full_name,
                "password_hash": generate_password_hash(password),
                "role": "user",
                "active": True,
                "created_at": now_iso(),
            }
        )
    except DuplicateKeyError:
        return error("שם המשתמש כבר קיים", 409)
        
    new_user = users_c.find_one({"_id": res.inserted_id})
    return jsonify({"token": make_token(res.inserted_id), "user": public_user(new_user)}), 201


@app.get("/api/me")
@auth_required()
def me():
    return jsonify(public_user(g.user))


@app.post("/api/me/password")
@auth_required()
def change_my_password():
    body = request.get_json(silent=True) or {}
    old, new = str(body.get("old_password", "")), str(body.get("new_password", ""))
    if not check_password_hash(g.user["password_hash"], old):
        return error("הסיסמה הנוכחית שגויה")
    if len(new) < MIN_PASSWORD:
        return error(f"הסיסמה החדשה חייבת להכיל לפחות {MIN_PASSWORD} תווים")
    if new == old:
        return error("הסיסמה החדשה זהה לנוכחית")
    users_c.update_one({"_id": g.user["_id"]}, {"$set": {"password_hash": generate_password_hash(new)}})
    audit("password_change", "user", g.user["_id"])
    return jsonify({"ok": True})


@app.post("/api/me/photo")
@auth_required()
def set_my_photo():
    body = request.get_json(silent=True) or {}
    photo = body.get("photo")
    if not photo:
        users_c.update_one({"_id": g.user["_id"]}, {"$unset": {"photo": ""}})
        return jsonify({"ok": True, "photo": None})
    if not isinstance(photo, str) or len(photo) > MAX_PHOTO_CHARS or not PHOTO_RE.match(photo):
        return error("קובץ תמונה לא תקין (JPG/PNG/WEBP עד כ-300KB)")
    users_c.update_one({"_id": g.user["_id"]}, {"$set": {"photo": photo}})
    return jsonify({"ok": True, "photo": photo})


# ------------------------------------------------------------- attendance
def read_status(body, default="base"):
    status = body.get("status", default)
    return status if status in ATT_STATUSES else None


@app.post("/api/attendance/check-in")
@auth_required("user")
def check_in():
    status = read_status(request.get_json(silent=True) or {})
    if status is None:
        return error("סטטוס לא תקין")
    try:
        attendance_c.insert_one(
            {
                "user_id": g.user["_id"],
                "check_in": now_iso(),
                "check_out": None,
                "open": True,
                "status": status,
            }
        )
    except DuplicateKeyError:
        return error("כבר רשום כניסה פתוחה. יש לרשום יציאה קודם", 409)
    return jsonify({"ok": True}), 201


@app.post("/api/attendance/status")
@auth_required("user")
def change_status():
    status = read_status(request.get_json(silent=True) or {}, default=None)
    if status is None:
        return error("סטטוס לא תקין")
    res = attendance_c.update_one(
        {"user_id": g.user["_id"], "open": True}, {"$set": {"status": status}}
    )
    if res.matched_count == 0:
        return error("אין כניסה פתוחה. יש לרשום כניסה קודם", 409)
    return jsonify({"ok": True})


@app.post("/api/attendance/check-out")
@auth_required("user")
def check_out():
    res = attendance_c.update_one(
        {"user_id": g.user["_id"], "open": True},
        {"$set": {"check_out": now_iso(), "open": False}},
    )
    if res.matched_count == 0:
        return error("אין כניסה פתוחה. יש לרשום כניסה קודם", 409)
    return jsonify({"ok": True})


def att_row(r):
    return {
        "id": str(r["_id"]),
        "check_in": r["check_in"],
        "check_out": r["check_out"],
        "status": r.get("status", "base"),
    }


@app.get("/api/attendance/mine")
@auth_required("user")
def my_attendance():
    rows = attendance_c.find({"user_id": g.user["_id"]}).sort("check_in", -1).limit(60)
    records = [att_row(r) for r in rows]
    open_rec = next((r for r in records if r["check_out"] is None), None)
    return jsonify({"open": open_rec, "records": records})


@app.get("/api/attendance/today")
@auth_required("commander")
def attendance_now():
    result = []
    for u in users_c.find({"active": True, "role": "user"}).sort("full_name", 1):
        last = attendance_c.find_one({"user_id": u["_id"]}, sort=[("check_in", -1)])
        checked_in = bool(last) and last["check_out"] is None
        status = last.get("status", "base") if checked_in else None
        result.append(
            {
                "id": str(u["_id"]),
                "full_name": u["full_name"],
                "photo": u.get("photo"),
                # ירוק רק אם רשום כנוכח וגם נמצא בבסיס; כל מצב אחר נחשב "לא בבסיס"
                "present": checked_in and status == "base",
                "checked_in": checked_in,
                "status": status,
                "since": last["check_in"] if checked_in else None,
                "last_check_out": last["check_out"] if last else None,
                "open_tasks": tasks_c.count_documents({"assigned_to": u["_id"], "status": "open"}),
            }
        )
    return jsonify(result)


@app.get("/api/attendance/report")
@auth_required("commander")
def attendance_report():
    try:
        start = parse_iso(request.args["start"])
        end = parse_iso(request.args["end"])
    except (KeyError, ValueError):
        return error("יש לבחור תאריך התחלה וסיום")

    query = {"check_in": {"$gte": start.isoformat(), "$lt": end.isoformat()}}
    user_id = request.args.get("user_id")
    if user_id:
        uid = oid(user_id)
        if uid is None:
            return error("משתמש לא תקין")
        query["user_id"] = uid

    names = names_map()
    rows = attendance_c.find(query).sort("check_in", -1).limit(2000)
    return jsonify(
        [
            {
                "id": str(r["_id"]),
                "user_id": str(r["user_id"]),
                "full_name": names.get(r["user_id"], "?"),
                "check_in": r["check_in"],
                "check_out": r["check_out"],
                "status": r.get("status", "base"),
            }
            for r in rows
        ]
    )


@app.patch("/api/attendance/<rec_id>")
@auth_required("commander")
def edit_attendance(rec_id):
    rid = oid(rec_id)
    rec = attendance_c.find_one({"_id": rid}) if rid else None
    if rec is None:
        return error("הרישום לא נמצא", 404)
    body = request.get_json(silent=True) or {}
    reason = str(body.get("reason", "")).strip()
    if not reason:
        return error("חובה לציין סיבה לתיקון")
    try:
        new_in = parse_iso(body["check_in"])
        new_out = parse_iso(body["check_out"]) if body.get("check_out") else None
    except (KeyError, ValueError):
        return error("זמן לא תקין")
    if new_out and new_out <= new_in:
        return error("זמן היציאה חייב להיות אחרי זמן הכניסה")
    new_status = body.get("status", rec.get("status", "base"))
    if new_status not in ATT_STATUSES:
        return error("סטטוס לא תקין")

    try:
        attendance_c.update_one(
            {"_id": rid},
            {
                "$set": {
                    "check_in": new_in.isoformat(),
                    "check_out": new_out.isoformat() if new_out else None,
                    "open": new_out is None,
                    "status": new_status,
                }
            },
        )
    except DuplicateKeyError:
        return error("לחייל הזה כבר יש כניסה פתוחה אחרת", 409)
    audit(
        "attendance_edit",
        "attendance",
        rid,
        f"{rec['check_in']}/{rec['check_out']} -> {new_in.isoformat()}/"
        f"{new_out.isoformat() if new_out else None} | {reason}",
    )
    return jsonify({"ok": True})


# ------------------------------------------------------------------ users
@app.get("/api/users")
@auth_required("commander")
def list_users():
    rows = users_c.find({}).sort([("role", 1), ("active", -1), ("full_name", 1)])
    return jsonify([public_user(r) for r in rows])


@app.post("/api/users")
@auth_required("commander")
def create_user():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip().lower()
    full_name = str(body.get("full_name", "")).strip()
    password = str(body.get("password", ""))
    if not username or not full_name:
        return error("יש להזין שם מלא ושם משתמש")
    if any(c.isspace() for c in username):
        return error("שם משתמש לא יכול להכיל רווחים")
    if len(password) < MIN_PASSWORD:
        return error(f"הסיסמה חייבת להכיל לפחות {MIN_PASSWORD} תווים")
    try:
        res = users_c.insert_one(
            {
                "username": username,
                "full_name": full_name,
                "password_hash": generate_password_hash(password),
                "role": "user",
                "active": True,
                "created_at": now_iso(),
            }
        )
    except DuplicateKeyError:
        return error("שם המשתמש כבר קיים", 409)
    audit("user_create", "user", res.inserted_id, username)
    return jsonify({"id": str(res.inserted_id)}), 201


@app.patch("/api/users/<user_id>")
@auth_required("commander")
def update_user(user_id):
    uid = oid(user_id)
    target = users_c.find_one({"_id": uid}) if uid else None
    if target is None:
        return error("המשתמש לא נמצא", 404)
    if target["role"] == "commander":
        return error("את סיסמת המפקד מחליפים דרך 'החשבון שלי'", 403)
    body = request.get_json(silent=True) or {}

    if "active" in body:
        users_c.update_one({"_id": uid}, {"$set": {"active": bool(body["active"])}})
        audit("user_active", "user", uid, str(bool(body["active"])))
    if body.get("password"):
        if len(str(body["password"])) < MIN_PASSWORD:
            return error(f"הסיסמה חייבת להכיל לפחות {MIN_PASSWORD} תווים")
        users_c.update_one(
            {"_id": uid}, {"$set": {"password_hash": generate_password_hash(str(body["password"]))}}
        )
        audit("user_password_reset", "user", uid)
    return jsonify({"ok": True})


# ------------------------------------------------------------------ tasks
def valid_date(value):
    try:
        dt.datetime.strptime(str(value), "%Y-%m-%d")
        return True
    except ValueError:
        return False


def task_rows(query):
    names = names_map()
    rows = [
        {
            "id": str(t["_id"]),
            "title": t["title"],
            "description": t.get("description", ""),
            "status": t["status"],  # open | submitted | done
            "start_date": t.get("start_date"),
            "due_date": t.get("due_date"),
            "progress": t.get("progress", 100 if t["status"] == "done" else 0),
            "created_at": t["created_at"],
            "submitted_at": t.get("submitted_at"),
            "completed_at": t.get("completed_at"),
            "assigned_to": str(t["assigned_to"]),
            "assignee_name": names.get(t["assigned_to"], "?"),
            "notes": [
                {
                    "author": names.get(n.get("by"), "?"),
                    "role": n.get("role", "user"),
                    "text": n.get("text", ""),
                    "created_at": n.get("created_at"),
                }
                for n in t.get("notes", [])
            ],
        }
        for t in tasks_c.find(query).sort("_id", -1).limit(500)
    ]
    rows.sort(key=lambda t: (t["status"] == "done", t["due_date"] is None, t["due_date"] or ""))
    return rows


def load_task(task_id):
    tid = oid(task_id)
    return tid, (tasks_c.find_one({"_id": tid}) if tid else None)


def can_touch(task):
    return g.user["role"] == "commander" or task["assigned_to"] == g.user["_id"]


@app.get("/api/tasks/mine")
@auth_required("user")
def my_tasks():
    return jsonify(task_rows({"assigned_to": g.user["_id"]}))


@app.get("/api/tasks")
@auth_required("commander")
def all_tasks():
    return jsonify(task_rows({}))


@app.post("/api/tasks")
@auth_required("commander")
def create_task():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()
    if not title:
        return error("יש להזין כותרת למשימה")
    aid = oid(body.get("assigned_to"))
    assignee = users_c.find_one({"_id": aid, "active": True, "role": "user"}) if aid else None
    if assignee is None:
        return error("יש לבחור חייל פעיל")
    start = body.get("start_date") or None
    due = body.get("due_date") or None
    if not due:
        return error("יש לבחור תאריך יעד")
    if not valid_date(due) or (start and not valid_date(start)):
        return error("תאריך לא תקין")
    if start and start > due:
        return error("תאריך ההתחלה לא יכול להיות אחרי תאריך היעד")
    res = tasks_c.insert_one(
        {
            "title": title,
            "description": str(body.get("description", "")).strip(),
            "assigned_to": assignee["_id"],
            "created_by": g.user["_id"],
            "status": "open",
            "start_date": start,
            "due_date": due,
            "progress": 0,
            "notes": [],
            "created_at": now_iso(),
            "submitted_at": None,
            "completed_at": None,
        }
    )
    return jsonify({"id": str(res.inserted_id)}), 201


@app.post("/api/tasks/<task_id>/progress")
@auth_required()
def task_progress(task_id):
    tid, task = load_task(task_id)
    if task is None:
        return error("המשימה לא נמצאה", 404)
    if not can_touch(task):
        return error("אין הרשאה לפעולה הזו", 403)
    if task["status"] != "open":
        return error("אפשר לעדכן התקדמות רק במשימה פתוחה", 409)
    try:
        progress = int((request.get_json(silent=True) or {}).get("progress"))
    except (TypeError, ValueError):
        return error("אחוז לא תקין")
    if not 0 <= progress <= 100:
        return error("האחוז חייב להיות בין 0 ל-100")
    tasks_c.update_one({"_id": tid}, {"$set": {"progress": progress}})
    return jsonify({"ok": True, "progress": progress})


@app.post("/api/tasks/<task_id>/notes")
@auth_required()
def task_add_note(task_id):
    tid, task = load_task(task_id)
    if task is None:
        return error("המשימה לא נמצאה", 404)
    if not can_touch(task):
        return error("אין הרשאה לפעולה הזו", 403)
    text = str((request.get_json(silent=True) or {}).get("text", "")).strip()
    if not text:
        return error("יש לכתוב הערה")
    if len(text) > 1000:
        return error("ההערה ארוכה מדי (עד 1000 תווים)")
    tasks_c.update_one(
        {"_id": tid},
        {
            "$push": {
                "notes": {
                    "by": g.user["_id"],
                    "role": g.user["role"],
                    "text": text,
                    "created_at": now_iso(),
                }
            }
        },
    )
    return jsonify({"ok": True}), 201


@app.post("/api/tasks/<task_id>/complete")
@auth_required()
def complete_task(task_id):
    tid, task = load_task(task_id)
    if task is None:
        return error("המשימה לא נמצאה", 404)
    if not can_touch(task):
        return error("אין הרשאה לפעולה הזו", 403)
    if task["status"] == "done":
        return error("המשימה כבר הושלמה", 409)

    if g.user["role"] == "commander":
        tasks_c.update_one(
            {"_id": tid},
            {"$set": {"status": "done", "progress": 100, "completed_at": now_iso()}},
        )
        return jsonify({"ok": True, "status": "done"})

    # חייל: המשימה עוברת לאישור המפקד ולא נסגרת עד שהמפקד מאשר
    if task["status"] == "submitted":
        return error("המשימה כבר נשלחה לאישור המפקד", 409)
    tasks_c.update_one(
        {"_id": tid},
        {
            "$set": {
                "status": "submitted",
                "progress_before_submit": task.get("progress", 0),
                "progress": 100,
                "submitted_at": now_iso(),
            }
        },
    )
    return jsonify({"ok": True, "status": "submitted"})


@app.post("/api/tasks/<task_id>/approve")
@auth_required("commander")
def approve_task(task_id):
    tid, task = load_task(task_id)
    if task is None:
        return error("המשימה לא נמצאה", 404)
    if task["status"] != "submitted":
        return error("המשימה לא ממתינה לאישור", 409)
    tasks_c.update_one(
        {"_id": tid},
        {"$set": {"status": "done", "progress": 100, "completed_at": now_iso()}},
    )
    audit("task_approve", "task", tid, task["title"])
    return jsonify({"ok": True})


@app.post("/api/tasks/<task_id>/reject")
@auth_required("commander")
def reject_task(task_id):
    tid, task = load_task(task_id)
    if task is None:
        return error("המשימה לא נמצאה", 404)
    if task["status"] != "submitted":
        return error("המשימה לא ממתינה לאישור", 409)
    reason = str((request.get_json(silent=True) or {}).get("reason", "")).strip()[:1000]
    update = {
        "$set": {
            "status": "open",
            "progress": task.get("progress_before_submit", 0),
            "submitted_at": None,
        }
    }
    if reason:
        update["$push"] = {
            "notes": {
                "by": g.user["_id"],
                "role": "commander",
                "text": f"הוחזרה לתיקון: {reason}",
                "created_at": now_iso(),
            }
        }
    tasks_c.update_one({"_id": tid}, update)
    audit("task_reject", "task", tid, reason)
    return jsonify({"ok": True})


@app.post("/api/tasks/<task_id>/reopen")
@auth_required("commander")
def reopen_task(task_id):
    tid = oid(task_id)
    if tid:
        tasks_c.update_one(
            {"_id": tid},
            {"$set": {"status": "open", "completed_at": None, "submitted_at": None}},
        )
    return jsonify({"ok": True})


@app.delete("/api/tasks/<task_id>")
@auth_required("commander")
def delete_task(task_id):
    tid = oid(task_id)
    if tid:
        tasks_c.delete_one({"_id": tid})
        audit("task_delete", "task", tid)
    return jsonify({"ok": True})


@app.get("/api/audit")
@auth_required("commander")
def audit_log():
    names = names_map()
    rows = audit_c.find({}).sort("_id", -1).limit(200)
    return jsonify(
        [
            {
                "id": str(r["_id"]),
                "action": r["action"],
                "target_type": r["target_type"],
                "target_id": r["target_id"],
                "details": r["details"],
                "created_at": r["created_at"],
                "actor": names.get(r["actor_id"], "?"),
            }
            for r in rows
        ]
    )


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=os.environ.get("FLASK_DEBUG") == "1")
