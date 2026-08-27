import { randomUUID } from "node:crypto";

const sidecar = "http://127.0.0.1:1106";
const profilePhotoPath = /^\/objects\/profile-photos\/[a-f0-9-]{36}$/;

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
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not prepare a secure profile photo upload.");
  return (await response.json() as { signed_url: string }).signed_url;
}

export function isProfilePhotoPath(value: string | null) {
  return Boolean(value && profilePhotoPath.test(value));
}

export async function createProfilePhotoUpload() {
  const fullPath = `${privateDirectory()}/profile-photos/${randomUUID()}`;
  const { bucket, object } = splitPath(fullPath);
  return {
    uploadURL: await signedObjectURL(bucket, object, "PUT"),
    objectPath: `/objects/profile-photos/${object.split("/").pop()}`,
  };
}

export async function createProfilePhotoAccessURL(objectPath: string) {
  if (!isProfilePhotoPath(objectPath)) throw new Error("Invalid profile photo path.");
  const fullPath = `${privateDirectory()}/${objectPath.slice("/objects/".length)}`;
  const { bucket, object } = splitPath(fullPath);
  return signedObjectURL(bucket, object, "GET");
}