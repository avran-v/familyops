"""Web search utility using Tavily for current pricing and alternatives."""

import os
from typing import Optional


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Search the web and return results with titles, URLs, and snippets.

    Returns a list of dicts: [{"title": ..., "url": ..., "content": ...}]
    Falls back gracefully if Tavily is not configured.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key or api_key == "your_tavily_key_here":
        return []

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth="basic",
            include_answer=False,
        )
        results = []
        for r in response.get("results", []):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", "")[:300],
            })
        return results
    except Exception:
        return []


def search_alternatives(service_name: str, category: str = "subscription") -> list[dict]:
    """Search for cheaper alternatives to a specific service/product."""
    query = f"best cheap alternatives to {service_name} {category} pricing 2026"
    return search_web(query, max_results=5)


def search_current_price(service_name: str) -> list[dict]:
    """Search for current pricing of a service."""
    query = f"{service_name} current price monthly cost 2026"
    return search_web(query, max_results=3)
