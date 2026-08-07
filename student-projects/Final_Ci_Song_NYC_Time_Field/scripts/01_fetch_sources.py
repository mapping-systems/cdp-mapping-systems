from pipeline import fetch_sources


if __name__ == "__main__":
    result = fetch_sources(include_pluto=True)
    print(f"Fetched {len(result['sources'])} source snapshots.")
