from __future__ import annotations

import re
from typing import Any

from ..config import get_settings
from ..data import RegulationData
from .store import PolicyChunk, store

INJECTION_PATTERNS = [
    r"ignore (all )?(previous|prior|above) instructions",
    r"disregard (the )?(system|previous|above)",
    r"reveal (the )?(system|developer) prompt",
    r"you are now",
    r"act as (an? )?(admin|developer|system)",
    r"\bDAN\b",
    r"تجاهل (كل )?(التعليمات|الأوامر) (السابقة|السابقه)",
    r"اكشف (التعليمات|البرومبت|النظام)",
    r"أنت الآن",
    r"تظاهر بأنك",
]
INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)

AR_STOPWORDS = {
    "من", "في", "على", "عن", "الى", "إلى", "ما", "هل", "هو", "هي", "و", "او", "أو",
    "التي", "الذي", "مع", "كان", "كانت", "يجب", "يمكن", "كم", "متي", "متى", "كيف",
    "لائحة", "اللائحة", "المادة", "مادة", "بخصوص", "حول", "هذا", "هذه", "ذلك",
}
EN_STOPWORDS = {
    "the", "a", "an", "of", "is", "are", "what", "how", "when", "can", "i", "to",
    "in", "on", "for", "and", "or", "about", "does", "do", "my", "with", "by",
    "bylaw", "bylaws", "regulation", "article",
}


def detect_language(question: str) -> str:
    arabic = len(re.findall(r"[\u0600-\u06FF]", question))
    return "ar" if arabic > 2 else "en"


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[\w\u0600-\u06FF]+", text.lower())
    return {w for w in words if len(w) > 2 and w not in AR_STOPWORDS and w not in EN_STOPWORDS}


def _citation(chunk: PolicyChunk) -> dict[str, Any]:
    return {
        "article": chunk.article_no,
        "clause": chunk.clause_no,
        "page": chunk.page_no,
        "source": chunk.source,
        "title": chunk.title,
    }


