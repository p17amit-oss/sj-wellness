# End-to-end check in a phone-sized browser against tools/dev-server.mjs (DEV_DATA=memory).
# python3 tools/test-e2e.py http://localhost:8080 out_dir
import sys, re, json, pathlib, urllib.request
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
errors = []
def shot(pg, name, full=False): pg.screenshot(path=str(out / name), full_page=full)
def check(cond, msg):
    if not cond: raise SystemExit('FAIL: ' + msg)
    print('✓ ' + msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.route("https://wa.me/**", lambda r: r.fulfill(status=200, body="whatsapp"))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" and 'favicon' not in m.text else None)

    # 1. parent fills the onboarding form
    pg.goto(base + "/join/"); pg.wait_for_timeout(500)
    pg.click("text=Start the form")
    pg.fill("#ob_childName", "Aditya Verma"); pg.fill("#ob_dob", "2018-05-10"); pg.click("label[for=ob_gender_0]")
    pg.click("text=Continue")
    pg.click("label[for=ob_conditions_0]"); pg.fill("#ob_conditionsDetail", "Rescue medicine is in his bag."); pg.click("text=Continue")
    pg.click("label[for=ob_water_1]"); pg.click("text=Continue")
    pg.click("label[for=ob_goals_0]"); pg.click("text=Continue")
    pg.fill("#ob_p1Name", "Sunita Verma"); pg.click("label[for=ob_p1Relation_0]"); pg.fill("#ob_p1Mobile", "98765 43210"); pg.click("text=Continue")
    pg.click("label[for=ob_consent]"); pg.click("text=Submit form")
    pg.wait_for_selector("text=Thank you, Sunita", timeout=8000)
    check(True, "onboarding form submits to the backend")
    shot(pg, "01_join_thanks.png")
    mail = json.loads(urllib.request.urlopen(base + "/__mail").read())
    check(any("Aditya Verma" in m["subject"] for m in mail), "coach is emailed about the new form")

    # 2. coach app shows the new child
    pg.goto(base + "/coach/"); pg.wait_for_selector(".kid", timeout=8000)
    shot(pg, "02_coach.png")
    check(pg.locator(".group.st-new .kid:has-text('Aditya Verma')").count() == 1, "new child appears under Just joined")
    check(pg.locator(".kid:has-text('Aditya Verma') .new-dot").inner_text() == "New form", "marked as a new form")
    check("tel:+919876543210" in pg.locator(".kid:has-text('Aditya Verma') .kid-foot a.icon-btn").first.get_attribute("href"), "call button dials the parent")
    pg.click(".kid:has-text('Aditya Verma') .kid-open"); pg.wait_for_timeout(400)
    shot(pg, "03_detail.png")
    check(pg.locator(".section.warm:has-text('Seizures or epilepsy')").count() == 1, "safety details shown before the session")
    pg.click("text=First session done? Mark as started"); pg.wait_for_timeout(600)
    check(pg.locator(".hero .tag.st-swim").count() == 1, "Mark as started moves the child to Swimming")

    # 3. coach asks for feedback; the link belongs to this child
    pg.click("text=Course over? Ask for feedback"); pg.wait_for_selector(".sheet .msg", timeout=8000)
    msg = pg.inner_text(".sheet .msg")
    m = re.search(r"/f/\?c=([a-f0-9]{32})", msg); check(m is not None, "feedback message contains a personal link")
    token = m.group(1)
    wa = pg.locator(".sheet a.btn-wa").get_attribute("href")
    check(wa.startswith("https://wa.me/919876543210?text="), "Send on WhatsApp opens a chat with this parent, message filled in")
    shot(pg, "04_ask_sheet.png")
    with ctx.expect_page() as newp: pg.click(".sheet a.btn-wa")
    newp.value.close(); pg.wait_for_timeout(800)
    pg.click("text=Back"); pg.wait_for_timeout(300)
    check(pg.locator(".group.st-asked .kid:has-text('Aditya Verma')").count() == 1, "child moves to Feedback asked")

    # 4. parent opens the personal link
    pp = ctx.new_page(); pp.on("pageerror", lambda e: errors.append(str(e)))
    pp.goto(base + "/f/?c=" + token); pp.wait_for_selector("text=Your feedback on Aditya", timeout=8000)
    check(True, "feedback page greets the right child")
    shot(pp, "05_feedback_welcome.png")
    pp.click("text=Start"); pp.click("label[for=fb_rating_0]"); pp.click("label[for=fb_changes_0]")
    pp.fill("#fb_story", "Aditya is calmer after swimming.")
    pp.click("text=Continue")
    pp.click("label[for=fb_continueOn_0]"); pp.click("label[for=fb_shareWords_1]"); pp.click("label[for=fb_referenceOk_0]")
    pp.fill("#fb_ref_name_0", "Meena Joshi"); pp.fill("#fb_ref_mob_0", "9000055555"); pp.click("label[for=fb_refsAgreed]")
    pp.click("text=Send feedback"); pp.wait_for_selector("text=Thank you, Sunita", timeout=8000)
    check(pp.locator("a:has-text('Write a Google review')").count() == 1, "thank-you screen offers the Google review link")
    shot(pp, "06_feedback_thanks.png")
    pp.goto(base + "/f/" + token); pp.wait_for_selector("text=already have your feedback", timeout=8000)
    check(True, "opening the link again says thank you instead of a new form")
    pp.goto(base + "/f/" + "a" * 32); pp.wait_for_selector("text=not valid", timeout=8000)
    check(True, "a made-up link is refused")

    # 5. coach sees the feedback on the same child
    pg.click("text=Refresh"); pg.wait_for_timeout(1200)
    check(pg.locator(".group.st-done .kid:has-text('Aditya Verma')").count() == 1, "child moves to Feedback received")
    shot(pg, "07_coach_after.png")
    pg.click(".nav-b:has-text('Follow-ups')"); pg.wait_for_timeout(300)
    check(pg.locator(".list .row:has-text('Sunita Verma')").count() == 1, "Follow-ups: parent who wants to continue")
    pg.click(".row:has-text('Sunita Verma') >> text=Mark done"); pg.wait_for_timeout(300)
    check(pg.locator(".list .row:has-text('Sunita Verma')").count() == 0, "Mark done moves the parent to Done")
    pg.click(".toast button:has-text('Undo')"); pg.wait_for_timeout(300)
    check(pg.locator(".list .row:has-text('Sunita Verma')").count() == 1, "Undo brings the parent back")
    pg.click(".seg button:has-text('Referrals')"); check(pg.locator(".row:has-text('Meena Joshi')").count() == 1, "Follow-ups: referral received")
    pg.click(".row:has-text('Meena Joshi') >> text=Mark contacted"); pg.wait_for_timeout(300)
    pg.click(".done-list summary"); check(pg.locator(".done-row:has-text('Meena Joshi')").count() == 1, "Mark contacted moves the referral to Contacted")
    pg.click(".seg button:has-text('Share number')"); check(pg.locator(".row:has-text('Sunita Verma')").count() == 1, "Follow-ups: can share number")
    share = pg.locator(".row:has-text('Sunita Verma') a.icon-btn.wa").get_attribute("href")
    check("98765" in share and share.startswith("https://wa.me/?text="), "Share sends the parent's number in a WhatsApp message")
    shot(pg, "08_followups.png")
    pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_selector(".kid", timeout=8000)
    pg.click(".nav-b:has-text('Follow-ups')"); pg.click(".seg button:has-text('Referrals')")
    check(pg.locator(".list .row:has-text('Meena Joshi')").count() == 0, "contacted status is saved on the server")
    b.close()

check(not errors, "no script errors" + ("" if not errors else ": " + "; ".join(errors)))
