from __future__ import annotations

import argparse

from api_client import GridAssetClient
from qr_tools import label_text


def main() -> None:
    parser = argparse.ArgumentParser(description="TelecomNE Grid Asset Links desktop companion")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", default="admin123")
    subparsers = parser.add_subparsers(dest="command", required=True)
    preview = subparsers.add_parser("import-preview")
    preview.add_argument("entity")
    preview.add_argument("csv_path")
    export = subparsers.add_parser("export")
    export.add_argument("entity")
    export.add_argument("output_path")
    qr = subparsers.add_parser("qr")
    qr.add_argument("entity_type")
    qr.add_argument("entity_id")
    args = parser.parse_args()
    client = GridAssetClient(args.api)
    client.login(args.email, args.password)
    if args.command == "import-preview":
        print(client.import_preview(args.entity, args.csv_path))
    elif args.command == "export":
        print(client.export_csv(args.entity, args.output_path))
    elif args.command == "qr":
        print(client.generate_qr(args.entity_type, args.entity_id, label_text(args.entity_type, args.entity_id)))


if __name__ == "__main__":
    main()