def _facts(data: RegulationData) -> list[dict[str, Any]]:
    max_load = data.load.get("max_by_cgpa") or []
    load_text = "، ".join(
        f"CGPA ≥ {row['cgpa_min']}: {row['max']}" for row in reversed(max_load)
    )
    return [
        {
            "keys": ["العبء", "الحد الأقصى", "ساعات", "ساعة", "load", "maximum", "credits"],
            "ar": (
                f"الحد الأقصى للعبء الدراسي حسب المعدل التراكمي: {load_text} ساعة. "
                f"الحد الأدنى {data.load.get('min_regular', 9)} ساعات ويُعفى إذا تبقى أقل من "
                f"{data.load.get('min_waived_if_remaining_credits_lt', 9)} ساعات للتخرج. "
                f"الفصل الصيفي بحد أقصى {data.load.get('summer_max', 9)} ساعات."
            ),
            "en": (
                f"Maximum load by CGPA: {load_text} credits. Minimum is {data.load.get('min_regular', 9)} "
                f"(waived when fewer than {data.load.get('min_waived_if_remaining_credits_lt', 9)} credits remain). "
                f"Summer maximum is {data.load.get('summer_max', 9)} credits."
            ),
            "rule_code": "R-LOAD-MAX",
        },
        {
            "keys": ["مشروع التخرج", "project", "graduation project"],
            "ar": (
                f"يُسجَّل مشروع التخرج في المستوى الرابع بعد اجتياز {data.graduation_project.get('min_passed_credit_hours', 96)} "
                "ساعة معتمدة (70%) مع استيفاء المتطلب السابق، ويُسجَّل في الخريف أو الربيع فقط."
            ),
            "en": (
                f"The graduation project is registered at level 4 after passing "
                f"{data.graduation_project.get('min_passed_credit_hours', 96)} credits (70%) and its prerequisite; "
                "registration is only in fall or spring."
            ),
            "rule_code": "R-PROJECT-13.7",
        },
        {
            "keys": ["التدريب", "الميداني", "training", "field"],
            "ar": (
                f"التدريب الميداني 0 ساعة ولا يدخل في GPA، ويشترط اجتياز {data.field_training.get('min_passed_credit_hours', 68)} "
                f"ساعة، ومدته {data.field_training.get('duration_weeks', 6)} أسابيع، ويُسمح به صيفاً."
            ),
            "en": (
                f"Field training is 0 credits and excluded from GPA; it requires "
                f"{data.field_training.get('min_passed_credit_hours', 68)} passed credits, lasts "
                f"{data.field_training.get('duration_weeks', 6)} weeks, and may be taken in summer."
            ),
            "rule_code": "R-TRAIN-13",
        },
        {
            "keys": ["التخرج", "graduation", "graduate", "136"],
            "ar": (
                f"التخرج يتطلب {data.graduation.get('min_credits', 136)} ساعة، ومعدلاً تراكمياً لا يقل عن "
                f"{data.graduation.get('min_cgpa', 2.0)}، واجتياز المقررات غير المحسوبة (التدريب الميداني)، "
                f"واستيفاء المجموعات الاختيارية والمشروع، و{data.graduation.get('min_regular_semesters', 6)} فصول نظامية على الأقل."
            ),
            "en": (
                f"Graduation requires {data.graduation.get('min_credits', 136)} credits, CGPA >= "
                f"{data.graduation.get('min_cgpa', 2.0)}, all non-credit requirements (field training), "
                f"satisfied elective pools and project, and at least {data.graduation.get('min_regular_semesters', 6)} regular semesters."
            ),
            "rule_code": "R-GRAD-17",
        },
        {
            "keys": ["الشرف", "honors", "honour", "3.00"],
            "ar": (
                f"مرتبة الشرف: CGPA ≥ {data.honors.get('min_cgpa', 3.0)}، وفي حدود "
                f"{data.honors.get('max_regular_semesters', 8)} فصول نظامية، دون رسوب أو حرمان."
            ),
            "en": (
                f"Honors: CGPA >= {data.honors.get('min_cgpa', 3.0)}, within "
                f"{data.honors.get('max_regular_semesters', 8)} regular semesters, with no failure or deprivation."
            ),
            "rule_code": "R-HONORS-16.4",
        },
        {
            "keys": ["الإنذار", "المنذر", "probation", "warning", "2.00"],
            "ar": (
                f"يكون الطالب تحت الملاحظة الأكاديمية إذا كان CGPA أقل من {data.probation.get('cgpa_lt', 2.0)} "
                "بعد أي فصل دراسي عدا الفصل الأول. الفصل بعد 4 إنذارات متتالية أو 6 إنذارات إجمالية أو تجاوز المدة."
            ),
            "en": (
                f"A student is on probation when CGPA is below {data.probation.get('cgpa_lt', 2.0)} after any semester "
                "except the first. Dismissal follows 4 consecutive or 6 total warnings, or exceeding max duration."
            ),
            "rule_code": "R-PROB-16.5",
        },
        {
            "keys": ["الانسحاب", "withdraw", "withdrawal", "W"],
            "ar": (
                f"الانسحاب (W) حتى نهاية الأسبوع {data.dates.get('withdraw_until_week', 10)} بشرط عدم تجاوز حد الغياب "
                "وعدم مخالفة حدود العبء؛ بعد ذلك يُسجَّل F. لا ينطبق على الفصل الصيفي."
            ),
            "en": (
                f"Withdrawal (W) is allowed until the end of week {data.dates.get('withdraw_until_week', 10)} if the "
                "absence limit and load limits are respected; afterwards it is recorded as F. It does not apply to summer."
            ),
            "rule_code": "R-DROP-10",
        },
        {
            "keys": ["الحضور", "الغياب", "الحرمان", "attendance", "75"],
            "ar": (
                f"الحد الأدنى للحضور {data.attendance_min_pct}%؛ بعد إنذارين متتاليين يُحرم الطالب من الامتحان النهائي "
                "ويُسجَّل F، والغياب بعذر مقبول يُسجَّل W."
            ),
            "en": (
                f"Minimum attendance is {data.attendance_min_pct}%; after two successive warnings the student is barred "
                "from the final exam and receives F; an excused absence is recorded as W."
            ),
            "rule_code": "R-ATT-11",
        },
        {
            "keys": ["التقييم", "الامتحان", "درجة النجاح", "النجاح", "الرسوب", "assessment", "exam", "pass", "fail", "50", "25"],
            "ar": (
                "توزيع الدرجات: أعمال فصلية 25 + امتحان نصفي 25 + امتحان نهائي 50. الرسوب إذا كانت درجة "
                f"الامتحان النهائي أقل من {data.assessment.get('final_min_pct_of_final_exam', 30)}% أو المجموع أقل من "
                f"{data.assessment.get('pass_total_pct', 50)}%."
            ),
            "en": (
                "Assessment: coursework 25 + midterm 25 + final 50. A student fails with less than "
                f"{data.assessment.get('final_min_pct_of_final_exam', 30)}% on the final exam or less than "
                f"{data.assessment.get('pass_total_pct', 50)}% overall."
            ),
            "rule_code": "R-EXAM-15",
        },
        {
            "keys": ["التحويل", "transfer", "40%"],
            "ar": f"لا يجوز تحويل أكثر من {data.transfer.get('max_transferable_pct', 40)}% من ساعات البرنامج.",
            "en": f"No more than {data.transfer.get('max_transferable_pct', 40)}% of program credits may be transferred.",
            "rule_code": "R-ADM-05.2",
        },
        {
            "keys": ["المدة", "مدة الدراسة", "مدة", "duration", "16", "semesters"],
            "ar": (
                f"المدة القصوى {data.durations.get('max_regular_semesters', 16)} فصلاً نظامياً (8 سنوات) "
                "دون احتساب فصول الإيقاف المعتمدة."
            ),
            "en": (
                f"Maximum duration is {data.durations.get('max_regular_semesters', 16)} regular semesters (8 years), "
                "excluding approved suspensions."
            ),
            "rule_code": "R-GRAD-DURATION",
        },
        {
            "keys": ["الإيقاف", "suspension", "4", "6"],
            "ar": (
                f"يُطلب الإيقاف قبل الامتحانات بشهر على الأقل، وبحد أقصى {data.durations.get('suspension_max_consecutive', 4)} "
                f"فصول متتالية أو {data.durations.get('suspension_max_total', 6)} فصول إجمالاً."
            ),
            "en": (
                f"Suspension must be requested at least one month before finals, capped at "
                f"{data.durations.get('suspension_max_consecutive', 4)} consecutive or "
                f"{data.durations.get('suspension_max_total', 6)} total semesters."
            ),
            "rule_code": "R-SUSP-14",
        },
        {
            "keys": ["الإعادة", "إعادة المقرر", "إعادة", "repeat", "83", "improvement", "تحسين", "رفع المعدل", "تحسين المعدل", "improve"],
            "ar": (
                "إعادة المقرر الراسب أو إعادة مقرر نجح فيه الطالب لتحسين المعدل: تُحتسب الدرجة الفعلية بحد أقصى "
                f"{data.gpa.get('repeat_cap_pct', 83)}% (B، 3.00)، وتُحتسب ساعات المقرر مرة واحدة. "
                "التحسين مسموح بلا حد إذا كان CGPA < 2.00، وبحد 3 مقررات إذا كان CGPA ≥ 2.00."
            ),
            "en": (
                "A failed-course repeat or a CGPA-improvement repeat records the actual grade capped at "
                f"{data.gpa.get('repeat_cap_pct', 83)}% (B, 3.00), with credits counted once. Improvement is unlimited "
                "when CGPA < 2.00 and capped at 3 courses when CGPA >= 2.00."
            ),
            "rule_code": "R-REPEAT-CAP-16.11",
        },
        {
            "keys": ["التسجيل المتأخر", "الحذف والإضافة", "الحذف والاضافة", "الحذف", "الإضافة", "add/drop", "add", "drop", "registration", "التسجيل", "late registration"],
            "ar": (
                f"التسجيل المتأخر والحذف والإضافة متاحان حتى نهاية الأسبوع {data.dates.get('late_registration_week', 2)} "
                f"من الفصل، وبعدها يُثبَّت الجدول. ويمكن الانسحاب بتقدير W حتى نهاية الأسبوع "
                f"{data.dates.get('withdraw_until_week', 10)} وفق ضوابط الغياب والعبء. أما مواعيد فتح التسجيل "
                "وتواريخ بداية الدراسة والامتحانات فيعلنها مكتب التسجيل بالكلية كل فصل."
            ),
            "en": (
                f"Late registration, add, and drop are open until the end of week "
                f"{data.dates.get('late_registration_week', 2)}, after which the schedule is fixed. Withdrawal with a "
                f"W grade is possible until the end of week {data.dates.get('withdraw_until_week', 10)}, subject to "
                "attendance and load limits. Official registration, term-start, and exam dates are announced by the "
                "college registrar each term."
            ),
            "rule_code": "R-DROP-10",
        },
        {
            "keys": ["الفصل الصيفي", "الصيفي", "summer"],
            "ar": (
                f"الفصل الصيفي اختياري ومكثف ({data.dates.get('summer_weeks', 8)} أسابيع) بحد أقصى "
                f"{data.load.get('summer_max', 9)} ساعات. يُسمح به لمن لم يستوفِ الحد الأقصى للعبء، أو لإعادة المقررات، "
                "أو لرفع CGPA، أو للانتقال إلى مستوى أعلى، أو لاستكمال التخرج. مشروع التخرج لا يُسجَّل في الصيف."
            ),
            "en": (
                f"The summer term is optional and intensive ({data.dates.get('summer_weeks', 8)} weeks) with a maximum "
                f"of {data.load.get('summer_max', 9)} credits. It is allowed to make up load, repeat courses, raise "
                "CGPA, move to a higher level, or complete graduation. The graduation project is not offered in summer."
            ),
            "rule_code": "R-ACA-06.3",
        },
        {
            "keys": ["المستويات", "المستوى", "level", "freshman", "sophomore", "junior", "senior"],
            "ar": (
                "توزيع المستويات حسب الساعات المجتازة: المستوى الأول أقل من 26 ساعة، والثاني من 26 إلى أقل من 62، "
                "والثالث من 62 إلى أقل من 96، والرابع من 96 إلى أقل من 136 ساعة معتمدة."
            ),
            "en": (
                "Levels are based on passed credits: Freshman below 26, Sophomore 26 to less than 62, "
                "Junior 62 to less than 96, and Senior 96 to less than 136 credits."
            ),
            "rule_code": "R-LVL-12",
        },
        {
            "keys": ["التسجيل المتزامن", "المتطلب السابق", "متطلب سابق", "prerequisite", "co-requisite"],
            "ar": (
                "لا يُسجَّل مقرر له متطلب سابق إلا بعد دراسته والنجاح فيه. ويُسمح بالتسجيل المتزامن استثناءً إذا كان "
                "يؤثر على التخرج وبموافقة المرشد، ويُراجع مجلس الكلية إذا كان الطالب راسبًا في المتطلب (REVIEW_REQUIRED)."
            ),
            "en": (
                "A course with a prerequisite cannot be registered until the prerequisite is studied and passed. "
                "A co-requisite exception is allowed only when it affects graduation, with advisor approval; a failed "
                "prerequisite is referred to the college council (REVIEW_REQUIRED)."
            ),
            "rule_code": "R-REG-09.5",
        },
        {
            "keys": ["جدول التقديرات", "التقديرات", "الدرجات", "grade", "grading", "A+"],
            "ar": (
                "التقديرات من A+ (96% وأعلى، 4.00 نقطة) إلى F (أقل من 50%، 0.00). أمثلة: A من 92 إلى 96، "
                "B+ من 84 إلى 88، B من 80 إلى 84، C+ من 72 إلى 76، C من 68 إلى 72، D من 55 إلى 60، "
                "D- من 50 إلى 55. الجدول الكامل في المادة 16 من اللائحة."
            ),
            "en": (
                "Grades run from A+ (96%+, 4.00 points) to F (below 50%, 0.00). Examples: A 92-96, B+ 84-88, "
                "B 80-84, C+ 72-76, C 68-72, D 55-60, D- 50-55. The full table is in Article 16 of the bylaw."
            ),
            "rule_code": "R-GRADE-16.1",
        },
        {
            "keys": ["حساب المعدل", "المعدل الفصلي", "كيف أحسب", "طريقة حساب", "sgpa", "gpa", "المتوسط"],
            "ar": (
                "المعدل الفصلي (SGPA) = مجموع (نقاط كل مقرر × ساعاته) ÷ مجموع ساعات مقررات الفصل. "
                "والمعدل التراكمي (CGPA) يُحسب بالطريقة نفسها على جميع المحاولات مع احتساب ساعات المقرر مرة واحدة، "
                "ويُقرَّب الناتج إلى رقمين عشريين."
            ),
            "en": (
                "SGPA = sum(points x credits) / sum(credits) for the term. CGPA uses the same formula across all "
                "attempts, counting a course's credits once, rounded to two decimals."
            ),
            "rule_code": "R-GPA-16.2",
        },
        {
            "keys": ["التقدير العام", "التصنيف", "classification", "ممتاز", "جيد جداً"],
            "ar": (
                "تصنيف المعدل التراكمي: أقل من 1.00 ضعيف جدًا، من 1.00 إلى أقل من 2.00 ضعيف، من 2.00 إلى أقل من 2.50 "
                "مقبول، من 2.50 إلى أقل من 3.00 جيد، من 3.00 إلى أقل من 3.50 جيد جدًا، و3.50 فأعلى ممتاز."
            ),
            "en": (
                "CGPA classification: below 1.00 very weak, 1.00-2.00 weak, 2.00-2.50 acceptable, 2.50-3.00 good, "
                "3.00-3.50 very good, and 3.50+ excellent."
            ),
            "rule_code": "R-GPA-16.2",
        },
        {
            "keys": ["غير مكتمل", "غير المكتمل", "incomplete", "الدرجة المؤجلة", "عذر قهري"],
            "ar": (
                "يُمنح تقدير غير مكتمل (I) عند عذر قهري يُقدَّم خلال يومين من الامتحان النهائي، بشرط ألا يقل عن "
                "60% من أعمال الفصل وألا يكون الطالب محرومًا؛ وإلا يُسجَّل W."
            ),
            "en": (
                "An Incomplete (I) is granted for a compelling excuse submitted within two days of the final exam, "
                "provided the coursework is at least 60% and the student is not barred; otherwise it is recorded as W."
            ),
            "rule_code": "R-INCOMPLETE-16.8",
        },
        {
            "keys": ["الفصل من الكلية", "فصل من الكلية", "dismissal", "الإنذارات المتتالية"],
            "ar": (
                "يُفصل الطالب من الكلية بعد 4 إنذارات متتالية أو 6 إنذارات متفرقة أو تجاوز المدة القصوى. "
                f"وتُمنح فرصة أخيرة لمن اجتاز {data.durations.get('final_chance_min_pct_completed', 80)}% من الساعات "
                f"({data.durations.get('final_chance_min_credits', 109)} ساعة) وفق المادة 21."
            ),
            "en": (
                "Dismissal follows 4 consecutive or 6 separate warnings, or exceeding the maximum duration. "
                f"A final chance is granted to students who completed {data.durations.get('final_chance_min_pct_completed', 80)}% "
                f"of credits ({data.durations.get('final_chance_min_credits', 109)}), under Article 21."
            ),
            "rule_code": "R-DISMISS-21",
        },
        {
            "keys": ["خطة الدراسة", "الخطة الدراسية", "study plan", "curriculum", "خطة", "المقررات"],
            "ar": (
                f"الخطة الدراسية موزعة على 4 مستويات وتشمل متطلبات الجامعة والمتطلبات الأساسية ومقررات التخصص "
                f"والاختيارية ومشروع التخرج والتدريب الميداني، بإجمالي {data.graduation.get('min_credits', 136)} ساعة "
                "معتمدة للتخرج. صفحة الخطط تعرض مقررات برنامجك ومتطلباته وخطته الفصلية."
            ),
            "en": (
                f"The study plan spans 4 levels and includes university requirements, core courses, major and elective "
                f"courses, the graduation project, and field training, for a total of "
                f"{data.graduation.get('min_credits', 136)} credits. The Plans page shows your program's courses and "
                "term-by-term plan."
            ),
            "rule_code": "R-GRAD-17",
        },
        {
            "keys": ["مواعيد", "التقويم", "بداية الدراسة", "نهاية الفصل", "امتحانات", "calendar", "dates"],
            "ar": (
                f"الفصل النظامي {data.dates.get('regular_semester_weeks', '16-17')} أسبوعًا، والفصل الصيفي "
                f"{data.dates.get('summer_weeks', 8)} أسابيع. آخر موعد للحذف والإضافة والتسجيل المتأخر هو الأسبوع "
                f"{data.dates.get('late_registration_week', 2)}، والانسحاب حتى الأسبوع "
                f"{data.dates.get('withdraw_until_week', 10)}. تواريخ بداية الفصل والامتحانات يعلنها مكتب التسجيل رسميًا."
            ),
            "en": (
                f"A regular semester lasts {data.dates.get('regular_semester_weeks', '16-17')} weeks and the summer term "
                f"{data.dates.get('summer_weeks', 8)} weeks. Add/drop and late registration close at the end of week "
                f"{data.dates.get('late_registration_week', 2)}; withdrawal runs to week "
                f"{data.dates.get('withdraw_until_week', 10)}. Official term and exam dates are announced by the registrar."
            ),
            "rule_code": "R-DROP-10",
        },
        {
            "all": ["تدريب", "مشروع"],
            "keys": ["التدريب الميداني", "مشروع التخرج"],
            "ar": (
                f"التدريب الميداني: 0 ساعة ولا يدخل في GPA، ويشترط اجتياز "
                f"{data.field_training.get('min_passed_credit_hours', 68)} ساعة، ومدته "
                f"{data.field_training.get('duration_weeks', 6)} أسابيع، ويُسمح به صيفاً. "
                f"ومشروع التخرج: يُسجَّل في المستوى الرابع بعد اجتياز "
                f"{data.graduation_project.get('min_passed_credit_hours', 96)} ساعة معتمدة (70%)، "
                "ويُسجَّل في الخريف أو الربيع فقط."
            ),
            "en": (
                f"Field training: 0 credits, excluded from GPA, requires "
                f"{data.field_training.get('min_passed_credit_hours', 68)} passed credits, lasts "
                f"{data.field_training.get('duration_weeks', 6)} weeks, and is allowed in summer. "
                f"Graduation project: registered at level 4 after passing "
                f"{data.graduation_project.get('min_passed_credit_hours', 96)} credits (70%), and only in fall or spring."
            ),
            "rule_code": "R-TRAIN-13",
        },
    ]


