"""Arabic text utilities for Al-Shughaily."""

import re
import unicodedata

# Tashkeel (diacritical marks) Unicode range
_TASHKEEL = re.compile(r"[\u0617-\u061A\u064B-\u0652\u0670]")

# Alef variants -> bare alef
_ALEF_VARIANTS = re.compile(r"[\u0622\u0623\u0625\u0671]")

# Ya variants -> dotless ya
_YA_VARIANTS = re.compile(r"[\u0649]")

# Taa marbuta -> ha
_TAA_MARBUTA = re.compile(r"\u0629")

# Arabic character range (basic + extended)
_ARABIC_CHAR = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")


def remove_tashkeel(text: str) -> str:
    """Remove Arabic diacritical marks (tashkeel) from text."""
    if not text:
        return text
    return _TASHKEEL.sub("", text)


def normalize_arabic(text: str) -> str:
    """Normalize Arabic text for consistent matching.

    - Removes tashkeel
    - Unifies alef variants to bare alef
    - Normalises ya/alef maqsura
    - Normalises taa marbuta to ha
    - Strips extra whitespace
    """
    if not text:
        return text

    text = remove_tashkeel(text)
    text = _ALEF_VARIANTS.sub("\u0627", text)  # bare alef
    text = _YA_VARIANTS.sub("\u064A", text)  # ya with dots
    text = _TAA_MARBUTA.sub("\u0647", text)  # ha
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_arabic(text: str) -> bool:
    """Return True if the majority of alphabetic characters are Arabic."""
    if not text:
        return False
    arabic_count = len(_ARABIC_CHAR.findall(text))
    alpha_count = sum(1 for c in text if unicodedata.category(c).startswith("L"))
    if alpha_count == 0:
        return False
    return arabic_count / alpha_count > 0.5
