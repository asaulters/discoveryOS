// Storage HTTP emulation backed by real PostgreSQL RLS; signed downloads use short-lived tokens.
import crypto from "node:crypto";
const files = new Map(),
  signed = new Map();
export async function storageProtocol({ db, req, res, url, bytes, send }) {
  if (!url.pathname.startsWith("/storage/v1/")) return false;
  if (url.pathname.startsWith("/storage/v1/object/public/")) {
    send(res, 403, { message: "Private bucket" });
    return true;
  }
  const match = url.pathname.match(
    /^\/storage\/v1\/object\/(info\/|sign\/)?(project-files)\/(.+)$/,
  );
  if (!match) {
    send(res, 404, { message: "Unknown storage path" });
    return true;
  }
  const [, operation, bucket, encoded] = match,
    path = decodeURIComponent(encoded),
    key = `${bucket}/${path}`;
  if (operation === "sign/" && req.method === "GET") {
    const token = url.searchParams.get("token"),
      record = signed.get(token);
    if (
      !record ||
      record.key !== key ||
      record.expiry < Date.now() ||
      !files.has(key)
    ) {
      send(res, 403, { message: "Invalid token" });
      return true;
    }
    const file = files.get(key),
      filename = (url.searchParams.get("download") || "attachment").replace(
        /["\r\n]/g,
        "_",
      );
    res.writeHead(200, {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    });
    res.end(file.bytes);
    return true;
  }
  if (!operation && req.method === "POST") {
    const form = await new Request(url, {
        method: "POST",
        headers: req.headers,
        body: bytes,
      }).formData(),
      upload = form.get("");
    if (!upload || typeof upload === "string") throw Error("File required");
    const fileBytes = Buffer.from(await upload.arrayBuffer());
    if (!fileBytes.length || fileBytes.length > 26214400)
      throw Error("Invalid file size");
    const r = await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3::jsonb) returning id",
      [
        bucket,
        path,
        JSON.stringify({
          size: fileBytes.length,
          mimetype: upload.type || "application/octet-stream",
        }),
      ],
    );
    files.set(key, {
      bytes: fileBytes,
      contentType: upload.type || "application/octet-stream",
    });
    send(res, 200, { Id: r.rows[0].id, Key: key });
    return true;
  }
  const row = (
    await db.query(
      "select * from storage.objects where bucket_id=$1 and name=$2",
      [bucket, path],
    )
  ).rows[0];
  if (!row || !files.has(key)) {
    send(res, 403, { message: "Object not accessible" });
    return true;
  }
  if (operation === "info/" && req.method === "GET") {
    send(res, 200, {
      id: row.id,
      name: path,
      bucket_id: bucket,
      size: row.metadata.size,
      content_type: row.metadata.mimetype,
    });
    return true;
  }
  if (operation === "sign/" && req.method === "POST") {
    const { expiresIn } = JSON.parse(bytes.toString()),
      token = crypto.randomUUID();
    signed.set(token, { key, expiry: Date.now() + expiresIn * 1000 });
    send(res, 200, { signedURL: `/object/sign/${key}?token=${token}` });
    return true;
  }
  send(res, 405, { message: "Unsupported storage operation" });
  return true;
}
