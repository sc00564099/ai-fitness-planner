import os
import threading
from urllib.parse import urlsplit

from flask import Flask, jsonify, render_template, request
from pydantic import ValidationError

from planner import Profile, generate_plan, proxy_config

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8192
generation_slots = threading.BoundedSemaphore(2)


@app.after_request
def security_headers(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://images.unsplash.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response


@app.get("/")
def index():
    return render_template("index.html", ai_ready=bool(proxy_config()))


@app.post("/api/plan")
def create_plan():
    origin = request.headers.get("Origin")
    if origin and urlsplit(origin).netloc != request.host:
        return jsonify(error="Cross-origin requests are not allowed."), 403
    if not request.is_json:
        return jsonify(error="A JSON request is required."), 415
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {"profile", "use_ai"} or type(body["use_ai"]) is not bool:
        return jsonify(error="Please submit a valid profile and plan mode."), 400
    try:
        profile = Profile.model_validate(body["profile"])
    except ValidationError:
        return jsonify(error="Check your preferences: choose 2-5 days, 15-45 minutes, and complete the required confirmations."), 400
    if not generation_slots.acquire(blocking=False):
        return jsonify(error="Two plans are already being prepared. Please try again shortly."), 429
    try:
        plan, source, message = generate_plan(profile, body["use_ai"])
        return jsonify(plan=plan.model_dump(), source=source, message=message)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    finally:
        generation_slots.release()


@app.errorhandler(413)
def too_large(error):
    return jsonify(error="That request is too large."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("FITNESS_PORT", "5050")), debug=False)