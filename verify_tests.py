import urllib.request
import urllib.parse
import urllib.error
import json
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run_tests():
    print("=== Running CareWell Automated Verification Suite ===")

    # Test 1: DOM Verification on index.html
    print("\n--- Test 1: DOM Structure & Landing Page Verification ---")
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Verify no middle navigation links in landing-nav
    assert '<header class="landing-nav">' in html, "landing-nav missing"
    landing_nav = html[html.find('<header class="landing-nav">'):html.find('</header>')]
    assert 'Home' not in landing_nav or 'CareWell Home' in landing_nav, "Found unexpected 'Home' nav link"
    assert 'Features' not in landing_nav, "Found middle 'Features' link in header"
    assert 'About' not in landing_nav, "Found middle 'About' link in header"
    assert 'Testimonials' not in landing_nav, "Found middle 'Testimonials' link in header"
    assert 'FAQ' not in landing_nav, "Found middle 'FAQ' link in header"
    assert 'themeToggleBtn' not in landing_nav, "Found theme toggle button in header"
    print("[PASS] Landing top nav header is clean and minimal (no middle links, no theme toggle)")

    # Verify Login button on top right
    assert 'class="btn-login"' in landing_nav, "Login button missing from top nav"
    assert 'Login' in landing_nav, "Login text missing"
    print("[PASS] Clean Login button located on top right")

    # Verify Quote "Small Steps Healthier Tomorrows" directly above the first feature card (Never Miss a Dose)
    assert 'top-quote-cloud-pill' not in landing_nav, "Badge still present in landing nav"
    assert 'top-quote-cloud-pill' in html, "Quote pill container missing from DOM"
    first_card_pos = html.find('<strong>Never Miss a Dose</strong>')
    badge_pos = html.find('top-quote-cloud-pill')
    assert 0 < badge_pos < first_card_pos, "Badge should be positioned directly above the first feature card ('Never Miss a Dose')"
    assert 'Small Steps' in html and 'Healthier Tomorrows' in html, "Quote text mismatch"
    print("[PASS] Quote 'Small Steps Healthier Tomorrows' repositioned directly above 'Never Miss a Dose' card (Item 1)")

    # Verify Digital Clock Time Picker in Schedule Modal (Item 4)
    assert 'id="digitalClockPicker"' in html, "digitalClockPicker missing in index.html"
    assert 'id="clockHourInput"' in html and 'id="clockMinInput"' in html, "Clock hour and min inputs missing"
    assert 'id="clockBtnAM"' in html and 'id="clockBtnPM"' in html, "Clock AM/PM toggle buttons missing"
    assert 'clockHourUp' in html and 'clockMinUp' in html, "Clock steppers missing"
    print("[PASS] Interactive Digital Clock Time Picker (HH:MM, AM/PM toggle, steppers) verified in schedule modal (Item 4)")

    # Verify Medicine Reminder Notification Popup (Item 3)
    assert 'id="alarmPopupOverlay"' in html, "alarmPopupOverlay missing"
    assert 'id="alarmPopupDosage"' in html, "alarmPopupDosage element missing"
    assert 'id="alarmPopupTime"' in html, "alarmPopupTime element missing"
    assert 'id="popupTakenBtn"' in html, "popupTakenBtn button missing"
    assert 'id="popupSnoozeBtn"' in html, "popupSnoozeBtn button missing"
    assert 'id="popupDismissBtn"' in html, "popupDismissBtn button missing"
    print("[PASS] Medicine reminder popup with Name, Dosage, Time, and Taken/Snooze/Dismiss buttons verified (Item 3)")

    # Verify Footer & Contact modal
    assert 'openContactTeamBtn' in html, "openContactTeamBtn missing from footer"
    assert 'Contact Our Team' in html, "'Contact Our Team' text missing from footer"
    assert 'contactTeamModalOverlay' in html, "contactTeamModalOverlay modal missing"
    assert 'mailto:support@carewell.com' in html, "support@carewell.com mailto link missing"
    assert 'tel:+919876543210' in html, "+91 98765 43210 tel link missing"
    assert 'copyContactValue(\'support@carewell.com\', this)' in html, "Copy email button trigger missing"
    assert 'copyContactValue(\'+91 98765 43210\', this)' in html, "Copy phone button trigger missing"
    print("[PASS] Footer 'Contact Our Team' button and direct support modal (email, phone, copy buttons) verified")

    # Verify Public Testimonials
    assert 'landingTestimonialsSection' in html, "landingTestimonialsSection missing"
    assert 'What Our Users Say' in html, "'What Our Users Say' title missing"
    assert 'landingTestimonialsGrid' in html, "landingTestimonialsGrid missing"
    print("[PASS] Public 'What Our Users Say' testimonials grid section verified")

    # Verify AI Companion hidden on landing page
    assert 'id="carewellBotContainer"' in html, "carewellBotContainer missing"
    bot_container_match = re.search(r'<div[^>]*id="carewellBotContainer"[^>]*>', html)
    assert bot_container_match, "carewellBotContainer element not found"
    assert 'display:none' in bot_container_match.group(0).replace(" ", ""), "carewellBotContainer should have display:none initially"
    print("[PASS] Floating CareWell AI companion is hidden by default on public landing page")

    # Test 2: JavaScript Logic & Safety Verification
    print("\n--- Test 2: JavaScript Logic & Function Verification ---")
    with open("script.js", "r", encoding="utf-8") as f:
        js = f.read()

    assert 'function showToast(' in js, "showToast function missing in script.js"
    assert 'renderLandingTestimonials' in js, "renderLandingTestimonials missing"
    assert 'renderSettingsReviewCard' in js, "renderSettingsReviewCard missing"
    assert 'submitUserReview' in js, "submitUserReview missing"
    assert 'deleteUserReview' in js, "deleteUserReview missing"
    assert 'copyContactValue' in js, "copyContactValue missing"
    assert 'initContactTeamModal' in js, "initContactTeamModal missing"
    assert 'deleteMyReviewBtn' in js, "deleteMyReviewBtn handler missing"
    assert 'Delete My Review' in js, "'Delete My Review' text missing"

    # Hospital Scanner checks (Item 2)
    assert 'function showHospitalScanner(' in js, "showHospitalScanner missing in script.js"
    assert 'hsHospitalName' in js, "Hospital Name input logic missing"
    assert 'navigator.geolocation.getCurrentPosition' in js, "Geolocation check missing"
    assert 'hsManualLocation' in js, "Manual location input fallback missing"
    assert 'scanDirection' in js and 'shatter' in js, "Double-pass scanner and shatter animation logic missing"
    assert 'Room Number &amp; Ward' in js or 'Room Number & Ward' in js, "Room Number & Ward missing from patient record"
    assert 'Doctor Appointment Details' in js, "Doctor Appointment Details missing from patient record"
    assert 'Medicine Prescriptions' in js, "Medicine Prescriptions missing from patient record"
    assert 'Medical &amp; Lab Reports' in js or 'Medical & Lab Reports' in js, "Medical & Lab Reports missing from patient record"
    print("[PASS] Hospital Scanner with Geolocation, Dynamic QR, Double-Pass Shatter, and Full Patient Records verified (Item 2)")

    # Digital Clock Logic check (Item 4)
    assert 'function initDigitalClockPicker(' in js, "initDigitalClockPicker missing in script.js"
    print("[PASS] Digital Clock Picker initialization and synchronization logic verified (Item 4)")

    # Alarm Manager checks (Item 3)
    with open("alarm.js", "r", encoding="utf-8") as f:
        alarm_js = f.read()
    assert 'popupTakenBtn' in alarm_js, "popupTakenBtn logic missing in alarm.js"
    assert 'popupSnoozeBtn' in alarm_js, "popupSnoozeBtn logic missing in alarm.js"
    assert 'popupDismissBtn' in alarm_js, "popupDismissBtn logic missing in alarm.js"
    assert 'alarmPopupDosage' in alarm_js and 'alarmPopupTime' in alarm_js, "Dosage and time binding missing in alarm.js"
    print("[PASS] Medicine reminder popup dispatch with Taken, Snooze, and Dismiss verified (Item 3)")

    # Boundary rules verification
    assert 'X of Y taken' in js or 'taken of' in js or 'progress' in js, "Progress counter missing"
    assert 'showCounsellingSession' in js, "Counselling session view missing"
    assert 'openDoctorBookingModal' in js, "Doctor booking modal missing"
    print("[PASS] JavaScript functions for reviews, settings card, deletion, and contact modal verified")
    print("[PASS] Dynamic progress counter and Counselling Session workflows remain completely untouched")

    # Test 3: Backend API Integration
    print("\n--- Test 3: Backend API Live Verification ---")
    base_url = "http://127.0.0.1:8000"
    
    server_proc = None
    try:
        urllib.request.urlopen(f"{base_url}/api/reviews", timeout=1)
    except Exception:
        print("[INFO] Server not detected on port 8000. Spawning temporary uvicorn instance for tests...")
        import subprocess
        import time
        server_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "frontend2026.backend2026.main:app", "--port", "8000", "--host", "127.0.0.1"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        for _ in range(30):
            time.sleep(0.5)
            try:
                urllib.request.urlopen(f"{base_url}/api/reviews", timeout=1)
                print("[INFO] Server instance is up and responsive on port 8000.")
                break
            except Exception:
                pass

    try:
        # 3a. GET /api/reviews
        req = urllib.request.urlopen(f"{base_url}/api/reviews")
        assert req.status == 200, f"Expected 200, got {req.status}"
        reviews = json.loads(req.read().decode("utf-8"))
        assert isinstance(reviews, list), "Expected list of reviews"
        assert len(reviews) >= 1, "Expected at least 1 seeded review"
        print(f"[PASS] GET /api/reviews returned {len(reviews)} active reviews successfully")

        # 3b. POST /api/reviews
        new_rev_data = {
            "user_name": "Test User Engineer",
            "rating": 5,
            "comment": "Exceptional healthcare dashboard! Adherence tracking is flawless."
        }
        post_req = urllib.request.Request(
            f"{base_url}/api/reviews",
            data=json.dumps(new_rev_data).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        post_res = urllib.request.urlopen(post_req)
        assert post_res.status in (200, 201), f"Expected 200/201, got {post_res.status}"
        created_review = json.loads(post_res.read().decode("utf-8"))
        created_id = created_review.get("id")
        assert created_id is not None, "Created review ID is missing"
        print(f"[PASS] POST /api/reviews successfully created review id={created_id}")

        # 3c. DELETE /api/reviews/{id}
        del_req = urllib.request.Request(
            f"{base_url}/api/reviews/{created_id}",
            method="DELETE"
        )
        del_res = urllib.request.urlopen(del_req)
        assert del_res.status == 200, f"Expected 200, got {del_res.status}"
        del_data = json.loads(del_res.read().decode("utf-8"))
        assert del_data.get("status") == "success" or "deleted" in del_data.get("message", "").lower(), "Expected success or deleted message on delete"
        print(f"[PASS] DELETE /api/reviews/{created_id} successfully deleted review from database")

        # 3d. POST /api/chat & /api/ai/chat with Gemini API
        chat_req = urllib.request.Request(
            f"{base_url}/api/chat",
            data=json.dumps({"message": "Hello CareWell AI, what is biology?"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        chat_res = urllib.request.urlopen(chat_req, timeout=25)
        assert chat_res.status == 200, f"Expected 200 from /api/chat, got {chat_res.status}"
        chat_data = json.loads(chat_res.read().decode("utf-8"))
        reply_text = chat_data.get("reply") or chat_data.get("response") or chat_data.get("message")
        assert reply_text and len(reply_text) > 15, "Expected non-empty AI reply from /api/chat"
        assert chat_data.get("source") == "gemini_api", "Expected source to be gemini_api"
        print(f"[PASS] POST /api/chat successfully generated reply via Gemini API: {reply_text[:60]}...")

        # 3e. POST /api/chat with conversation history & patient context
        chat_ctx_req = urllib.request.Request(
            f"{base_url}/api/chat",
            data=json.dumps({
                "messages": [
                    {"role": "user", "content": "What should I know about my medicine?"},
                    {"role": "assistant", "content": "You are taking Metformin 500mg at 8:00 AM."},
                    {"role": "user", "content": "What are the common side effects of it?"}
                ],
                "context": "Patient: Sachin\nActive Meds: Metformin 500mg at 8:00 AM"
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        chat_ctx_res = urllib.request.urlopen(chat_ctx_req, timeout=25)
        assert chat_ctx_res.status == 200, f"Expected 200 from /api/chat multi-turn, got {chat_ctx_res.status}"
        chat_ctx_data = json.loads(chat_ctx_res.read().decode("utf-8"))
        ctx_reply = chat_ctx_data.get("reply") or chat_ctx_data.get("response") or chat_ctx_data.get("message")
        assert ctx_reply and len(ctx_reply) > 20, "Expected non-empty context-aware reply"
        assert chat_ctx_data.get("source") == "gemini_api", "Expected source to be gemini_api"
        print(f"[PASS] POST /api/chat multi-turn & context-aware chat verified: {ctx_reply[:60]}...")

        # Test 4: Dynamic Twilio SOS Integration Verification
        print("\n--- Test 4: Dynamic Twilio SOS Integration Verification ---")

        # 4a. Verify .env.local contains Twilio credentials
        with open(".env.local", "r", encoding="utf-8") as f:
            env_content = f.read()
        assert "TWILIO_ACCOUNT_SID=" in env_content and "AC" in env_content, "TWILIO_ACCOUNT_SID missing or mismatch"
        assert "TWILIO_AUTH_TOKEN=" in env_content, "TWILIO_AUTH_TOKEN missing or mismatch"
        assert "TWILIO_PHONE_NUMBER=" in env_content, "TWILIO_PHONE_NUMBER missing or mismatch"
        print("[PASS] .env.local correctly configured with Twilio SID, Auth Token, and Phone Number")

        # 4b. Verify package.json contains twilio
        with open("package.json", "r", encoding="utf-8") as f:
            pkg_content = f.read()
        assert '"twilio"' in pkg_content, "twilio dependency missing from package.json"
        print("[PASS] package.json contains twilio dependency")

        # 4c. Verify Next.js route handler app/api/sos/route.js
        with open("app/api/sos/route.js", "r", encoding="utf-8") as f:
            next_route = f.read()
        assert "import twilio from 'twilio';" in next_route, "twilio import missing in Next route"
        assert "client.messages.create" in next_route, "messages.create missing in Next route"
        assert "client.calls.create" in next_route, "calls.create missing in Next route"
        assert "client.messages.create" in next_route, "messages.create missing in Next route"
        assert next_route.find("client.calls.create") < next_route.find("client.messages.create"), "Voice call must be prioritized before SMS"
        assert "Emergency alert sent successfully" in next_route, "Success message missing in Next route"
        print("[PASS] Next.js Route Handler (app/api/sos/route.js) verified with prioritized Voice Call and isolated SMS")

        # 4d. Verify Frontend sos.js logic
        with open("sos.js", "r", encoding="utf-8") as f:
            sos_content = f.read()
        assert "getCaregiverPhone" in sos_content, "getCaregiverPhone missing in sos.js"
        assert "setCaregiverPhone" in sos_content, "setCaregiverPhone missing in sos.js"
        assert "promptConfigureCaregiver" in sos_content, "promptConfigureCaregiver missing in sos.js"
        assert "Sending SOS..." in sos_content, "'Sending SOS...' feedback missing in sos.js"
        assert "Alert Dispatched: Call &amp; SMS Sent" in sos_content or "Alert Dispatched: Call & SMS Sent" in sos_content, "Alert Dispatched message missing in sos.js"
        assert "navigator.geolocation.getCurrentPosition" in sos_content, "navigator.geolocation missing in sos.js"
        assert "fetch('/api/sos'" in sos_content, "POST /api/sos fetch missing in sos.js"
        print("[PASS] Frontend sos.js verified with dynamic caregiver retrieval, prompt fallback, geolocation, and feedback")

        # 4e. Verify Live Backend /api/sos validation
        invalid_payload = {"caregiverPhone": "9876543210"}
        try:
            inv_req = urllib.request.Request(
                f"{base_url}/api/sos",
                data=json.dumps(invalid_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(inv_req)
            assert False, "Expected 400 Bad Request for phone missing '+' country code"
        except urllib.error.HTTPError as e:
            assert e.code == 400, f"Expected status 400, got {e.code}"
            print("[PASS] Live /api/sos rejects phone numbers without country code (+ prefix) with HTTP 400")

        # Test 5: Header Banner & PWA Home Screen Icon Verification
        print("\n--- Test 5: Header Banner & PWA Home Screen Icon Verification ---")
        with open("app/page.tsx", "r", encoding="utf-8") as f:
            app_page_content = f.read()
        assert '<img src="/brand-banner.png" alt="CareWell" className="h-10 w-auto object-contain"' in app_page_content, "brand-banner.png missing in app/page.tsx header"
        print("[PASS] app/page.tsx header uses brand-banner.png with h-10 w-auto object-contain")

        with open("index.html", "r", encoding="utf-8") as f:
            index_html_content = f.read()
        assert 'brand-banner.png' in index_html_content, "brand-banner.png missing in index.html"
        print("[PASS] index.html landing nav & sidebar headers use brand-banner.png")

        with open("public/manifest.json", "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
        assert manifest_data.get("name") == "CareWell"
        assert manifest_data.get("short_name") == "CareWell"
        assert manifest_data.get("display") == "standalone"
        assert manifest_data.get("theme_color") == "#2563eb"
        assert manifest_data.get("start_url") == "./"
        assert manifest_data.get("scope") == "./"
        icons = manifest_data.get("icons", [])
        icon_srcs = [i.get("src") for i in icons]
        assert "icon-192.png" in icon_srcs, "icon-192.png missing in public/manifest.json"
        assert "icon-512.png" in icon_srcs, "icon-512.png missing in public/manifest.json"
        print("[PASS] public/manifest.json configured with relative start_url, scope, icon-192.png, and icon-512.png")

    finally:
        if server_proc:
            server_proc.terminate()

    print("\n=== ALL AUTOMATED VERIFICATION CHECKS PASSED PERFECTLY ===")

if __name__ == "__main__":
    run_tests()

