// @ts-nocheck
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from './prisma'; // We will create this

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

export async function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export async function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
  } catch (error) {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  return user;
}
