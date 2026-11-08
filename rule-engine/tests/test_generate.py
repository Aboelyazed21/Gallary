from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.rag import generate as gen
from app.rag.answer import answer_question
from app.rag.store import PolicyChunk


def make_chunk(text: str = "يجب ألا يقل الحد الأدنى للعبء عن اثني عشر ساعة.", language: str = "ar"):
    return PolicyChunk(
        article_no="8",
        clause_no="1",
        page_no=12,
        language=language,
        title="العبء الدراسي",
        text=text,
        source="BUA-AIDM.pdf#page=12",
    )


def settings_with(**overrides) -> Settings:
    base = {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "test-model", "GEMINI_TIMEOUT_SECONDS": 5.0}
    base.update(overrides)
    return Settings(**base)


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error", request=httpx.Request("POST", "https://example.test"), response=httpx.Response(500)
            )

    def json(self) -> dict:
        return self._payload


class FakeClient:
    """Stands in for httpx.Client; records the request it received."""

    last: dict | None = None

    def __init__(self, payload: dict, status: int = 200, error: Exception | None = None):
        self._payload = payload
        self._status = status
        self._error = error

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def post(self, url, json=None, headers=None):
        FakeClient.last = {"url": url, "json": json, "headers": headers}
        if self._error:
            raise self._error
        return FakeResponse(self._payload, self._status)


def candidate_payload(text: str | None) -> dict:
    if text is None:
        return {"candidates": []}
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(gen, "get_settings", lambda: settings_with())


def test_build_context_numbers_excerpts():
    context = gen.build_context([make_chunk(), make_chunk("text two", language="en")])
    assert context.startswith("[1] مادة 8 / 1 · p.12")
    assert "[2] Article 8 / 1 · p.12" in context


def test_build_contents_maps_history_and_appends_question():
    contents = gen.build_contents(
        "ما الحد الأدنى؟",
        "[1] excerpt",
        [{"role": "user", "content": "previous q"}, {"role": "assistant", "content": "previous a"}],
    )
    assert [turn["role"] for turn in contents] == ["user", "model", "user"]
    assert "previous a" in contents[1]["parts"][0]["text"]
    final = contents[-1]["parts"][0]["text"]
    assert "[1] excerpt" in final and "ما الحد الأدنى؟" in final


def test_build_contents_skips_empty_history():
    contents = gen.build_contents("q", "ctx", None)
    assert len(contents) == 1 and contents[0]["role"] == "user"


def test_parse_response_extracts_and_handles_missing():
    assert gen.parse_response(candidate_payload("hello")) == "hello"
    assert gen.parse_response({"candidates": [{"content": {"parts": []}}]}) is None
    assert gen.parse_response({}) is None


def test_generation_requires_credentials(monkeypatch):
    monkeypatch.setattr(gen, "get_settings", lambda: settings_with(GEMINI_API_KEY=""))
    assert gen.generate_answer("q", [make_chunk()], "ar") is None


def test_generation_skips_without_chunks(enabled):
    assert gen.generate_answer("q", [], "ar") is None


def test_generation_returns_model_text(enabled, monkeypatch):
    client = FakeClient(candidate_payload("الإجابة من اللائحة [1]."))
    monkeypatch.setattr(gen.httpx, "Client", lambda timeout=None: client)
    answer = gen.generate_answer("ما الحد الأدنى؟", [make_chunk()], "ar")
    assert answer == "الإجابة من اللائحة [1]."
    sent = FakeClient.last
    assert sent["url"].endswith("test-model:generateContent")
    assert sent["headers"]["x-goog-api-key"] == "test-key"
    assert "Arabic" in sent["json"]["systemInstruction"]["parts"][0]["text"]


def test_generation_detects_no_relevant_info(enabled, monkeypatch):
    monkeypatch.setattr(
        gen.httpx, "Client", lambda timeout=None: FakeClient(candidate_payload(gen.NO_RELEVANT_INFO))
    )
    assert gen.generate_answer("q", [make_chunk()], "ar") == gen.NO_RELEVANT_INFO


def test_generation_returns_none_on_http_error(enabled, monkeypatch):
    monkeypatch.setattr(gen.httpx, "Client", lambda timeout=None: FakeClient({}, status=500))
    assert gen.generate_answer("q", [make_chunk()], "ar") is None


def test_generation_returns_none_on_transport_error(enabled, monkeypatch):
    client = FakeClient({}, error=httpx.ConnectError("boom"))
    monkeypatch.setattr(gen.httpx, "Client", lambda timeout=None: client)
    assert gen.generate_answer("q", [make_chunk()], "ar") is None


def test_generation_returns_none_on_empty_candidate(enabled, monkeypatch):
    monkeypatch.setattr(gen.httpx, "Client", lambda timeout=None: FakeClient(candidate_payload(None)))
    assert gen.generate_answer("q", [make_chunk()], "ar") is None


def test_generation_truncates_overlong_answers(enabled, monkeypatch):
    monkeypatch.setattr(
        gen.httpx, "Client", lambda timeout=None: FakeClient(candidate_payload("x" * 5000))
    )
    answer = gen.generate_answer("q", [make_chunk()], "ar")
    assert answer is not None and len(answer) <= gen.MAX_ANSWER_CHARS


# Reaches the vector-retrieval branch (confidence ≥ RAG_MIN_CONFIDENCE) instead
# of the deterministic fact/anomaly/small-talk branches.
RETRIEVED_QUESTION = "إلى كم فصل دراسي تنقسم السنة الدراسية الرئيسية في الكلية؟"


def test_answer_question_uses_generated_answer(data, monkeypatch):
    monkeypatch.setattr(
        "app.rag.answer.generate_answer", lambda **kwargs: "إجابة مولّدة من اللائحة [1]."
    )
    result = answer_question(data, RETRIEVED_QUESTION, "ar")
    assert result["escalate"] is False
    assert result["answer"] == "إجابة مولّدة من اللائحة [1]."
    assert "LLM_GENERATED" in result["flags"]
    assert result["citations"]


def test_answer_question_escalates_when_model_finds_nothing(data, monkeypatch):
    monkeypatch.setattr(
        "app.rag.answer.generate_answer", lambda **kwargs: gen.NO_RELEVANT_INFO
    )
    result = answer_question(data, RETRIEVED_QUESTION, "ar")
    assert result["escalate"] is True
    assert result["escalate_reason"] == "NO_RELEVANT_INFO"
    assert "NO_RELEVANT_INFO" in result["flags"]
    assert result["confidence"] == 0.0
    assert result["answer"]


def test_answer_question_falls_back_to_extractive(data, monkeypatch):
    monkeypatch.setattr("app.rag.answer.generate_answer", lambda **kwargs: None)
    result = answer_question(data, RETRIEVED_QUESTION, "ar")
    assert result["escalate"] is False
    assert "LLM_GENERATED" not in result["flags"]
    assert result["answer"]


def test_history_reaches_the_generator(data, monkeypatch):
    seen: dict = {}

    def spy(**kwargs):
        seen.update(kwargs)
        return None

    monkeypatch.setattr("app.rag.answer.generate_answer", spy)
    history = [{"role": "user", "content": "سؤال سابق"}, {"role": "assistant", "content": "جواب سابق"}]
    answer_question(data, RETRIEVED_QUESTION, "ar", history=history)
    assert seen["history"] == history
    assert seen["chunks"], "retrieved chunks must be handed to the generator"
