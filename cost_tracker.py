"""Token istifadəsi və xərc hesablama moduludu"""

# Azure OpenAI GPT-4o Standard pricing (USD / 1M tokens)
PRICING = {
    "gpt-4o": {
        "input": 2.50,   # $2.50 per 1M input tokens
        "output": 10.00, # $10.00 per 1M output tokens
    },
    "gpt-4o-mini": {
        "input": 0.15,
        "output": 0.60,
    },
    "gpt-4": {
        "input": 30.00,
        "output": 60.00,
    },
    "gpt-35-turbo": {
        "input": 0.50,
        "output": 1.50,
    },
}

# USD → AZN (təxmini, dəyişdirə bilərsən)
USD_TO_AZN = 1.70


def calculate_cost(input_tokens: int, output_tokens: int, model: str = "gpt-4o") -> dict:
    """Token sayından xərc hesabla"""
    # Model adını normalizə et (deployment adı model adından fərqli ola bilər)
    model_key = _normalize_model(model)
    prices = PRICING.get(model_key, PRICING["gpt-4o"])

    cost_usd = (
        (input_tokens / 1_000_000) * prices["input"]
        + (output_tokens / 1_000_000) * prices["output"]
    )
    cost_azn = cost_usd * USD_TO_AZN

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cost_usd": cost_usd,
        "cost_azn": cost_azn,
        "model": model_key,
    }


def _normalize_model(model: str) -> str:
    """Deployment adından model tipini tap"""
    m = model.lower()
    if "mini" in m:
        return "gpt-4o-mini"
    if "4o" in m or "4-o" in m:
        return "gpt-4o"
    if "gpt-4" in m or "gpt4" in m:
        return "gpt-4"
    if "35" in m or "3.5" in m or "turbo" in m:
        return "gpt-35-turbo"
    return "gpt-4o"  # default


def format_cost(cost_info: dict, compact: bool = False) -> str:
    """Xərci gözəl formatla"""
    tokens = cost_info["total_tokens"]
    usd = cost_info["cost_usd"]
    azn = cost_info["cost_azn"]

    if compact:
        # Inline kiçik göstəriş
        return f"🪙 {tokens:,} token • ${usd:.4f} (~{azn*100:.1f} qəpik)"

    return (
        f"Token: {tokens:,} (in: {cost_info['input_tokens']:,}, "
        f"out: {cost_info['output_tokens']:,}) • "
        f"Xərc: ${usd:.4f} (~{azn:.3f} AZN)"
    )


def aggregate_costs(cost_list: list) -> dict:
    """Bir neçə cost obyektini toplayır"""
    if not cost_list:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0,
                "cost_usd": 0.0, "cost_azn": 0.0, "calls": 0}

    return {
        "input_tokens": sum(c["input_tokens"] for c in cost_list),
        "output_tokens": sum(c["output_tokens"] for c in cost_list),
        "total_tokens": sum(c["total_tokens"] for c in cost_list),
        "cost_usd": sum(c["cost_usd"] for c in cost_list),
        "cost_azn": sum(c["cost_azn"] for c in cost_list),
        "calls": len(cost_list),
    }
