import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production.')
}
const SECRET = new TextEncoder().encode(
  jwtSecret || 'change-this-to-a-long-random-secret-min-32-chars'
)

export const TOKEN_EXPIRY = '8h'

export interface TokenPayload extends JWTPayload {
  id: string
  username: string
  fullName: string
  email: string
  roleCode: string
}

export async function signToken(payload: Omit<TokenPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, SECRET)
  return payload as TokenPayload
}
