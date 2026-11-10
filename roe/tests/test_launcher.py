import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_launcher_stores_the_token_encrypted_outside_the_repo():
    s = (ROOT / "run_roe.ps1").read_text(encoding="utf-8")
    assert "ProtectedData" in s and "DataProtectionScope]::CurrentUser" in s       # DPAPI, per Windows user
    assert "$env:USERPROFILE" in s                                                  # stored outside the repo
    assert "Read-Host 'Push token' -AsSecureString" in s                           # hidden input
    assert "$_.Exception.Message" in s                                              # the real reason is shown if reading fails
    assert not re.search(r"ROE_PUSH_TOKEN\s*=\s*['\"][A-Za-z0-9]{20,}", s)         # no token in the file
    assert "Remove-Item -LiteralPath $tokenFile" in s                              # a refused token is forgotten
    assert "roe_sources.laptop.json" in s and "--push" in s


def test_bat_wrapper_and_gitignore():
    b = (ROOT / "run_roe.bat").read_text(encoding="utf-8")
    assert "run_roe.ps1" in b and "ExecutionPolicy Bypass" in b
    assert "roe_sources.laptop.json" in (ROOT / ".gitignore").read_text(encoding="utf-8")


def test_launcher_can_run_the_concept_cards_with_the_stored_token():
    s = (ROOT / "run_roe.ps1").read_text(encoding="utf-8")
    assert "[int]$Concepts" in s and "roe.concepts run --calls $n" in s
    assert s.index("$env:ROE_PUSH_TOKEN = $plain") < s.index("roe.concepts run")      # the token is loaded first
    assert "Math]::Min(12" in s                                                         # never more than a press
