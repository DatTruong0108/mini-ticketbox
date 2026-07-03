import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Safe server-side JWT decoder
function decodeServerJwt(token: string) {
  try {
    const payloadBase64 = token.split(".")[1];
    const decodedJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
    return JSON.parse(decodedJson);
  } catch (e) {
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  // 1. If not logged in, redirect to login page
  if (!accessToken) {
    redirect("/");
  }

  // 2. If logged in but not an admin, block and redirect to custom forbidden error page
  const payload = decodeServerJwt(accessToken);
  if (!payload || payload.role !== "ADMIN") {
    redirect("/error?code=403");
  }

  return <>{children}</>;
}
