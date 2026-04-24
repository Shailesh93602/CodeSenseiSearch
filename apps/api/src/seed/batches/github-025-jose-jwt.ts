/**
 * Batch github-025-jose-jwt
 *
 * 20 high-quality entries on jose (panva/jose) JWT/JWS/JWE patterns drawn
 * from the actual source. Each entry is attributed to a real file in the
 * repo at https://github.com/panva/jose (main branch).
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const jose = { owner: 'panva', name: 'jose' };
const baseUrl = 'https://github.com/panva/jose/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'SignJWT: builder pattern for compact JWS-formatted JWTs',
    body: `\`SignJWT\` is a fluent builder that produces a Compact JWS string. The constructor accepts the claims payload (default \`{}\`); chained setters mutate an internal \`JWTClaimsBuilder\`; \`sign(key)\` finalizes the token.

\`\`\`ts
const jwt = await new SignJWT({ 'urn:example:claim': true })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setIssuer('urn:example:issuer')
  .setAudience('urn:example:audience')
  .setExpirationTime('2h')
  .sign(secret)
\`\`\`

Internally \`sign()\` constructs a \`CompactSign\` over the JSON-serialized claims and delegates the actual signing:

\`\`\`ts
async sign(key, options?) {
  const sig = new CompactSign(this.#jwt.data())
  sig.setProtectedHeader(this.#protectedHeader)
  if (
    Array.isArray(this.#protectedHeader?.crit) &&
    this.#protectedHeader.crit.includes('b64') &&
    this.#protectedHeader.b64 === false
  ) {
    throw new JWTInvalid('JWTs MUST NOT use unencoded payload')
  }
  return sig.sign(key, options)
}
\`\`\`

Why a builder rather than a one-shot \`sign(payload, options)\`? Because the JWT spec splits header and claims into two distinct objects with different rules. A builder keeps the header-vs-claims split obvious in the call site and lets the library reject bad combinations (here: \`b64: false\` with the JWT Claims Set, which RFC 7519 forbids — an unencoded payload is a JWS extension, but JWTs MUST be base64url-encoded).

Non-obvious gotcha: the setters only mutate; nothing is validated until \`sign()\`. If you call \`setExpirationTime('-2h')\` (already-expired token) the builder accepts it and emits a perfectly valid signed JWT — verification will then throw \`JWTExpired\`. Use this on purpose for testing expired-token paths; don't be surprised when a typo in the duration string silently produces a token that fails downstream.

Also: \`setProtectedHeader\` is the ONLY non-claim setter. There is no way to add an Unprotected Header through \`SignJWT\` because compact JWS has no unprotected header by spec. If you need an unprotected header (multi-recipient signatures, key hints), drop down to \`FlattenedSign\` or \`GeneralSign\` directly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'sign', 'jws', 'compact'],
    repository: jose,
    filePath: 'src/jwt/sign.ts',
    url: `${baseUrl}/src/jwt/sign.ts`,
  },
  {
    title: 'jwtVerify: signature first, claims second — overload-driven key resolution',
    body: `\`jwtVerify\` has two TypeScript overloads — pass a key directly OR pass a \`getKey\` resolver function (used by \`createRemoteJWKSet\`). The implementation always defers to \`compactVerify\`, then runs the claims-set validator on the decoded payload.

\`\`\`ts
export async function jwtVerify(jwt, key, options?) {
  const verified = await compactVerify(jwt, key, options)
  if (verified.protectedHeader.crit?.includes('b64') && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid('JWTs MUST NOT use unencoded payload')
  }
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options)
  const result = { payload, protectedHeader: verified.protectedHeader }
  if (typeof key === 'function') {
    return { ...result, key: verified.key }
  }
  return result
}
\`\`\`

Order matters and is non-obvious: signature verification happens BEFORE claims validation. If the signature is invalid, you get \`JWSSignatureVerificationFailed\` and never see the (untrusted) claims. Conversely, if the signature is valid but \`exp\` is in the past, you get \`JWTExpired\` and the (now trusted) payload is attached to the error as \`err.payload\` — useful for logging the subject of an expired token without re-decoding it manually.

The function-vs-key overload is what enables the \`createRemoteJWKSet(url)\` JWKS pattern: the resolver gets the parsed protected header BEFORE any signature work, picks the matching key by \`kid\`+\`alg\`, and returns it. When you pass a function, the result also includes \`key\` — the actually-used \`CryptoKey\` — so you can log which JWKS entry verified the token.

Gotcha: \`options\` are passed through to BOTH \`compactVerify\` and \`validateClaimsSet\`. \`algorithms\` (allowed JWS algs) belongs to the former; \`issuer\`/\`audience\`/\`maxTokenAge\` to the latter. There's no separate "claims options" object — they all live on the same \`JWTVerifyOptions\` shape, which is intentional but trips people who try to type the option bags separately.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'verify', 'jwks', 'claims'],
    repository: jose,
    filePath: 'src/jwt/verify.ts',
    url: `${baseUrl}/src/jwt/verify.ts`,
  },
  {
    title: 'JWT Claims Set validation: presence checks before value checks',
    body: `\`validateClaimsSet\` is the single source of truth for \`iss\`/\`sub\`/\`aud\`/\`exp\`/\`nbf\`/\`iat\`/\`typ\` enforcement. The order is deliberate: presence first (collected into a single Set so duplicates don't double-throw), then value comparisons, then time checks.

\`\`\`ts
const presenceCheck = [...requiredClaims]
if (maxTokenAge !== undefined) presenceCheck.push('iat')
if (audience !== undefined)    presenceCheck.push('aud')
if (subject !== undefined)     presenceCheck.push('sub')
if (issuer !== undefined)      presenceCheck.push('iss')

for (const claim of new Set(presenceCheck.reverse())) {
  if (!(claim in payload)) {
    throw new JWTClaimValidationFailed(
      \`missing required "\${claim}" claim\`, payload, claim, 'missing'
    )
  }
}
\`\`\`

The \`reverse()\` is so that an explicit \`requiredClaims: ['custom']\` is checked LAST after the implicit ones — this gives consistent error ordering across runs. The \`new Set(...)\` collapses the case where you both passed \`audience\` and listed \`'aud'\` in \`requiredClaims\`.

Then comes value checks. \`issuer\` accepts a string OR string[]:

\`\`\`ts
if (issuer && !((Array.isArray(issuer) ? issuer : [issuer]) as unknown[]).includes(payload.iss)) {
  throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, 'iss', 'check_failed')
}
\`\`\`

Audience is more subtle. The \`aud\` claim in the JWT may itself be a string OR an array (RFC 7519 §4.1.3), and the verifier may want to accept ANY of N audiences. \`checkAudiencePresence\` handles all four combinations using \`Set\` intersection.

Time checks come last and use \`clockTolerance\` (in seconds, or the same string format as durations — \`'30s'\`, \`'2m'\`). The check is \`payload.exp <= now - tolerance\` (NOT \`<\`), so a token that expires exactly at \`now\` is rejected. \`nbf\` similarly uses \`payload.nbf > now + tolerance\` so a token whose \`nbf\` is exactly \`now\` is accepted.

Gotcha: if you set \`maxTokenAge\` but the token has no \`iat\`, you get a presence error with \`reason: 'missing'\`. If \`iat\` is present but in the future (clock skew), you get \`reason: 'check_failed'\` from the \`age < 0 - tolerance\` branch — the latter is easy to miss because the message says "too far in the past" only for the other direction.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'claims', 'iss', 'aud', 'exp'],
    repository: jose,
    filePath: 'src/lib/jwt_claims_set.ts',
    url: `${baseUrl}/src/lib/jwt_claims_set.ts`,
  },
  {
    title: 'requiredClaims + expectedAudience policy: enforcing OIDC-style guarantees',
    body: `The \`requiredClaims\` option lets you force presence of arbitrary claims that jose doesn't otherwise check (e.g. \`'sub'\`, \`'jti'\`, \`'azp'\` for OIDC). It composes with the implicit presence checks driven by \`audience\`, \`issuer\`, \`subject\`, and \`maxTokenAge\`:

\`\`\`ts
const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options
const presenceCheck = [...requiredClaims]

if (maxTokenAge !== undefined) presenceCheck.push('iat')
if (audience !== undefined)    presenceCheck.push('aud')
if (subject !== undefined)     presenceCheck.push('sub')
if (issuer !== undefined)      presenceCheck.push('iss')
\`\`\`

So if you do \`{ audience: 'urn:api', requiredClaims: ['sub', 'azp'] }\` you get four presence checks: \`aud\`, \`sub\`, \`azp\` (\`requiredClaims\` items first). The dedupe via \`new Set(presenceCheck.reverse())\` means \`requiredClaims: ['aud']\` together with \`audience: 'urn:api'\` only produces one error, not two.

Why this matters for OIDC: a typical access-token verifier needs \`{ issuer: 'https://issuer/', audience: 'urn:api', requiredClaims: ['sub', 'azp', 'jti'] }\`. The library only enforces presence for \`requiredClaims\`; if you want value enforcement of \`azp\` (e.g. specific authorized party), you check \`payload.azp === expected\` yourself after \`jwtVerify\` resolves. There is intentionally no \`expectedAzp\` option — jose limits "policy" to RFC 7519's registered claims, leaving custom-claim policy to the caller.

The \`audience\` option is the only one that supports multi-value matching: pass \`['urn:api-v1', 'urn:api-v2']\` and the token's \`aud\` claim (string or array) must intersect.

Gotcha: unlike \`audience\`, \`subject\` is strict equality only (\`payload.sub !== subject\`). There's no way to say "subject must be one of these values" without checking the payload yourself after \`jwtVerify\`. This is by design — \`sub\` is a single identifier per RFC 7519 §4.1.2 — but it surprises people coming from libraries that overloaded subject.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'claims', 'requiredClaims', 'audience', 'oidc'],
    repository: jose,
    filePath: 'src/lib/jwt_claims_set.ts',
    url: `${baseUrl}/src/lib/jwt_claims_set.ts`,
  },
  {
    title: 'setExpirationTime accepts duration strings, Date, or epoch numbers',
    body: `The \`exp\`/\`nbf\`/\`iat\` setters accept three input shapes. The internal \`JWTClaimsBuilder\` setter for \`exp\` shows the dispatch:

\`\`\`ts
set exp(value: number | string | Date) {
  if (typeof value === 'number') {
    this.#payload.exp = validateInput('setExpirationTime', value)
  } else if (value instanceof Date) {
    this.#payload.exp = validateInput('setExpirationTime', epoch(value))
  } else {
    this.#payload.exp = epoch(new Date()) + secs(value)
  }
}
\`\`\`

So \`setExpirationTime(1700000000)\` is taken as an absolute NumericDate (seconds since epoch — NOT milliseconds), \`setExpirationTime(new Date(...))\` is converted via \`epoch()\` (\`Math.floor(date.getTime()/1000)\`), and \`setExpirationTime('2h')\` is \`now + 7200\`.

The duration parser supports \`s/sec/secs/second/seconds\`, \`m/min/mins/minute/minutes\`, \`h/hr/hrs/hour/hours\`, \`d/day/days\`, \`w/week/weeks\`, \`y/yr/yrs/year/years\` (a year is \`365.25 days\`). Negatives work via leading \`-\` or trailing \`ago\`: \`'-30s'\` and \`'30s ago'\` both produce \`now - 30\`. The trailing form is meant for \`setIssuedAt('5m ago')\` — handy for backdating tokens in tests.

Gotcha 1: numbers are SECONDS, not milliseconds. \`setExpirationTime(Date.now() + 7200000)\` produces a token that expires in the year 56,837 — and verification won't catch that because \`exp\` just needs to be in the future. Always use the string form (\`'2h'\`) or pass a Date.

Gotcha 2: \`setIssuedAt()\` with no argument uses \`new Date()\` directly (\`this.#payload.iat = epoch(new Date())\`). Calling \`setIssuedAt(0)\` does NOT mean "now" — it means "1970-01-01", which combined with \`maxTokenAge\` always fails. There's no overload for "zero means default"; you must omit the argument entirely.

Gotcha 3: \`secs()\` throws \`TypeError: 'Invalid time period format'\` on bad input. So \`setExpirationTime('2 hours')\` works, but \`setExpirationTime('two hours')\` throws synchronously inside the setter — not in \`sign()\`. The early throw matters for tests: a malformed duration crashes at the call site rather than producing a token that quietly verifies-then-fails on the consumer; resist the urge to wrap the chained setters in a try/catch unless you actually want lazy validation.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'exp', 'duration', 'setExpirationTime'],
    repository: jose,
    filePath: 'src/lib/jwt_claims_set.ts',
    url: `${baseUrl}/src/lib/jwt_claims_set.ts`,
  },
  {
    title: 'Key inputs: CryptoKey, KeyObject, JWK, or Uint8Array — checked per-algorithm',
    body: `Every signing/verifying/encrypting/decrypting entry point accepts one union type:

\`\`\`ts
key: types.CryptoKey | types.KeyObject | types.JWK | Uint8Array
\`\`\`

\`CryptoKey\` is the Web Crypto type (works in browsers, Deno, Bun, edge runtimes). \`KeyObject\` is the Node.js native type. \`JWK\` is a plain object that gets imported on the fly. \`Uint8Array\` is for symmetric secrets and is the most efficient option for HS* algorithms.

\`checkKeyType(alg, key, usage)\` switches on the alg prefix to decide whether the key shape is symmetric or asymmetric:

\`\`\`ts
switch (alg.substring(0, 2)) {
  case 'A1': case 'A2': // AES variants
  case 'di':            // dir
  case 'HS':            // HMAC
  case 'PB':            // PBES2
    symmetricTypeCheck(alg, key, usage)
    break
  default:
    asymmetricTypeCheck(alg, key, usage)
}
\`\`\`

\`asymmetricTypeCheck\` then enforces direction: signing requires a private key, verifying requires a public key, encrypting requires a public key, decrypting requires a private key. Pass a \`CryptoKey\` of the wrong \`type\`:

\`\`\`ts
if (key.type === 'public') {
  switch (usage) {
    case 'sign':
      throw new TypeError(
        \`\${tag(key)} instances for asymmetric algorithm signing must be of type "private"\`
      )
\`\`\`

If you pass a JWK, \`jwkMatchesOp\` cross-checks the JWK's own \`use\`, \`alg\`, and \`key_ops\` parameters against your usage. If the JWK declares \`use: 'enc'\` and you try to sign with it, \`TypeError: Invalid key for this operation, its "use" must be "sig" when present\`.

Gotcha: passing the same RSA private key to both \`SignJWT.sign()\` and \`EncryptJWT.encrypt()\` will work mechanically (the underlying RSA key has both capabilities) but the JWK \`use\` parameter will fail-fast if you exported with a use hint. Best practice is one key per use.

Also: when you pass a \`Uint8Array\` for HS256, jose treats it as raw secret bytes. \`new TextEncoder().encode('hex-string')\` yields ASCII bytes of the hex characters, NOT the hex-decoded value — a recurrent bug for people porting from libraries that auto-decode hex. Use \`base64url.decode\` or \`hex.decode\` if you have an encoded secret.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'key', 'CryptoKey', 'JWK', 'Uint8Array'],
    repository: jose,
    filePath: 'src/lib/check_key_type.ts',
    url: `${baseUrl}/src/lib/check_key_type.ts`,
  },
  {
    title: 'generateKeyPair: per-algorithm Web Crypto parameters and 2048-bit RSA floor',
    body: `\`generateKeyPair(alg, options?)\` resolves to \`{ publicKey, privateKey }\` using the runtime's Web Crypto. The function is a giant switch from JWA alg identifier to Web Crypto's \`{ name, hash, modulusLength, namedCurve, ... }\` parameter shape.

\`\`\`ts
case 'PS256': case 'PS384': case 'PS512':
  algorithm = {
    name: 'RSA-PSS',
    hash: \`SHA-\${alg.slice(-3)}\`,
    publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
    modulusLength: getModulusLengthOption(options),
  }
  keyUsages = ['sign', 'verify']
  break
case 'ES256':
  algorithm = { name: 'ECDSA', namedCurve: 'P-256' }
  keyUsages = ['sign', 'verify']
  break
case 'Ed25519':
case 'EdDSA':
  algorithm = { name: 'Ed25519' }
  keyUsages = ['sign', 'verify']
  break
\`\`\`

\`getModulusLengthOption\` enforces a 2048-bit floor for RSA — \`generateKeyPair('RS256', { modulusLength: 1024 })\` throws \`JOSENotSupported('Invalid or unsupported modulusLength option provided, 2048 bits or larger keys must be used')\`. The default is 2048 bits, which is what NIST currently allows; for new systems prefer 3072 (\`{ modulusLength: 3072 }\`) or skip RSA entirely for ES256/Ed25519.

\`extractable\` defaults to \`false\` for the private key, which is the safer default — you cannot \`exportJWK\`/\`exportPKCS8\` a non-extractable key. If you need to persist the generated key (writing to KV storage, sharing across processes), pass \`{ extractable: true }\`.

Public exponent is hardcoded to \`0x010001\` (65537) — the JOSE-standard value. There is no option to override; supplying weird exponents is a known footgun and the spec doesn't allow it.

Gotcha: \`Ed25519\` and \`EdDSA\` both map to Web Crypto \`{ name: 'Ed25519' }\` (note the alg \`'EdDSA'\` is the legacy JOSE identifier; \`'Ed25519'\` is the modern one preferred by RFC 8037). Generating with \`'EdDSA'\` and then signing with \`alg: 'Ed25519'\` (or vice-versa) WORKS at the crypto layer but JWKS resolution treats them as different algs — be consistent across producer and consumer.

Web Crypto support varies: ML-DSA-44/65/87 (post-quantum) was added recently and only Node.js >=24 supports it; older runtimes throw \`Unrecognized name\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'key', 'generateKeyPair', 'rsa', 'ecdsa', 'ed25519'],
    repository: jose,
    filePath: 'src/key/generate_key_pair.ts',
    url: `${baseUrl}/src/key/generate_key_pair.ts`,
  },
  {
    title: 'generateSecret: HS256 returns CryptoKey, A128CBC-HS256 returns Uint8Array',
    body: `Symmetric secrets are not all the same shape. \`generateSecret(alg)\` returns either a \`CryptoKey\` or a \`Uint8Array\` depending on the algorithm — a non-obvious but unavoidable quirk.

\`\`\`ts
case 'HS256': case 'HS384': case 'HS512':
  length = parseInt(alg.slice(-3), 10)
  algorithm = { name: 'HMAC', hash: \`SHA-\${length}\`, length }
  keyUsages = ['sign', 'verify']
  break
case 'A128CBC-HS256': case 'A192CBC-HS384': case 'A256CBC-HS512':
  length = parseInt(alg.slice(-3), 10)
  return crypto.getRandomValues(new Uint8Array(length >> 3))
case 'A128KW': case 'A192KW': case 'A256KW':
  length = parseInt(alg.slice(1, 4), 10)
  algorithm = { name: 'AES-KW', length }
  keyUsages = ['wrapKey', 'unwrapKey']
  break
\`\`\`

The CBC-HS family gets a raw \`Uint8Array\` because Web Crypto cannot represent a "compound" CBC-then-HMAC key as a single \`CryptoKey\` — these algorithms actually use TWO sub-keys (encryption + MAC) packed into one buffer. JOSE handles the split internally; users just see a \`Uint8Array\` of length 32/48/64.

For HS*, AES-KW, AES-GCM, AES-GCMKW you get a real \`CryptoKey\` honoring \`extractable\` (default \`false\`). For the CBC-HS family the \`extractable\` option has no effect — there's literally no key object to flag.

Gotcha: this means the return type is \`Promise<CryptoKey | Uint8Array>\`. Code like:

\`\`\`ts
const secret = await generateSecret('HS256')
await crypto.subtle.exportKey('raw', secret) // FAILS for A128CBC-HS256 path
\`\`\`

needs the typeof check for portability. The recommended pattern is to commit to one algorithm class and type the variable narrowly: \`const secret = (await generateSecret('HS256')) as CryptoKey\`.

Why the length math (\`alg.slice(-3)\` for HS, \`alg.slice(1, 4)\` for A*)? The substring positions encode the bit length: \`HS256\` → \`'256'\`, \`A128KW\` → \`'128'\`. \`length >> 3\` converts bits to bytes.

Why default \`extractable: false\`? An extractable secret can be \`exportJWK\`'d and exfiltrated by any code with a reference to it — making secrets non-extractable is browser-side defense in depth. If you're storing the secret in your own backend KV, you'll want \`{ extractable: true }\` so you can serialize.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'key', 'generateSecret', 'hmac', 'aes'],
    repository: jose,
    filePath: 'src/key/generate_secret.ts',
    url: `${baseUrl}/src/key/generate_secret.ts`,
  },
  {
    title: 'importPKCS8 / importSPKI / importX509 / importJWK: four paths to a CryptoKey',
    body: `jose covers every standard private/public key serialization format you'll find in OAuth/OIDC infrastructure:

\`\`\`ts
export async function importSPKI(spki: string, alg: string, options?) {
  if (typeof spki !== 'string' || spki.indexOf('-----BEGIN PUBLIC KEY-----') !== 0) {
    throw new TypeError('"spki" must be SPKI formatted string')
  }
  return fromSPKI(spki, alg, options)
}

export async function importPKCS8(pkcs8: string, alg: string, options?) {
  if (typeof pkcs8 !== 'string' || pkcs8.indexOf('-----BEGIN PRIVATE KEY-----') !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string')
  }
  return fromPKCS8(pkcs8, alg, options)
}

export async function importX509(x509: string, alg: string, options?) {
  if (typeof x509 !== 'string' || x509.indexOf('-----BEGIN CERTIFICATE-----') !== 0) {
    throw new TypeError('"x509" must be X.509 formatted string')
  }
  return fromX509(x509, alg, options)
}
\`\`\`

The PEM header is checked at \`indexOf === 0\` — leading whitespace fails the check. Trim before passing.

\`importJWK(jwk, alg?, options?)\` is the runtime-flexible one: it routes by \`kty\`, derives Web Crypto params from \`alg\` (which can be omitted if the JWK has its own \`alg\`), and returns either a \`CryptoKey\` (for \`RSA\`/\`EC\`/\`OKP\`/\`AKP\`) or a \`Uint8Array\` (for \`oct\`):

\`\`\`ts
switch (jwk.kty) {
  case 'oct':
    if (typeof jwk.k !== 'string' || !jwk.k) throw new TypeError('missing "k" Parameter value')
    return decodeBase64URL(jwk.k)
  case 'RSA':
    if ('oth' in jwk && jwk.oth !== undefined) {
      throw new JOSENotSupported('RSA JWK "oth" Parameter value is not supported')
    }
    return jwkToKey({ ...jwk, alg, ext })
\`\`\`

The \`oth\` rejection is for multi-prime RSA keys (RFC 7518 §6.3.2.7) — these are extremely rare and Web Crypto doesn't support them.

Gotcha #1: the warning at the top of \`importPKCS8\`: "The OID id-RSASSA-PSS (1.2.840.113549.1.1.10) is not supported in Web Cryptography API, use the OID rsaEncryption (1.2.840.113549.1.1.1) instead for all RSA algorithms." If your private key was generated with \`openssl genpkey -algorithm RSA-PSS\`, jose can't import it; regenerate with \`-algorithm RSA\`.

Gotcha #2: \`importX509\` extracts the public key from the cert; it does NOT validate the cert chain or expiry. That's your responsibility.

Gotcha #3: \`importJWK\` resolves \`alg\` via \`alg ??= jwk.alg\` — the explicit option wins, the JWK's own \`alg\` is the fallback. For \`AKP\` keys (post-quantum), the two MUST match or you get \`JWK alg and alg option value mismatch\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'key', 'importJWK', 'importPKCS8', 'importSPKI', 'importX509'],
    repository: jose,
    filePath: 'src/key/import.ts',
    url: `${baseUrl}/src/key/import.ts`,
  },
  {
    title: 'exportJWK / exportPKCS8 / exportSPKI: dual KeyObject + CryptoKey support',
    body: `The export functions are deliberately thin — each just delegates to a normalized backend that handles both Node \`KeyObject\` and Web Crypto \`CryptoKey\`:

\`\`\`ts
export async function exportSPKI(key: types.CryptoKey | types.KeyObject): Promise<string> {
  return exportPublic(key)
}
export async function exportPKCS8(key: types.CryptoKey | types.KeyObject): Promise<string> {
  return exportPrivate(key)
}
export async function exportJWK(
  key: types.CryptoKey | types.KeyObject | Uint8Array,
): Promise<types.JWK> {
  return keyToJWK(key)
}
\`\`\`

\`exportJWK\` additionally accepts a raw \`Uint8Array\` — that path produces a symmetric \`{ kty: 'oct', k: <base64url> }\` JWK. The other two reject \`Uint8Array\` because PKCS#8/SPKI are inherently asymmetric formats.

The non-obvious requirement: \`extractable\` must be \`true\` on the input \`CryptoKey\`. Web Crypto's \`exportKey()\` (which these eventually call) throws \`InvalidAccessError: key is not extractable\` otherwise. Keys generated by \`generateKeyPair(alg)\` default to \`extractable: false\` — if you intend to export, generate with \`{ extractable: true }\`.

\`\`\`ts
const { privateKey, publicKey } = await jose.generateKeyPair('PS256', { extractable: true })
console.log(await jose.exportPKCS8(privateKey))
console.log(await jose.exportJWK(privateKey))
\`\`\`

A common pattern: generate once at startup with \`extractable: true\`, export to JWK, store in your KV/secrets manager, then on subsequent boots \`importJWK\` with \`extractable: false\` (the production default) so the in-memory key can't be re-exported by malicious code.

Gotcha: \`exportJWK\` on a private key returns ALL components — \`{ kty: 'RSA', n, e, d, p, q, dp, dq, qi }\` for RSA. If you accidentally serve this from a \`/.well-known/jwks.json\` endpoint instead of the public-only version, you've leaked the private key. The fix: always derive the public-only JWK manually:

\`\`\`ts
const fullJwk = await exportJWK(privateKey)
const publicJwk = { kty: fullJwk.kty, n: fullJwk.n, e: fullJwk.e, alg: 'RS256', kid }
\`\`\`

Or just call \`exportJWK(publicKey)\` on the matching public key — that one only contains public components by construction.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'key', 'export', 'exportJWK', 'exportPKCS8', 'extractable'],
    repository: jose,
    filePath: 'src/key/export.ts',
    url: `${baseUrl}/src/key/export.ts`,
  },
  {
    title: 'CompactSign vs FlattenedSign vs GeneralSign — three JWS serializations',
    body: `Three JWS classes exist because RFC 7515 defines three serializations.

**CompactSign** produces the URL-safe \`header.payload.signature\` string everyone calls a "JWT". It's a thin wrapper over \`FlattenedSign\` that joins the three parts:

\`\`\`ts
async sign(key, options?) {
  const jws = await this.#flattened.sign(key, options)
  if (jws.payload === undefined) {
    throw new TypeError('use the flattened module for creating JWS with b64: false')
  }
  return \`\${jws.protected}.\${jws.payload}.\${jws.signature}\`
}
\`\`\`

The \`b64: false\` (RFC 7797 unencoded payload) check rejects compact-mode use because the dots can appear in raw payloads.

**FlattenedSign** returns an object \`{ protected, header?, payload, signature }\`. Useful when you need an unprotected header (\`setUnprotectedHeader\`) — e.g. to attach a \`kid\` that isn't part of the signed envelope.

**GeneralSign** lets you create a JWS with MULTIPLE signatures over the SAME payload, each with its own key/alg:

\`\`\`ts
const jws = await new jose.GeneralSign(payload)
  .addSignature(ecPrivateKey).setProtectedHeader({ alg: 'ES256' })
  .addSignature(rsaPrivateKey).setProtectedHeader({ alg: 'PS256' })
  .sign()
// → { payload, signatures: [{ protected, signature }, { protected, signature }] }
\`\`\`

This is rare — it's used in Web Push (multi-recipient JWE), in some signed-receipt workflows, and in cosigning schemes. Most apps will never need it.

Internal mechanic: \`GeneralSign.sign()\` runs each signature through a fresh \`FlattenedSign\` and asserts the encoded payload matches across all of them — otherwise it would mean inconsistent \`b64\` flag use:

\`\`\`ts
if (i === 0) {
  jws.payload = payload
} else if (jws.payload !== payload) {
  throw new JWSInvalid('inconsistent use of JWS Unencoded Payload (RFC7797)')
}
\`\`\`

Gotcha: GeneralSign has no public access to the underlying signature options — \`addSignature(key, options?)\` returns an \`IndividualSignature\` proxy that just remembers them and replays through FlattenedSign at \`sign()\` time. If you want to share \`crit\` headers across signatures, you must pass them to each \`addSignature(...)\` call individually.

When in doubt: use \`SignJWT\` (which uses \`CompactSign\`) for HTTP bearer tokens. Drop down to flattened/general only when you have a specific RFC-7515-defined need.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jws', 'CompactSign', 'FlattenedSign', 'GeneralSign'],
    repository: jose,
    filePath: 'src/jws/general/sign.ts',
    url: `${baseUrl}/src/jws/general/sign.ts`,
  },
  {
    title: 'JWE alg vs enc: key-management vs content-encryption are separate parameters',
    body: `Every JWE has TWO algorithm parameters in its header: \`alg\` (how the content encryption key is established) and \`enc\` (how the actual plaintext is encrypted). \`FlattenedEncrypt#encrypt\` extracts both and validates them:

\`\`\`ts
const { alg, enc } = joseHeader
if (typeof alg !== 'string' || !alg) {
  throw new JWEInvalid('JWE "alg" (Algorithm) Header Parameter missing or invalid')
}
if (typeof enc !== 'string' || !enc) {
  throw new JWEInvalid('JWE "enc" (Encryption Algorithm) Header Parameter missing or invalid')
}
checkKeyType(alg === 'dir' ? enc : alg, key, 'encrypt')
\`\`\`

Why two? Because content encryption is always symmetric (AES-GCM or AES-CBC-HMAC) but key wrapping can be asymmetric (RSA-OAEP, ECDH-ES) OR symmetric (A128KW, dir, PBES2). The \`alg\` describes how the recipient gets the symmetric Content Encryption Key (CEK); the \`enc\` describes how the CEK encrypts your plaintext.

Common combinations:

- \`{ alg: 'RSA-OAEP-256', enc: 'A256GCM' }\` — recipient has an RSA keypair; CEK wrapped with their public key, plaintext encrypted with AES-256-GCM.
- \`{ alg: 'dir', enc: 'A256GCM' }\` — \`dir\` (Direct Encryption) means there's no separate wrapped CEK: the symmetric secret you pass IS the CEK. Lighter-weight but requires a pre-shared secret.
- \`{ alg: 'ECDH-ES+A128KW', enc: 'A128CBC-HS256' }\` — ephemeral ECDH derives a key-encryption key, which AES-wraps the CEK; CBC-HMAC encrypts the payload.
- \`{ alg: 'PBES2-HS256+A128KW', enc: 'A128GCM' }\` — derive a key from a password, AES-wrap the CEK with it. Used for password-protected JWTs.

Note the \`alg === 'dir' ? enc : alg\` indirection in \`checkKeyType\`: for \`dir\`, the key validation is against the \`enc\` algorithm (because the user-supplied key IS the content key); for everything else, against \`alg\` (because the key is for the wrapping operation).

Gotcha: trying \`{ alg: 'RSA-OAEP-256', enc: 'HS256' }\` will fail — \`HS256\` is a JWS signing alg, not a JWE \`enc\` value. The \`enc\` value must be one of \`A128CBC-HS256\`, \`A192CBC-HS384\`, \`A256CBC-HS512\`, \`A128GCM\`, \`A192GCM\`, \`A256GCM\`. Confusing the two is the most common JWE setup error.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwe', 'alg', 'enc', 'rsa-oaep', 'aes-gcm'],
    repository: jose,
    filePath: 'src/jwe/flattened/encrypt.ts',
    url: `${baseUrl}/src/jwe/flattened/encrypt.ts`,
  },
  {
    title: 'EncryptJWT: symmetric (dir + A128CBC-HS256) and asymmetric (RSA-OAEP) encrypted JWTs',
    body: `\`EncryptJWT\` mirrors \`SignJWT\` but produces a JWE-formatted token (5 dot-separated parts: \`header.encryptedKey.iv.ciphertext.tag\`). The same claim setters apply.

\`\`\`ts
// Symmetric "direct" encryption — no key wrapping, secret IS the CEK
const secret = jose.base64url.decode('zH4NRP1HMALxxCFnRZABFA7GOJtzU_gIj02alfL1lvI')
const jwt = await new jose.EncryptJWT({ 'urn:example:claim': true })
  .setProtectedHeader({ alg: 'dir', enc: 'A128CBC-HS256' })
  .setIssuedAt()
  .setIssuer('urn:example:issuer')
  .setAudience('urn:example:audience')
  .setExpirationTime('2h')
  .encrypt(secret)
\`\`\`

For asymmetric encryption (recipient holds an RSA private key, sender uses their public key):

\`\`\`ts
const jwt = await new jose.EncryptJWT(claims)
  .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
  .setExpirationTime('15m')
  .encrypt(recipientPublicKey)
\`\`\`

The internal \`encrypt()\` constructs a \`CompactEncrypt\` over the JSON-encoded claims and forwards \`#cek\`, \`#iv\`, and \`#keyManagementParameters\` if set:

\`\`\`ts
const enc = new CompactEncrypt(this.#jwt.data())
if (this.#protectedHeader && (this.#replicateIssuerAsHeader || ...)) {
  this.#protectedHeader = {
    ...this.#protectedHeader,
    iss: this.#replicateIssuerAsHeader ? this.#jwt.iss : undefined,
    sub: ...,
    aud: ...,
  }
}
enc.setProtectedHeader(this.#protectedHeader)
\`\`\`

The \`replicateIssuerAsHeader()\` / \`replicateSubjectAsHeader()\` / \`replicateAudienceAsHeader()\` setters copy claims from the encrypted body into the protected header. Per RFC 7519 §5.3 this is a useful optimization: a relay can route the encrypted token by \`iss\`/\`aud\` without decrypting it. \`jwtDecrypt\` then VERIFIES that the replicated header matches the encrypted body — see \`src/jwt/decrypt.ts\` lines 79-107 — so a bad relay can't tamper with it without breaking decryption.

Gotcha: if you enable replication but forget to call the matching \`setIssuer\` / \`setAudience\` / \`setSubject\`, the header gets \`iss: undefined\` (literally), which serializes as missing — that's silently fine on encrypt but \`jwtDecrypt\`'s mismatch check will pass too (both undefined). The asymmetry surfaces only if SOME tokens have the header and others don't — relays then break unpredictably. Establish replication as a flat policy across producers.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'EncryptJWT', 'jwe', 'dir', 'rsa-oaep'],
    repository: jose,
    filePath: 'src/jwt/encrypt.ts',
    url: `${baseUrl}/src/jwt/encrypt.ts`,
  },
  {
    title: 'PBES2 key wrapping: password-derived KEK with PBKDF2 + iteration count',
    body: `PBES2 (PBES2-HS256+A128KW, PBES2-HS384+A192KW, PBES2-HS512+A256KW) is how you encrypt JWEs with a PASSWORD instead of a key. jose's implementation derives a key-encryption key with PBKDF2 then AES-wraps the CEK:

\`\`\`ts
async function deriveKey(p2s, alg, p2c, key) {
  if (!(p2s instanceof Uint8Array) || p2s.length < 8) {
    throw new JWEInvalid('PBES2 Salt Input must be 8 or more octets')
  }
  const salt = concatSalt(alg, p2s)  // alg | 0x00 | p2sInput
  const keylen = parseInt(alg.slice(13, 16), 10)
  const subtleAlg = {
    hash: \`SHA-\${alg.slice(8, 11)}\`,
    iterations: p2c,
    name: 'PBKDF2',
    salt,
  }
  const cryptoKey = await getCryptoKey(key, alg)
  return new Uint8Array(await crypto.subtle.deriveBits(subtleAlg, cryptoKey, keylen))
}

export async function wrap(alg, key, cek, p2c = 2048, p2s = crypto.getRandomValues(new Uint8Array(16))) {
  const derived = await deriveKey(p2s, alg, p2c, key)
  const encryptedKey = await aeskw.wrap(alg.slice(-6), derived, cek)
  return { encryptedKey, p2c, p2s: b64u(p2s) }
}
\`\`\`

The salt is constructed as \`alg | 0x00 | random_p2s\` per RFC 7518 §4.8.1.1 — the algorithm identifier is mixed in to make precomputed dictionaries useless across alg variants.

The default iteration count is 2048. THAT IS LOW for 2026 — OWASP currently recommends >=600,000 for PBKDF2-SHA256. jose keeps the spec default for backward compatibility but the call site can override:

\`\`\`ts
const jwt = await new EncryptJWT(claims)
  .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM', p2c: 600000 })
  .encrypt(passwordBytes)
\`\`\`

The \`p2c\` from the protected header is what the wrap function picks up.

Gotcha: high \`p2c\` makes BOTH encryption and decryption expensive. A web service decrypting password-protected JWTs at 600k iterations adds ~50-200ms per request. PBES2 is appropriate for human-typed-password protection of long-lived secrets (config files, exported keys), NOT for high-volume bearer tokens — for those use \`dir\` with a server-held key.

Gotcha 2: the salt input \`p2s\` MUST be >=8 bytes. The default random 16 bytes is fine; if you supply your own salt and forget the floor, you get \`JWEInvalid('PBES2 Salt Input must be 8 or more octets')\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwe', 'pbes2', 'pbkdf2', 'key-wrapping'],
    repository: jose,
    filePath: 'src/lib/pbes2kw.ts',
    url: `${baseUrl}/src/lib/pbes2kw.ts`,
  },
  {
    title: 'createRemoteJWKSet: cooldown, cacheMaxAge, and the no-match retry',
    body: `\`createRemoteJWKSet\` returns a function \`(protectedHeader, token) => Promise<CryptoKey>\` that you pass to \`jwtVerify\`. It manages an in-memory JWKS with three time windows:

\`\`\`ts
this.#timeoutDuration  = options?.timeoutDuration  ?? 5000     // HTTP timeout
this.#cooldownDuration = options?.cooldownDuration ?? 30000    // min interval between fetches
this.#cacheMaxAge      = options?.cacheMaxAge      ?? 600000   // forced refresh interval
\`\`\`

The selection logic in \`getKey\`:

\`\`\`ts
async getKey(protectedHeader, token) {
  if (!this.#local || !this.fresh()) {
    await this.reload()
  }
  try {
    return await this.#local(protectedHeader, token)
  } catch (err) {
    if (err instanceof JWKSNoMatchingKey) {
      if (this.coolingDown() === false) {
        await this.reload()
        return this.#local(protectedHeader, token)
      }
    }
    throw err
  }
}
\`\`\`

The flow: (1) if cache is empty or stale (>= cacheMaxAge), fetch JWKS first. (2) try local match. (3) if no key matches but we're past the cooldown, refetch and retry — this is what handles IdP key rotation without frequent polling.

Why the cooldown? Without it, an attacker could trigger unbounded JWKS fetches by submitting tokens with random bogus \`kid\`s. The 30-second cooldown caps the abuse rate.

Why \`cacheMaxAge\`? Without it, a successfully-fetched JWKS would persist forever even if the IdP rotates. 10 minutes is the upper bound on freshness regardless of whether all incoming \`kid\`s match.

\`\`\`ts
const JWKS = jose.createRemoteJWKSet(new URL('https://accounts.google.com/.well-known/jwks.json'))
const { payload } = await jose.jwtVerify(jwt, JWKS, {
  issuer: 'https://accounts.google.com',
  audience: '<your client id>',
})
\`\`\`

Cloudflare Workers gotcha (real bug, see source comment): "Do not assume a fetch created in another request reliably resolves":

\`\`\`ts
if (this.#pendingFetch && isCloudflareWorkers()) {
  this.#pendingFetch = undefined
}
\`\`\`

On Workers, an in-flight fetch from a previous request may never resolve in the new request's isolate; jose explicitly nulls it out so each request starts fresh.

Gotcha: \`fetchJwks\` requires \`response.status === 200\` exactly. A 304 Not Modified will throw \`JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response')\`. If your IdP serves cache headers, you may need a \`customFetch\` wrapper that strips \`If-None-Match\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwks', 'createRemoteJWKSet', 'cooldown', 'cache'],
    repository: jose,
    filePath: 'src/jwks/remote.ts',
    url: `${baseUrl}/src/jwks/remote.ts`,
  },
  {
    title: 'JWKS key matching: kid, alg, use=sig, key_ops, and curve filtering',
    body: `Inside \`createLocalJWKSet\`, \`getKey()\` filters the JWKS keys array down to candidates that match the token's protected header. The filter is layered:

\`\`\`ts
const candidates = this.#jwks.keys.filter((jwk) => {
  // 1. Match key type (kty) derived from alg prefix
  let candidate = kty === jwk.kty

  // 2. If the token has a "kid", match it
  if (candidate && typeof kid === 'string') {
    candidate = kid === jwk.kid
  }

  // 3. If the JWK declares its own "alg", it must match the token's alg
  if (candidate && (typeof jwk.alg === 'string' || kty === 'AKP')) {
    candidate = alg === jwk.alg
  }

  // 4. If "use" is declared, must be "sig"
  if (candidate && typeof jwk.use === 'string') {
    candidate = jwk.use === 'sig'
  }

  // 5. If "key_ops" is declared, must include "verify"
  if (candidate && Array.isArray(jwk.key_ops)) {
    candidate = jwk.key_ops.includes('verify')
  }

  // 6. EC curves: ES256→P-256, ES384→P-384, ES512→P-521
  if (candidate) {
    switch (alg) {
      case 'ES256': candidate = jwk.crv === 'P-256'; break
      case 'ES384': candidate = jwk.crv === 'P-384'; break
      case 'ES512': candidate = jwk.crv === 'P-521'; break
      case 'Ed25519': case 'EdDSA': candidate = jwk.crv === 'Ed25519'; break
    }
  }
  return candidate
})
\`\`\`

If exactly one candidate remains: that's your key. If zero: \`JWKSNoMatchingKey\`. If more than one: \`JWKSMultipleMatchingKeys\` — but this error is async-iterable so you can try each in turn:

\`\`\`ts
const error = new JWKSMultipleMatchingKeys()
error[Symbol.asyncIterator] = async function* () {
  for (const jwk of candidates) {
    try { yield await importWithAlgCache(_cached, jwk, alg!) } catch {}
  }
}
\`\`\`

Imported keys are cached in a \`WeakMap<JWK, { [alg]: CryptoKey }>\` — the same JWK reused across many verifications doesn't get re-imported. The WeakMap means the cache cleans up when the JWKS is replaced (e.g. \`createRemoteJWKSet\` rotates).

Gotcha #1: missing \`kid\` in the token = no \`kid\` filter applied. With multiple keys of the same kty, you'll get \`JWKSMultipleMatchingKeys\`. ALWAYS include \`kid\` in your protected header when verifying against a JWKS.

Gotcha #2: ES512 uses curve P-521 (NOT P-512). The naming is RFC 7518's choice — the digest is SHA-512 but the curve is P-521. jose's filter encodes this correctly; if you build a JWKS by hand, the same trap applies.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwks', 'kid', 'alg', 'key-matching', 'curve'],
    repository: jose,
    filePath: 'src/jwks/local.ts',
    url: `${baseUrl}/src/jwks/local.ts`,
  },
  {
    title: 'algorithms allowlist: the most important verify option you forget to set',
    body: `\`flattenedVerify\` (and through it \`compactVerify\`/\`jwtVerify\`) supports an \`algorithms: string[]\` option. It's optional but security-critical:

\`\`\`ts
const algorithms = options && validateAlgorithms('algorithms', options.algorithms)
if (algorithms && !algorithms.has(alg)) {
  throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed')
}
\`\`\`

\`validateAlgorithms\` just builds a Set:

\`\`\`ts
export function validateAlgorithms(option: string, algorithms?: string[]) {
  if (algorithms !== undefined && (!Array.isArray(algorithms) || algorithms.some(s => typeof s !== 'string'))) {
    throw new TypeError(\`"\${option}" option must be an array of strings\`)
  }
  if (!algorithms) return undefined
  return new Set(algorithms)
}
\`\`\`

WHY this matters: without an allowlist, the verifier accepts whatever \`alg\` the token's header declares. The classic attack is "alg confusion": you have an RSA public key for verification, an attacker forges a token with \`{ alg: 'HS256' }\` whose signature is HMAC-SHA256 of the body using YOUR PUBLIC KEY AS THE SECRET. Many old libraries would happily verify this because public keys are by definition public. jose's \`checkKeyType\` blocks the symmetric-vs-asymmetric mismatch (a \`CryptoKey\` of type \`'public'\` isn't accepted for HS256), but \`algorithms\` is a defense-in-depth layer that ALSO catches the broader case.

Always pass \`algorithms\`:

\`\`\`ts
await jwtVerify(token, publicKey, {
  algorithms: ['ES256'],
  issuer: 'https://issuer/',
  audience: 'urn:api',
})
\`\`\`

Even when you control both ends, lock to the exact alg you produce. If you ever rotate algs (RS256→ES256), update the allowlist atomically and roll producers/consumers carefully.

Why is the option optional? Backward compatibility — early JWT libraries didn't have it. jose keeps the spec-permissive default but the docs (and every security audit) tell you to set it.

Gotcha: \`algorithms\` checks the JWS \`alg\` only. There's no equivalent JWE \`enc\` allowlist on this code path — for encrypted JWTs you also want to validate the \`enc\` value yourself if you accept multiple. The asymmetry is because JWS has historically been more attacked than JWE, but it's still a sharp edge.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jws', 'algorithms', 'security', 'alg-confusion'],
    repository: jose,
    filePath: 'src/lib/validate_algorithms.ts',
    url: `${baseUrl}/src/lib/validate_algorithms.ts`,
  },
  {
    title: 'UnsecuredJWT: the alg=none escape hatch that exists only for testing',
    body: `\`UnsecuredJWT\` produces a JWT with header \`{ "alg": "none" }\` and an empty signature segment:

\`\`\`ts
encode(): string {
  const header = b64u.encode(JSON.stringify({ alg: 'none' }))
  const payload = b64u.encode(this.#jwt.data())
  return \`\${header}.\${payload}.\`
}
\`\`\`

Note the trailing dot with nothing after it — the third segment is the empty string. \`decode()\` enforces this exactly:

\`\`\`ts
const { 0: encodedHeader, 1: encodedPayload, 2: signature, length } = jwt.split('.')
if (length !== 3 || signature !== '') {
  throw new JWTInvalid('Invalid Unsecured JWT')
}
let header: types.JWSHeaderParameters
try {
  header = JSON.parse(decoder.decode(b64u.decode(encodedHeader)))
  if (header.alg !== 'none') throw new Error()
} catch {
  throw new JWTInvalid('Invalid Unsecured JWT')
}
\`\`\`

Why does this exist at all? Because RFC 7519 §6.1 defines the Unsecured JWT for cases where the integrity has already been established by a different layer (mTLS, signed transport, on-disk file with OS permissions). It's also useful in tests where you want to assert "claims validation works" without setting up a key.

The deliberate API choice: \`UnsecuredJWT\` is a SEPARATE class from \`SignJWT\`. You cannot accidentally produce an unsigned token through \`SignJWT\` — there's no \`'none'\` branch in the signing path. And you cannot accidentally accept an unsigned token through \`jwtVerify\` — that function ALWAYS calls \`compactVerify\` which always invokes a real signature algorithm via \`checkKeyType\`. The only way to consume an unsigned JWT is to explicitly call \`UnsecuredJWT.decode(token)\`.

This neutralizes the famous "alg=none" attack from circa 2015 against early JWT libraries, where a token with header \`{ "alg": "none" }\` would skip verification entirely. In jose, even if a malicious producer sends \`{ "alg": "none" }\`, your \`jwtVerify(token, key)\` call passes the token to \`compactVerify\` which throws when the alg doesn't match the key type — the unsigned token is rejected at the type-check layer, never even reaches signature verification.

Gotcha: never wire \`UnsecuredJWT.decode\` into a request handler that accepts user input. The temptation is "I'll accept either signed or unsigned" — but then an attacker just always sends unsigned. The class is for tests and offline tooling only.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'unsecured', 'alg-none', 'security'],
    repository: jose,
    filePath: 'src/jwt/unsecured.ts',
    url: `${baseUrl}/src/jwt/unsecured.ts`,
  },
  {
    title: 'decodeJwt: read claims WITHOUT verification — and when that is OK',
    body: `\`decodeJwt\` parses the second segment of a JWS-formatted JWT and returns the claims with no signature check, no exp check, nothing.

\`\`\`ts
export function decodeJwt<PayloadType = types.JWTPayload>(jwt: string): PayloadType & types.JWTPayload {
  if (typeof jwt !== 'string')
    throw new JWTInvalid('JWTs must use Compact JWS serialization, JWT must be a string')

  const { 1: payload, length } = jwt.split('.')

  if (length === 5) throw new JWTInvalid('Only JWTs using Compact JWS serialization can be decoded')
  if (length !== 3) throw new JWTInvalid('Invalid JWT')
  if (!payload) throw new JWTInvalid('JWTs must contain a payload')

  let decoded: Uint8Array
  try {
    decoded = b64u(payload)
  } catch {
    throw new JWTInvalid('Failed to base64url decode the payload')
  }

  let result: unknown
  try {
    result = JSON.parse(decoder.decode(decoded))
  } catch {
    throw new JWTInvalid('Failed to parse the decoded payload as JSON')
  }

  if (!isObject<PayloadType & types.JWTPayload>(result))
    throw new JWTInvalid('Invalid JWT Claims Set')

  return result
}
\`\`\`

The \`length === 5\` check rejects JWE tokens (5 dot-separated parts) — those have an encrypted body and \`decodeJwt\` cannot read them.

Legitimate uses for unverified decoding:

1. **Pre-verify routing.** You need to read \`iss\` to decide which JWKS endpoint to call before you can verify. The pattern: \`decodeJwt(token).iss\` → look up issuer config → \`jwtVerify(token, JWKS, options)\`.
2. **Logging.** You want to log the \`sub\` of an invalid token without trusting the value. Catch the verify error, then \`decodeJwt\` separately for the audit log (clearly mark it as untrusted).
3. **Frontend display.** A SPA decoding its own access token to show username/avatar before the API request. The actual API request still verifies; the UI just guesses.

Why this is dangerous if misused: \`decodeJwt(token).role === 'admin'\` is a real vulnerability pattern — anyone can create a token with \`role: 'admin'\` because no verification happens. Treat \`decodeJwt\` output as fully untrusted user input. The JSDoc on this function explicitly says: "For a proper Signed JWT Claims Set validation and JWS signature verification use \`jose.jwtVerify()\`."

Gotcha: there is no equivalent for JWE — you cannot read encrypted claims without decrypting. \`decodeProtectedHeader\` (a sibling utility) reads the header of either a JWS or a JWE without verifying, which IS useful for picking a decryption key by \`kid\` before calling \`jwtDecrypt\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'jwt', 'decodeJwt', 'security', 'unverified'],
    repository: jose,
    filePath: 'src/util/decode_jwt.ts',
    url: `${baseUrl}/src/util/decode_jwt.ts`,
  },
  {
    title: 'base64url: native Uint8Array.toBase64 fast path with regex fallback',
    body: `Base64url is the encoding for every component in JOSE — header, payload, signature, IV, ciphertext, tag, key wrap output. \`util/base64url.ts\` has just two functions but they're hot:

\`\`\`ts
export function encode(input: Uint8Array | string): string {
  let unencoded = input
  if (typeof unencoded === 'string') {
    unencoded = encoder.encode(unencoded)
  }

  // @ts-ignore
  if (Uint8Array.prototype.toBase64) {
    // @ts-ignore
    return unencoded.toBase64({ alphabet: 'base64url', omitPadding: true })
  }

  return encodeBase64(unencoded).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_')
}

export function decode(input: Uint8Array | string): Uint8Array {
  // @ts-ignore
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === 'string' ? input : decoder.decode(input), {
      alphabet: 'base64url',
    })
  }
  let encoded = input
  if (encoded instanceof Uint8Array) encoded = decoder.decode(encoded)
  encoded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeBase64(encoded)
  } catch {
    throw new TypeError('The input to be decoded is not correctly encoded.')
  }
}
\`\`\`

The \`Uint8Array.prototype.toBase64\` / \`Uint8Array.fromBase64\` checks are for the new TC39 base64 proposal — Node.js >=22 and Bun ship it. When available, jose uses the native implementation which is implemented in C and ~10x faster than the JS fallback.

The fallback path round-trips through standard base64 then does the URL-safe substitution: strip padding (\`=\`), \`+\` → \`-\`, \`/\` → \`_\`. Same in reverse for decode.

Why this matters for performance: every JWT verify decodes the protected header and payload (2 base64url decodes). Every JWE encrypt encodes 5 segments. A backend verifying 1000 tokens/sec is doing ~3000 base64url operations/sec. The native fast path is real.

Why \`omitPadding: true\` for encode? base64url in JOSE has NO padding (RFC 7515 §2). Standard base64 \`SGVsbG8=\` becomes base64url \`SGVsbG8\`.

Gotcha: \`decode\` accepts EITHER a string or a \`Uint8Array\` (which it decodes to string first). Sometimes you have raw bytes that happen to be base64url-encoded text — pass them as-is rather than \`new TextDecoder().decode(...)\`-ing first. Saves a round-trip.

Gotcha 2: the fallback decode silently drops \`\\r\\n\` characters in the input via the underlying \`decodeBase64\`. The native path does not — strict mode. If you accept JWTs from a system that wraps long base64 lines with newlines (rare but happens for embedded certs), test on both Node >=22 and Node <22.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jose', 'base64url', 'encoding', 'performance'],
    repository: jose,
    filePath: 'src/util/base64url.ts',
    url: `${baseUrl}/src/util/base64url.ts`,
  },
];
