from __future__ import annotations

import json
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
SEED_PATH = DATA_DIR / "curated_places.json"
PLANNER_PATH = DATA_DIR / "venues.geojson"
OUTPUT_PATH = DATA_DIR / "visit_info.json"
CHECKED_DATE = "2026-08-01"
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def hours(**days):
    return {day: days.get(day) for day in DAYS}


def regular(open_days, start, end, **special):
    result = hours()
    for day in open_days:
        result[day] = [start, end]
    result.update(special)
    return result


VISIT_OVERRIDES = {
    "center-for-architecture": {
        "schedule_type": "regular",
        "hours": hours(mon=[9, 20], tue=[9, 20], wed=[9, 20], thu=[9, 20], fri=[9, 20], sat=[11, 17]),
        "adult_price": 0,
        "student_price": 0,
        "admission_label": "Free galleries; lectures and tours are priced separately",
        "visit_source": "https://www.centerforarchitecture.org/visit/",
    },
    "salmagundi-club": {
        "schedule_type": "regular",
        "hours": hours(tue=[13, 18], wed=[13, 18], thu=[13, 18], fri=[13, 18], sat=[13, 17], sun=[13, 17]),
        "adult_price": 0,
        "student_price": 0,
        "admission_label": "Free public galleries; some lectures have a small fee",
        "visit_source": "https://salmagundi.org/about/",
    },
    "the-kitchen": {
        "hours_label": "Open for the times listed with each program",
        "admission_label": "No fixed admission; public programs include free and $5-$25 sliding-scale events",
        "visit_source": "https://thekitchen.org/on-view/the-woodshed-black-backstage/",
    },
    "abrons-arts-center": {
        "hours_label": "Building open daily 10 AM-10 PM; box office opens one hour before shows",
        "admission_label": "Free galleries and community programs; performance tickets are priced per event",
        "visit_source": "https://abronsartscenter.org/about/contact",
    },
    "the-clemente": {
        "hours_label": "Open for the times listed with each public event",
        "admission_label": "No fixed admission; the calendar identifies free and ticketed events",
        "visit_source": "https://www.theclementecenter.org/calendar",
    },
    "africa-center": {
        "schedule_type": "regular",
        "hours": hours(wed=[11, 17], thu=[11, 17], fri=[11, 17], sat=[11, 17], sun=[11, 17]),
        "adult_price": 0,
        "student_price": 0,
        "admission_label": "Free admission; selected exhibitions and events may be ticketed",
        "visit_source": "https://theafricacenter.org/about-us",
    },
    "americas-society": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat".split(), 11, 18),
        "adult_price": 0,
        "student_price": 0,
        "admission_label": "Free gallery admission",
        "visit_source": "https://www.as-coa.org/art",
    },
    "scandinavia-house": {
        "hours_label": "Gallery and cinema hours follow the current exhibition and screening schedule",
        "admission_label": "Gallery and screening admission are priced separately by program",
        "visit_source": "https://www.scandinaviahouse.org/events/",
    },
    "irish-arts-center": {
        "hours_label": "Open for scheduled performances, classes, and public events",
        "admission_label": "No fixed admission; each performance lists its own ticket price",
        "visit_source": "https://irishartscenter.org/whats-on",
    },
    "tibet-house": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat".split(), 11, 16),
        "adult_price": 5,
        "student_price": 5,
        "admission_label": "$5 suggested gallery donation; programs may be separately ticketed",
        "visit_source": "https://thus.org/featured/TIBET-HOUSE-US-PRESS-KIT.pdf",
    },
    "the-shed": {
        "hours_label": "Hours and entry times are listed with each exhibition or performance",
        "admission_label": "Dynamic event pricing; Open Call is free and CUNY students receive free gallery admission",
        "visit_source": "https://www.theshed.org/visit/faq",
    },
    "performance-space-new-york": {
        "hours_label": "Open for scheduled performances and public programs",
        "admission_label": "No fixed admission; programs range from free conversations to ticketed performances",
        "visit_source": "https://performancespacenewyork.org/shows/",
    },
    "la-mama": {
        "hours_label": "Box office opens one hour before each performance",
        "adult_price": 30,
        "student_price": 25,
        "admission_label": "Most shows $30 adult / $25 student or senior; first ten tickets often $10",
        "visit_source": "https://lamama.org/memory-generation/",
    },
    "anthology-film-archives": {
        "hours_label": "Open for scheduled screenings; box office opens 30 minutes before the first show",
        "adult_price": 14,
        "student_price": 10,
        "admission_label": "$14 general / $10 student, senior, or child / $8 member",
        "visit_source": "https://www.anthologyfilmarchives.org/contact/box_office-tickets",
    },
    "film-forum": {
        "hours_label": "Open daily for scheduled screenings",
        "screening_times": {
            "2026-08-01": [
                "12:20", "12:30", "12:45", "12:50", "14:40", "15:00",
                "15:20", "16:30", "16:50", "17:45", "18:15", "18:40",
                "19:00", "19:50", "20:30", "21:10",
            ],
        },
        "screening_source": "https://filmforum.org/",
        "adult_price": 17,
        "student_price": 17,
        "admission_label": "$17 general / $11 member; special events may differ",
        "visit_source": "https://filmforum.org/",
    },
    "metrograph": {
        "hours_label": "Open daily for scheduled screenings; in-person sales begin before the first show",
        "screening_times": {
            "2026-08-01": ["20:45", "21:00", "23:00"],
        },
        "screening_source": "https://metrograph.com/nyc/?date=2026-08-01",
        "adult_price": 18,
        "student_price": 18,
        "admission_label": "$18 general / $12 senior or guest with disability / $11 member",
        "visit_source": "https://metrograph.com/tickets/",
    },
    "pioneer-works": {
        "hours_label": "Open for scheduled exhibitions and events",
        "admission_label": "No fixed admission; many exhibitions are free and ticketed events list a price",
        "visit_source": "https://pioneerworks.org/programs",
    },
    "brooklyn-museum": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat sun".split(), 11, 18),
        "adult_price": 20,
        "student_price": 14,
        "ny_resident_price": 1,
        "admission_label": "Pay what you can at the desk; suggested $20 adult / $14 student",
        "visit_source": "https://www.brooklynmuseum.org/visit/tickets",
    },
    "bam": {
        "hours_label": "Open for scheduled films and performances",
        "adult_price": 17,
        "student_price": 11,
        "admission_label": "Cinema $17 general / $11 student Mon-Thu; live performance prices vary",
        "visit_source": "https://www.bam.org/cinema-faq",
    },
    "roulette": {
        "hours_label": "Box office opens one hour before performances",
        "adult_price": 25,
        "student_price": 20,
        "admission_label": "Typical shows $25 advance / $30 door / $20 student or senior",
        "visit_source": "https://roulette.org/event/jessica-cook-night-2/",
    },
    "issue-project-room": {
        "hours_label": "Open for scheduled performances and public programs",
        "admission_label": "No fixed admission; general concerts are commonly priced at $15-$25",
        "visit_source": "https://issueprojectroom.org/support/patron",
    },
    "light-industry": {
        "hours_label": "Open for scheduled screenings",
        "adult_price": 10,
        "student_price": 10,
        "admission_label": "Most screenings $10; members receive complimentary admission",
        "visit_source": "https://www.lightindustry.org/membersnight",
    },
    "spectacle-theater": {
        "hours_label": "Open for scheduled screenings",
        "adult_price": 5,
        "student_price": 5,
        "admission_label": "$5 for most screenings unless marked otherwise",
        "visit_source": "https://www.spectacletheater.com/",
    },
    "culture-lab-lic": {
        "schedule_type": "regular",
        "hours": hours(thu=[17, 21], fri=[17, 21], sat=[14, 21], sun=[14, 21]),
        "adult_price": 0,
        "student_price": 0,
        "admission_label": "Free gallery and most public events; donations welcome",
        "visit_source": "https://www.culturelablic.org/recent-exhibitions",
    },
    "flushing-town-hall": {
        "hours_label": "Open for scheduled exhibitions and performances",
        "admission_label": "Free exhibitions; recent performances range from $15 to $50",
        "visit_source": "https://www.flushingtownhall.org/show-details/spirits-from-both-sides-arturo-ofarrill-x-vincent-hsu",
    },
    "jcal": {
        "hours_label": "Open for scheduled exhibitions, classes, and performances",
        "admission_label": "Free exhibitions and community programs; performances are priced per event",
        "visit_source": "https://jcal.org/events/",
    },
    "pregones-prtt": {
        "hours_label": "Open for scheduled performances and public programs",
        "admission_label": "No fixed admission; each performance lists its own ticket price",
        "visit_source": "https://pregonesprtt.org/events/",
    },
    "noble-maritime": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat sun".split(), 12, 17),
        "adult_price": 1,
        "student_price": 1,
        "admission_label": "Pay what you wish; members, children under 10, and care partners are free",
        "visit_source": "https://noblemaritime.org/",
    },
    "national-sawdust": {
        "hours_label": "Open for scheduled concerts and public programs",
        "admission_label": "No fixed admission; each concert lists its own ticket price",
        "visit_source": "https://www.nationalsawdust.org/events",
    },
    "new-york-live-arts": {
        "hours_label": "Open for scheduled performances, exhibitions, and talks",
        "admission_label": "No fixed admission; each performance lists its own price and discounts",
        "visit_source": "https://newyorklivearts.org/events/",
    },
    "danspace-project": {
        "hours_label": "Open for scheduled performances and public programs",
        "admission_label": "No fixed admission; each performance lists its own ticket price",
        "visit_source": "https://danspaceproject.org/calendar/",
    },
    "film-at-lincoln-center": {
        "hours_label": "Open daily for scheduled screenings",
        "screening_times": {
            "2026-08-01": ["12:00", "15:00", "18:30"],
        },
        "screening_source": "https://www.filmlinc.org/now-playing/?tab=schedule",
        "adult_price": 19,
        "student_price": 16,
        "admission_label": "$18-$19 general / $15-$16 student, senior, or guest with disability",
        "visit_source": "https://www.filmlinc.org/visit-us/",
    },
    "maysles-documentary-center": {
        "hours_label": "Open for scheduled screenings and community events",
        "adult_price": 15,
        "student_price": 7,
        "admission_label": "Many screenings $15 general / $7 reduced; some community events are free",
        "visit_source": "https://www.maysles.org/calendar/feminist-elsewheres",
    },
    "apexart": {
        "hours": regular("tue wed thu fri sat".split(), 11, 18),
        "admission_label": "Free admission",
        "visit_source": "https://apexart.org/about-us.php",
    },
    "artists-space": {
        "hours": regular("wed thu fri sat".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://artistsspace.org/about",
    },
    "cue-art-foundation": {
        "hours": regular("wed thu fri sat".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://cueartfoundation.org/information",
    },
    "white-columns": {
        "hours": regular("tue wed thu fri sat".split(), 11, 18),
        "admission_label": "Free admission",
        "visit_source": "https://whitecolumns.org/about/",
    },
    "swiss-institute": {
        "hours": hours(wed=[14, 20], thu=[14, 20], fri=[14, 20], sat=[12, 20], sun=[12, 18]),
        "admission_label": "Free admission",
        "visit_source": "https://www.swissinstitute.net/visit/",
    },
    "cara": {
        "hours": hours(wed=[11, 18], thu=[11, 18], fri=[11, 18], sat=[11, 18], sun=[12, 18]),
        "admission_label": "Free admission",
        "visit_source": "https://www.cara-nyc.org/pages/visit?section=Hours",
    },
    "print-center-new-york": {
        "hours": regular("wed thu fri sat".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://www.printcenternewyork.org/visit",
    },
    "center-for-book-arts": {
        "hours": hours(mon=[11, 18], tue=[11, 18], wed=[11, 18], thu=[11, 18], fri=[11, 17], sat=[11, 17]),
        "admission_label": "Free; suggested donation welcomed",
        "visit_source": "https://centerforbookarts.org/about",
    },
    "storefront-art-architecture": {
        "hours": regular("wed thu fri sat".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://storefront.nyc/about/",
    },
    "james-gallery": {
        "hours": regular("tue wed thu fri".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://www.gc.cuny.edu/james-gallery",
    },
    "isaw": {
        "hours": hours(tue=[11, 18], wed=[11, 18], thu=[11, 18], fri=[11, 20], sat=[11, 18], sun=[11, 18]),
        "admission_label": "Free admission",
        "visit_source": "https://isaw.nyu.edu/exhibitions/wgre/location-and-hours",
    },
    "moca": {
        "hours": hours(wed=[11, 18], thu=[11, 18], fri=[11, 18], sat=[11, 18], sun=[11, 16]),
        "adult_price": 15,
        "student_price": 10,
        "ny_resident_price": 1,
        "admission_label": "$15 adult / $10 student; pay what you wish for NYC residents",
        "visit_source": "https://www.mocanyc.org/visit/plan-your-visit/",
    },
    "museum-at-eldridge-street": {
        "hours": regular("sun mon tue wed thu fri".split(), 10, 17),
        "adult_price": 15,
        "student_price": 10,
        "admission_label": "$15 adult / $10 student; pay what you wish Mon and Fri",
        "visit_source": "https://www.eldridgestreet.org/visit",
    },
    "ukrainian-museum": {
        "hours": regular("wed thu fri sat sun".split(), 12, 18),
        "adult_price": 15,
        "student_price": 10,
        "admission_label": "$15 adult / $10 student; free last Thursday 6-9 PM",
        "visit_source": "https://www.theukrainianmuseum.org/Visit/",
    },
    "weeksville": {
        "hours": hours(tue=[10, 17], wed=[10, 17], thu=[10, 17], fri=[10, 17], sat=[11, 17]),
        "admission_label": "Free admission; guided tours may cost extra",
        "visit_source": "https://www.weeksvillesociety.org/visit/",
    },
    "city-reliquary": {
        "schedule_type": "regular",
        "hours_label": "Open Thu-Sun during posted museum hours",
        "adult_price": 10,
        "student_price": 5,
        "ny_resident_price": 8,
        "admission_label": "$10 adult / $5 student / $8 NYC resident",
        "visit_source": "https://www.cityreliquary.org/admission/",
    },
    "moma-ps1": {
        "schedule_type": "regular",
        "hours_label": "Open Thu-Mon; daytime museum hours",
        "admission_label": "Free admission",
        "visit_source": "https://www.moma.org/visit/",
    },
    "sculpturecenter": {
        "hours": regular("thu fri sat sun mon".split(), 12, 18),
        "admission_label": "Free admission",
        "visit_source": "https://www.sculpture-center.org/visit/93/admission-and-accessibility",
    },
    "noguchi-museum": {
        "hours": regular("wed thu fri sat sun".split(), 11, 18),
        "adult_price": 16,
        "student_price": 6,
        "admission_label": "$16 adult / $6 student; free first Friday",
        "visit_source": "https://www.noguchi.org/museum/visit/",
    },
    "queens-museum": {
        "schedule_type": "regular",
        "hours_label": "Open Wed-Sun; closes 5 PM",
        "adult_price": 8,
        "student_price": 6,
        "admission_label": "Pay what you wish; $8 adult / $6 student suggested",
        "visit_source": "https://queensmuseum.org/visit/",
    },
    "moving-image": {
        "hours": hours(thu=[14, 18], fri=[14, 20], sat=[11, 18], sun=[11, 18]),
        "adult_price": 20,
        "student_price": 12,
        "admission_label": "$20 adult / $12 student; free Thursday 2-6 PM",
        "visit_source": "https://movingimage.org/visit/",
    },
    "bronx-museum": {
        "hours": regular("wed thu fri sat sun".split(), 11, 18),
        "admission_label": "Free admission",
        "visit_source": "https://bronxmuseum.org/visit/",
    },
    "louis-armstrong-house": {
        "hours": regular("thu fri sat".split(), 11, 16),
        "adult_price": 10,
        "student_price": 8,
        "admission_label": "$10 exhibits / $20 house tour; student $8 / $14",
        "visit_source": "https://www.louisarmstronghouse.org/visit/",
    },
    "alice-austen-house": {
        "hours": hours(wed=[12, 17], thu=[12, 17], fri=[12, 17], sat=[11, 17]),
        "adult_price": 5,
        "student_price": 5,
        "admission_label": "$5 suggested admission",
        "visit_source": "https://aliceausten.org/planyourvisit/",
    },
    "staten-island-museum": {
        "hours": regular("wed thu fri sat sun".split(), 11, 17),
        "adult_price": 8,
        "student_price": 5,
        "admission_label": "Pay what you wish; $8 adult / $5 student suggested",
        "visit_source": "https://www.statenislandmuseum.org/visit/",
    },
    "national-arts-club": {
        "schedule_type": "regular",
        "hours": hours(mon=[9, 15], tue=[9, 15], wed=[9, 15], thu=[9, 15], fri=[9, 15], sat=[10, 16], sun=[10, 16]),
        "hours_label": "Public gallery hours; availability can change for Club functions",
        "admission_label": "Free public exhibitions",
        "visit_source": "https://www.nationalartsclub.org/files/Membership%20Application.pdf",
    },
    "wallach-art-gallery": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat sun".split(), 12, 18),
        "hours_label": "Wednesday-Sunday, noon-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://wallach.columbia.edu/content/plan-your-visit",
    },
    "grolier-club": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri sat".split(), 10, 17),
        "hours_label": "Monday-Saturday, 10 AM-5 PM; closed for August 2026",
        "closures": [
            {"start": "2026-08-01", "end": "2026-09-07", "label": "Closed for the August recess; reopens September 8"},
        ],
        "admission_label": "Free exhibitions",
        "visit_source": "https://www.grolierclub.org/",
    },
    "city-lore": {
        "schedule_type": "regular",
        "hours": regular("sat sun".split(), 12, 18),
        "hours_label": "Saturday-Sunday, noon-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://citylore.org/about-the-gallery/current-exhibition/",
    },
    "austrian-cultural-forum": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri".split(), 10, 18),
        "hours_label": "Monday-Friday, 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://acfny.org/",
    },
    "schomburg-center": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri sat".split(), 10, 18),
        "hours_label": "Monday-Saturday, 10 AM-6 PM",
        "admission_label": "Free exhibitions and public spaces",
        "visit_source": "https://www.nypl.org/locations/schomburg/",
    },
    "bric-house": {
        "schedule_type": "regular",
        "hours": regular("tue wed thu fri sat".split(), 11, 18),
        "hours_label": "BRIC House Gallery Tuesday-Saturday, 11 AM-6 PM",
        "admission_label": "Free gallery admission",
        "visit_source": "https://bricartsmedia.org/events/exhibitions/",
    },
    "amant": {
        "schedule_type": "regular",
        "hours": hours(thu=[12, 18], fri=[12, 21], sat=[12, 18], sun=[12, 18]),
        "hours_label": "Thursday noon-6 PM, Friday noon-9 PM, weekends noon-6 PM",
        "admission_label": "Free exhibitions and programs",
        "visit_source": "https://www.amant.org/visit/plan-your-visit",
    },
    "air-gallery": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat sun".split(), 12, 18),
        "hours_label": "Wednesday-Sunday, noon-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.airgallery.org/visit",
    },
    "smack-mellon": {
        "schedule_type": "regular",
        "hours": regular("wed thu fri sat sun".split(), 12, 18),
        "hours_label": "Wednesday-Sunday, noon-6 PM while exhibitions are on view",
        "admission_label": "Free admission",
        "visit_source": "https://www.smackmellon.org/visit/",
    },
    "five-myles": {
        "schedule_type": "regular",
        "hours": regular("thu fri sat sun".split(), 13, 18),
        "hours_label": "Thursday-Sunday, 1-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://fivemyles.org/about-1",
    },
    "kentler": {
        "schedule_type": "regular",
        "hours": regular("thu fri sat sun".split(), 12, 17),
        "hours_label": "Thursday-Sunday, noon-5 PM during exhibitions",
        "closures": [
            {"start": "2026-07-27", "end": "2026-09-18", "label": "Between exhibitions; next exhibition opens September 19"},
        ],
        "admission_label": "Free admission",
        "visit_source": "https://www.kentlergallery.org/Listing/upcoming_exhibitions",
    },
    "urbanglass": {
        "schedule_type": "regular",
        "hours": hours(wed=[11, 19], thu=[11, 19], fri=[11, 19], sat=[11, 19], sun=[11, 17]),
        "hours_label": "Wednesday-Saturday 11 AM-7 PM; Sunday 11 AM-5 PM",
        "admission_label": "Free gallery admission",
        "visit_source": "https://urbanglass.org/visit/overview",
    },
    "center-brooklyn-history": {
        "schedule_type": "regular",
        "hours": hours(mon=[10, 18], tue=[10, 18], wed=[10, 18], thu=[10, 18], fri=[10, 18], sat=[10, 16]),
        "hours_label": "Monday-Friday 10 AM-6 PM; Saturday 10 AM-4 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.bklynlibrary.org/locations/center-for-brooklyn-history",
    },
    "flux-factory": {
        "schedule_type": "event",
        "hours_label": "Public access is limited to the dates and times of listed exhibitions and events",
        "admission_label": "Public programs are generally free",
        "visit_source": "https://www.fluxfactory.org/fluxfactory/",
    },
    "bronx-art-space": {
        "schedule_type": "regular",
        "hours": hours(thu=[14, 18], fri=[14, 18], sat=[12, 17]),
        "hours_label": "Thursday-Friday 2-6 PM; Saturday noon-5 PM during exhibitions",
        "admission_label": "Free admission",
        "visit_source": "https://www.bronxartspace.com/2026",
    },
    "lehman-art-gallery": {
        "schedule_type": "regular",
        "hours": regular("tue wed thu fri sat".split(), 10, 16),
        "hours_label": "Tuesday-Saturday, 10 AM-4 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.lehman.edu/departments/Art-Gallery/Art-Gallery.php",
    },
    "longwood-art-gallery": {
        "schedule_type": "regular",
        "hours": regular("tue wed thu fri".split(), 12, 18),
        "hours_label": "Tuesday-Friday, noon-6 PM during exhibitions",
        "admission_label": "Free admission",
        "visit_source": "https://www.hostos.cuny.edu/culturearts/rentus/artgallery.shtml",
    },
    "art-lab-si": {
        "schedule_type": "regular",
        "hours": hours(mon=[10, 19], tue=[10, 19], wed=[10, 19], thu=[10, 19], fri=[10, 16], sat=[10, 16], sun=[10, 16]),
        "hours_label": "Monday-Thursday 10 AM-7 PM; Friday-Sunday 10 AM-4 PM",
        "admission_label": "Free gallery admission",
        "visit_source": "https://artlabsi.com/contact-us/",
    },
    "david-zwirner-chelsea": {
        "schedule_type": "regular",
        "hours": regular("tue wed thu fri sat".split(), 10, 18),
        "hours_label": "Tuesday-Saturday, 10 AM-6 PM when exhibitions are on view",
        "closures": [
            {"start": "2026-08-01", "end": "2026-09-09", "label": "Chelsea galleries are between exhibitions"},
        ],
        "admission_label": "Free admission",
        "visit_source": "https://www.davidzwirner.com/galleries/new-york",
    },
    "pace-gallery": {
        "schedule_type": "regular",
        "hours": hours(mon=[10, 18], tue=[10, 18], wed=[10, 18], thu=[10, 18], fri=[10, 16]),
        "hours_label": "Monday-Thursday 10 AM-6 PM; Friday 10 AM-4 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.pacegallery.com/galleries/new-york/",
    },
    "hauser-wirth-chelsea": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri".split(), 10, 18),
        "hours_label": "Monday-Friday, 10 AM-6 PM when exhibitions are on view",
        "closures": [
            {"start": "2026-08-01", "end": "2026-09-09", "label": "Summer exhibitions ended July 31; next exhibition opens September 10"},
        ],
        "admission_label": "Free admission",
        "visit_source": "https://www.hauserwirth.com/locations/10073-hauser-wirth-new-york-22nd-street/",
    },
    "petzel-gallery": {
        "schedule_type": "regular",
        "hours": regular("tue wed thu fri sat".split(), 10, 18),
        "hours_label": "Tuesday-Saturday, 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.petzel.com/about",
    },
    "jack-shainman-chelsea": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri".split(), 10, 18),
        "hours_label": "Monday-Friday, 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://jackshainman.com/about",
    },
    "lisson-gallery": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri".split(), 10, 18),
        "hours_label": "Monday-Friday, 10 AM-6 PM when exhibitions are on view",
        "closures": [
            {"start": "2026-07-25", "end": "2026-09-14", "label": "Between New York exhibitions; next exhibition opens September 15"},
        ],
        "admission_label": "Free admission",
        "visit_source": "https://www.lissongallery.com/contact",
    },
    "iscp": {
        "schedule_type": "regular",
        "hours": regular("mon tue wed thu fri".split(), 10.5, 17.5),
        "hours_label": "Monday-Friday, 10:30 AM-5:30 PM",
        "admission_label": "Free admission",
        "visit_source": "https://iscp-nyc.org/visit",
    },
    "tiger-strikes-asteroid": {
        "schedule_type": "regular",
        "hours": regular("sat sun".split(), 13, 18),
        "hours_label": "Saturday-Sunday, 1-6 PM during exhibitions",
        "admission_label": "Free admission",
        "visit_source": "https://www.tigerstrikesasteroid.com/contact",
    },
    "transmitter-gallery": {
        "schedule_type": "regular",
        "hours": regular("sat sun".split(), 13, 18),
        "hours_label": "Saturday-Sunday, 1-6 PM during exhibitions",
        "admission_label": "Free admission",
        "visit_source": "https://www.transmitter.nyc/contact",
    },
    "interference-archive": {
        "schedule_type": "regular",
        "hours": hours(mon=[18, 21], fri=[13, 18], sat=[12, 17], sun=[12, 17]),
        "hours_label": "Monday 6-9 PM; Friday 1-6 PM; weekends noon-5 PM",
        "admission_label": "Free admission; donations welcome",
        "visit_source": "https://interferencearchive.org/who-we-are/visit/",
    },
    "bronx-documentary-center": {
        "schedule_type": "regular",
        "hours": hours(thu=[15, 19], fri=[15, 19], sat=[13, 17]),
        "hours_label": "Thursday-Friday 3-7 PM; Saturday 1-5 PM during exhibitions",
        "admission_label": "Free admission",
        "visit_source": "https://www.bronxdoc.org/bronx-documentary-center/visit/",
    },
    "ifc-center": {
        "screening_times": {
            "2026-08-01": [
                "10:35", "10:40", "11:00", "11:05", "12:35", "12:45",
                "13:15", "13:30", "14:40", "14:50", "15:30", "15:55",
                "16:00", "16:35", "17:50", "18:05", "18:30", "18:45",
                "18:50", "19:35", "20:45", "21:00", "21:20", "21:40",
                "21:50", "23:05", "23:20", "23:55", "23:59",
            ],
        },
        "screening_source": "https://www.ifccenter.com/",
    },
    "nitehawk-williamsburg": {
        "screening_times": {
            "2026-08-01": [
                "11:00", "11:15", "11:30", "13:15", "13:30", "14:45",
                "16:00", "17:00", "18:00", "18:30", "20:45", "21:00",
            ],
        },
        "screening_source": "https://nitehawkcinema.com/williamsburg/williamsburg/2026-08/",
    },
    "nitehawk-prospect-park": {
        "screening_times": {
            "2026-08-01": [
                "11:00", "11:15", "11:30", "12:00", "12:30", "12:45",
                "13:40", "13:55", "14:10", "14:25", "14:55", "15:25",
                "16:00", "16:15", "16:30", "17:50", "18:05", "18:20",
                "18:35", "18:50", "19:05", "20:00", "20:40", "21:15",
                "21:35", "21:50", "22:05", "22:20",
            ],
        },
        "screening_source": "https://nitehawkcinema.com/prospectpark/2026-08-01/0/",
    },
    "gagosian-west-24": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://gagosian.com/locations/541-west-24th-street-new-york/",
    },
    "gladstone-west-21": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.gladstonegallery.com/about/",
    },
    "kasmin-west-27": {
        "schedule_type": "regular",
        "hours": hours(mon=[10, 17], tue=[10, 17], wed=[10, 17], thu=[10, 17], fri=[10, 16]),
        "hours_label": "Monday-Thursday 10 AM-5 PM; Friday 10 AM-4 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.kasmingallery.com/about-index/visit-us/",
    },
    "luhring-augustine-chelsea": {
        "schedule_type": "appointment",
        "hours_label": "Open by appointment; confirm before visiting",
        "admission_label": "Free admission by appointment",
        "visit_source": "https://www.luhringaugustine.com/contact",
    },
    "sean-kelly-new-york": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 17),
        "hours_label": "Summer hours Monday-Friday 10 AM-5 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.skny.com/news-events",
    },
    "lehmann-maupin-chelsea": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Summer hours Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.lehmannmaupin.com/about/contact",
    },
    "marianne-boesky-chelsea": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://marianneboeskygallery.com/about/",
    },
    "perrotin-new-york": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.perrotin.com/en/locations/new-york",
    },
    "uffner-liu": {
        "schedule_type": "regular",
        "hours": regular(("mon", "tue", "wed", "thu", "fri"), 10, 18),
        "hours_label": "Summer hours Monday-Friday 10 AM-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://uffnerliu.com/contact/",
    },
    "cuchifritos-gallery": {
        "schedule_type": "regular",
        "hours": regular(("wed", "thu", "fri", "sat"), 12, 18),
        "hours_label": "Wednesday-Saturday noon-6 PM",
        "admission_label": "Free admission",
        "visit_source": "https://www.artistsallianceinc.org/exhibitions/",
    },
}


