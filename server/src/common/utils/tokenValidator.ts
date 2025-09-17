import { IBearerStrategyOption } from 'passport-azure-ad';
import * as dotenv from 'dotenv';

dotenv.config();

const audience = `api://${process.env.MICROSOFT_CLIENT_ID}`;

export const bearerStrategyOptions: IBearerStrategyOption = {
    identityMetadata: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.MICROSOFT_CLIENT_ID!,
    validateIssuer: true,
    issuer: `https://sts.windows.net/${process.env.MICROSOFT_TENANT_ID}/`,
    audience: audience,
    scope: ['access_as_user'],
    passReqToCallback: false,
};