from pipeline import build_manifest


if __name__ == "__main__":
    manifest = build_manifest()
    print(
        f"Manifest ready for {manifest['cell_count']:,} cells and "
        f"{manifest['station_count']:,} stations."
    )
