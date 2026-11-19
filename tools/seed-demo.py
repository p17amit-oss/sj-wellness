# Fills the app with made-up test families that cover every coach scenario.
# Safe to run more than once: families that already exist are not added again.
#   python3 tools/seed-demo.py <API_URL>          e.g. http://localhost:8080/api  or the Apps Script /exec URL
# Families are marked "TEST FAMILY" in the coach's notes. Delete their rows in the Sheet before real use.
import json, subprocess, sys
from datetime import date, timedelta

API = sys.argv[1]
def call(body, ok_codes=()):
    out = subprocess.run(["curl", "-sS", "-m", "90", "-L", "-H", "Content-Type: text/plain", "--data-binary", json.dumps(body), API],
                         capture_output=True, text=True).stdout
    r = json.loads(out)
    if not r.get("ok"):
        err = r.get("error"); code = err.get("code") if isinstance(err, dict) else err
        if code in ok_codes: return None
        raise SystemExit(f"{body['action']} failed: {r}")
    return r["data"]
def ago(days): return (date.today() - timedelta(days=days)).isoformat()

BASE = {"consent": True, "waSame": True}
FAMILIES = [
 # ---------- Just joined ----------
 dict(state="new", unread=True, kid=dict(childName="Kabir Nair", nickname="Kabbu", dob="2019-03-14", gender="Boy", school="Little Steps School", grade="1",
      conditions=["Ear infections or ear tubes"], conditionsDetail="Has ear tubes. His doctor says ear plugs are a must.",
      medicines="No", diagnosis=["Autism (ASD)", "Sensory processing"], toilet="Needs reminders", water="Nervous or scared",
      communication="Uses a few words", upsets=["Loud noises or whistles", "Splashing", "Water on the face", "Sudden touch"],
      calms="Firm pressure on his shoulders and counting slowly to ten.", loves="Trains, the Wheels on the Bus song, anything blue.",
      goals=["Safety in water", "Confidence", "Calmness"], goalsNote="We would love him to stop being scared of bath time too.",
      therapy=["Occupational therapy", "Speech therapy"], therapistName="Meera Iyer", therapistContact="Sunrise Child Centre, Vashi", therapistOk="Yes",
      heardFrom="Therapist", referrerName="Meera Iyer", p1Name="Priya Nair", p1Relation="Mother", p1Mobile="98200 00001",
      email="priya.nair@example.com", p1Occupation="Architect", address="Sector 17, Vashi", showP2=True, p2Name="Rohan Nair",
      p2Relation="Father", p2Mobile="98200 00002", signature="Priya Nair")),
 dict(state="new", unread=True, kid=dict(childName="Saanvi Reddy", dob="2021-06-02", gender="Girl", school="Tiny Tots Playschool", grade="Nursery",
      conditions=["Skin condition or allergy"], conditionsDetail="Eczema on her arms. Please let her shower right after the pool.",
      medicines="No", diagnosis=["Developmental delay"], toilet="Uses diapers", water="Has never been in a pool",
      communication="Uses gestures or signs", upsets=["Cold water", "Crowded spaces"], calms="Her favourite song, Twinkle Twinkle.",
      loves="Rubber ducks and peekaboo.", goals=["Safety in water", "Fun and play"], therapy=["Physiotherapy"],
      heardFrom="Google", p1Name="Divya Reddy", p1Relation="Mother", p1Mobile="98200 00021", p1Occupation="Doctor", signature="Divya Reddy")),
 dict(state="new", kid=dict(childName="Zoya Malik", dob="2017-04-11", gender="Girl", school="DAV Public School", grade="3",
      conditions=["None of these"], medicines="No", diagnosis=["Speech delay", "Intellectual disability"], toilet="Needs reminders",
      water="Has never been in a pool", communication="Uses pictures or a device", upsets=["Splashing", "Other"], upsetsOther="Too many instructions at once",
      calms="Picture cards and a thumbs-up.", loves="Drawing, cats and the colour purple.", goals=["Safety in water", "Fun and play"],
      therapy=["Speech therapy", "Special educator"], heardFrom="Instagram or Facebook", p1Name="Farhan Malik", p1Relation="Father",
      p1Mobile="98200 00008", p1Occupation="Business", signature="Farhan Malik")),
 # ---------- Swimming (first session recorded) ----------
 dict(state="swim", started=ago(95), kid=dict(childName="Ishaan Gupta", dob="2017-08-23", gender="Boy", school="St. Mary's School", grade="3",
      conditions=["Asthma or breathing difficulty"], conditionsDetail="Mild asthma. His inhaler is in the side pocket of his bag.",
      medicines="Yes", medicinesDetail="Inhaler when needed; ADHD medicine in the morning", diagnosis=["ADHD"], toilet="Independent",
      water="Can float or swim a little", communication="Talks in full sentences", upsets=["Waiting for a turn"],
      calms="Short clear tasks, one at a time.", loves="Superheroes and diving for rings.", goals=["Learning strokes", "Following instructions"],
      therapy=["No therapy now"], heardFrom="Another parent", referrerName="Suresh Rao", p1Name="Pooja Gupta", p1Relation="Mother",
      p1Mobile="98200 00022", p1Occupation="Banker", signature="Pooja Gupta")),
 dict(state="swim", started=ago(70), kid=dict(childName="Myra Joshi", dob="2020-02-10", gender="Girl", school="Ankur Special School", grade="KG",
      conditions=["Low muscle tone", "Ear infections or ear tubes"], conditionsDetail="Ear plugs and a swim cap, always.",
      medicines="No", diagnosis=["Down syndrome"], toilet="Needs help", water="Enjoys it with support", communication="Uses a few words",
      upsets=["Cold water"], calms="A cuddle and a towel around her shoulders.", loves="Dancing, clapping games and her elder brother.",
      goals=["Strength and fitness", "Social skills", "Fun and play"], therapy=["Physiotherapy", "Speech therapy"], therapistOk="Not now",
      heardFrom="Doctor", p1Name="Anjali Joshi", p1Relation="Mother", p1Mobile="98200 00023", p1Occupation="Homemaker", signature="Anjali Joshi")),
 dict(state="swim", started=ago(130), kid=dict(childName="Dev Patil", dob="2015-11-30", gender="Boy", school="Navi Mumbai Public School", grade="5",
      conditions=["Seizures or epilepsy", "Low muscle tone"], conditionsDetail="Last seizure two years ago. Rescue medicine is with his father.",
      medicines="Yes", medicinesDetail="Seizure medicine twice a day", diagnosis=["Cerebral palsy"], toilet="Needs help",
      water="Enjoys it with support", communication="Talks in full sentences", upsets=["Sudden touch", "Crowded spaces"],
      calms="Tell him before you touch or move him.", loves="Cricket commentary and jokes.", goals=["Strength and fitness", "Confidence"],
      therapy=["Physiotherapy"], therapistName="Anil Joshi", therapistContact="98200 00009", therapistOk="Yes",
      heardFrom="Therapist", referrerName="Anil Joshi", p1Name="Mahesh Patil", p1Relation="Father", p1Mobile="98200 00024",
      p1Occupation="Shop owner", signature="Mahesh Patil")),
 # ---------- Feedback asked, waiting ----------
 dict(state="asked", kid=dict(childName="Vihaan Rao", dob="2014-09-05", gender="Boy", school="Navi Mumbai Public School", grade="6",
      conditions=["None of these"], medicines="Yes", medicinesDetail="Prescribed attention medicine every morning", diagnosis=["ADHD"],
      toilet="Independent", water="Can float or swim a little", communication="Talks in full sentences", upsets=["Waiting for a turn", "Change in routine"],
      calms="A clear countdown. Give him a job to do.", loves="Races, stopwatches and cricket.", goals=["Learning strokes", "Following instructions", "Calmness"],
      therapy=["Special educator"], heardFrom="School", referrerName="School counsellor", p1Name="Suresh Rao", p1Relation="Father",
      p1Mobile="98200 00005", p1Occupation="Engineer", signature="Suresh Rao")),
 dict(state="asked", remind=True, kid=dict(childName="Reyansh Iyer", dob="2018-12-12", gender="Boy", school="Anand Special School", grade="1",
      conditions=["None of these"], medicines="No", diagnosis=["Autism (ASD)"], toilet="Needs help", water="Nervous or scared",
      communication="Mostly without words", upsets=["Water on the face", "Loud noises or whistles", "Change in routine"],
      calms="A visual timer and the same routine every time.", loves="Spinning toys and the letter R.", goals=["Calmness", "Safety in water"],
      therapy=["Behaviour therapy (ABA)", "Occupational therapy"], heardFrom="Another parent", referrerName="Rakesh Mehta",
      p1Name="Lakshmi Iyer", p1Relation="Mother", p1Mobile="98200 00025", p1Occupation="Software engineer", signature="Lakshmi Iyer")),
 # ---------- Feedback received ----------
 dict(state="done", kid=dict(childName="Anaya Kulkarni", dob="2016-07-02", gender="Girl", school="Sunshine Special School", grade="4",
      conditions=["Heart condition", "Ear infections or ear tubes", "Low muscle tone"],
      conditionsDetail="Had heart surgery as a baby. Her cardiologist has cleared her for swimming. Gets ear infections easily.",
      medicines="No", diagnosis=["Down syndrome"], toilet="Independent", water="Nervous or scared", communication="Uses a few words",
      upsets=["Cold water", "Waiting for a turn"], calms="Holding her hand and singing to her.", loves="Music, high-fives and her pink goggles.",
      goals=["Safety in water", "Strength and fitness", "Social skills"], therapy=["Physiotherapy"], therapistName="Anil Joshi",
      therapistContact="98200 00009", therapistOk="Yes", heardFrom="Doctor", referrerName="Dr. Desai", p1Name="Neha Kulkarni",
      p1Relation="Mother", p1Mobile="98200 00003", waSame=False, whatsapp="98200 00004", p1Occupation="Teacher", address="Kharghar", signature="Neha Kulkarni"),
      fb=dict(rating="Very happy", changes=["More confident", "Stronger body", "Sleeps better", "More social"],
      nowCan="Walks into the pool on her own and kicks across half the pool with a float.",
      story="She was terrified of water when we started. Coach Sonal never rushed her. Now she sleeps through the night on swim days.",
      better="Weekend batches would help working parents like us.", continueOn="Yes, please contact me", shareWords="Yes, with my first name",
      referenceOk="Yes, share my number", refs=[{"name": "Sneha Patil", "mobile": "90000 11111"}, {"name": "Farah Shaikh", "mobile": "90000 22222"}], refsAgreed=True)),
 dict(state="done", calledBack=True, contacted=["Kavita Menon"], kid=dict(childName="Ira Shah", dob="2018-01-20", gender="Girl", school="Ryan Global School", grade="2",
      conditions=["Seizures or epilepsy", "Low muscle tone"],
      conditionsDetail="Last seizure in March 2024. Her mother brings rescue medicine to every class. Uses a walker and needs help on the pool steps.",
      medicines="Yes", medicinesDetail="Seizure medicine morning and night", diagnosis=["Cerebral palsy"], toilet="Needs help",
      water="Enjoys it with support", communication="Uses a few words", upsets=["Crowded spaces"], calms="Bubbles and soft singing.",
      loves="Bollywood songs and blowing bubbles.", goals=["Strength and fitness", "Confidence", "Fun and play"],
      therapy=["Physiotherapy", "Speech therapy"], therapistName="Ritu Menon", therapistContact="Ability Care Centre, Nerul", therapistOk="Yes",
      heardFrom="Therapist", referrerName="Ritu Menon", p1Name="Kavya Shah", p1Relation="Mother", p1Mobile="98200 00006",
      p1Occupation="Homemaker", showP2=True, p2Name="Nikhil Shah", p2Relation="Father", p2Mobile="98200 00007", signature="Kavya Shah"),
      fb=dict(rating="Very happy", changes=["Stronger body", "More confident", "More words or speech"],
      nowCan="Stands in the shallow end holding the rail and counts her kicks out loud.",
      story="She says more words since starting. The pool is the one place where her body feels light.",
      continueOn="Yes, please contact me", shareWords="Yes, with my first name", referenceOk="Yes, share my number",
      refs=[{"name": "Kavita Menon", "mobile": "90000 33333"}], refsAgreed=True)),
 dict(state="done", kid=dict(childName="Arjun Mehta", dob="2017-02-18", gender="Boy", school="Orchid International", grade="3",
      conditions=["None of these"], medicines="No", diagnosis=["Autism (ASD)"], toilet="Independent", water="Nervous or scared",
      communication="Uses a few words", upsets=["Splashing", "Loud noises or whistles", "Water on the face"],
      calms="Deep pressure hugs and a quiet corner.", loves="Numbers, clocks and lift buttons.", goals=["Safety in water", "Calmness", "Confidence"],
      therapy=["Occupational therapy"], heardFrom="Therapist", referrerName="Meera Iyer", p1Name="Rakesh Mehta", p1Relation="Father",
      p1Mobile="98200 00010", p1Occupation="Accountant", signature="Rakesh Mehta"),
      fb=dict(rating="Happy", changes=["Calmer", "More confident", "Sleeps better"], nowCan="Gets into the pool on his own and floats with a noodle.",
      story="He used to scream when water touched his face. Now he asks for the pool every Saturday.", continueOn="Maybe later",
      shareWords="Yes, without my name", referenceOk="Yes, share my number", refs=[])),
 dict(state="done", kid=dict(childName="Kiaan Bose", dob="2013-10-08", gender="Boy", school="Podar International", grade="7",
      conditions=["None of these"], medicines="No", diagnosis=["Autism (ASD)", "ADHD"], toilet="Independent", water="Swims independently",
      communication="Talks in full sentences", upsets=["Loud noises or whistles", "Change in routine"],
      calms="Tell him the plan for the class at the start.", loves="Maps, metro lines and freestyle laps.", goals=["Learning strokes", "Social skills"],
      therapy=["Behaviour therapy (ABA)"], heardFrom="Another parent", referrerName="Neha Kulkarni", p1Name="Moumita Bose", p1Relation="Mother",
      p1Mobile="98200 00026", p1Occupation="Professor", signature="Moumita Bose"),
      fb=dict(rating="Very happy", changes=["Better focus", "More social", "Follows instructions"], nowCan="Swims two full laps of freestyle without stopping.",
      story="He made his first friend at the pool. He now waits for his turn without a meltdown.", continueOn="Yes, please contact me",
      shareWords="Yes, with my first name", referenceOk="Yes, share my number", refs=[{"name": "Ritika Sen", "mobile": "90000 44444"}], refsAgreed=True)),
 dict(state="done", kid=dict(childName="Tara D'Souza", dob="2018-04-27", gender="Girl", school="Carmel Convent", grade="2",
      conditions=["None of these"], medicines="No", diagnosis=["Speech delay"], toilet="Independent", water="Enjoys it with support",
      communication="Uses a few words", upsets=["Waiting for a turn"], calms="Let her watch first, then try.", loves="Mermaids and singing.",
      goals=["Confidence", "Fun and play"], therapy=["Speech therapy"], heardFrom="Instagram or Facebook", p1Name="Gloria D'Souza", p1Relation="Mother",
      p1Mobile="98200 00027", p1Occupation="Nurse", signature="Gloria D'Souza"),
      fb=dict(rating="It was okay", changes=["More confident", "Too early to tell"], nowCan="Puts her face in the water for a few seconds.",
      better="Sessions sometimes started 15 minutes late, and the timing clashes with her speech therapy.", continueOn="Maybe later",
      shareWords="No, keep it private", referenceOk="Yes, share my number", refs=[])),
 dict(state="done", kid=dict(childName="Aarav Singh", dob="2016-03-15", gender="Boy", school="Bal Bharati", grade="4",
      conditions=["Skin condition or allergy"], conditionsDetail="Chlorine makes his skin itch. We apply cream before class.",
      medicines="No", diagnosis=["Sensory processing"], toilet="Independent", water="Nervous or scared", communication="Talks in full sentences",
      upsets=["Splashing", "Crowded spaces", "Sudden touch"], calms="A quiet corner and a tight towel wrap.", loves="Lego and dinosaurs.",
      goals=["Calmness", "Confidence"], therapy=["Occupational therapy"], heardFrom="Google", p1Name="Harpreet Singh", p1Relation="Father",
      p1Mobile="98200 00028", p1Occupation="Pilot", signature="Harpreet Singh"),
      fb=dict(rating="Not happy", changes=["Too early to tell"],
      better="The pool was too crowded on most days and Aarav got overwhelmed. Two sessions were cancelled at the last minute.",
      continueOn="No, not for now", referenceOk="No, thank you", refs=[])),
]

