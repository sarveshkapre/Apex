import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.APEX_API_URL ?? "http://localhost:4000/v1";

const proxy = async (request: NextRequest, params: Promise<{ path: string[] }>) => {
  const resolved = await params;
  const path = resolved.path.join("/");
  const target = `${API_BASE}/${path}${request.nextUrl.search}`;

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();

  const response = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-actor-id": request.headers.get("x-actor-id") ?? "ui-user",
      "x-actor-role": request.headers.get("x-actor-role") ?? "it-admin"
    },
    body
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
};

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}
