"""CarePill API and local development server.

Run from this directory with: uvicorn main:app --reload
Then open http://127.0.0.1:8000.
"""
from __future__ import annotations
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent
DATABASE_PATH = BASE_DIR / "carepill.db"
app = FastAPI(title="CarePill API", version="1.0.0")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

def initialise_database() -> None:
    with database() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS medications (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, dosage TEXT NOT NULL,
                instructions TEXT NOT NULL, scheduled_time TEXT NOT NULL, stock INTEGER NOT NULL,
                icon TEXT NOT NULL, repeat_label TEXT NOT NULL DEFAULT 'Daily'
            );
            CREATE TABLE IF NOT EXISTS dose_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, medication_id INTEGER NOT NULL REFERENCES medications(id),
                dose_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending', 'taken', 'snoozed', 'dismissed')),
                updated_at TEXT NOT NULL, UNIQUE(medication_id, dose_date)
            );
        """)
        if connection.execute("SELECT COUNT(*) FROM medications").fetchone()[0] == 0:
            connection.executemany("""INSERT INTO medications
                (id,name,dosage,instructions,scheduled_time,stock,icon) VALUES (?,?,?,?,?,?,?)""", [
                (1, "Atorvastatin", "20mg", "Take with food", "08:00 AM", 12, "medication"),
                (2, "Lisinopril", "10mg", "With water", "12:30 PM", 8, "water_drop"),
                (3, "Vitamin D3", "1000 IU", "After lunch", "02:00 PM", 5, "wb_sunny"),
            ])

# Create the schema as soon as this module is imported. This also makes direct
# function calls and reload-worker startup safe before FastAPI's startup event.
initialise_database()

@app.on_event("startup")
def on_startup() -> None:
    initialise_database()

class DoseAction(BaseModel):
    action: Literal["taken", "snoozed", "dismissed"]

class MedicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    dosage: str = Field(min_length=1, max_length=40)
    instructions: str = Field(min_length=1, max_length=120)
    scheduled_time: str = Field(pattern=r"^([0-1]\d|2[0-3]):[0-5]\d (AM|PM)$")
    stock: int = Field(ge=0)
    icon: str = "medication"

def dashboard_for(day: date) -> dict:
    with database() as connection:
        rows = connection.execute("""SELECT m.*, COALESCE(e.status, 'pending') AS status
            FROM medications m LEFT JOIN dose_events e ON e.medication_id=m.id AND e.dose_date=? ORDER BY m.id""", (day.isoformat(),)).fetchall()
    medicines = [dict(row) for row in rows]
    return {"date": day.isoformat(), "medications": medicines,
            "completed": sum(m["status"] == "taken" for m in medicines),
            "pending": sum(m["status"] == "pending" for m in medicines)}

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"message": "Medicine Reminder Backend is Running!", "status": "ok"}

@app.get("/api/dashboard")
def get_dashboard(for_date: date | None = None) -> dict:
    return dashboard_for(for_date or date.today())

@app.get("/api/schedule")
def get_schedule(for_date: date | None = None) -> dict:
    """All planned doses for a day, including their current saved status."""
    return dashboard_for(for_date or date.today())

@app.get("/api/refills")
def get_refills(threshold: int = 15) -> dict:
    """Medication inventory, with a refill flag based on the selected threshold."""
    with database() as connection:
        medicines = [dict(row) for row in connection.execute(
            "SELECT * FROM medications ORDER BY stock ASC, name ASC"
        ).fetchall()]
    for medicine in medicines:
        medicine["needs_refill"] = medicine["stock"] <= threshold
    return {"threshold": threshold, "medications": medicines}

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
def create_medication(medication: MedicationCreate) -> dict:
    with database() as connection:
        cursor = connection.execute("""INSERT INTO medications (name,dosage,instructions,scheduled_time,stock,icon)
            VALUES (?,?,?,?,?,?)""", (medication.name, medication.dosage, medication.instructions,
            medication.scheduled_time, medication.stock, medication.icon))
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
    # Read after the write transaction has committed so the returned dashboard is current.
    dashboard = dashboard_for(date.today())
    return {"id": medication_id, "status": payload.action, "dashboard": dashboard}

@app.get("/")
def home() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")