SMALL_TALK = [
    {
        "keys": ["السلام عليكم", "مرحبا", "مرحباً", "أهلا", "أهلاً", "hello", "good morning"],
        "ar": (
            "وعليكم السلام ورحمة الله. أنا مساعد اللائحة الأكاديمية لجامعة بدر بأسيوط. اسألني عن العبء الدراسي، "
            "التسجيل والحذف والإضافة، الحضور، التقييم، الإنذار الأكاديمي، المعدل، التخرج، أو أي مادة في اللائحة."
        ),
        "en": (
            "Hello! I am the BUA academic bylaw assistant. Ask me about study load, registration, attendance, "
            "assessment, probation, GPA, graduation, or any bylaw article."
        ),
    },
    {
        "keys": ["من أنت", "ما اسمك", "عرف بنفسك", "who are you", "what are you"],
        "ar": (
            "أنا المرشد الأكاديمي الذكي (AIDM) لجامعة بدر بأسيوط. أجيب من نصوص لائحة الكلية فقط، وأذكر المادة "
            "والصفحة ورقم القاعدة مع كل إجابة، وأحوّل السؤال إلى مرشد بشري عندما تكون الثقة منخفضة."
        ),
        "en": (
            "I am the BUA Smart Academic Advisor (AIDM). I answer only from the college bylaw text, cite the article, "
            "page, and rule code with every answer, and escalate to a human advisor when confidence is low."
        ),
    },
    {
        "keys": ["ماذا تستطيع", "ما الذي تستطيع", "help", "مساعدة", "what can you do"],
        "ar": (
            "أستطيع الإجابة عن: الحد الأدنى والأقصى للعبء، التسجيل والحذف والإضافة والانسحاب، الحضور والحرمان، "
            "توزيع الدرجات والتقديرات وحساب المعدل، الإنذار والفصل، الإعادة والتحسين، الفصل الصيفي، المستويات "
            "والمتطلبات السابقة، التدريب الميداني ومشروع التخرج، ومتطلبات التخرج والتقدير العام."
        ),
        "en": (
            "I can answer questions about minimum and maximum load, registration/add/drop/withdrawal, attendance and "
            "deprivation, assessment and grading, GPA, probation and dismissal, repeats and improvement, the summer "
            "term, levels and prerequisites, field training and the graduation project, and graduation requirements."
        ),
    },
    {
        "keys": ["شكرا", "شكراً", "مشكور", "thanks", "thank you"],
        "ar": "العفو. أتمنى لك فصلاً موفقًا. لو عندك سؤال آخر عن اللائحة أو خطتك الدراسية فأنا جاهز.",
        "en": "You're welcome. Good luck this term. Ask me anytime about the bylaw or your study plan.",
    },
]


