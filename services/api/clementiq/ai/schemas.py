"""Structured-output schemas for Clement Gemini. Every model response is validated against these."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Confidence = Literal["low", "medium", "high"]


class Option(BaseModel):
    action: str = Field(max_length=300)
    rationale: str = Field(max_length=500)


class ScenarioExplanation(BaseModel):
    headline: str = Field(max_length=160)
    what_happened: str = Field(max_length=800)
    why_it_matters: str = Field(max_length=800)
    affected_categories: list[str] = Field(max_length=8)
    what_the_numbers_show: str = Field(max_length=1000)
    options: list[Option] = Field(max_length=6)
    confidence: Confidence
    uncertainty: str = Field(max_length=600)
    source_ids: list[str] = Field(default_factory=list, max_length=10)


class NewsSummary(BaseModel):
    summary: str = Field(max_length=500)
    topic: str
    classification: Literal["confirmed", "forecast", "opinion", "speculation", "unclear"]
    exposure_categories: list[str] = Field(max_length=6)
    household_relevance: Literal["direct", "indirect", "minimal"]
    confidence_note: str = Field(max_length=300)


class NewsBatch(BaseModel):
    items: list[dict[str, Any]]


class AlertExplanation(BaseModel):
    explanation: str = Field(max_length=700)
    suggested_action: str = Field(max_length=300)
    confidence: Confidence


class PlanExplanation(BaseModel):
    summary: str = Field(max_length=900)
    key_steps: list[str] = Field(max_length=6)
    encouragement: str = Field(max_length=300)
    caveats: str = Field(max_length=400)


def to_gemini_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Convert a pydantic JSON schema into Gemini's OpenAPI-subset responseSchema (refs inlined)."""
    js = model.model_json_schema()
    defs = js.get("$defs", {})

    def conv(node: dict[str, Any]) -> dict[str, Any]:
        if "$ref" in node:
            return conv(defs[node["$ref"].split("/")[-1]])
        if "anyOf" in node:
            non_null = [n for n in node["anyOf"] if n.get("type") != "null"]
            out = conv(non_null[0]) if non_null else {"type": "STRING"}
            out["nullable"] = True
            return out
        t = node.get("type")
        if "enum" in node:
            return {"type": "STRING", "enum": [str(e) for e in node["enum"]]}
        if "const" in node:
            return {"type": "STRING", "enum": [str(node["const"])]}
        if t == "object":
            props = node.get("properties", {})
            if not props:
                return {"type": "OBJECT", "properties": {"note": {"type": "STRING"}}}
            return {"type": "OBJECT", "properties": {k: conv(v) for k, v in props.items()},
                    "required": node.get("required", list(props))}
        if t == "array":
            return {"type": "ARRAY", "items": conv(node.get("items", {"type": "string"}))}
        mapping = {"string": "STRING", "integer": "INTEGER", "number": "NUMBER", "boolean": "BOOLEAN"}
        out = {"type": mapping.get(t, "STRING")}
        if node.get("description"):
            out["description"] = node["description"]
        return out

    return conv(js)
