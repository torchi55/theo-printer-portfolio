// /api/focus on Cloudflare Pages: runs the same handler as Vercel (api/focus.js) through the Vercel shim.
import handler from "../../api/focus.js";
import { adapt } from "../_shared/vercel.js";

export const onRequest = adapt(handler);