def free_visit(seed):
    venue_type = seed["venue_type"].lower()
    description = seed["description"].lower()
    free_terms = (
        "gallery",
        "art space",
        "art center",
        "arts club",
        "archive",
        "research library",
        "residency",
        "outdoor art park",
        "commercial gallery",
    )
    return "free" in description or any(term in venue_type for term in free_terms)


def default_visit(seed):
    category = seed["category"]
    venue_type = seed["venue_type"].lower()
    if seed.get("schedule_type"):
        result = {
            "schedule_type": seed["schedule_type"],
            "hours_label": seed["hours_label"],
            "admission_label": seed["admission_label"],
            "visit_source": seed.get("visit_source", seed["website"]),
        }
        if "hours" in seed:
            result["hours"] = seed["hours"]
        for key in ("adult_price", "student_price", "ny_resident_price", "under_25_price"):
            if key in seed:
                result[key] = seed[key]
        return result
    if category == "Film & Media" and "museum" not in venue_type and "gallery" not in venue_type:
        return {
            "schedule_type": "screening",
            "hours_label": "Open for scheduled screenings",
            "admission_label": "Ticket price varies by screening",
            "visit_source": seed["events_url"],
        }
    if category == "Performance & Music" or "performance" in venue_type or "theater" in venue_type or "music venue" in venue_type:
        return {
            "schedule_type": "event",
            "hours_label": "Open for scheduled performances and events",
            "admission_label": "Ticket price varies by event",
            "visit_source": seed["events_url"],
        }
    if "park" in venue_type or "garden" in venue_type:
        return {
            "schedule_type": "daylight",
            "hours_label": "Public daytime hours; seasonal closing time varies",
            "adult_price": 0,
            "student_price": 0,
            "admission_label": "Free admission",
            "visit_source": seed["website"],
        }
    if free_visit(seed):
        return {
            "schedule_type": "exhibition",
            "hours_label": "Open during current public exhibition hours",
            "adult_price": 0,
            "student_price": 0,
            "admission_label": "Free admission",
            "visit_source": seed["website"],
        }
    return {
        "schedule_type": "program",
        "hours_label": "Open during scheduled public programs",
        "admission_label": "Admission varies by program",
        "visit_source": seed["events_url"],
    }


def build():
    seeds = read_json(SEED_PATH)
    planner = read_json(PLANNER_PATH)
    planner_by_id = {feature["properties"]["id"]: feature["properties"] for feature in planner["features"]}
    result = {}
    for seed in seeds:
        profile = planner_by_id.get(seed.get("planner_id"))
        if profile:
            result[seed["id"]] = {
                "schedule_type": "regular",
                "hours": profile["hours"],
                "hours_label": "Weekly museum hours",
                "adult_price": profile.get("adult_price"),
                "student_price": profile.get("student_price"),
                "ny_resident_price": profile.get("ny_resident_price"),
                "under_25_price": profile.get("under_25_price"),
                "admission_label": profile.get("standard_price_label", "Admission varies"),
                "visit_source": profile.get("admission_source", seed.get("website")),
            }
        else:
            result[seed["id"]] = default_visit(seed)
        result[seed["id"]].update(VISIT_OVERRIDES.get(seed["id"], {}))
        result[seed["id"]]["visit_checked"] = CHECKED_DATE
    return result


if __name__ == "__main__":
    output = build()
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote visit information for {len(output)} places")
