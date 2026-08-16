// /llms.txt — ビルド時生成（テンプレート＋property_facts の実数値）
import type { APIRoute } from "astro";
import template from "../data/llms.template.txt?raw";
import { renderLlms, LLMS_HEADERS } from "../lib/llms";

export const GET: APIRoute = async () =>
  new Response(await renderLlms(template), { headers: LLMS_HEADERS });
