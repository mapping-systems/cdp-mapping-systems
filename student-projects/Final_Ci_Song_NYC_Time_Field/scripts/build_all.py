import argparse

from pipeline import build_all


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build NYC TIME FIELD assets.")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-pluto", action="store_true")
    args = parser.parse_args()
    print(build_all(force=args.force, include_pluto=not args.skip_pluto))
