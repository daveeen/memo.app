import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/splash.tsx"),
    route("auth", "routes/auth.tsx"),
    route("ideas", "routes/ideas.tsx"),
    route("ideas/:id", "routes/ideas.$id.tsx"),
    route("record", "routes/record.tsx"),
    route("brief", "routes/brief.tsx"),
    route("songs", "routes/songs.tsx"),
    route("songs/new", "routes/songs.new.tsx"),
    route("songs/:id", "routes/songs.$id.tsx"),
  ]),
  route("produce/:songId", "routes/produce.tsx"),
] satisfies RouteConfig;
