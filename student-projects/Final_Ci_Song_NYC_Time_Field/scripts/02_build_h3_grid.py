from pipeline import build_h3_grid


if __name__ == "__main__":
    grid = build_h3_grid()
    print(f"Built {len(grid):,} H3 analysis cells.")