SCOPE_NOTES = [
    {
        "keys": ["الغش", "غش", "انتحال", "plagiarism", "cheat"],
        "ar": (
            "الغش والانتحال مخالفات تأديبية تُطبَّق عليها أحكام قانون تنظيم الجامعة رقم 49 ولائحة التأديب، "
            "وليست من العقوبات المحددة رقميًا في لائحة الكلية. تُحال الواقعة إلى لجنة التأديب، ويُفضَّل مراجعة "
            "المرشد أو شؤون الطلاب لمعرفة الإجراء المطبق على حالتك."
        ),
        "en": (
            "Cheating and plagiarism are disciplinary offences governed by University Organization Law No. 49 and the "
            "disciplinary regulations; the college bylaw does not set a numeric penalty. The case is referred to the "
            "disciplinary committee, and you should consult your advisor or student affairs for the applicable action."
        ),
    },
    {
        "keys": ["الرسوم", "رسوم", "المصروفات", "fees", "tuition"],
        "ar": (
            "الرسوم والمصروفات الدراسية ليست ضمن لائحة الكلية الأكاديمية؛ تُحددها إدارة الجامعة والشؤون المالية. "
            "راجع شؤون الطلاب أو الخزينة للرسوم ومواعيد السداد الرسمية."
        ),
        "en": (
            "Tuition and fees are not part of the academic bylaw; they are set by the university administration and "
            "finance office. Contact student affairs or the cashier for official amounts and payment dates."
        ),
    },
]


