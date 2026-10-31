import io
import re

from gtts import gTTS

TTS_LANGS = ("en", "hi", "pa")
# Max characters per request; the browser splits long reports into chunks of this size
MAX_TTS_CHARS = 1500


def clean_for_speech(text):
    """Strip markdown (headings, bold, tables, links) so it reads naturally aloud."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)            # images
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)          # links -> link text
    text = re.sub(r"^\s*\|?\s*:?-{2,}.*$", " ", text, flags=re.M)  # table separator rows
    text = re.sub(r"^\s*\||\|\s*$", "", text, flags=re.M)        # outer table pipes
    text = text.replace("|", ", ")
    text = re.sub(r"[#*_`>~]+", " ", text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)
    text = re.sub(r"\s*\n\s*", ". ", text)                         # each line (heading, bullet, row) = a pause
    text = re.sub(r"([.!?।:,])(\s*\.)+", r"\1", text)               # no doubled punctuation
    text = re.sub(r"(\.\s*){2,}", ". ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,.")


def synthesize(text, language):
    """Return MP3 bytes for the text using Google's free TTS (gTTS)."""
    buf = io.BytesIO()
    gTTS(text, lang=language if language in TTS_LANGS else "en").write_to_fp(buf)
    return buf.getvalue()
