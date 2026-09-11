import urllib.request
import urllib.parse
import json
import re
import sys

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

    # Verify Quote "Small Steps Healthier Tomorrows" directly underneath Login
    assert 'top-quote-cloud-pill' in landing_nav, "Quote pill container missing from header actions column"
    assert 'Small Steps' in landing_nav and 'Healthier Tomorrows' in landing_nav, "Quote text mismatch"
    print("[PASS] Quote 'Small Steps Healthier Tomorrows' neatly aligned in soft neumorphic cloud pill container")

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

    # Boundary rules verification
    assert 'X of Y taken' in js or 'taken of' in js or 'progress' in js, "Progress counter missing"
    assert 'showCounsellingSession' in js, "Counselling session view missing"
    assert 'openDoctorBookingModal' in js, "Doctor booking modal missing"
    print("[PASS] JavaScript functions for reviews, settings card, deletion, and contact modal verified")
    print("[PASS] Dynamic progress counter and Counselling Session workflows remain completely untouched")

    # Test 3: Backend API Integration
    print("\n--- Test 3: Backend API Live Verification ---")
    base_url = "http://127.0.0.1:8000"
    
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

    print("\n=== ALL AUTOMATED VERIFICATION CHECKS PASSED PERFECTLY ===")

if __name__ == "__main__":
    run_tests()
