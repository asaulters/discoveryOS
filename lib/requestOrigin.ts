/** Next may normalize the URL hostname to localhost in development.
 * The Host header retains the authority the browser actually requested.
 */
export function requestOrigin(request: Pick<Request, "url" | "headers">): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return host ? new URL(`${url.protocol}//${host}`).origin : url.origin;
}