data = call({"action": "getAll"})
have = {c["childName"]: c["id"] for c in data["children"]}
can_start = True
for fam in FAMILIES:
    k = fam["kid"]; name = k["childName"]
    if name not in have:
        d = dict(BASE); d.update(k)
        call({"action": "submitOnboarding", "data": d})
        ids = {c["childName"]: c["id"] for c in call({"action": "getAll"})["children"]}
        cid = ids[name]; have[name] = cid
        call({"action": "saveNote", "childId": cid, "note": "TEST FAMILY – delete before real use."})
        if fam["state"] in ("asked", "done"):
            link = call({"action": "prepareFeedbackLink", "childId": cid})
            call({"action": "markLinkSent", "token": link["token"]})
            if fam.get("remind"): call({"action": "markLinkSent", "token": link["token"]})
            if fam.get("fb"): call({"action": "submitFeedback", "token": link["token"], "data": fam["fb"]})
        print("added", name, "→", fam["state"])
    else:
        print("already there", name)
    cid = have[name]
    if fam.get("started") and can_start:
        if call({"action": "setStarted", "childId": cid, "date": fam["started"]}, ok_codes=("BAD_REQUEST",)) is None:
            can_start = False; print("  ! server has no setStarted yet – update the Apps Script, then run this again")
    if not fam.get("unread"): call({"action": "markSeen", "childId": cid})

data = call({"action": "getAll"})
byname = {c["childName"]: c["id"] for c in data["children"]}
for fam in FAMILIES:
    cid = byname.get(fam["kid"]["childName"])
    if fam.get("calledBack"):
        for f in data["feedback"]:
            if f["childId"] == cid and f.get("calledBack") is not True: call({"action": "setCalledBack", "feedbackId": f["id"], "value": True})
    for rn in fam.get("contacted", []):
        for r in data["referrals"]:
            if r["childId"] == cid and r["name"] == rn and r.get("contacted") is not True: call({"action": "setContacted", "referralId": r["id"], "value": True})
d = call({"action": "getAll"})
print(len(d["children"]), "children,", len(d["feedback"]), "feedback,", len(d["links"]), "links,", len(d["referrals"]), "referrals")
