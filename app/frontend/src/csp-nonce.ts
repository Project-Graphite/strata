export const cspNonce = () => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || undefined;
