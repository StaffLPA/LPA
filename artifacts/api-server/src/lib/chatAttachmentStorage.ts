import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";

const client = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

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

export async function createChatAttachmentUpload() {
  const fullPath = `${privateDirectory()}/uploads/${randomUUID()}`;
  const { bucket, object } = splitPath(fullPath);
  const uploadURL = await signedObjectURL(bucket, object, "PUT");
  return { uploadURL, objectPath: `/objects/uploads/${object.split("/").pop()}` };
}

async function signedObjectURL(bucket: string, object: string, method: "PUT" | "GET") {
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket_name: bucket, object_name: object, method, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not prepare a secure upload.");
  return (await response.json() as { signed_url: string }).signed_url;
}

export async function getChatAttachmentFile(objectPath: string): Promise<File> {
  if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(objectPath)) throw new Error("Invalid attachment path.");
  const fullPath = `${privateDirectory()}/${objectPath.slice("/objects/".length)}`;
  const { bucket, object } = splitPath(fullPath);
  const file = client.bucket(bucket).file(object);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Attachment not found.");
  return file;
}

export async function createChatAttachmentDownloadURL(objectPath: string) {
  const fullPath = `${privateDirectory()}/${objectPath.slice("/objects/".length)}`;
  const { bucket, object } = splitPath(fullPath);
  return signedObjectURL(bucket, object, "GET");
}