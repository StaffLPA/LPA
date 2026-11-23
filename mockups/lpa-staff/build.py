"""Builds index.html for the Meet the Staff redesign mockup.

Staff records are copied verbatim from legendaryprepacademy.com/staff.
Run: python3 build.py
"""
import html
from pathlib import Path

E = html.escape

GROUPS = [
    ("Coaching staff", "coaching", [
        ("Mark Karaviotis", "Head Coach", "staff-mark-karaviotis", "staff-mark-karaviotis-action", "50% 18%", [
            "Former Division 1 baseball player at Oregon", "2016 Hillsboro Hops batting champion",
            "3x MiLB All Star", "7 years of professional baseball experience"]),
        ("Joe Dunigan", "Hitting Coordinator & Astros Scout", "staff-joe-dunigan", "staff-joe-dunigan-action", "50% 16%", [
            "Former Division 1 baseball player at Oklahoma", "10 years of professional baseball experience",
            "Current Area Scout for the Houston Astros"]),
        ("Terrell Hudson", "Assistant Coach", "staff-terrell-hudson", "staff-terrell-hudson-action", "50% 30%", [
            "Former Division 1 baseball player at the University of New Mexico",
            "Extensive experience in training and managing elite youth baseball"]),
        ("Josh Garcia", "Director of Strength & Conditioning", "staff-josh-garcia", None, "50% 18%", [
            "Certified Strength and Conditioning Specialist (CSCS)", "Performance Enhancement Specialist (PES)",
            "EXOS Performance Specialist (XPS)", "Precision Nutrition Level 1 Coach (Pn1)",
            "16 years experience as a performance coach"]),
        ("Taylor Hubbell", "Middle School Head Coach", "staff-taylor-hubbell", "staff-taylor-hubbell-action", "50% 20%", [
            "Former Division 1 baseball player at the University of Louisiana",
            "NJCAA World Series and All Star performer",
            "Vast experience managing elite youth baseball players and programs"]),
        ("Steve Karsay", "Pitching Development Coordinator", "staff-steve-karsay", "staff-steve-karsay-action", "50% 16%", [
            "1990 1st Round Pick (22) Toronto Blue Jays",
            "16 years professional playing career (Oakland A's, Cleveland Indians, Atlanta Braves, NY Yankees, Texas Rangers)",
            "13 years professional coaching experience (Cleveland 2012-2018 Minors, MLB Bullpen Coach Milwaukee 2019-2021, Los Angeles Angels MLB bullpen coach 2024-2025)"]),
        ("Isaiah Garcia-Castaneda", "Strength & Conditioning Coach", "staff-isaiah-garcia-castaneda", None, "50% 14%", [
            "Former Big Ten Wide Receiver",
            "Played Division 1 college football for New Mexico State University, and also the University of Nebraska",
            "Division 1 college weight room experience"]),
        ("Jake Hanen", "Assistant Coach", "staff-jake-hanen", None, "50% 14%", [
            "Former college player (Scottsdale Community College)", "Drafted by the Arizona Diamondbacks",
            "10+ years coaching elite amateur baseball"]),
    ]),
    ("Front office", "executive", [
        ("Will Armijo", "CEO & Co-Founder", "staff-will-armijo", None, "50% 16%", [
            "Former Division 2 baseball player", "Holds an MBA", "15 years of entrepreneur experience",
            "Founder of 6 companies"]),
        ("RJ Etchebarren", "COO", "staff-rj-etchebarren", None, "50% 16%", [
            "Former GCU baseball player, 39th-round Diamondbacks draft pick",
            "Holds MBA and BS in Sports Management", "Directed student-athlete success initiatives at GCU",
            "14+ years corporate and operational leadership experience"]),
    ]),
    ("Administration", "administration", [
        ("Martin Jacquez", "Administration", "staff-martin-jacquez", None, "50% 16%", [
            "17+ year U.S. Coast Guard veteran", "Operational leadership in counter-drug and rescue missions",
            "Barrett Honors College student, Arizona State University",
            "Double major in Political Science and Public Policy", "Minor in Sports Business"]),
        ("Billy Armijo", "Facilities & Transportation Manager", "staff-billy-armijo", None, "50% 16%", [
            "22 years Gallup Fire Department", "10 years Scottsdale Fire Department", "Former TRT, Hazmat, airport Team",
            "Former paramedic & EMT", "Former Police Reserve (New Mexico)", "CDL certified"]),
        ("Brandon Bouchard", "Social Media and Marketing Coordinator", "staff-brandon-bouchard", None, "50% 18%", [
            "10 Years of Graphic Design Experience"]),
        ("Jay Mar Lagmay", "Operations Support Specialist", "staff-jay-mar-lagmay", None, "50% 16%", [
            "3 years of Workforce Management Experience", "3 years of Business Virtual Assistant Experience"]),
    ]),
    ("Operating partners", "partners", [
        ("Chef Miguel Rueda IV", "Culinary Partner", "staff-chef-miguel-rueda", None, "50% 30%", [
            "Saucier of a Michelin Recommended Restaurant", "7+ years Executive Chef experience"]),
        ("Andy Leonard", "Financial Consultant", None, None, None, []),
    ]),
]

SITE = "https://legendaryprepacademy.com"
TOUR = SITE + "/appointments"


def slug(name):
    return "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")


