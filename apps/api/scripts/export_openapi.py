"""Write the OpenAPI schema for the typed frontend client (packages/api-client)."""

import json
from pathlib import Path

from app.main import app

OUT = Path(__file__).resolve().parents[3] / "packages" / "api-client" / "openapi.json"

if __name__ == "__main__":
    OUT.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print(f"wrote {OUT}")
