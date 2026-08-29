"""CarePill API and local development server.

Run from this directory with: uvicorn main:app --reload
Then open http://127.0.0.1:8000.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
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
        """)
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
    return {"date": day.isoformat(), "medications": medicines,
            "completed": sum(m["status"] == "taken" for m in medicines),
            "pending": sum(m["status"] == "pending" for m in medicines)}


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
