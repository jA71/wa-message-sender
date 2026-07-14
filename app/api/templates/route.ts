import { type NextRequest, NextResponse } from "next/server";
import { listTemplates } from "@/lib/meta-api";

export async function GET(request: NextRequest) {
  const wabaId = request.headers.get("x-waba-id");
  const accessToken = request.headers.get("x-access-token");

  if (!wabaId || !accessToken) {
    return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
  }

  try {
    const templates = await listTemplates(wabaId, accessToken);
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch templates" },
      { status: 500 }
    );
  }
}
