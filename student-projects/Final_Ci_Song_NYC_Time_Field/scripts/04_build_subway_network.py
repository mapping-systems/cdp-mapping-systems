from pipeline import build_subway_network


if __name__ == "__main__":
    scenarios = build_subway_network()
    for scenario in scenarios:
        print(
            f"{scenario['label']}: {scenario['active_trip_count']:,} trips, "
            f"{scenario['state_count']:,} states."
        )
