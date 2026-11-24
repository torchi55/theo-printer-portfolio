// /api/feed on Cloudflare Pages: runs the same handler as Vercel (api/feed.js) through the Vercel shim.
import handler from "../../api/feed.js";
import { adapt } from "../_shared/vercel.js";

export const onRequest = adapt(handler);
