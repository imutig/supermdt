import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Routes d'authentification Convex Auth.
auth.addHttpRoutes(http);

export default http;
