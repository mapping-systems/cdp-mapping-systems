import type { Metadata } from "next";
import { TimeField } from "./components/TimeField";

export const metadata: Metadata = {
  title: { absolute: "NYC TIME FIELD" },
  description:
    "An interactive study of how walking and the subway reshape a fixed commute budget across New York City.",
};

export default function Home() {
  return <TimeField />;
}
