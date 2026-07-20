import type { Route } from "./+types/record";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Memo" },
    { name: "description", content: "Hum it. Memo turns it into a song skeleton." },
  ];
}

export default function Record() {
  return <p>Record</p>;
}
