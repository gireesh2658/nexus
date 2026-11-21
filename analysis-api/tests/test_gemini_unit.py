import unittest
from unittest.mock import MagicMock, AsyncMock, patch
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.routers.ai import sanitize_error, get_gemini_config, call_gemini_summary, clean_pg_url

class TestGeminiUnit(unittest.IsolatedAsyncioTestCase):

    def test_sanitize_error_redacts_api_key_and_credentials(self):
        with patch("app.routers.ai.get_gemini_config", return_value=("AIzaSyFakeKeyForTesting1234567890", "gemini-3.8-flash")):
            raw_error = "Error: Invalid credentials for AIzaSyFakeKeyForTesting1234567890 at postgresql://user:secretpass@localhost:5432/db"
            sanitized = sanitize_error(raw_error)
            self.assertNotIn("AIzaSyFakeKeyForTesting1234567890", sanitized)
            self.assertNotIn("secretpass", sanitized)
            self.assertIn("[REDACTED", sanitized)

    def test_clean_pg_url_removes_schema(self):
        url = "postgresql://postgres:password@localhost:5432/nexus?schema=public"
        cleaned = clean_pg_url(url)
        self.assertEqual(cleaned, "postgresql://postgres:password@localhost:5432/nexus")

    def test_get_gemini_config_reads_env(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key-abc", "GEMINI_MODEL": "gemini-3.8-flash"}):
            key, model = get_gemini_config()
            self.assertEqual(key, "test-key-abc")
            self.assertEqual(model, "gemini-3.8-flash")

    async def test_call_gemini_summary_structured_json(self):
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "executiveSummary": "Team aligned on Phase 5 deliverables.",
            "keyHighlights": ["LiveKit audio pipeline operational", "Captions rendered visibly in browser"],
            "decisions": ["Approve Gemini 3.8 Flash deployment"],
            "actionItems": [
                {"task": "Run acceptance test", "owner": "QA Lead", "deadline": "Today"}
            ],
            "openQuestions": ["None"],
            "followUpEmail": "Subject: Sync Recap\n\nHi team, deliverables approved."
        })

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        transcripts = [
            {"participantId": "host_1", "text": "Let us review Phase 5.", "startTimeMs": 0, "endTimeMs": 2000},
            {"participantId": "guest_1", "text": "Everything is verified.", "startTimeMs": 2500, "endTimeMs": 4000}
        ]

        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client):
            summary_text, decisions, action_items, follow_up_email, model_used = await call_gemini_summary(transcripts)

            self.assertIn("Team aligned on Phase 5 deliverables.", summary_text)
            self.assertIn("Approve Gemini 3.8 Flash deployment", decisions)
            self.assertEqual(len(action_items), 1)
            self.assertEqual(action_items[0]["task"], "Run acceptance test")
            self.assertIn("Subject: Sync Recap", follow_up_email)
            self.assertEqual(model_used, "gemini/gemini-3.8-flash")

    async def test_call_gemini_summary_transient_503_retry_success(self):
        """Scenario: First call fails with 503 high demand; second call succeeds."""
        mock_success_response = MagicMock()
        mock_success_response.text = json.dumps({
            "executiveSummary": "Recovered after transient spike.",
            "keyHighlights": ["Retried successfully"],
            "decisions": ["Proceed"],
            "actionItems": [],
            "openQuestions": [],
            "followUpEmail": "Subject: Recap\n\nAll good."
        })

        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = [
            Exception("503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high demand.'}}"),
            mock_success_response
        ]

        transcripts = [{"participantId": "host_1", "text": "Testing retry.", "startTimeMs": 0, "endTimeMs": 1000}]

        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client), \
             patch("app.routers.ai.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            summary_text, decisions, action_items, follow_up_email, model_used = await call_gemini_summary(transcripts)

            self.assertEqual(mock_client.models.generate_content.call_count, 2)
            self.assertEqual(mock_sleep.call_count, 1)
            self.assertIn("Recovered after transient spike.", summary_text)

    async def test_call_gemini_summary_exhausted_retries(self):
        """Scenario: All 3 attempts fail with 503; raises exception after 3 calls."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("503 UNAVAILABLE. High demand.")

        transcripts = [{"participantId": "host_1", "text": "Testing retry.", "startTimeMs": 0, "endTimeMs": 1000}]

        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client), \
             patch("app.routers.ai.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with self.assertRaises(Exception) as ctx:
                await call_gemini_summary(transcripts)

            self.assertEqual(mock_client.models.generate_content.call_count, 3)
            self.assertEqual(mock_sleep.call_count, 2)
            self.assertIn("503 UNAVAILABLE", str(ctx.exception))

    async def test_call_gemini_summary_permanent_error_no_retry(self):
        """Scenario: Permanent 400 Bad Request client error must NOT be retried."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("400 INVALID_ARGUMENT. Model format error.")

        transcripts = [{"participantId": "host_1", "text": "Testing retry.", "startTimeMs": 0, "endTimeMs": 1000}]

        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client), \
             patch("app.routers.ai.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with self.assertRaises(Exception) as ctx:
                await call_gemini_summary(transcripts)

            self.assertEqual(mock_client.models.generate_content.call_count, 1)
            self.assertEqual(mock_sleep.call_count, 0)
            self.assertIn("400 INVALID_ARGUMENT", str(ctx.exception))

    async def test_call_gemini_summary_missing_key(self):
        transcripts = [{"participantId": "host_1", "text": "Hello", "startTimeMs": 0, "endTimeMs": 1000}]
        with patch("app.routers.ai.get_gemini_config", return_value=(None, "gemini-3.8-flash")):
            with self.assertRaises(ValueError) as ctx:
                await call_gemini_summary(transcripts)
            self.assertIn("GEMINI_API_KEY is not configured", str(ctx.exception))

    async def test_call_gemini_summary_malformed_json(self):
        mock_response = MagicMock()
        mock_response.text = "NOT VALID JSON"
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        transcripts = [{"participantId": "host_1", "text": "Hello", "startTimeMs": 0, "endTimeMs": 1000}]
        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client):
            with self.assertRaises(ValueError) as ctx:
                await call_gemini_summary(transcripts)
            self.assertIn("Failed to parse Gemini JSON response", str(ctx.exception))

    async def test_call_gemini_summary_empty_response(self):
        mock_response = MagicMock()
        mock_response.text = ""
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        transcripts = [{"participantId": "host_1", "text": "Hello", "startTimeMs": 0, "endTimeMs": 1000}]
        with patch("app.routers.ai.get_gemini_config", return_value=("valid_mock_key", "gemini-3.8-flash")), \
             patch("app.routers.ai.genai.Client", return_value=mock_client):
            with self.assertRaises(ValueError) as ctx:
                await call_gemini_summary(transcripts)
            self.assertIn("Gemini returned an empty response", str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
