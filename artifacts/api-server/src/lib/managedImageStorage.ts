import { randomUUID } from "node:crypto";

const sidecar = "http://127.0.0.1:1106";
const managedImagePath = /^\/objects\/schedule-images\/(?:weekly-schedule|lunch-program)-[a-f0-9-]{36}$/;

function privateDirectory() {
  const directory = process.env.PRIVATE_OBJECT_DIR;
  if (!directory) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  return directory.replace(/\/+$/, "");
}

function splitPath(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path.");
  return { bucket: parts[0], object: parts.slice(1).join("/") };
}

async function signedObjectURL(bucket: string, object: string, method: "PUT" | "GET") {
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket_name: bucket, object_name: object, method, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not prepare a secure image upload.");
  return (await response.json() as { signed_url: string }).signed_url;
}

export function isManagedImagePath(path: string | null) {
  return Boolean(path && managedImagePath.test(path));
}

export async function createManagedImageUpload(kind: "weekly-schedule" | "lunch-program") {
  const fullPath = `${privateDirectory()}/schedule-images/${kind}-${randomUUID()}`;
  const { bucket, object } = splitPath(fullPath);
  return {
    uploadURL: await signedObjectURL(bucket, object, "PUT"),
    objectPath: `/objects/schedule-images/${object.split("/").pop()}`,
  };
}

export async function createManagedImageAccessURL(objectPath: string) {
  if (!isManagedImagePath(objectPath)) throw new Error("Invalid managed image path.");
  const fullPath = `${privateDirectory()}/${objectPath.slice("/objects/".length)}`;
  const { bucket, object } = splitPath(fullPath);
  return signedObjectURL(bucket, object, "GET");
}