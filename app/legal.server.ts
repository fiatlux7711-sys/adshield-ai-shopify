export type LegalIdentity = { owner: string; email: string; address: string };

export function getLegalIdentity(): LegalIdentity | null {
  const owner = process.env.ADSHIELD_LEGAL_OWNER?.trim();
  const email = process.env.ADSHIELD_SUPPORT_EMAIL?.trim();
  const address = process.env.ADSHIELD_MAILING_ADDRESS?.trim();
  if (!owner || !email || !address) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) return null;
  return { owner, email, address };
}

export function requireLegalIdentity(): LegalIdentity {
  const identity = getLegalIdentity();
  if (!identity) throw new Response("Legal contact information is not configured", { status: 503 });
  return identity;
}
