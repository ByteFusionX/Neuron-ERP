import jwt, { JwtHeader } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const tenantID = process.env.MICROSOFT_TENANT_ID!;

// Configure JWKS client
const jwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${tenantID}/discovery/v2.0/keys`
});

function getKey(header: JwtHeader, callback: (err: Error | null, key?: string) => void) {
    if (!header.kid) {
        return callback(new Error("No kid found in token header"));
    }
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
    });
}

export async function verifyAndExtractOid(token: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded: any) => {
            if (err) return reject(err);
            resolve(decoded?.oid ?? null);
        });
    });
}