def _match_scope_note(question: str) -> dict[str, Any] | None:
    q = question.lower()
    for entry in SCOPE_NOTES:
        if any(key in q for key in entry["keys"]):
            return entry
    return None


def _match_small_talk(question: str) -> dict[str, Any] | None:
    q = question.lower()
    for entry in SMALL_TALK:
        if any(key in q for key in entry["keys"]):
            return entry
    return None


def _match_fact(data: RegulationData, question: str) -> dict[str, Any] | None:
    q = question.lower()
    best = None
    best_score = (0, 0)
    for fact in _facts(data):
        required = fact.get("all")
        if required and not all(key.lower() in q for key in required):
            continue
        matched = [key for key in fact["keys"] if key.lower() in q]
        if not matched:
            continue
        # Prefer the fact that matches more keywords, then the more specific (longer) keyword.
        score = (len(matched), max(len(key) for key in matched))
        if score > best_score:
            best = fact
            best_score = score
    return best


def _match_anomaly(data: RegulationData, question: str) -> Any | None:
    q = question.lower()
    q_tokens = _tokens(question)
    best = None
    best_overlap = 0
    for anomaly in data.anomalies.values():
        if not anomaly.is_open:
            continue
        if any(code.lower() in q for code in anomaly.affected_courses):
            return anomaly
        blob = f"{anomaly.title_ar} {anomaly.description_ar} {anomaly.title_en} {anomaly.description_en}"
        overlap = len(q_tokens & _tokens(blob))
        if overlap > best_overlap:
            best = anomaly
            best_overlap = overlap
    return best if best_overlap >= 5 else None


