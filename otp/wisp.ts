// Codes from a Wisp server (`GET /api/v1/codes`, Wisp's docs/API.md): Wisp
// reads them out of every account it keeps (SMS, mail, chats) as they
// arrive. A code carries no message text, so the account it came through
// stands in for it until Wisp sends one.
import { getCACertificates, rootCertificates } from "node:tls";
import type { Code } from "./index.ts";

export type WispCode = { code: string; issuer: string; sentAt: string; account?: string; messageId: number; text?: string };

const HTTP_MS = 10_000;
const LIMIT = 200;

/** No server or no token in the settings. */
export class NotSetUp extends Error {}

/** Bun's roots and the ones this machine trusts, so a server behind a private CA (Caddy's `tls internal`) answers as in a browser. */
let trusted: string[] | undefined;
const tls = () => ({ ca: (trusted ??= [...rootCertificates, ...(() => { try { return getCACertificates("system"); } catch { return []; } })()]) });

export async function wispCodes(url: string, token: string, hours: number): Promise<Code[]> {
  const base = url.trim().replace(/\/+$/, "");
  if (!base) throw new NotSetUp("No Wisp server: set its address under Settings › Extensions › Verification Codes");
  if (!token.trim()) throw new NotSetUp("No Wisp token: make one in Wisp (Accounts › Agent tokens, Read) and paste it under Settings › Extensions › Verification Codes");
  let r: Response;
  try {
    r = await fetch(`${base}/api/v1/codes?since=${Math.max(1, hours)}h&limit=${LIMIT}`, { headers: { authorization: `Bearer ${token.trim()}` }, signal: AbortSignal.timeout(HTTP_MS), tls: tls() });
  } catch (e) {
    throw new Error(`Wisp is unreachable at ${base}: ${e instanceof Error && e.name === "TimeoutError" ? `no answer within ${HTTP_MS / 1000} s` : e instanceof Error ? e.message : String(e)}`);
  }
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Wisp refused the token: make a new one with Read scope" : `Wisp answered ${r.status}`);
  const { codes } = (await r.json()) as { codes: WispCode[] };
  return codes.map(fromWisp);
}

export const fromWisp = (c: WispCode): Code => ({ id: `w${c.messageId}-${c.code}`, code: c.code, sender: c.issuer, name: c.issuer, text: c.text || c.account || "", at: Date.parse(c.sentAt) });
