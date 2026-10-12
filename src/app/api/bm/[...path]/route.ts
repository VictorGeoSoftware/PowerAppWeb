import { proxyToBackend } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

const handler = async (request: Request, { params }: Ctx) =>
  proxyToBackend(request, (await params).path);

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
