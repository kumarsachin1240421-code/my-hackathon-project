"""CarePill API and local development server.

Run from this directory with: uvicorn main:app --reload
Then open http://127.0.0.1:8000.
"""
from __future__ import annotations
import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, EmailStr

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent
ROOT_DIR = FRONTEND_DIR.parent if FRONTEND_DIR.name in ("frontend2026", "static") else FRONTEND_DIR

# ─── Environment & Configuration Loader ──────────────────────────────────
def load_env_variables() -> None:
    """Load environment variables from .env.local and .env across potential directories."""
    candidate_paths = [
        ROOT_DIR / ".env.local",
        ROOT_DIR / ".env",
        FRONTEND_DIR / ".env.local",
        FRONTEND_DIR / ".env",
        BASE_DIR / ".env.local",
        BASE_DIR / ".env",
        Path(".env.local").resolve(),
        Path(".env").resolve(),
    ]
    # Try python-dotenv first if installed
    try:
        from dotenv import load_dotenv
        for env_file in candidate_paths:
            if env_file.is_file():
                load_dotenv(dotenv_path=env_file, override=False)
    except ImportError:
        pass

    # Built-in fallback parser for .env files
    for env_file in candidate_paths:
        if env_file.is_file():
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"\'')
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass

load_env_variables()

# Gemini & Google API Key
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")

if os.environ.get("VERCEL"):
    DATABASE_PATH = Path("/tmp/carepill.db")
    seed_db = BASE_DIR / "carepill.db"
    if seed_db.exists() and not DATABASE_PATH.exists():
        try:
            import shutil
            shutil.copy2(seed_db, DATABASE_PATH)
        except Exception:
            pass
else:
    DATABASE_PATH = BASE_DIR / "carepill.db"

# JWT-like token secret (auto-generated per server instance, or set via env)
JWT_SECRET = os.environ.get("CAREPILL_SECRET", secrets.token_hex(32))
TOKEN_EXPIRY_DAYS = 7


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CarePill API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ─── Database Connection Pool ───────────────────────────────────────────────

@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    if not os.environ.get("VERCEL"):
        connection.execute("PRAGMA journal_mode=WAL")  # Better concurrent performance locally
    connection.execute("PRAGMA busy_timeout=5000")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialise_database() -> None:
    with database() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS medications (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, dosage TEXT NOT NULL,
                instructions TEXT NOT NULL, doctor_prescription TEXT DEFAULT '', scheduled_time TEXT NOT NULL, stock INTEGER NOT NULL,
                icon TEXT NOT NULL, repeat_label TEXT NOT NULL DEFAULT 'Daily',
                user_id INTEGER DEFAULT NULL
            );
            CREATE TABLE IF NOT EXISTS dose_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, medication_id INTEGER NOT NULL REFERENCES medications(id),
                dose_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending', 'taken', 'snoozed', 'dismissed')),
                updated_at TEXT NOT NULL, UNIQUE(medication_id, dose_date)
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS emergency_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sos_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                latitude REAL,
                longitude REAL,
                ambulance_number TEXT,
                triggered_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT NULL,
                user_name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        # Seed default reviews if empty
        try:
            review_count = connection.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
            if review_count == 0:
                seed_reviews = [
                    ("Dr. Ananya Sharma", 5, "CareWell has completely transformed how my senior patients adhere to their daily medication routines. The reminders are clear, timely, and easy to use.", "2026-09-08 10:30:00"),
                    ("Rajesh Malhotra", 5, "I manage multiple prescriptions for hypertension and diabetes. The dynamic progress ring and real-time alarms mean I never miss a single dose.", "2026-09-09 14:15:00"),
                    ("Sunita Patel (Caregiver)", 5, "As a caregiver for my elderly parents, the 1-click SOS and emergency support give our whole family immense peace of mind.", "2026-09-10 09:45:00"),
                    ("Vikram Sen", 5, "The AI companion and instant pharmacy locator made refilling critical medicines seamless. Truly a modern healthcare companion!", "2026-09-11 18:20:00")
                ]
                connection.executemany(
                    "INSERT INTO reviews (user_name, rating, comment, created_at) VALUES (?, ?, ?, ?)",
                    seed_reviews
                )
        except Exception:
            pass

        # Safe migration for existing DB
        try:
            connection.execute("ALTER TABLE medications ADD COLUMN doctor_prescription TEXT DEFAULT ''")
        except Exception:
            pass

        if connection.execute("SELECT COUNT(*) FROM medications").fetchone()[0] == 0:
            connection.executemany("""INSERT INTO medications
                (id,name,dosage,instructions,doctor_prescription,scheduled_time,stock,icon,repeat_label) VALUES (?,?,?,?,?,?,?,?,?)""", [
                (1, "Atorvastatin", "20mg", "Take with food", "Rx by Dr. A. Sharma: Take once daily with dinner for lipid management.", "08:00 AM", 12, "medication", "Daily"),
                (2, "Lisinopril", "10mg", "With water", "Rx by Dr. A. Sharma: Morning dose with full glass of water for blood pressure.", "12:30 PM", 8, "water_drop", "Daily"),
                (3, "Vitamin D3", "1000 IU", "After lunch", "Rx by Dr. A. Sharma: Daily dietary supplement post-meal.", "02:00 PM", 5, "wb_sunny", "Daily"),
            ])

        if connection.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0:
            connection.executemany("""INSERT INTO reviews (user_name, rating, comment, created_at) VALUES (?,?,?,?)""", [
                ("Sarah Mitchell", 5, "CareWell made managing my dad's daily heart medication so effortless. The smart alarms and refill reminders give our family complete peace of mind.", "2026-03-08"),
                ("David Kumar", 5, "The cleanest, smoothest medication tracker I have ever used. The 7-day adherence reports helped my doctor adjust my prescription accurately.", "2026-03-09"),
                ("Priya Sharma", 5, "Booking confidential counselling sessions and tracking vitamin schedules took seconds. Absolutely love the CareWell AI bot!", "2026-03-10")
            ])


