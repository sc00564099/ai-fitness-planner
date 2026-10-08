import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from openai import APIStatusError, APITimeoutError

from planner import Profile, generate_plan, proxy_config, starter_plan, validate_plan


class PlannerTests(unittest.TestCase):
    def test_schedule_and_duration(self):
        for count in range(2, 6):
            for goal in ("Stay active", "Build strength", "Improve endurance"):
                profile = Profile(adult=True, days=count, minutes=15, goal=goal)
                plan = validate_plan(starter_plan(profile), profile)
                self.assertEqual(sum(day.kind == "Workout" for day in plan.days), count)
                self.assertEqual(len(plan.days), 7)

    def test_safety_gate(self):
        for profile in (Profile(adult=False), Profile(adult=True, clearance_needed=True)):
            with self.assertRaises(ValueError):
                generate_plan(profile, False)

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_proxy_never_defaults_to_openai(self):
        self.assertIsNone(proxy_config())
        self.assertEqual(generate_plan(Profile(adult=True, consent=True))[1], "starter")

    def test_rejects_invalid_ai_schedule(self):
        profile = Profile(adult=True)
        plan = starter_plan(profile)
        plan.days[0].minutes = 45
        with self.assertRaises(ValueError):
            validate_plan(plan, profile)
        plan = starter_plan(profile)
        plan.days[0].day = "Sunday"
        with self.assertRaises(ValueError):
            validate_plan(plan, profile)
        plan = starter_plan(profile)
        plan.days[0].kind = "Recovery"
        with self.assertRaises(ValueError):
            validate_plan(plan, profile)

    def test_consent_required(self):
        with self.assertRaises(ValueError):
            generate_plan(Profile(adult=True))

    @patch.dict(os.environ, {"LITELLM_BASE_URL": "http://localhost:4000/", "LITELLM_API_KEY": "test-only", "LITELLM_MODEL": "test-model"}, clear=True)
    @patch("planner.OpenAI")
    def test_ai_uses_proxy_and_validates_response(self, client_class):
        profile = Profile(adult=True, consent=True)
        client = MagicMock()
        client_class.return_value.__enter__.return_value = client
        client.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=starter_plan(profile).model_dump_json()))])
        self.assertEqual(generate_plan(profile)[1], "ai")
        self.assertEqual(client_class.call_args.kwargs["base_url"], "http://localhost:4000")
        self.assertEqual(client.chat.completions.create.call_args.kwargs["model"], "test-model")
        client.chat.completions.create.return_value.choices[0].message.content = "invalid"
        self.assertEqual(generate_plan(profile)[1], "starter")

    @patch.dict(os.environ, {"LITELLM_BASE_URL": "http://localhost:4000", "LITELLM_API_KEY": "test-only"}, clear=True)
    @patch("planner.OpenAI")
    def test_proxy_errors_use_safe_fallback(self, client_class):
        request = httpx.Request("POST", "http://localhost:4000/chat/completions")
        errors = [APIStatusError("do-not-expose-secret", response=httpx.Response(401, request=request), body=None), APITimeoutError(request=request)]
        client = client_class.return_value.__enter__.return_value
        for error in errors:
            client.chat.completions.create.side_effect = error
            plan, source, message = generate_plan(Profile(adult=True, consent=True))
            self.assertEqual(source, "starter")
            self.assertEqual(len(plan.days), 7)
            self.assertNotIn("do-not-expose-secret", message)


class ApiTests(unittest.TestCase):
    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_home_and_starter(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        response = self.client.post("/api/plan", json={"profile": {"adult": True}, "use_ai": False})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["source"], "starter")
        self.assertEqual(len(response.json["plan"]["days"]), 7)

    def test_invalid_requests(self):
        for body in ([], {}, {"profile": {"adult": True, "days": 9}, "use_ai": False}, {"profile": {"adult": False}, "use_ai": False}, {"profile": {"adult": True}, "use_ai": "false"}):
            self.assertEqual(self.client.post("/api/plan", json=body).status_code, 400)
        self.assertEqual(self.client.post("/api/plan", data="hello").status_code, 415)
        self.assertEqual(self.client.post("/api/plan", json={}, headers={"Origin": "http://other.example"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()