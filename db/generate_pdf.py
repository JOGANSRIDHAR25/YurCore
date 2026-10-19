"""
Generate DB Schema PDF
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
import os, textwrap, re

# Brand name shown in the PDF and its filename. Keep in sync with src/shared/config/site.ts.
SITE_NAME = "YurCore"

def s(text):
    """Sanitize string to latin-1 safe characters."""
    return (str(text)
        .replace("—", "-").replace("–", "-")
        .replace("‘", "'").replace("’", "'")
        .replace("“", '"').replace("”", '"')
        .replace("…", "...").replace("·", ".")
        .encode("latin-1", errors="replace").decode("latin-1")
    )

# ── colour palette ────────────────────────────────────────────────
C_BG          = (250, 248, 245)   # warm ivory page background
C_HEADER_BG   = (42,  70,  55)    # dark forest green – brand header
C_HEADER_TEXT = (255, 255, 255)
C_MODULE_BG   = (62,  100, 75)    # module title bar
C_MODULE_TEXT = (255, 255, 255)
C_TABLE_HDR   = (235, 228, 215)   # table header row
C_TABLE_ALT   = (247, 244, 239)   # alternating row tint
C_TABLE_WHITE = (255, 255, 255)
C_DIVIDER     = (200, 190, 175)
C_KEYWORD     = (180, 100, 40)    # SQL keyword orange
C_TEXT        = (40,  40,  40)
C_MUTED       = (120, 110, 100)
C_BORDER      = (180, 170, 155)
C_ENUM_BG     = (232, 244, 236)   # soft green for enum boxes
C_ENUM_BORDER = (100, 160, 110)

MODULES = [
    {
        "title": "Module 1 — Users & Identity",
        "tables": [
            {
                "name": "users",
                "desc": "Auth identity record for every platform user across all roles.",
                "cols": [
                    ("id",              "UUID PK",          "Primary key"),
                    ("mobile",          "VARCHAR(15) UNIQUE","Registered mobile (+91)"),
                    ("email",           "VARCHAR(255)",      "Optional email address"),
                    ("role",            "user_role",         "patient | practitioner | clinic_admin | receptionist | pharmacy | super_admin"),
                    ("language_pref",   "VARCHAR(20)",       "Preferred language code (default 'en')"),
                    ("is_active",       "BOOLEAN",           "Soft-disable flag"),
                    ("tos_accepted_at", "TIMESTAMPTZ",       "Terms of service acceptance timestamp"),
                    ("created_at",      "TIMESTAMPTZ",       "Row creation time"),
                    ("updated_at",      "TIMESTAMPTZ",       "Last modification time"),
                ],
            },
            {
                "name": "abha_links",
                "desc": "Ayushman Bharat Health Account (ABHA) linkage per user. One record per user.",
                "cols": [
                    ("id",            "UUID PK",          "Primary key"),
                    ("user_id",       "UUID FK → users",  "Owning user (UNIQUE – one ABHA per user)"),
                    ("abha_id",       "VARCHAR(17) UNIQUE","XX-XXXX-XXXX-XXXX government ID"),
                    ("abha_address",  "VARCHAR(255)",      "name@abdm health address"),
                    ("aadhaar_masked","VARCHAR(12)",        "Last 4 digits only – never store full Aadhaar"),
                    ("full_name",     "VARCHAR(255)",       "Name as on government record"),
                    ("date_of_birth", "DATE",               "From ABHA registry"),
                    ("gender",        "gender",             "male | female | other | prefer_not_to_say"),
                    ("mobile_linked", "VARCHAR(15)",        "Mobile on ABHA record"),
                    ("is_verified",   "BOOLEAN",            "NHA verification confirmed"),
                    ("linked_at",     "TIMESTAMPTZ",        "When link was established"),
                ],
            },
        ],
    },
    {
        "title": "Module 2 — Patients",
        "tables": [
            {
                "name": "patients",
                "desc": "Patient profile. One-to-one with users (user_id UNIQUE).",
                "cols": [
                    ("id",                "UUID PK",             "Primary key"),
                    ("user_id",           "UUID FK → users",     "Linked auth user (UNIQUE)"),
                    ("full_name",         "VARCHAR(255)",         "Display name"),
                    ("date_of_birth",     "DATE",                 ""),
                    ("gender",            "gender",               ""),
                    ("city",              "VARCHAR(100)",          ""),
                    ("pin_code",          "VARCHAR(10)",           ""),
                    ("profile_photo",     "TEXT",                  "S3 URL"),
                    ("prakriti",          "prakriti_type",         "Vata / Pitta / Kapha and combinations"),
                    ("wellness_goals",    "TEXT[]",                "Multi-select tags e.g. {Sleep, Digestion}"),
                    ("discipline_prefs",  "ayush_discipline[]",    "Preferred AYUSH disciplines"),
                    ("drop_off_nudge_paused","BOOLEAN",            "Suppress re-engagement notifications"),
                    ("created_at",        "TIMESTAMPTZ",           ""),
                    ("updated_at",        "TIMESTAMPTZ",           ""),
                ],
            },
            {
                "name": "family_members",
                "desc": "Linked family profiles managed under one patient account. Max 6 per account.",
                "cols": [
                    ("id",               "UUID PK",                  ""),
                    ("owner_patient_id", "UUID FK → patients",       "Account holder who manages this profile"),
                    ("full_name",        "VARCHAR(255)",               ""),
                    ("relationship",     "relationship",               "spouse | parent | child | sibling | other"),
                    ("date_of_birth",    "DATE",                       ""),
                    ("gender",           "gender",                     ""),
                    ("abha_id",          "VARCHAR(17)",                "Optional ABHA ID for this member"),
                    ("prakriti",         "prakriti_type",              ""),
                    ("is_minor",         "BOOLEAN (computed)",         "TRUE if age < 18 – auto-computed from DOB"),
                    ("created_at",       "TIMESTAMPTZ",                ""),
                ],
            },
        ],
    },
    {
        "title": "Module 3 — Practitioners",
        "tables": [
            {
                "name": "practitioners",
                "desc": "AYUSH doctor / practitioner profile. Linked to users. Bookings only allowed when verification_status = 'verified'.",
                "cols": [
                    ("id",                  "UUID PK",           ""),
                    ("user_id",             "UUID FK → users",   "UNIQUE"),
                    ("full_name",           "VARCHAR(255)",       ""),
                    ("gender",              "gender",             ""),
                    ("profile_photo",       "TEXT",               "S3 URL"),
                    ("bio",                 "TEXT",               "Free-text practitioner bio"),
                    ("languages",           "TEXT[]",             "Spoken languages"),
                    ("disciplines",         "ayush_discipline[]", "One or more AYUSH disciplines"),
                    ("specializations",     "TEXT[]",             "e.g. {Panchakarma, Spine Rehab}"),
                    ("qualifications",      "TEXT[]",             "e.g. {BAMS, MD Ayurveda}"),
                    ("experience_years",    "SMALLINT",           "Years of practice"),
                    ("hpr_id",              "VARCHAR(20)",         "Health Professional Registry ID (UNIQUE)"),
                    ("hpr_verified",        "BOOLEAN",            "HPR verification confirmed"),
                    ("hip_registered",      "BOOLEAN",            "ABDM Health Information Provider registered"),
                    ("reg_council",         "VARCHAR(150)",        "e.g. Central Council of Indian Medicine"),
                    ("reg_number",          "VARCHAR(50)",         "State / central council number"),
                    ("verification_status", "verification_status","pending | under_review | verified | rejected"),
                    ("rejection_reason",    "TEXT",                "Set on rejection by admin"),
                    ("is_online",           "BOOLEAN",             "Real-time availability toggle"),
                    ("rating_avg",          "NUMERIC(3,2)",        "Auto-maintained by trigger on ratings table"),
                    ("rating_count",        "INTEGER",             "Auto-maintained by trigger"),
                    ("consultation_count",  "INTEGER",             "Total completed consultations"),
                    ("base_video_fee",      "INTEGER",             "Fee in paise for video consult"),
                    ("base_clinic_fee",     "INTEGER",             "Fee in paise for in-clinic consult"),
                    ("followup_fee_pct",    "SMALLINT",            "% of base fee for follow-ups ≤7 days (default 50)"),
                    ("slot_duration_min",   "SMALLINT",            "Default slot length in minutes"),
                    ("buffer_min",          "SMALLINT",            "Buffer between consecutive slots"),
                    ("created_at",          "TIMESTAMPTZ",         ""),
                    ("updated_at",          "TIMESTAMPTZ",         ""),
                ],
            },
            {
                "name": "verification_documents",
                "desc": "Credential documents uploaded by practitioners during onboarding review.",
                "cols": [
                    ("id",              "UUID PK",                     ""),
                    ("practitioner_id", "UUID FK → practitioners",     ""),
                    ("doc_type",        "VARCHAR(50)",                  "degree | registration | identity | photo"),
                    ("file_url",        "TEXT",                         "S3 URL"),
                    ("file_name",       "VARCHAR(255)",                  ""),
                    ("uploaded_at",     "TIMESTAMPTZ",                  ""),
                    ("reviewed_at",     "TIMESTAMPTZ",                  "When admin reviewed"),
                    ("reviewed_by",     "UUID FK → users",              "Admin who reviewed"),
                ],
            },
        ],
    },
    {
        "title": "Module 4 — Clinics",
        "tables": [
            {
                "name": "clinics",
                "desc": "Physical healthcare facilities. Can be associated with multiple practitioners.",
                "cols": [
                    ("id",                "UUID PK",        ""),
                    ("name",              "VARCHAR(255)",    "Clinic display name"),
                    ("address_line1",     "VARCHAR(255)",    ""),
                    ("address_line2",     "VARCHAR(255)",    ""),
                    ("city",              "VARCHAR(100)",    ""),
                    ("state",             "VARCHAR(100)",    ""),
                    ("pin_code",          "VARCHAR(10)",     ""),
                    ("geo_lat",           "NUMERIC(9,6)",    "GPS latitude"),
                    ("geo_lng",           "NUMERIC(9,6)",    "GPS longitude"),
                    ("phone",             "VARCHAR(15)",     ""),
                    ("hfr_id",            "VARCHAR(30)",     "Health Facility Registry ID"),
                    ("hfr_verified",      "BOOLEAN",         ""),
                    ("profile_photo",     "TEXT",            "S3 URL"),
                    ("parking_notes",     "TEXT",            "Day-of directions shown to patient"),
                    ("entry_instructions","TEXT",            ""),
                    ("is_active",         "BOOLEAN",         ""),
                    ("created_at",        "TIMESTAMPTZ",     ""),
                ],
            },
            {
                "name": "clinic_practitioners",
                "desc": "Junction: practitioner ↔ clinic. A doctor may work at multiple clinics.",
                "cols": [
                    ("id",              "UUID PK",                 ""),
                    ("clinic_id",       "UUID FK → clinics",       ""),
                    ("practitioner_id", "UUID FK → practitioners", ""),
                    ("room_number",     "VARCHAR(20)",              "Room or consultation bay"),
                    ("in_clinic_fee",   "INTEGER",                  "Override paise fee; NULL → use practitioner base"),
                    ("is_active",       "BOOLEAN",                  ""),
                    ("joined_at",       "DATE",                     ""),
                ],
            },
            {
                "name": "clinic_staff",
                "desc": "Receptionists and admins attached to a clinic.",
                "cols": [
                    ("id",        "UUID PK",             ""),
                    ("clinic_id", "UUID FK → clinics",   ""),
                    ("user_id",   "UUID FK → users",     ""),
                    ("role",      "user_role",            "receptionist | clinic_admin"),
                    ("is_active", "BOOLEAN",              ""),
                ],
            },
        ],
    },
    {
        "title": "Module 5 — Scheduling & Slots",
        "tables": [
            {
                "name": "availability_schedules",
                "desc": "Recurring weekly working hours per practitioner, per clinic (NULL clinic = video slots).",
                "cols": [
                    ("id",              "UUID PK",                  ""),
                    ("practitioner_id", "UUID FK → practitioners",  ""),
                    ("clinic_id",       "UUID FK → clinics",         "NULL for video"),
                    ("day_of_week",     "SMALLINT",                  "0=Mon … 6=Sun"),
                    ("start_time",      "TIME",                      ""),
                    ("end_time",        "TIME",                      ""),
                    ("break_start",     "TIME",                      "Optional mid-day break start"),
                    ("break_end",       "TIME",                      ""),
                    ("is_active",       "BOOLEAN",                   ""),
                ],
            },
            {
                "name": "blocked_dates",
                "desc": "Specific dates or date ranges marked unavailable by the practitioner (vacations, emergencies).",
                "cols": [
                    ("id",              "UUID PK",                 ""),
                    ("practitioner_id", "UUID FK → practitioners", ""),
                    ("clinic_id",       "UUID FK → clinics",        "NULL = all modes"),
                    ("block_date",      "DATE",                     ""),
                    ("reason",          "VARCHAR(50)",               "personal | travel | medical | other"),
                    ("blocked_at",      "TIMESTAMPTZ",               ""),
                ],
            },
            {
                "name": "slots",
                "desc": "Individual booking slots generated from schedules. 8-min checkout lock via locked_until.",
                "cols": [
                    ("id",              "UUID PK",                 ""),
                    ("practitioner_id", "UUID FK → practitioners", ""),
                    ("clinic_id",       "UUID FK → clinics",        "NULL = video"),
                    ("mode",            "consult_mode",             "video | clinic"),
                    ("slot_date",       "DATE",                     ""),
                    ("start_time",      "TIME",                     ""),
                    ("end_time",        "TIME",                     ""),
                    ("status",          "slot_status",              "open | locked | booked | blocked | completed"),
                    ("locked_until",    "TIMESTAMPTZ",              "8-minute checkout lock expiry"),
                    ("locked_by",       "UUID FK → users",          "User holding the lock"),
                    ("fee",             "INTEGER",                   "Fee in paise at time of slot creation"),
                ],
            },
        ],
    },
    {
        "title": "Module 6 — Appointments",
        "tables": [
            {
                "name": "appointments",
                "desc": "Confirmed bookings. Central entity linking patient, practitioner, slot, payment, and EMR.",
                "cols": [
                    ("id",                   "UUID PK",                  ""),
                    ("slot_id",              "UUID FK → slots",          ""),
                    ("practitioner_id",      "UUID FK → practitioners",  ""),
                    ("patient_id",           "UUID FK → patients",       ""),
                    ("family_member_id",     "UUID FK → family_members", "Set when booking for a family member"),
                    ("clinic_id",            "UUID FK → clinics",         "NULL for video"),
                    ("mode",                 "consult_mode",              ""),
                    ("status",               "appointment_status",        "scheduled | checked_in | in_session | completed | cancelled | no_show | rescheduled"),
                    ("reason_for_visit",     "TEXT",                      "Patient-entered reason (max 300 chars)"),
                    ("is_followup",          "BOOLEAN",                   ""),
                    ("parent_appointment_id","UUID FK → appointments",    "Self-ref: prior appointment this follows up"),
                    ("booked_at",            "TIMESTAMPTZ",               ""),
                    ("scheduled_date",       "DATE",                      ""),
                    ("scheduled_time",       "TIME",                      ""),
                    ("checked_in_at",        "TIMESTAMPTZ",               "Digital / QR check-in time"),
                    ("session_started_at",   "TIMESTAMPTZ",               ""),
                    ("session_ended_at",     "TIMESTAMPTZ",               ""),
                    ("duration_min",         "SMALLINT",                  "Actual duration"),
                    ("noshow_marked_at",     "TIMESTAMPTZ",               ""),
                    ("cancelled_at",         "TIMESTAMPTZ",               ""),
                    ("cancellation_reason",  "TEXT",                      ""),
                    ("cancelled_by",         "UUID FK → users",           ""),
                    ("rescheduled_from_id",  "UUID FK → appointments",    "Original appointment before reschedule"),
                ],
            },
            {
                "name": "appointment_reports",
                "desc": "Files (PDF / images) uploaded by patient before a consultation.",
                "cols": [
                    ("id",             "UUID PK",                  ""),
                    ("appointment_id", "UUID FK → appointments",   ""),
                    ("file_url",       "TEXT",                      "S3 URL"),
                    ("file_name",      "VARCHAR(255)",               ""),
                    ("file_type",      "VARCHAR(20)",                "pdf | image"),
                    ("uploaded_by",    "UUID FK → users",           ""),
                    ("uploaded_at",    "TIMESTAMPTZ",                ""),
                ],
            },
            {
                "name": "waitlist_entries",
                "desc": "Waitlist for fully-booked slots. 30-min priority window triggered on cancellation.",
                "cols": [
                    ("id",                  "UUID PK",                  ""),
                    ("practitioner_id",     "UUID FK → practitioners",  ""),
                    ("patient_id",          "UUID FK → patients",       ""),
                    ("family_member_id",    "UUID FK → family_members", ""),
                    ("clinic_id",           "UUID FK → clinics",         ""),
                    ("mode",                "consult_mode",              ""),
                    ("waitlist_date",       "DATE",                      ""),
                    ("position",            "SMALLINT",                  "Queue position"),
                    ("notified_at",         "TIMESTAMPTZ",               "When patient was alerted of opening"),
                    ("priority_expires_at", "TIMESTAMPTZ",               "30-min window end"),
                    ("is_active",           "BOOLEAN",                   ""),
                    ("created_at",          "TIMESTAMPTZ",               ""),
                ],
            },
        ],
    },
    {
        "title": "Module 7 — Payments & Refunds",
        "tables": [
            {
                "name": "payments",
                "desc": "All financial transactions. All monetary values stored in paise (INR × 100).",
                "cols": [
                    ("id",                      "UUID PK",                  ""),
                    ("appointment_id",           "UUID FK → appointments",   "Set for booking payments"),
                    ("order_id",                 "UUID FK → orders",         "Set for medicine order payments"),
                    ("user_id",                  "UUID FK → users",          "Payer"),
                    ("amount_paise",             "INTEGER",                   "Total charged"),
                    ("consult_fee_paise",        "INTEGER",                   ""),
                    ("convenience_fee_paise",    "INTEGER",                   ""),
                    ("gst_paise",                "INTEGER",                   ""),
                    ("discount_paise",           "INTEGER",                   ""),
                    ("method",                   "payment_method",            "upi | card | net_banking | cod | wallet"),
                    ("status",                   "payment_status",            "pending | processing | success | failed | refunded"),
                    ("gateway",                  "VARCHAR(50)",                "razorpay | phonepe | stripe"),
                    ("gateway_order_id",         "VARCHAR(255)",               "Gateway reference"),
                    ("gateway_payment_id",       "VARCHAR(255)",               ""),
                    ("gateway_signature",        "VARCHAR(512)",               "Webhook HMAC signature"),
                    ("promo_code",               "VARCHAR(50)",                ""),
                    ("initiated_at",             "TIMESTAMPTZ",                ""),
                    ("confirmed_at",             "TIMESTAMPTZ",                ""),
                    ("failed_at",                "TIMESTAMPTZ",                ""),
                    ("failure_reason",           "TEXT",                       ""),
                ],
            },
            {
                "name": "refunds",
                "desc": "Refunds issued against a payment. Full or partial depending on cancellation policy.",
                "cols": [
                    ("id",                "UUID PK",             ""),
                    ("payment_id",        "UUID FK → payments",  ""),
                    ("amount_paise",      "INTEGER",              "Refund amount"),
                    ("reason",            "refund_reason",        "patient_cancelled | doctor_cancelled | no_show_doctor | payment_error | order_cancelled | admin_override"),
                    ("initiated_at",      "TIMESTAMPTZ",          ""),
                    ("processed_at",      "TIMESTAMPTZ",          ""),
                    ("gateway_refund_id", "VARCHAR(255)",          ""),
                    ("status",            "payment_status",       "pending | processing | success | failed | refunded"),
                ],
            },
        ],
    },
    {
        "title": "Module 8 — Consultations & EMR",
        "tables": [
            {
                "name": "consultations",
                "desc": "Consultation session record. One-to-one with appointment. Tracks session lifecycle and fallback state.",
                "cols": [
                    ("id",                 "UUID PK",                  ""),
                    ("appointment_id",     "UUID FK → appointments",   "UNIQUE – one consultation per appointment"),
                    ("practitioner_id",    "UUID FK → practitioners",  ""),
                    ("patient_id",         "UUID FK → patients",       ""),
                    ("family_member_id",   "UUID FK → family_members", ""),
                    ("mode",               "consult_mode",              ""),
                    ("fallback_used",      "session_fallback",          "none | audio_only | phone_call"),
                    ("identity_confirmed", "BOOLEAN",                   "ABHA identity confirmed at session start"),
                    ("session_start",      "TIMESTAMPTZ",               ""),
                    ("session_end",        "TIMESTAMPTZ",               ""),
                    ("duration_min",       "SMALLINT",                  "Actual call duration"),
                    ("recording_enabled",  "BOOLEAN",                   "Only enabled with explicit consent from both parties"),
                    ("recording_url",      "TEXT",                      "S3 URL if recorded"),
                    ("is_complete",        "BOOLEAN",                   ""),
                    ("created_at",         "TIMESTAMPTZ",               ""),
                ],
            },
            {
                "name": "emr_notes",
                "desc": "SOAP clinical notes + AYUSH assessment. Draft until finalized; finalized notes are locked (amendment-only).",
                "cols": [
                    ("id",               "UUID PK",                   ""),
                    ("consultation_id",  "UUID FK → consultations",   "UNIQUE"),
                    ("practitioner_id",  "UUID FK → practitioners",   ""),
                    ("patient_id",       "UUID FK → patients",        ""),
                    ("chief_complaint",  "TEXT",                       "S – pre-filled from booking intake"),
                    ("history_present",  "TEXT",                       "S – history of present illness"),
                    ("past_medical_hx",  "TEXT",                       "S"),
                    ("family_history",   "TEXT",                       "S"),
                    ("allergies",        "TEXT",                       "S"),
                    ("current_medications","TEXT",                      "S – from prior prescriptions"),
                    ("objective_findings","TEXT",                       "O – clinical examination"),
                    ("assessment",       "TEXT",                        "A – AYUSH diagnostic impression"),
                    ("plan",             "TEXT",                        "P – treatment plan"),
                    ("prakriti",         "prakriti_type",               "AYUSH: body constitution"),
                    ("nadi_pariksha",    "TEXT",                        "Pulse analysis notes"),
                    ("jihva_pariksha",   "TEXT",                        "Tongue examination findings"),
                    ("agni",             "agni_type",                   "Sama | Vishama | Teekshna | Manda"),
                    ("mala_notes",       "TEXT",                        "Optional – stool quality"),
                    ("mutra_notes",      "TEXT",                        "Optional – urine"),
                    ("drik_notes",       "TEXT",                        "Optional – eyes/vision"),
                    ("akruti_notes",     "TEXT",                        "Constitution observation"),
                    ("template_used",    "VARCHAR(100)",                "Named template if applied"),
                    ("is_draft",         "BOOLEAN",                     "TRUE until doctor finalizes"),
                    ("finalized_at",     "TIMESTAMPTZ",                  "Locked after this point"),
                    ("patient_summary",  "TEXT",                         "AI-generated plain-language summary for patient"),
                    ("summary_approved", "BOOLEAN",                      "Doctor approved patient summary"),
                    ("created_at",       "TIMESTAMPTZ",                  ""),
                    ("updated_at",       "TIMESTAMPTZ",                  "Auto-maintained by trigger"),
                ],
            },
            {
                "name": "emr_attachments",
                "desc": "Files attached to an EMR note (lab images, Prakriti charts, patient-uploaded reports).",
                "cols": [
                    ("id",          "UUID PK",              ""),
                    ("emr_note_id", "UUID FK → emr_notes",  ""),
                    ("file_url",    "TEXT",                   "S3 URL"),
                    ("file_name",   "VARCHAR(255)",            ""),
                    ("file_type",   "VARCHAR(20)",             ""),
                    ("uploaded_by", "UUID FK → users",        ""),
                    ("uploaded_at", "TIMESTAMPTZ",             ""),
                ],
            },
        ],
    },
    {
        "title": "Module 9 — Prescriptions",
        "tables": [
            {
                "name": "medicines",
                "desc": "Master AYUSH drug/formulation catalogue. Shared across all practitioners.",
                "cols": [
                    ("id",                  "UUID PK",           ""),
                    ("name",                "VARCHAR(255)",       "Full formulation name"),
                    ("generic_name",        "VARCHAR(255)",       ""),
                    ("discipline",          "ayush_discipline",   ""),
                    ("category",            "VARCHAR(100)",        "Churna | Kwath | Arka | Dilution | Majoon …"),
                    ("pharmacopoeia",       "VARCHAR(100)",        "API | UP | HP (pharmacopoeial reference)"),
                    ("standard_dose",       "VARCHAR(100)",        "Human-readable standard dose"),
                    ("standard_dose_min",   "NUMERIC(8,3)",        "Numeric lower bound"),
                    ("standard_dose_max",   "NUMERIC(8,3)",        "Numeric upper bound"),
                    ("dose_unit",           "VARCHAR(20)",         "mg | tsp | drops | tabs"),
                    ("is_controlled",       "BOOLEAN",             "Requires per-order re-authorization (no auto-refill)"),
                    ("is_active",           "BOOLEAN",             ""),
                    ("created_at",          "TIMESTAMPTZ",         ""),
                ],
            },
            {
                "name": "prescriptions",
                "desc": "Digital prescription issued per consultation. Signed with biometric/PIN. Versions created on amendment.",
                "cols": [
                    ("id",                     "UUID PK",                  ""),
                    ("consultation_id",         "UUID FK → consultations",  ""),
                    ("practitioner_id",         "UUID FK → practitioners",  ""),
                    ("patient_id",              "UUID FK → patients",       ""),
                    ("family_member_id",        "UUID FK → family_members", ""),
                    ("abha_locker_pushed",      "BOOLEAN",                   "Synced to ABHA health locker"),
                    ("status",                  "prescription_status",       "draft | finalized | signed | dispensed | cancelled"),
                    ("dietary_advice",          "TEXT",                      ""),
                    ("lifestyle_advice",        "TEXT",                      ""),
                    ("physical_activity",       "TEXT",                      ""),
                    ("followup_date",           "DATE",                      "Doctor-set follow-up date"),
                    ("signed_at",               "TIMESTAMPTZ",                "E-sign timestamp (immutable)"),
                    ("esign_method",            "VARCHAR(20)",                "biometric | pin"),
                    ("pdf_url",                 "TEXT",                       "S3 URL – downloadable prescription PDF"),
                    ("qr_code_url",             "TEXT",                       "QR linking to ABHA-registered prescription"),
                    ("version",                 "SMALLINT",                   "1 = original; incremented on each amendment"),
                    ("parent_prescription_id",  "UUID FK → prescriptions",    "Self-ref: links amendment to original"),
                    ("created_at",              "TIMESTAMPTZ",                ""),
                ],
            },
            {
                "name": "prescription_items",
                "desc": "Individual medicines on a prescription. medicine_name stored inline for immutability.",
                "cols": [
                    ("id",               "UUID PK",                    ""),
                    ("prescription_id",  "UUID FK → prescriptions",    ""),
                    ("medicine_id",      "UUID FK → medicines",         "Nullable – allows free-text medicines"),
                    ("medicine_name",    "VARCHAR(255)",                 "Stored directly; not a JOIN to prevent drift after signing"),
                    ("dose",             "VARCHAR(100)",                  "e.g. '1 tsp' or '500 mg'"),
                    ("frequency",        "VARCHAR(100)",                  "Once | Twice | Thrice | At bedtime | As needed"),
                    ("duration_days",    "SMALLINT",                     "Prescription duration"),
                    ("anupana",          "VARCHAR(150)",                  "Vehicle: Warm milk | Honey | Ghee | Empty stomach"),
                    ("special_instructions","TEXT",                      ""),
                    ("sort_order",       "SMALLINT",                     "Display order on prescription"),
                ],
            },
        ],
    },
    {
        "title": "Module 10 — Care Plans & Follow-ups",
        "tables": [
            {
                "name": "care_plans",
                "desc": "Post-consultation care plan linking prescription, tasks, and follow-up date.",
                "cols": [
                    ("id",              "UUID PK",                  ""),
                    ("consultation_id", "UUID FK → consultations",  "UNIQUE"),
                    ("prescription_id", "UUID FK → prescriptions",  ""),
                    ("patient_id",      "UUID FK → patients",       ""),
                    ("practitioner_id", "UUID FK → practitioners",  ""),
                    ("followup_date",   "DATE",                     "Doctor-recommended follow-up date"),
                    ("followup_reason", "TEXT",                     ""),
                    ("monitoring_notes","TEXT",                     "What to track between sessions"),
                    ("created_at",      "TIMESTAMPTZ",              ""),
                ],
            },
            {
                "name": "care_plan_tasks",
                "desc": "Patient homework tasks within a care plan (diet, exercise, medicine, etc.).",
                "cols": [
                    ("id",           "UUID PK",                  ""),
                    ("care_plan_id", "UUID FK → care_plans",     ""),
                    ("title",        "VARCHAR(255)",               ""),
                    ("description",  "TEXT",                       ""),
                    ("category",     "dinacharya_category",        "diet | exercise | mindfulness | medicine | sleep | hygiene"),
                    ("sort_order",   "SMALLINT",                   ""),
                ],
            },
            {
                "name": "follow_ups",
                "desc": "Tracks recommended follow-up per patient-practitioner pair. Drives nudge and AI check-in scheduling.",
                "cols": [
                    ("id",                    "UUID PK",                  ""),
                    ("patient_id",            "UUID FK → patients",       ""),
                    ("practitioner_id",       "UUID FK → practitioners",  ""),
                    ("care_plan_id",          "UUID FK → care_plans",     ""),
                    ("recommended_date",      "DATE",                     ""),
                    ("nudge_sent_at",         "TIMESTAMPTZ",              "First booking nudge sent"),
                    ("second_nudge_sent_at",  "TIMESTAMPTZ",              "48h second nudge"),
                    ("ai_checkin_sent_at",    "TIMESTAMPTZ",              "AI check-in sent at 7-day mark"),
                    ("booked_appointment_id", "UUID FK → appointments",   "Set once patient books"),
                    ("is_booked",             "BOOLEAN (computed)",       "Auto-computed from booked_appointment_id"),
                    ("created_at",            "TIMESTAMPTZ",              ""),
                ],
            },
        ],
    },
    {
        "title": "Module 11 — Health Records & Consent (ABDM)",
        "tables": [
            {
                "name": "health_records",
                "desc": "Patient health timeline. Includes internal records and ABDM-pulled external records.",
                "cols": [
                    ("id",               "UUID PK",                  ""),
                    ("patient_id",       "UUID FK → patients",       ""),
                    ("family_member_id", "UUID FK → family_members", ""),
                    ("record_type",      "health_record_type",        "consultation | prescription | lab | tracker | ai_summary | external_abdm"),
                    ("title",            "VARCHAR(255)",               ""),
                    ("summary",          "TEXT",                       ""),
                    ("consultation_id",  "UUID FK → consultations",   "Source link (only one FK will be set)"),
                    ("prescription_id",  "UUID FK → prescriptions",   ""),
                    ("source_facility",  "VARCHAR(255)",               "External: facility name"),
                    ("source_hfr_id",    "VARCHAR(30)",                "External: Health Facility Registry ID"),
                    ("abdm_record_id",   "VARCHAR(255)",               "ABDM-issued record identifier"),
                    ("practitioner_id",  "UUID FK → practitioners",   ""),
                    ("discipline",       "ayush_discipline",           ""),
                    ("record_date",      "DATE",                       "Date of the clinical event"),
                    ("is_external",      "BOOLEAN",                    "TRUE for ABDM-pulled records"),
                    ("created_at",       "TIMESTAMPTZ",                ""),
                ],
            },
            {
                "name": "health_record_attachments",
                "desc": "Files attached to a health record entry.",
                "cols": [
                    ("id",               "UUID PK",                     ""),
                    ("health_record_id", "UUID FK → health_records",    ""),
                    ("file_url",         "TEXT",                          "S3 URL"),
                    ("file_name",        "VARCHAR(255)",                   ""),
                    ("file_type",        "VARCHAR(20)",                    ""),
                    ("uploaded_at",      "TIMESTAMPTZ",                    ""),
                ],
            },
            {
                "name": "consent_grants",
                "desc": "ABDM consent audit trail. Append-only. Every grant, denial, and revocation is a new row. Non-deletable.",
                "cols": [
                    ("id",               "UUID PK",                  ""),
                    ("patient_id",       "UUID FK → patients",       ""),
                    ("family_member_id", "UUID FK → family_members", ""),
                    ("practitioner_id",  "UUID FK → practitioners",  ""),
                    ("appointment_id",   "UUID FK → appointments",   "Consent triggered by this booking"),
                    ("action",           "consent_action",            "granted | denied | revoked | expired"),
                    ("duration",         "consent_duration",          "session_only | 30_days | 90_days | until_revoked"),
                    ("record_types",     "health_record_type[]",      "Types of records consented"),
                    ("date_range_from",  "DATE",                      "Records from this date"),
                    ("date_range_to",    "DATE",                      "Records to this date"),
                    ("expires_at",       "TIMESTAMPTZ",                "Consent expiry timestamp"),
                    ("abdm_consent_id",  "VARCHAR(255)",               "ABDM-issued consent artefact ID"),
                    ("revoked_at",       "TIMESTAMPTZ",                ""),
                    ("revoked_reason",   "TEXT",                       ""),
                    ("created_at",       "TIMESTAMPTZ",                "Consent event timestamp (immutable)"),
                ],
            },
        ],
    },
    {
        "title": "Module 12 — Apothecary (Orders)",
        "tables": [
            {
                "name": "pharmacy_partners",
                "desc": "Verified pharmacy/fulfillment partner accounts.",
                "cols": [
                    ("id",             "UUID PK",           ""),
                    ("user_id",        "UUID FK → users",   "Partner's platform account"),
                    ("name",           "VARCHAR(255)",       ""),
                    ("license_number", "VARCHAR(100)",       "Drug license number"),
                    ("is_verified",    "BOOLEAN",            ""),
                    ("api_endpoint",   "TEXT",               "Partner API URL for order dispatch"),
                    ("contact_email",  "VARCHAR(255)",       ""),
                    ("contact_phone",  "VARCHAR(15)",        ""),
                    ("is_active",      "BOOLEAN",            ""),
                    ("created_at",     "TIMESTAMPTZ",        ""),
                ],
            },
            {
                "name": "patient_addresses",
                "desc": "Saved delivery addresses per patient.",
                "cols": [
                    ("id",            "UUID PK",             ""),
                    ("patient_id",    "UUID FK → patients",  ""),
                    ("label",         "VARCHAR(50)",          "Home | Work | Other"),
                    ("full_name",     "VARCHAR(255)",          "Delivery recipient name"),
                    ("phone",         "VARCHAR(15)",           ""),
                    ("address_line1", "VARCHAR(255)",           ""),
                    ("address_line2", "VARCHAR(255)",           ""),
                    ("city",          "VARCHAR(100)",           ""),
                    ("state",         "VARCHAR(100)",           ""),
                    ("pin_code",      "VARCHAR(10)",            ""),
                    ("is_default",    "BOOLEAN",                ""),
                    ("created_at",    "TIMESTAMPTZ",            ""),
                ],
            },
            {
                "name": "orders",
                "desc": "Medicine orders. Linked to a prescription when prescription items are purchased.",
                "cols": [
                    ("id",                  "UUID PK",                        ""),
                    ("patient_id",          "UUID FK → patients",             ""),
                    ("prescription_id",     "UUID FK → prescriptions",        "NULL for OTC / wellness items"),
                    ("pharmacy_id",         "UUID FK → pharmacy_partners",    ""),
                    ("address_id",          "UUID FK → patient_addresses",    ""),
                    ("status",              "order_status",                    "placed → verified → packed → dispatched → delivered"),
                    ("subtotal_paise",      "INTEGER",                         ""),
                    ("delivery_fee_paise",  "INTEGER",                         ""),
                    ("discount_paise",      "INTEGER",                         ""),
                    ("total_paise",         "INTEGER",                         ""),
                    ("promo_code",          "VARCHAR(50)",                      ""),
                    ("is_express",          "BOOLEAN",                          "Express delivery option"),
                    ("refill_order",        "BOOLEAN",                          "Reorder from prior prescription"),
                    ("parent_order_id",     "UUID FK → orders",                 "Self-ref for refill orders"),
                    ("tracking_number",     "VARCHAR(100)",                      "Logistics partner tracking number"),
                    ("logistics_partner",   "VARCHAR(100)",                      "Shiprocket | Delhivery etc."),
                    ("estimated_delivery",  "DATE",                              ""),
                    ("delivered_at",        "TIMESTAMPTZ",                       ""),
                    ("cancelled_at",        "TIMESTAMPTZ",                       ""),
                    ("cancellation_reason", "TEXT",                              ""),
                    ("created_at",          "TIMESTAMPTZ",                       ""),
                    ("updated_at",          "TIMESTAMPTZ",                       ""),
                ],
            },
            {
                "name": "order_items",
                "desc": "Individual line items in an order. Tracks substitutions and controlled-substance flags.",
                "cols": [
                    ("id",                    "UUID PK",                 ""),
                    ("order_id",              "UUID FK → orders",        ""),
                    ("medicine_id",           "UUID FK → medicines",      ""),
                    ("medicine_name",         "VARCHAR(255)",              "Stored for immutability"),
                    ("quantity",              "SMALLINT",                  ""),
                    ("unit_price_paise",      "INTEGER",                   ""),
                    ("total_price_paise",     "INTEGER",                   ""),
                    ("is_prescription_item",  "BOOLEAN",                   "Requires prescription verification"),
                    ("is_substitute",         "BOOLEAN",                   "Approved pharmacist substitute"),
                    ("substituted_for_id",    "UUID FK → order_items",     "Original item this substitutes"),
                    ("substitute_approved_by","UUID FK → users",           "Pharmacist who approved substitution"),
                    ("is_controlled",         "BOOLEAN",                   "High-dose / controlled formulation"),
                ],
            },
            {
                "name": "order_status_history",
                "desc": "Append-only delivery status trail for tracking.",
                "cols": [
                    ("id",         "UUID PK",             ""),
                    ("order_id",   "UUID FK → orders",    ""),
                    ("status",     "order_status",         ""),
                    ("notes",      "TEXT",                  ""),
                    ("updated_by", "UUID FK → users",      ""),
                    ("created_at", "TIMESTAMPTZ",           ""),
                ],
            },
            {
                "name": "refill_schedules",
                "desc": "Auto-refill schedule set by patient for a prescription item.",
                "cols": [
                    ("id",                    "UUID PK",                        ""),
                    ("patient_id",            "UUID FK → patients",             ""),
                    ("prescription_item_id",  "UUID FK → prescription_items",   ""),
                    ("frequency_days",        "SMALLINT",                        "Refill every N days"),
                    ("next_refill_date",      "DATE",                            ""),
                    ("is_active",             "BOOLEAN",                         ""),
                    ("created_at",            "TIMESTAMPTZ",                     ""),
                ],
            },
        ],
    },
    {
        "title": "Module 13 — Dinacharya & Wellness",
        "tables": [
            {
                "name": "dinacharya_plans",
                "desc": "Daily wellness routine plan per patient. Can be linked to a care plan.",
                "cols": [
                    ("id",           "UUID PK",               ""),
                    ("patient_id",   "UUID FK → patients",    ""),
                    ("care_plan_id", "UUID FK → care_plans",  "Optional link to clinical care plan"),
                    ("title",        "VARCHAR(255)",           ""),
                    ("is_active",    "BOOLEAN",                ""),
                    ("created_at",   "TIMESTAMPTZ",            ""),
                ],
            },
            {
                "name": "dinacharya_tasks",
                "desc": "Individual tasks within a daily routine plan.",
                "cols": [
                    ("id",          "UUID PK",                     ""),
                    ("plan_id",     "UUID FK → dinacharya_plans",  ""),
                    ("time_of_day", "TIME",                         "Scheduled time for this task"),
                    ("title",       "VARCHAR(255)",                  ""),
                    ("description", "TEXT",                          ""),
                    ("category",    "dinacharya_category",           "diet | exercise | mindfulness | medicine | sleep | hygiene"),
                    ("sort_order",  "SMALLINT",                      ""),
                ],
            },
            {
                "name": "habit_logs",
                "desc": "Daily completion log. One row per task per patient per date.",
                "cols": [
                    ("id",           "UUID PK",                       ""),
                    ("task_id",      "UUID FK → dinacharya_tasks",    ""),
                    ("patient_id",   "UUID FK → patients",            ""),
                    ("log_date",     "DATE",                           "UNIQUE with (task_id, patient_id)"),
                    ("completed_at", "TIMESTAMPTZ",                    "NULL if not done"),
                    ("is_done",      "BOOLEAN",                        ""),
                ],
            },
            {
                "name": "wellness_checkins",
                "desc": "Weekly AI-prompted wellness check-in responses.",
                "cols": [
                    ("id",             "UUID PK",                         ""),
                    ("patient_id",     "UUID FK → patients",              ""),
                    ("ai_session_id",  "UUID FK → ai_chat_sessions",      "Conversation that prompted the check-in"),
                    ("response",       "wellness_response",                "better | same | worse"),
                    ("notes",          "TEXT",                             ""),
                    ("checked_in_at",  "TIMESTAMPTZ",                      ""),
                ],
            },
        ],
    },
    {
        "title": "Module 14 — AI Chat (AyurSanvaad)",
        "tables": [
            {
                "name": "ai_chat_sessions",
                "desc": "AyurSanvaad AI chat sessions per patient. Logged for optional practitioner review.",
                "cols": [
                    ("id",                       "UUID PK",              ""),
                    ("patient_id",               "UUID FK → patients",   ""),
                    ("title",                    "VARCHAR(255)",          "Auto-generated or user-set"),
                    ("is_emergency",             "BOOLEAN",               "TRUE if emergency keywords detected"),
                    ("practitioner_cta_shown",   "BOOLEAN",               "Whether 'Book a doctor' CTA was shown"),
                    ("created_at",               "TIMESTAMPTZ",           ""),
                    ("last_message_at",           "TIMESTAMPTZ",           ""),
                ],
            },
            {
                "name": "ai_chat_messages",
                "desc": "Individual messages within an AI session.",
                "cols": [
                    ("id",           "UUID PK",                       ""),
                    ("session_id",   "UUID FK → ai_chat_sessions",    ""),
                    ("role",         "VARCHAR(10)",                    "user | ai"),
                    ("content",      "TEXT",                           ""),
                    ("is_emergency", "BOOLEAN",                        "Flagged if this message triggered emergency path"),
                    ("sent_at",      "TIMESTAMPTZ",                    ""),
                ],
            },
        ],
    },
    {
        "title": "Module 15 — Bounded Messaging",
        "tables": [
            {
                "name": "bounded_messages",
                "desc": "Doctor–patient messages. Only available within 48h post-consultation. For clarification and adverse reaction reporting only.",
                "cols": [
                    ("id",                   "UUID PK",                  ""),
                    ("consultation_id",       "UUID FK → consultations",  ""),
                    ("sender_user_id",        "UUID FK → users",          ""),
                    ("direction",             "message_direction",         "patient_to_doctor | doctor_to_patient"),
                    ("content",               "TEXT",                      ""),
                    ("has_attachment",        "BOOLEAN",                   ""),
                    ("attachment_url",        "TEXT",                      "S3 URL"),
                    ("is_adverse_reaction",   "BOOLEAN",                   "Flags pharmacovigilance events; notifies admin"),
                    ("sent_at",               "TIMESTAMPTZ",               ""),
                    ("read_at",               "TIMESTAMPTZ",               ""),
                    ("responded_at",          "TIMESTAMPTZ",               ""),
                ],
            },
        ],
    },
    {
        "title": "Module 16 — Notifications & Reminders",
        "tables": [
            {
                "name": "notifications",
                "desc": "All platform notifications sent to users via push, SMS, email, or in-app.",
                "cols": [
                    ("id",             "UUID PK",             ""),
                    ("user_id",        "UUID FK → users",     "Recipient"),
                    ("channel",        "notification_channel","push | sms | email | in_app"),
                    ("type",           "reminder_type",        "Category of notification"),
                    ("title",          "VARCHAR(255)",          ""),
                    ("body",           "TEXT",                  ""),
                    ("deep_link",      "TEXT",                  "App deep link URL"),
                    ("reference_id",   "UUID",                  "Generic FK to source entity"),
                    ("reference_type", "VARCHAR(50)",           "appointments | orders | prescriptions …"),
                    ("is_read",        "BOOLEAN",               ""),
                    ("sent_at",        "TIMESTAMPTZ",           "NULL if not yet dispatched"),
                    ("created_at",     "TIMESTAMPTZ",           ""),
                ],
            },
            {
                "name": "reminders",
                "desc": "Scheduled future notifications to be fired by cron (24h, 1h, follow-up, refill, etc.).",
                "cols": [
                    ("id",             "UUID PK",             ""),
                    ("user_id",        "UUID FK → users",     ""),
                    ("type",           "reminder_type",        ""),
                    ("reference_id",   "UUID",                  ""),
                    ("reference_type", "VARCHAR(50)",           ""),
                    ("fire_at",        "TIMESTAMPTZ",           "When this reminder should be dispatched"),
                    ("fired_at",       "TIMESTAMPTZ",           "NULL until dispatched"),
                    ("is_cancelled",   "BOOLEAN",               ""),
                    ("created_at",     "TIMESTAMPTZ",           ""),
                ],
            },
        ],
    },
    {
        "title": "Module 17 — Ratings",
        "tables": [
            {
                "name": "ratings",
                "desc": "Patient ratings per consultation. Triggers auto-update of practitioner rating_avg.",
                "cols": [
                    ("id",               "UUID PK",                  ""),
                    ("consultation_id",  "UUID FK → consultations",  "UNIQUE – one rating per consultation"),
                    ("patient_id",       "UUID FK → patients",       ""),
                    ("practitioner_id",  "UUID FK → practitioners",  ""),
                    ("stars",            "SMALLINT",                  "1–5 stars"),
                    ("review_text",      "TEXT",                      "Optional written review"),
                    ("is_visible",       "BOOLEAN",                   "Can be hidden by admin for policy violations"),
                    ("created_at",       "TIMESTAMPTZ",               "Shown 24h after consultation"),
                ],
            },
        ],
    },
    {
        "title": "Module 18 — Audit Log",
        "tables": [
            {
                "name": "audit_logs",
                "desc": "Append-only compliance and security trail. Consent events are automatically inserted via trigger.",
                "cols": [
                    ("id",             "UUID PK",             ""),
                    ("actor_user_id",  "UUID FK → users",     "Who performed the action (NULL for system events)"),
                    ("action",         "VARCHAR(100)",          "e.g. consent.granted | record.viewed | prescription.signed"),
                    ("entity_type",    "VARCHAR(50)",           "Table name of the affected entity"),
                    ("entity_id",      "UUID",                  "ID of the affected row"),
                    ("patient_id",     "UUID FK → patients",   "For patient-data events"),
                    ("ip_address",     "INET",                  "Requestor IP"),
                    ("user_agent",     "TEXT",                  ""),
                    ("metadata",       "JSONB",                  "Additional structured context"),
                    ("created_at",     "TIMESTAMPTZ",           "Immutable event timestamp"),
                ],
            },
        ],
    },
]

ENUMS = [
    ("user_role",             ["patient","practitioner","clinic_admin","receptionist","pharmacy","super_admin"]),
    ("ayush_discipline",      ["Ayurveda","Yoga","Naturopathy","Unani","Siddha","Homeopathy"]),
    ("verification_status",   ["pending","under_review","verified","rejected"]),
    ("consult_mode",          ["video","clinic"]),
    ("appointment_status",    ["scheduled","checked_in","in_session","completed","cancelled","no_show","rescheduled"]),
    ("session_fallback",      ["none","audio_only","phone_call"]),
    ("consent_action",        ["granted","denied","revoked","expired"]),
    ("consent_duration",      ["session_only","30_days","90_days","until_revoked"]),
    ("health_record_type",    ["consultation","prescription","lab","tracker","ai_summary","external_abdm"]),
    ("order_status",          ["placed","prescription_verified","packed","dispatched","out_for_delivery","delivered","cancelled","refund_initiated","refunded"]),
    ("payment_status",        ["pending","processing","success","failed","refunded"]),
    ("payment_method",        ["upi","card","net_banking","cod","wallet"]),
    ("refund_reason",         ["patient_cancelled","doctor_cancelled","no_show_doctor","payment_error","order_cancelled","admin_override"]),
    ("prakriti_type",         ["Vata","Pitta","Kapha","Vata-Pitta","Pitta-Kapha","Vata-Kapha","Tridosha"]),
    ("agni_type",             ["Sama","Vishama","Teekshna","Manda"]),
    ("dinacharya_category",   ["diet","exercise","mindfulness","medicine","sleep","hygiene"]),
    ("reminder_type",         ["appointment_24h","appointment_1h","appointment_15m","follow_up_nudge","follow_up_ai_checkin","medicine_dose","refill_due","wellness_checkin","order_status","re_engagement"]),
    ("notification_channel",  ["push","sms","email","in_app"]),
    ("gender",                ["male","female","other","prefer_not_to_say"]),
    ("relationship",          ["self","spouse","parent","child","sibling","other"]),
    ("prescription_status",   ["draft","finalized","signed","dispensed","cancelled"]),
    ("message_direction",     ["patient_to_doctor","doctor_to_patient"]),
    ("wellness_response",     ["better","same","worse"]),
    ("slot_status",           ["open","locked","booked","blocked","completed"]),
]


class PDF(FPDF):
    def cell(self, w=0, h=0, txt="", border=0, new_x=XPos.RIGHT, new_y=YPos.TOP, align="L", fill=False, link="", center=False):
        return super().cell(w, h, s(txt), border=border, new_x=new_x, new_y=new_y, align=align, fill=fill, link=link)

    def multi_cell(self, w, h=0, txt="", border=0, align="J", fill=False, new_x=XPos.LMARGIN, new_y=YPos.NEXT, **kwargs):
        return super().multi_cell(w, h, s(txt), border=border, align=align, fill=fill, new_x=new_x, new_y=new_y, **kwargs)

    def header(self):
        pass

    def footer(self):
        self.set_y(-13)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*C_MUTED)
        self.cell(0, 8, f"{SITE_NAME} — Relational Database Schema  ·  Page {self.page_no()}", align="C")
        self.set_text_color(*C_TEXT)

    def cover_page(self):
        self.add_page()
        # full-bleed header block
        self.set_fill_color(*C_HEADER_BG)
        self.rect(0, 0, 210, 85, "F")

        self.set_y(22)
        self.set_font("Helvetica", "B", 28)
        self.set_text_color(*C_HEADER_TEXT)
        self.cell(0, 12, SITE_NAME, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_font("Helvetica", "", 13)
        self.cell(0, 8, "Relational Database Schema", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)
        self.set_font("Helvetica", "I", 10)
        self.cell(0, 7, "India's First AYUSH Digital Health Platform", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_y(95)
        self.set_text_color(*C_TEXT)

        # stats boxes
        stats = [
            ("18", "Modules"),
            ("55", "Tables"),
            ("24", "Enums"),
            ("200+","Columns"),
        ]
        box_w = 40
        total_w = box_w * 4 + 3 * 4
        start_x = (210 - total_w) / 2
        self.set_x(start_x)
        for val, lbl in stats:
            x = self.get_x()
            y = self.get_y()
            self.set_fill_color(*C_ENUM_BG)
            self.set_draw_color(*C_ENUM_BORDER)
            self.set_line_width(0.4)
            self.rect(x, y, box_w, 22, "FD")
            self.set_font("Helvetica", "B", 20)
            self.set_text_color(*C_MODULE_BG)
            self.set_xy(x, y + 2)
            self.cell(box_w, 10, val, align="C")
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*C_MUTED)
            self.set_xy(x, y + 12)
            self.cell(box_w, 8, lbl, align="C")
            self.set_xy(x + box_w + 4, y)
        self.ln(32)

        # description
        self.set_text_color(*C_TEXT)
        self.set_font("Helvetica", "", 10)
        self.set_x(20)
        desc = (
            "This document contains the complete PostgreSQL relational database schema for the "
            f"{SITE_NAME} platform — covering user identity, ABHA/ABDM integration, practitioner "
            "onboarding and scheduling, appointments, teleconsultations, EMR (SOAP + AYUSH "
            "assessment), digital prescriptions, care plans, health records, ABDM consent "
            "management, medicine orders (Apothecary), Dinacharya wellness tracking, AI chat, "
            "payments, notifications, and audit logging."
        )
        self.multi_cell(170, 5.5, desc, align="J")
        self.ln(6)

        # module list
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*C_MODULE_BG)
        self.cell(170, 7, "Schema Modules", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*C_TEXT)
        for i, m in enumerate(MODULES, 1):
            title = m["title"].split("—")[1].strip() if "—" in m["title"] else m["title"]
            tbl_count = len(m["tables"])
            self.set_x(20)
            self.cell(8, 6, f"{i}.", )
            self.cell(130, 6, title)
            self.set_text_color(*C_MUTED)
            self.cell(30, 6, f"{tbl_count} table{'s' if tbl_count > 1 else ''}")
            self.set_text_color(*C_TEXT)
            self.ln()

        self.ln(6)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*C_MUTED)
        self.set_x(20)
        self.cell(170, 5, "Generated: June 2026  ·  Version 1.0  ·  PostgreSQL 15+")

    def enum_page(self):
        self.add_page()
        self._module_bar("Enumerations (PostgreSQL ENUMs)")
        self.ln(4)

        col1_x = 14
        col2_x = 112
        col_w  = 90
        y_start = self.get_y()
        col = 0

        for name, values in ENUMS:
            x = col1_x if col == 0 else col2_x
            y = self.get_y()
            if y > 258:
                if col == 0:
                    col = 1
                    self.set_y(y_start)
                else:
                    self.add_page()
                    self._module_bar("Enumerations (continued)")
                    self.ln(4)
                    col = 0
                    y_start = self.get_y()

            self.set_xy(x, self.get_y())
            # header
            self.set_fill_color(*C_ENUM_BORDER)
            self.set_font("Helvetica", "B", 8)
            self.set_text_color(*C_HEADER_TEXT)
            self.cell(col_w, 6, f"  {name}", fill=True)
            self.ln()
            # values
            self.set_fill_color(*C_ENUM_BG)
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*C_TEXT)
            self.set_draw_color(*C_ENUM_BORDER)
            self.set_line_width(0.2)
            val_str = "  " + "  ·  ".join(values)
            # wrap manually
            lines = textwrap.wrap(val_str, width=52)
            for li, line in enumerate(lines):
                self.set_xy(x, self.get_y())
                fill = li % 2 == 0
                self.set_fill_color(*(C_ENUM_BG if fill else C_TABLE_WHITE))
                self.cell(col_w, 5, line, fill=True, border="LR")
            # bottom border
            self.set_xy(x, self.get_y())
            self.cell(col_w, 0, "", border="T")
            self.ln(4)

            if col == 0:
                col = 1
                self.set_y(y_start + (self.get_y() - y_start) if self.get_y() > y_start else self.get_y())
                # track max y per pair
                self._enum_col0_y = self.get_y()
            else:
                col = 0
                y_after = max(self.get_y(), getattr(self, "_enum_col0_y", self.get_y()))
                self.set_y(y_after)
                y_start = self.get_y()

    def _module_bar(self, title):
        self.set_fill_color(*C_MODULE_BG)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*C_MODULE_TEXT)
        self.set_x(0)
        self.cell(210, 8, f"  {title}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*C_TEXT)

    def table_page(self, tbl):
        name = tbl["name"]
        desc = tbl["desc"]
        cols = tbl["cols"]

        # column widths: col_name | type | description
        W = [52, 52, 79]
        HEADERS = ["Column", "Type", "Description"]

        # check if fits on current page
        needed = 8 + 6 + 6 + len(cols) * 5.5 + 6
        if self.get_y() + needed > 272:
            self.add_page()

        y0 = self.get_y()

        # table name bar
        self.set_fill_color(*C_HEADER_BG)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*C_HEADER_TEXT)
        self.set_x(14)
        self.cell(183, 7, f"  {name}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # description
        self.set_x(14)
        self.set_fill_color(230, 240, 233)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(60, 90, 65)
        self.cell(183, 5.5, f"  {desc}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # header row
        self.set_x(14)
        self.set_fill_color(*C_TABLE_HDR)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*C_TEXT)
        self.set_draw_color(*C_BORDER)
        self.set_line_width(0.2)
        for h, w in zip(HEADERS, W):
            self.cell(w, 6, f" {h}", fill=True, border=1)
        self.ln()

        # data rows
        self.set_font("Helvetica", "", 7.5)
        for i, (col_name, col_type, col_desc) in enumerate(cols):
            if self.get_y() > 272:
                self.add_page()
                # re-draw header
                self.set_x(14)
                self.set_fill_color(*C_TABLE_HDR)
                self.set_font("Helvetica", "B", 8)
                for h, w in zip(HEADERS, W):
                    self.cell(w, 6, f" {h}", fill=True, border=1)
                self.ln()
                self.set_font("Helvetica", "", 7.5)

            self.set_x(14)
            fill_color = C_TABLE_ALT if i % 2 == 0 else C_TABLE_WHITE
            self.set_fill_color(*fill_color)
            self.set_text_color(*C_TEXT)

            # col name
            self.set_font("Helvetica", "B", 7.5)
            self.cell(W[0], 5.5, f" {col_name}", fill=True, border=1)
            # type
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*C_KEYWORD)
            self.cell(W[1], 5.5, f" {col_type}", fill=True, border=1)
            # desc
            self.set_text_color(*C_MUTED)
            # truncate if too long
            max_chars = 60
            display_desc = col_desc if len(col_desc) <= max_chars else col_desc[:max_chars - 1] + "…"
            self.cell(W[2], 5.5, f" {display_desc}", fill=True, border=1)
            self.ln()

        self.set_text_color(*C_TEXT)
        self.ln(4)

    def render_modules(self):
        for mod in MODULES:
            self.add_page()
            self._module_bar(mod["title"])
            self.ln(4)
            for tbl in mod["tables"]:
                self.table_page(tbl)


def build():
    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)

    pdf.cover_page()
    pdf.enum_page()
    pdf.render_modules()

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"{SITE_NAME}_DB_Schema.pdf")
    pdf.output(out)
    print(f"PDF written → {out}")


if __name__ == "__main__":
    build()
