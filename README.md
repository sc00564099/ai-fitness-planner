# Fitness Planner

A small web app that builds a conservative, one-week fitness plan for healthy adults. Plans come from a built-in starter generator or, optionally, from an AI model through a LiteLLM/OpenAI-compatible proxy.

> This tool is for general wellness only and is not medical advice. Anyone with an injury, symptoms, pregnancy, or a condition affecting exercise should consult a qualified clinician first.

## Screenshot

Application UI:
<img width="1804" height="1117" alt="image" src="https://github.com/user-attachments/assets/1cc35881-5273-422d-9d83-37287046d9fc" />
<img width="1881" height="1110" alt="image" src="https://github.com/user-attachments/assets/d2b7d5ef-e61c-4dda-bb3a-7082b1636867" />


## Features

- Choose goal, experience level, equipment, days per week (2-5) and session length (15-45 minutes).
- Seven-day plan with workout and recovery days, exercise doses and technique cues.
- Starter plan works offline; no data leaves the server.
- Optional AI-generated plan, only after explicit user consent.
- Eligibility checks (adults 18+, no clearance needed) and input validation with Pydantic.
- Security headers, same-origin checks, request size limits and concurrency limits.

## Requirements

- Python 3.10+
- Dependencies in `requirements.txt` (Flask, OpenAI SDK, Pydantic)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run the app

```bash
source .venv/bin/activate
python app.py
```

Open `http://127.0.0.1:5050` in your browser.

To use a different port:

```bash
FITNESS_PORT=8080 python app.py
```

## Enable AI plans (optional)

Set these environment variables before starting the app. Without them, the app returns the starter plan.

```bash
export LITELLM_BASE_URL="https://your-litellm-proxy.example.com"
export LITELLM_API_KEY="your-api-key"
export LITELLM_MODEL="gpt-4.1-mini"  # optional, default shown
python app.py
```

Never commit API keys to source control.

## Run the tests

```bash
python -m pytest test_planner.py
```

If `pytest` is not installed: `pip install pytest`.

## Project structure

| Path | Purpose |
|---|---|
| `app.py` (`app.py`) | Flask server, `/` page and `/api/plan` endpoint |
| `planner.py` (`planner.py`) | Profile/plan models, starter plan, AI generation |
| `templates/index.html` (`templates/index.html`) | UI page |
| `static/` (`static/`) | Front-end JavaScript and CSS |
| `test_planner.py` (`test_planner.py`) | Tests |

## API

`POST /api/plan` with JSON:

```json
{
  "profile": {
    "goal": "Stay active",
    "level": "Beginner",
    "equipment": "No equipment",
    "days": 3,
    "minutes": 25,
    "adult": true,
    "clearance_needed": false,
    "consent": false
  },
  "use_ai": false
}
```

Response: `"plan"`, `"source"` (`"starter"` or `"ai"`) and `"message"`.
