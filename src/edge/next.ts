import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleEdge } from "./index";

export async function edgeRoute(request: Request) {
  const { env, ctx } = await getCloudflareContext({ async: true });
  return (await handleEdge(request, env, ctx)) ?? new Response(null, { status: 404 });
}