def _extract(chunk: PolicyChunk, question: str, language: str) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!؟])\s+|\n+", chunk.text) if len(s.strip()) > 25]
    q_tokens = _tokens(question)
    scored = []
    for idx, sentence in enumerate(sentences):
        overlap = len(q_tokens & _tokens(sentence))
        scored.append((overlap, -idx, sentence))
    scored.sort(reverse=True)
    selected = [row[2] for row in scored[:3] if row[0] > 0] or [row[2] for row in scored[:2]]
    if not selected:
        selected = [chunk.text[:700]]
    body = " ".join(selected)
    if language == "en" and chunk.language == "ar":
        return f"The bylaw text (Arabic) states: {body}"
    return body


def _citations(chunks: list[tuple[PolicyChunk, float]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    for chunk, _score in chunks:
        key = (chunk.article_no, chunk.clause_no, chunk.page_no)
        if key in seen:
            continue
        seen.add(key)
        out.append(_citation(chunk))
        if len(out) >= 3:
            break
    return out


def answer_question(
    data: RegulationData, question: str, language: str = "auto", open_anomaly_ids: list[str] | None = None
) -> dict[str, Any]:
    """Extractive, citation-first RAG. There is no LLM tool access and no student data."""
    settings = get_settings()
    lang = detect_language(question) if language == "auto" else language
    flags: list[str] = []
    store.load()

    if INJECTION_RE.search(question):
        return {
            "answer": "تم رفض الطلب: نص المستخدم يحتوي على محاولة توجيه غير مسموح بها. تم تحويل الحالة إلى المرشد."
            if lang == "ar"
            else "Request refused: the input contains a prompt-injection attempt. The case has been escalated to an advisor.",
            "answer_language": lang,
            "citations": [],
            "confidence": 0.0,
            "escalate": True,
            "escalate_reason": "PROMPT_INJECTION_DETECTED",
            "anomaly_ids": [],
            "flags": ["PROMPT_INJECTION_DETECTED"],
        }

    scope_note = _match_scope_note(question)
    if scope_note:
        return {
            "answer": scope_note[lang],
            "answer_language": lang,
            "citations": [],
            "confidence": 0.55,
            "escalate": False,
            "escalate_reason": None,
            "anomaly_ids": [],
            "flags": ["OUT_OF_BYLAW_SCOPE"],
        }

    small_talk = _match_small_talk(question)
    if small_talk:
        return {
            "answer": small_talk[lang],
            "answer_language": lang,
            "citations": [],
            "confidence": 0.98,
            "escalate": False,
            "escalate_reason": None,
            "anomaly_ids": [],
            "flags": ["SMALL_TALK"],
        }

    allowed_anomalies = set(open_anomaly_ids) if open_anomaly_ids is not None else {
        a.id for a in data.anomalies.values() if a.is_open
    }

    anomaly = _match_anomaly(data, question)
    if anomaly and anomaly.id in allowed_anomalies:
        return {
            "answer": (
                f"هذا الموضوع مرتبط بعيب مفتوح في اللائحة ({anomaly.id}: {anomaly.title_ar}). "
                "لا يمكن الإجابة بشكل قاطع؛ تم تحويل الحالة إلى المرشد الأكاديمي."
                if lang == "ar"
                else f"This topic matches an open bylaw anomaly ({anomaly.id}). A definitive answer is not possible; "
                "the case has been escalated to an academic advisor."
            ),
            "answer_language": lang,
            "citations": [
                {"article": str(s.get("article")), "clause": "", "page": s.get("page"), "source": "BUA-AIDM.pdf"}
                for s in anomaly.sources
            ],
            "confidence": 0.4,
            "escalate": True,
            "escalate_reason": f"OPEN_ANOMALY:{anomaly.id}",
            "anomaly_ids": [anomaly.id],
            "flags": ["OPEN_ANOMALY"],
        }

    fact = _match_fact(data, question)
    if fact:
        rule = data.rule(fact["rule_code"], ("N/A", "N/A"))
        return {
            "answer": fact["ar"] if lang == "ar" else fact["en"],
            "answer_language": lang,
            "citations": [
                {
                    "article": rule.article,
                    "clause": rule.clause,
                    "page": int(re.findall(r"\d+", rule.page)[0]) if re.findall(r"\d+", rule.page) else rule.page,
                    "source": f"BUA-AIDM.pdf#page={rule.page}",
                    "title": rule.title_ar,
                }
            ],
            "confidence": 0.99,
            "escalate": False,
            "escalate_reason": None,
            "anomaly_ids": [],
            "flags": ["RULE_ENGINE_NUMERIC"],
        }

    results = store.search(question, settings.rag_top_k)
    if not results:
        return {
            "answer": "لا توجد مقتطفات لائحية مطابقة؛ تم تحويل السؤال إلى المرشد."
            if lang == "ar"
            else "No matching bylaw text was retrieved; the question has been escalated to an advisor.",
            "answer_language": lang,
            "citations": [],
            "confidence": 0.0,
            "escalate": True,
            "escalate_reason": "NO_RETRIEVAL",
            "anomaly_ids": [],
            "flags": [],
        }

    best, score = results[0]
    confidence = max(0.0, min(1.0, round(float(score), 3)))
    citations = _citations(results)
    if confidence < settings.rag_min_confidence or not citations:
        return {
            "answer": "الثقة في النص المسترجع منخفضة؛ تم تحويل السؤال إلى المرشد الأكاديمي."
            if lang == "ar"
            else "Confidence in the retrieved bylaw text is low; the question has been escalated to an academic advisor.",
            "answer_language": lang,
            "citations": citations,
            "confidence": confidence,
            "escalate": True,
            "escalate_reason": "LOW_CONFIDENCE",
            "anomaly_ids": [],
            "flags": flags,
        }

    return {
        "answer": _extract(best, question, lang),
        "answer_language": lang,
        "citations": citations,
        "confidence": confidence,
        "escalate": False,
        "escalate_reason": None,
        "anomaly_ids": [],
        "flags": flags,
    }