def detail(p, n):
    name, title, img, then, pos, creds = p
    out = [f'<div class="detail" id="d-{slug(name)}">']
    out.append('<div class="detail__photos"><div class="detail__print">')
    out.append(f'<img class="detail__portrait" src="img/{img}.jpg" alt="Studio portrait of {E(name)} in an LPA polo" '
               f'style="object-position:{pos}" loading="{"eager" if n == 1 else "lazy"}" width="900" height="1125"></div>')
    if then:
        out.append(f'<figure class="detail__then"><img src="img/{then}.jpg" alt="{E(name)} during his playing career" loading="lazy">'
                   '<figcaption>Playing days</figcaption></figure>')
    out.append('</div>')
    out.append(f'<h3 class="detail__name">{E(name)}</h3>')
    out.append(f'<p class="detail__title">{E(title)}</p>')
    out.append('<ul class="detail__creds">' + "".join(f"<li>{E(c)}</li>" for c in creds) + '</ul>')
    out.append('</div>')
    return "".join(out)


rows = []
n = 0
for label, key, people in GROUPS:
    rows.append(f'<li class="band"><h2>{E(label)}</h2><span class="band__count">{len(people)}<span class="band__unit"> on the card</span></span></li>')
    for p in people:
        n += 1
        name, title, img, then, pos, creds = p
        thumb = (f'<img class="row__then" src="img/{then}.jpg" alt="" loading="lazy">' if then
                 else '<span class="row__then row__then--none" aria-hidden="true"></span>')
        lead = E(creds[0]) if creds else ""
        if img:
            rows.append(
                f'<li class="entry" data-group="{key}">'
                f'<button class="row" type="button" aria-pressed="{"true" if n == 1 else "false"}" aria-controls="frame" data-target="d-{slug(name)}">'
                f'<span class="row__no"><svg class="ring" viewBox="0 0 60 44" aria-hidden="true"><path d="M31 4C14 3 4 11 5 23s14 18 28 17 24-9 22-20C53 9 41 3 27 5"/></svg>{n:02d}</span>'
                f'<span class="row__name">{E(name)}</span>'
                f'<span class="row__pos">{E(title)}</span>'
                f'<span class="row__lead">{lead}</span>'
                f'{thumb}'
                f'</button>{detail(p, n)}</li>')
        else:
            rows.append(
                f'<li class="entry entry--plain" data-group="{key}"><div class="row row--plain">'
                f'<span class="row__no">{n:02d}</span><span class="row__name">{E(name)}</span>'
                f'<span class="row__pos">{E(title)}</span><span class="row__lead"></span>'
                f'<span class="row__then row__then--none" aria-hidden="true"></span></div></li>')

TOTAL = n

page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Meet the Staff</title>
<meta name="description" content="The coaches, administrators and front office of Legendary Prep Academy, Scottsdale's baseball prep academy, with their full careers.">
<meta name="theme-color" content="#050505">
<link rel="icon" href="img/favicon.png" type="image/png">
<link rel="preload" href="fonts/HouseOfCards_Bold.otf" as="font" type="font/otf" crossorigin>
<link rel="stylesheet" href="staff.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="skip" href="#lineup">Skip to the staff lineup</a>
<header class="top">
  <button class="top__menu" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
  <a class="top__brand" href="{SITE}/"><img src="img/shield.png" alt="" width="30" height="42"><span>Legendary Prep Academy</span></a>
  <nav class="top__nav" id="nav" aria-label="Main">
    <a href="{SITE}/">Home</a>
    <a href="{SITE}/experience">The LPA Experience</a>
    <a href="{SITE}/staff" aria-current="page">Meet the Staff</a>
    <a href="{SITE}/schedule">Schedule</a>
    <a href="{SITE}/sponsors">Partnerships</a>
    <a href="{SITE}/apply">Apply</a>
  </nav>
  <a class="btn btn--small" href="{TOUR}">Book a tour</a>
</header>

<main id="lineup" class="card">
  <header class="card__head">
    <div class="card__title">
      <h1>The staff lineup</h1>
      <p>Former pros, Division 1 players and certified specialists coach, teach and look after every LPA player. Pick a name to read the full career.</p>
    </div>
    <dl class="card__fields">
      <div><dt>Club</dt><dd>Legendary Prep Academy</dd></div>
      <div><dt>Field</dt><dd>Scottsdale, Arizona</dd></div>
      <div><dt>Head coach</dt><dd>Mark Karaviotis</dd></div>
      <div><dt>On the card</dt><dd>Sixteen staff</dd></div>
    </dl>
  </header>

  <div class="card__body">
    <div class="sheet">
      <div class="sheet__cols" aria-hidden="true"><span>No.</span><span>Name</span><span>Position</span><span class="c-lead">Career</span><span>Then</span></div>
      <ul class="sheet__rows">
        {"".join(rows)}
      </ul>
    </div>
    <aside class="frame" id="frame" aria-live="polite" aria-label="Selected staff member"></aside>
  </div>

  <footer class="card__foot">
    <div class="foot__ask">
      <h2>Meet them in person</h2>
      <p>See the academy in Scottsdale and bring your questions. A tour is the best way to know whether LPA fits your son.</p>
    </div>
    <div class="foot__act">
      <a class="btn btn--big" href="{TOUR}">Book a tour</a>
      <a class="link" href="{SITE}/contact">Request the program guide</a>
    </div>
    <address class="foot__where">9382 E Bahia Drive, Suite B101<br>Scottsdale, AZ 85260<br><a href="tel:+14804854855">(480) 485-4855</a><br><a href="mailto:info@legendaryprepacademy.com">info@legendaryprepacademy.com</a></address>
  </footer>
</main>

<footer class="site-foot">
  <img src="img/arch.png" alt="LPA" width="260" height="100" loading="lazy">
  <p>Arizona's premier baseball development academy.</p>
  <p class="site-foot__legal">&copy; 2026 Legendary Prep Academy · <a href="{SITE}/terms">Terms</a> · <a href="{SITE}/privacy">Privacy</a></p>
</footer>
<script src="staff.js" defer></script>
</body>
</html>
'''

Path(__file__).with_name("index.html").write_text(page)
print("wrote index.html with", TOTAL, "staff")
