export type FakeFile = { name: string; bytes: number };

export function rawEmail(to: string, html: string, files: FakeFile[] = []) {
  const boundary = "b0undary";
  const parts = [
    `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n`,
    ...files.map(
      (f) =>
        `--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${f.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa("x".repeat(f.bytes))}\r\n`,
    ),
  ];
  return `From: Sender <sender@example.org>\r\nTo: ${to}\r\nSubject: quota\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n${parts.join("")}--${boundary}--\r\n`;
}

export type Forwarded = { to: string; headers: Headers };

export function fakeMessage(to: string, raw: string, forwarded: Forwarded[] = []) {
  const bytes = new TextEncoder().encode(raw);
  return {
    to,
    from: "sender@example.org",
    rawSize: bytes.byteLength,
    raw: new Response(bytes).body,
    headers: new Headers(),
    setReject: () => {},
    forward: async (target: string, headers: Headers) => {
      forwarded.push({ to: target, headers });
    },
    reply: async () => {},
  } as unknown as ForwardableEmailMessage;
}

export const fakeCtx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
