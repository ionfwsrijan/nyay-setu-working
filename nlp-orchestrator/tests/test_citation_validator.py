import json
from pathlib import Path


def test_bns_bnss_section_ranges():
    data_path = Path("data/legal_sections.json")

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["acts"]["BNS"]["section_range"] == [1, 358]
    assert data["acts"]["BNSS"]["section_range"] == [1, 531]