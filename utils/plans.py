import json
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
MAX_ACTIVE_PLANS = 10
MAX_TASKS = 40


def today_ist():
    return datetime.now(IST).date()


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def extract_tasks(gemini_model, guide, language):
    """Ask Gemini to turn a guidebook into a day-by-day task list: [{day, title, details}]."""
    prompt = f"""Below is a crop farming guidebook. Convert it into a practical day-by-day task schedule for a farmer.
    Day 1 is the sowing/planting day; preparation tasks before sowing should also be on Day 1.
    Return ONLY a JSON array of 8 to 25 objects, sorted by day, each with:
      "day": integer (1 = sowing day),
      "title": short task name (max 8 words),
      "details": one or two short practical sentences (what to do, which fertilizer/dose if any).
    Include fertilizer applications, irrigation, weeding, pest/disease checks and harvesting.
    Write "title" and "details" in the language corresponding to language code '{language}'.

    GUIDEBOOK:
    {guide}"""
    response = gemini_model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
    text = response.text.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json")
    raw = json.loads(text)

    tasks = []
    for item in raw if isinstance(raw, list) else []:
        try:
            day = int(item.get("day"))
        except (TypeError, ValueError, AttributeError):
            continue
        title = str(item.get("title") or "").strip()
        if 1 <= day <= 400 and title:
            tasks.append({"day": day, "title": title[:120], "details": str(item.get("details") or "").strip()[:500]})
    tasks.sort(key=lambda t: t["day"])
    return tasks[:MAX_TASKS]


def plan_view(plan):
    """Shape a plan for the dashboard: current day, today's / overdue / upcoming tasks."""
    start = parse_date(plan["start_date"])
    current_day = (today_ist() - start).days + 1
    done = set(plan.get("done", []))
    tasks = [dict(t, index=i, done=i in done) for i, t in enumerate(plan["tasks"])]
    total_days = max((t["day"] for t in tasks), default=1)

    return {
        "id": str(plan["_id"]),
        "crop": plan["crop"],
        "soil": plan["soil"],
        "language": plan.get("language", "en"),
        "start_date": plan["start_date"],
        "current_day": current_day,
        "total_days": total_days,
        "completed": len(done) == len(tasks) and current_day >= total_days,
        "progress": round(100 * len(done) / len(tasks)) if tasks else 0,
        "tasks": tasks,
        "today": [t for t in tasks if t["day"] == current_day],
        "overdue": [t for t in tasks if t["day"] < current_day and not t["done"]],
        "upcoming": [t for t in tasks if t["day"] > current_day][:3],
    }