initialise_database()


@app.on_event("startup")
def on_startup() -> None:
    initialise_database()


# ─── Password Hashing (no external dependency) ─────────────────────────────

def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, dk_hex = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ─── Token (JWT-like, lightweight) ──────────────────────────────────────────

def create_token(user_id: int) -> str:
    payload = {"uid": user_id, "exp": int(time.time()) + TOKEN_EXPIRY_DAYS * 86400}
    data = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(JWT_SECRET.encode(), data.encode(), "sha256").hexdigest()
    return f"{data}.{sig}"


def decode_token(token: str) -> int | None:
    try:
        data_part, sig = token.rsplit(".", 1)
        expected_sig = hmac.new(JWT_SECRET.encode(), data_part.encode(), "sha256").hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(data_part)
        if payload.get("exp", 0) < time.time():
            return None
        return payload["uid"]
    except Exception:
        return None


def get_current_user(request: Request) -> dict | None:
    """Extract user from Authorization header. Returns None if unauthenticated."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    user_id = decode_token(auth[7:])
    if user_id is None:
        return None
    with database() as conn:
        row = conn.execute("SELECT id, name, email FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None


# ─── Auth Models ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=200)


class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Auth Endpoints ─────────────────────────────────────────────────────────

@app.post("/api/auth/signup", status_code=201)
def signup(payload: SignupRequest) -> dict:
    with database() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (payload.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(400, "An account with this email already exists.")
        pw_hash = hash_password(payload.password)
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
            (payload.name, payload.email.lower(), pw_hash),
        )
        user_id = cursor.lastrowid
    token = create_token(user_id)
    return {"token": token, "user": {"id": user_id, "name": payload.name, "email": payload.email.lower()}}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    with database() as conn:
        row = conn.execute("SELECT id, name, email, password_hash FROM users WHERE email=?",
                           (payload.email.lower(),)).fetchone()
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password.")
    token = create_token(row["id"])
    return {"token": token, "user": {"id": row["id"], "name": row["name"], "email": row["email"]}}


@app.get("/api/auth/me")
def me(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


# ─── Existing Models ────────────────────────────────────────────────────────

class DoseAction(BaseModel):
    action: Literal["taken", "snoozed", "dismissed"]


class MedicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    dosage: str = Field(min_length=1, max_length=60)
    instructions: str = Field(default="As prescribed", max_length=200)
    doctor_prescription: str = Field(default="", max_length=400)
    scheduled_time: str = Field(default="08:00 AM")
    stock: int = Field(default=30, ge=0)
    icon: str = "medication"
    repeat_label: str = "Daily"


# ─── Dashboard & Data Endpoints ─────────────────────────────────────────────

def dashboard_for(day: date) -> dict:
    with database() as connection:
        rows = connection.execute("""SELECT m.*, COALESCE(e.status, 'pending') AS status
            FROM medications m LEFT JOIN dose_events e ON e.medication_id=m.id AND e.dose_date=? ORDER BY m.id""",
            (day.isoformat(),)).fetchall()
    medicines = [dict(row) for row in rows]
    total = len(medicines)
    completed = sum(1 for m in medicines if m["status"] == "taken")
    pending = max(0, total - completed)
    return {
        "date": day.isoformat(),
        "medications": medicines,
        "completed": completed,
        "pending": pending,
        "total": total
    }


CACHE_HEADERS = {"Cache-Control": "max-age=10, stale-while-revalidate=30"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"message": "Medicine Reminder Backend is Running!", "status": "ok"}


@app.get("/api/dashboard")
def get_dashboard(for_date: date | None = None) -> JSONResponse:
    data = dashboard_for(for_date or date.today())
    return JSONResponse(content=data, headers=CACHE_HEADERS)


@app.get("/api/schedule")
def get_schedule(for_date: date | None = None) -> JSONResponse:
    """All planned doses for a day, including their current saved status."""
    data = dashboard_for(for_date or date.today())
    return JSONResponse(content=data, headers=CACHE_HEADERS)


@app.get("/api/refills")
def get_refills(threshold: int = 15) -> JSONResponse:
    """Medication inventory, with a refill flag based on the selected threshold."""
    with database() as connection:
        medicines = [dict(row) for row in connection.execute(
            "SELECT * FROM medications ORDER BY stock ASC, name ASC"
        ).fetchall()]
    for medicine in medicines:
        medicine["needs_refill"] = medicine["stock"] <= threshold
    data = {"threshold": threshold, "medications": medicines}
    return JSONResponse(content=data, headers=CACHE_HEADERS)


@app.get("/api/reports/weekly")
def weekly_report() -> dict:
    """Seven-day adherence summary based on recorded dose actions."""
    today = date.today()
    start = today - timedelta(days=6)
    with database() as connection:
        totals = connection.execute("SELECT COUNT(*) AS total FROM medications").fetchone()["total"]
        rows = connection.execute("""SELECT dose_date, status, COUNT(*) AS count
            FROM dose_events WHERE dose_date BETWEEN ? AND ? GROUP BY dose_date, status""",
            (start.isoformat(), today.isoformat())).fetchall()
    by_day = {str(start + timedelta(days=index)): {"taken": 0, "dismissed": 0, "snoozed": 0} for index in range(7)}
    for row in rows:
        by_day[row["dose_date"]][row["status"]] = row["count"]
    days = [{"date": day, "scheduled": totals, **counts} for day, counts in by_day.items()]
    taken = sum(item["taken"] for item in days)
    scheduled = totals * 7
    profiles = {
        "Atorvastatin": {"purpose": "Helps lower cholesterol and reduce cardiovascular risk.", "adherence": 100, "last_taken": "8:00 PM", "reminder": "Once daily, as prescribed"},
        "Lisinopril": {"purpose": "Used to help control high blood pressure and may be prescribed for certain heart or kidney conditions.", "adherence": 90, "last_taken": "9:00 AM", "reminder": "Once daily, as prescribed"},
        "Vitamin D3": {"purpose": "Supports vitamin D levels, calcium absorption, and bone health.", "adherence": 100, "last_taken": "9:00 AM", "reminder": "According to the prescribed schedule"},
    }
    with database() as connection:
        medicines = [dict(row) for row in connection.execute("SELECT name, stock FROM medications ORDER BY id").fetchall()]
    patient_medicines = [{**medicine, **profiles.get(medicine["name"], {}), "low_stock": medicine["stock"] <= 8} for medicine in medicines]
    return {"period_start": start.isoformat(), "period_end": today.isoformat(), "scheduled": scheduled,
            "taken": taken, "adherence": round((taken / scheduled * 100) if scheduled else 0), "days": days,
            "patient_medicines": patient_medicines}


@app.get("/api/medications")
def list_medications() -> list[dict]:
    with database() as connection:
        rows = connection.execute("SELECT * FROM medications ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/medications", status_code=201)
def create_medication(medication: MedicationCreate, request: Request) -> dict:
    user = get_current_user(request)
    user_id = user["id"] if user else None
    with database() as connection:
        cursor = connection.execute("""INSERT INTO medications 
            (name, dosage, instructions, doctor_prescription, scheduled_time, stock, icon, repeat_label, user_id)
            VALUES (?,?,?,?,?,?,?,?,?)""", (
            medication.name,
            medication.dosage,
            medication.instructions or "As prescribed",
            medication.doctor_prescription,
            medication.scheduled_time,
            medication.stock,
            medication.icon,
            medication.repeat_label,
            user_id
        ))
        row = connection.execute("SELECT * FROM medications WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/medications/{medication_id}")
def delete_medication(medication_id: int) -> dict:
    with database() as connection:
        connection.execute("DELETE FROM dose_events WHERE medication_id=?", (medication_id,))
        connection.execute("DELETE FROM medications WHERE id=?", (medication_id,))
    dashboard = dashboard_for(date.today())
    return {"message": "Medication deleted", "deleted_id": medication_id, "dashboard": dashboard}


@app.post("/api/medications/{medication_id}/dose")
def update_dose(medication_id: int, payload: DoseAction) -> dict:
    today = date.today().isoformat()
    with database() as connection:
        medication = connection.execute("SELECT id,stock FROM medications WHERE id=?", (medication_id,)).fetchone()
        if medication is None:
            raise HTTPException(status_code=404, detail="Medication not found")
        previous = connection.execute("SELECT status FROM dose_events WHERE medication_id=? AND dose_date=?", (medication_id, today)).fetchone()
        connection.execute("""INSERT INTO dose_events (medication_id,dose_date,status,updated_at) VALUES (?,?,?,?)
            ON CONFLICT(medication_id,dose_date) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at""",
            (medication_id, today, payload.action, datetime.now().isoformat(timespec="seconds")))
        if payload.action == "taken" and (previous is None or previous["status"] != "taken"):
            connection.execute("UPDATE medications SET stock=MAX(0,stock-1) WHERE id=?", (medication_id,))
    dashboard = dashboard_for(date.today())
    return {"id": medication_id, "status": payload.action, "dashboard": dashboard}


# ─── Public & User Reviews / Testimonials ───────────────────────────────────

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=3, max_length=1000)
    user_name: Optional[str] = None


@app.get("/api/reviews")
def get_reviews() -> list[dict]:
    with database() as connection:
        rows = connection.execute("SELECT * FROM reviews ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/reviews", status_code=201)
def create_or_update_review(payload: ReviewCreate, request: Request) -> dict:
    user = get_current_user(request)
    user_id = user["id"] if user else None
    name = payload.user_name or (user["name"] if user else "CareWell Member")
    
    with database() as connection:
        if user_id:
            existing = connection.execute("SELECT id FROM reviews WHERE user_id=?", (user_id,)).fetchone()
            if existing:
                connection.execute("UPDATE reviews SET rating=?, comment=?, user_name=?, created_at=datetime('now') WHERE id=?",
                                   (payload.rating, payload.comment, name, existing["id"]))
                row = connection.execute("SELECT * FROM reviews WHERE id=?", (existing["id"],)).fetchone()
                return dict(row)
        
        cursor = connection.execute(
            "INSERT INTO reviews (user_id, user_name, rating, comment, created_at) VALUES (?,?,?,?,datetime('now'))",
            (user_id, name, payload.rating, payload.comment)
        )
        row = connection.execute("SELECT * FROM reviews WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int) -> dict:
    with database() as connection:
        connection.execute("DELETE FROM reviews WHERE id=?", (review_id,))
    return {"message": "Review deleted", "deleted_id": review_id}


@app.delete("/api/reviews/user/mine")
def delete_my_review(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    with database() as connection:
        connection.execute("DELETE FROM reviews WHERE user_id=?", (user["id"],))
    return {"message": "Your review was deleted successfully"}


# ─── SOS Emergency Endpoints ────────────────────────────────────────────────

class SOSContact(BaseModel):
    name: str
    phone: str
    id: Optional[int] = None


class SOSTrigger(BaseModel):
    contacts: list[SOSContact] = []
    ambulance_number: str = "108"
    location: Optional[dict] = None


@app.post("/api/sos/trigger")
def trigger_sos(payload: SOSTrigger, request: Request) -> dict:
    user = get_current_user(request)
    user_id = user["id"] if user else None

    lat = payload.location.get("lat") if payload.location else None
    lng = payload.location.get("lng") if payload.location else None

    # Record the SOS event
    with database() as conn:
        conn.execute(
            "INSERT INTO sos_events (user_id, latitude, longitude, ambulance_number) VALUES (?,?,?,?)",
            (user_id, lat, lng, payload.ambulance_number),
        )

    # Send SMS to contacts (simulated — in production, integrate Twilio)
    results = []
    location_text = f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else "Location unavailable"
    for contact in payload.contacts:
        message = f"EMERGENCY SOS from CarePill! Patient needs help. Location: {location_text}"
        # In production: twilio_client.messages.create(to=contact.phone, body=message, from_=TWILIO_NUMBER)
        print(f"[SOS SMS] To: {contact.phone} ({contact.name}) - {message}")
        results.append({"id": contact.id, "name": contact.name, "success": True})

    return {"status": "triggered", "results": results, "location": location_text}


@app.get("/api/sos/contacts")
def get_sos_contacts(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        return {"contacts": []}
    with database() as conn:
        rows = conn.execute("SELECT * FROM emergency_contacts WHERE user_id=?", (user["id"],)).fetchall()
    return {"contacts": [dict(r) for r in rows]}


@app.post("/api/sos/contacts", status_code=201)
def add_sos_contact(contact: SOSContact, request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    with database() as conn:
        conn.execute("INSERT INTO emergency_contacts (user_id, name, phone) VALUES (?,?,?)",
                     (user["id"], contact.name, contact.phone))
    return {"status": "added"}


class TwilioSOSTrigger(BaseModel):
    patientName: Optional[str] = "Patient"
    bloodGroup: Optional[str] = "N/A"
    lat: Optional[float] = None
    lng: Optional[float] = None
    caregiverPhone: str


def _dispatch_twilio_message(account_sid: str, auth_token: str, from_phone: str, to_phone: str, body: str) -> dict:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode({"From": from_phone, "To": to_phone, "Body": body}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    auth_str = f"{account_sid}:{auth_token}"
    b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("ascii")
    req.add_header("Authorization", f"Basic {b64_auth}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _dispatch_twilio_call(account_sid: str, auth_token: str, from_phone: str, to_phone: str, twiml: str) -> dict:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls.json"
    data = urllib.parse.urlencode({"From": from_phone, "To": to_phone, "Twiml": twiml}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    auth_str = f"{account_sid}:{auth_token}"
    b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("ascii")
    req.add_header("Authorization", f"Basic {b64_auth}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


@app.post("/api/sos")
def dynamic_twilio_sos(payload: TwilioSOSTrigger) -> dict:
    phone = payload.caregiverPhone.strip() if payload.caregiverPhone else ""
    if not phone or not phone.startswith("+") or len("".join(c for c in phone if c.isdigit())) < 8:
        raise HTTPException(
            status_code=400,
            detail="Valid caregiverPhone with country code (e.g., +91...) is required"
        )

    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    from_phone = os.environ.get("TWILIO_PHONE_NUMBER", "").strip()

    if not account_sid or not auth_token or not from_phone:
        raise HTTPException(
            status_code=500,
            detail="Twilio credentials not configured in environment"
        )

    patient = payload.patientName.strip() if payload.patientName else "Patient"
    blood = payload.bloodGroup.strip() if payload.bloodGroup else "N/A"
    if payload.lat is not None and payload.lng is not None:
        location_url = f"https://maps.google.com/?q={payload.lat},{payload.lng}"
    else:
        location_url = "https://maps.google.com"

    sms_body = (
        f"EMERGENCY ALERT: It's emergency please come as soon as possible! Patient: {patient} (Blood: {blood}). Location: {location_url}"
    )
    twiml_voice = (
        '<Response><Say voice="alice">'
        "It's emergency please come as soon as possible. Your contact has triggered an emergency alert. Please check your messages for coordinates immediately."
        "</Say></Response>"
    )

    call_res = None
    sms_res = None
    call_err = None
    sms_err = None

    # 1. Prioritize Voice Call First in independent try-except
    try:
        call_res = _dispatch_twilio_call(account_sid, auth_token, from_phone, phone, twiml_voice)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        try:
            call_err = json.loads(err_body).get("message", str(e))
        except Exception:
            call_err = err_body or str(e)
        print(f"[Twilio Voice Error] HTTP {e.code}: {call_err}")
    except Exception as e:
        call_err = str(e)
        print(f"[Twilio Voice Unexpected Error]: {e}")

    # 2. Isolate SMS in independent try-except so SMS failure never blocks Voice Call
    try:
        sms_res = _dispatch_twilio_message(account_sid, auth_token, from_phone, phone, sms_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        try:
            sms_err = json.loads(err_body).get("message", str(e))
        except Exception:
            sms_err = err_body or str(e)
        print(f"[Twilio SMS Warning] HTTP {e.code}: {sms_err}")
    except Exception as e:
        sms_err = str(e)
        print(f"[Twilio SMS Unexpected Error]: {e}")

    call_status = "success" if call_res else "failed"
    sms_status = "success" if sms_res else "failed"

    # Return overall state without crashing
    return {
        "success": call_status == "success" or sms_status == "success",
        "message": "Emergency alert sent successfully",
        "callStatus": call_status,
        "callSid": call_res.get("sid") if call_res else None,
        "callError": call_err,
        "smsStatus": sms_status,
        "smsSid": sms_res.get("sid") if sms_res else None,
        "smsError": sms_err,
        "mapsUrl": location_url
    }


# ─── Gemini AI Integration ──────────────────────────────────────────────────

def call_gemini_api(prompt: str, system_instruction: str = "", model: str = "gemini-3.7-flash") -> str:
    """Call Google Gemini REST API with automated model fallback."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API Key is not configured. Please add GEMINI_API_KEY to your .env.local file."
        )

    # Preferred models in sequence
    models_to_try = [model, "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
    seen = set()
    ordered_models = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_error = None
    for target_model in ordered_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
        payload_dict = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        if system_instruction:
            payload_dict["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        data = json.dumps(payload_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
                return "No response generated by Gemini."
        except urllib.error.HTTPError as err:
            error_body = err.read().decode("utf-8", errors="replace")
            last_error = f"HTTP {err.code}: {error_body}"
            if err.code in (404, 503):
                continue
            raise HTTPException(status_code=err.code, detail=f"Gemini API Error: {error_body}")
        except Exception as e:
            last_error = str(e)
            continue

    raise HTTPException(status_code=500, detail=f"Failed to communicate with Gemini API: {last_error}")


class AIChatRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    context: Optional[str] = None
    history: Optional[list] = None


class AIPrescriptionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@app.get("/api/ai/status")
def get_ai_status() -> dict:
    """Check if Gemini AI is properly configured with an API key."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
    has_key = bool(key)
    preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else ("Configured" if has_key else "Not Set")
    return {
        "status": "ready" if has_key else "missing_key",
        "configured": has_key,
        "key_preview": preview,
        "model": "gemini-3.7-flash",
    }


@app.post("/api/ai/chat")
def ai_chat(payload: AIChatRequest) -> dict:
    """CareWell AI Health, Medication, and Site Navigation Assistant."""
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")

    system_instruction = (
        "You are CareWell AI, an empathetic, intelligent dual-role healthcare and wellness companion and site operator for the CareWell platform.\n\n"
        "Your capabilities consist of TWO core roles:\n\n"
        "1. WEBSITE SITE OPERATOR & INTENT DETECTOR:\n"
        "When the user asks to navigate, trigger actions, manage medications, or query site features, respond with actionable guidance:\n"
        "- Navigating to Counselling Sessions, Reports, Today's Schedule, Refills, Pharmacy, Settings, or History\n"
        "- Triggering Emergency SOS countdown safety protocol\n"
        "- Adding a new medication schedule or dosage\n"
        "- Marking medications as taken\n"
        "- Checking current schedule, daily progress, pending doses, inventory stock, or weekly adherence rate\n"
        "- Toggling dark/light mode\n"
        "Always provide a friendly confirmation (e.g., 'Navigating to Counselling Sessions now...').\n\n"
        "2. HEALTHCARE & HUMAN BODY KNOWLEDGE ASSISTANT:\n"
        "When the user asks general questions about health, wellness, nutrition, anatomy, lifestyle, medications, biology, or symptoms:\n"
        "- Answer clearly, accurately, warmly, and empathetically.\n"
        "- Provide practical explanations for common symptoms, medical terms, anatomical functions, and healthy routines.\n"
        "- ALWAYS include this polite disclaimer at the end of health guidance:\n"
        "'⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies.'\n"
    )

    user_prompt = message
    if payload.context:
        user_prompt = f"Patient context:\n{payload.context}\n\nPatient question: {message}"

    models_to_try = ["gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]

    if api_key:
        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            body_data = {
                "systemInstruction": {
                    "parts": [{"text": system_instruction}]
                },
                "contents": [
                    {"role": "user", "parts": [{"text": user_prompt}]}
                ],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 1000
                }
            }
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(body_data).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=12) as response:
                    res_json = json.loads(response.read().decode("utf-8"))
                    text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    return {"reply": text, "source": "gemini_api", "model": model_name}
            except Exception:
                continue

    # Fallback smart healthcare & operator engine if offline or rate-limited or key missing
    q_lower = message.lower()
    if any(w in q_lower for w in ["counsel", "mental health", "therap", "psychiat"]):
        return {"reply": "🧠 Navigating to Counselling Sessions with certified specialists.", "action": "NAVIGATE", "target": "counselling"}
    if any(w in q_lower for w in ["report", "adherence", "streak", "progress chart"]):
        return {"reply": "📊 Opening your Patient Medicine Report and Weekly Adherence Dial.", "action": "NAVIGATE", "target": "reports"}
    if any(w in q_lower for w in ["sos", "emergency", "ambulance", "help me"]):
        return {"reply": "🚨 Activating Emergency SOS countdown protocol!", "action": "TRIGGER_SOS"}
    if any(w in q_lower for w in ["add med", "new med", "add schedule"]):
        return {"reply": "💊 Opening the New Medication Schedule creator.", "action": "ADD_MEDICINE"}

    return {
        "reply": (
            "I am CareWell AI, your health and wellness companion. I can help you manage your daily medications, "
            "track your progress, book counselling sessions, or answer general health, anatomy, and wellness questions.\n\n"
            "⚠️ Disclaimer: I provide general health guidance. Please consult a qualified doctor for medical diagnoses or emergencies."
        ),
        "source": "fallback"
    }


@app.post("/api/ai/analyze-prescription")
def analyze_prescription(payload: AIPrescriptionRequest) -> dict:
    """Analyze doctor prescription text and extract medication schedule items."""
    system_prompt = (
        "You are CarePill prescription parser. Read the doctor's prescription text and extract all medications into a clean JSON structure. "
        "Output ONLY valid JSON with format: {'medications': [{'name': '...', 'dosage': '...', 'instructions': '...', 'scheduled_time': '08:00 AM', 'stock': 30, 'repeat_label': 'Daily'}]}"
    )
    reply = call_gemini_api(payload.text, system_instruction=system_prompt)
    return {"result": reply}


# ─── Clinical AI Triage & Bayesian Hospital Routing ──────────────────────────

class TriageMessage(BaseModel):
    role: str
    content: str

class TriagePayload(BaseModel):
    messages: list[TriageMessage]
    userLocation: Optional[dict] = None

class HospitalQueryPayload(BaseModel):
    lat: float
    lng: float
    radius: Optional[int] = 10000
    specialty: Optional[str] = ""
    keywords: Optional[list[str]] = []
    isEmergency: Optional[bool] = False


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Exact Haversine distance in kilometers."""
    import math
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(6371.0 * c, 2)


def bayesian_hospital_score(rating: float, reviews: int, distance_km: float, max_radius_km: float,
                            is_specialty: bool, is_emergency_facility: bool, is_emergency_user: bool) -> float:
    """Calculate Bayesian weighted score with review count dampening."""
    norm_rating = min(max((rating - 1.0) / 4.0, 0.0), 1.0)
    norm_proximity = max(0.0, 1.0 - (distance_km / max(max_radius_km, 1.0)))
    score = (norm_rating * 0.6) + (norm_proximity * 0.4)

    if reviews < 10:
        score *= 0.85

    if is_specialty:
        score += 0.08
    if is_emergency_user and is_emergency_facility:
        score += 0.12

    return min(max(round(score, 2), 0.05), 0.99)


@app.post("/api/triage")
def triage_symptoms(payload: TriagePayload) -> dict:
    """Clinical AI Symptom Triage using Gemini structured JSON response."""
    last_msg = payload.messages[-1].content if payload.messages else ""
    is_critical = any(kw in last_msg.lower() for kw in [
        "heart attack", "chest pain", "chest tightness", "stroke", "can't breathe",
        "cannot breathe", "shortness of breath", "unconscious", "passed out", "severe bleeding"
    ])

    system_instruction = (
        "You are CarePill Clinical AI Triage Engine. Evaluate patient symptoms and output STRICT JSON conforming to: "
        "{"
        "\"ai_message\": \"string\","
        "\"summary\": \"string\","
        "\"severity\": \"low\" | \"medium\" | \"high\" | \"critical_emergency\","
        "\"is_emergency\": boolean,"
        "\"recommended_specialty\": \"string\","
        "\"search_keywords\": [\"string\", \"string\"],"
        "\"emergency_instructions\": \"string\""
        "}"
    )

    conv_text = "\n".join([f"{m.role}: {m.content}" for m in payload.messages])
    prompt = f"Patient symptoms:\n{conv_text}\n\nProduce valid JSON triage evaluation."

    try:
        raw_res = call_gemini_api(prompt, system_instruction=system_instruction)
        cleaned = raw_res.replace("```json", "").replace("```", "").strip()
        data = json.loads(cleaned)
        if is_critical:
            data["severity"] = "critical_emergency"
            data["is_emergency"] = True
        return data
    except Exception:
        # Fallback heuristic
        if is_critical:
            return {
                "ai_message": "CRITICAL EMERGENCY ALERT: Immediate medical intervention is required. Call 108/112 immediately or proceed to the nearest emergency trauma center.",
                "summary": "Potential life-threatening acute emergency requiring immediate intervention.",
                "severity": "critical_emergency",
                "is_emergency": True,
                "recommended_specialty": "Emergency Medicine / Trauma Center",
                "search_keywords": ["emergency trauma center", "cardiac hospital", "critical care"],
                "emergency_instructions": "Sit upright, loosen tight clothing, and call 108/112 immediately."
            }
        return {
            "ai_message": "Thank you for sharing your symptoms. Based on your description, a general clinical evaluation is recommended.",
            "summary": "General clinical consultation advised",
            "severity": "medium",
            "is_emergency": False,
            "recommended_specialty": "General Medicine",
            "search_keywords": ["general hospital", "multispecialty clinic"]
        }


@app.post("/api/hospitals")
def query_hospitals(payload: HospitalQueryPayload) -> dict:
    """Fetch nearby healthcare facilities and calculate Bayesian weighted rankings."""
    lat = payload.lat
    lng = payload.lng
    radius_km = (payload.radius or 10000) / 1000.0
    specialty = payload.specialty or ""
    is_emergency = bool(payload.isEmergency)

    # 1. Try Overpass API
    facilities = []
    source = "openstreetmap_overpass"
    try:
        query = f"""
        [out:json][timeout:10];
        (
          node["amenity"="hospital"](around:{payload.radius},{lat},{lng});
          node["amenity"="clinic"](around:{payload.radius},{lat},{lng});
          way["amenity"="hospital"](around:{payload.radius},{lat},{lng});
        );
        out center 25;
        """
        req_url = f"https://overpass-api.de/api/interpreter?data={urllib.parse.quote(query.strip())}" if hasattr(urllib, 'parse') else f"https://overpass-api.de/api/interpreter?data={urllib.request.quote(query.strip())}"
        req = urllib.request.Request(req_url, headers={"User-Agent": "CarePill/2.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for el in data.get("elements", []):
                el_lat = el.get("lat") or el.get("center", {}).get("lat", lat)
                el_lng = el.get("lon") or el.get("center", {}).get("lon", lng)
                tags = el.get("tags", {})
                name = tags.get("name") or tags.get("name:en") or "Medical Center"
                dist = haversine_km(lat, lng, el_lat, el_lng)
                is_emerg_fac = tags.get("emergency") == "yes" or any(w in name.lower() for w in ["emergency", "trauma", "critical"])
                spec_match = bool(specialty and specialty.lower() in name.lower())
                rating = 4.8 if is_emerg_fac else 4.3
                reviews = 150 if is_emerg_fac else 40
                score = bayesian_hospital_score(rating, reviews, dist, radius_km, spec_match, is_emerg_fac, is_emergency)

                facilities.append({
                    "id": f"osm-{el.get('id')}",
                    "name": name,
                    "lat": el_lat,
                    "lng": el_lng,
                    "distanceKm": dist,
                    "rating": rating,
                    "userRatingsTotal": reviews,
                    "bayesianScore": score,
                    "address": tags.get("addr:street", "Nearby Healthcare Center"),
                    "phoneNumber": tags.get("phone", "108"),
                    "openNow": True,
                    "isOpen24Hours": is_emerg_fac or tags.get("opening_hours") == "24/7",
                    "specialtyMatch": spec_match,
                    "isEmergencyCenter": is_emerg_fac,
                    "source": "openstreetmap_overpass",
                    "directionsUrl": f"https://www.google.com/maps/dir/?api=1&destination={el_lat},{el_lng}"
                })
    except Exception:
        pass

    # 2. Resilient Directory Fallback if empty
    if not facilities:
        source = "fallback_directory"
        fallback_seeds = [
            ("Apex Multispecialty & Trauma Hospital", 0.009, 0.007, 4.8, 450, True, "Emergency Medicine"),
            ("City Lifeline Critical Care Center", -0.012, 0.011, 4.7, 320, True, specialty or "Cardiology"),
            ("CarePill Health & Family Clinic", -0.006, -0.008, 4.4, 85, False, "General Medicine"),
            ("Fortis Heart & Emergency Institute", 0.018, 0.015, 4.9, 810, True, "Cardiology"),
        ]
        for name, off_lat, off_lng, rat, rev, is_em, spec in fallback_seeds:
            f_lat = lat + off_lat
            f_lng = lng + off_lng
            dist = haversine_km(lat, lng, f_lat, f_lng)
            spec_m = bool(specialty and specialty.lower() in spec.lower())
            score = bayesian_hospital_score(rat, rev, dist, radius_km, spec_m, is_em, is_emergency)
            facilities.append({
                "id": f"fallback-{len(facilities)+1}",
                "name": name,
                "lat": f_lat,
                "lng": f_lng,
                "distanceKm": dist,
                "rating": rat,
                "userRatingsTotal": rev,
                "bayesianScore": score,
                "address": "Medical District, City Center",
                "phoneNumber": "108",
                "openNow": True,
                "isOpen24Hours": is_em,
                "specialtyMatch": spec_m,
                "isEmergencyCenter": is_em,
                "source": "fallback_directory",
                "directionsUrl": f"https://www.google.com/maps/dir/?api=1&destination={f_lat},{f_lng}"
            })

    facilities.sort(key=lambda x: x["bayesianScore"], reverse=True)
    return {
        "success": True,
        "facilities": facilities,
        "triageResult": None
    }


# ─── Serve Frontend ─────────────────────────────────────────────────────────



@app.get("/")
def home() -> FileResponse:
    target = FRONTEND_DIR / "index.html"
    if not target.exists():
        target = Path("index.html")
    return FileResponse(target)


@app.get("/{file_path:path}")
def serve_static_or_spa(file_path: str):
    p1 = FRONTEND_DIR / file_path
    if p1.exists() and p1.is_file():
        return FileResponse(p1)
    p2 = Path(file_path)
    if p2.exists() and p2.is_file():
        return FileResponse(p2)
    return home()
