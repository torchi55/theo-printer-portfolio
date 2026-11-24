// /api/stats on Cloudflare Pages: runs the same handler as Vercel (api/stats.js) through the Vercel shim.
import handler from "../../api/stats.js";
import { adapt } from "../_shared/vercel.js";

export const onRequest = adapt(handler);
