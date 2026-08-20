import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDatabase } from '@/db/client';
import { memberships, sessions, users } from '@/db/schema';

async function main() {
  const db = createDatabase();
  const email = process.argv[2] ?? 'owner@northgateroofing.example';
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) throw new Error(`user missing: ${email}`);
  const member = await db
    .select({ companyId: memberships.companyId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: createHash('sha256').update(token).digest('hex'),
    userId: user.id,
    activeCompanyId: member[0]?.companyId ?? null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  console.log(token);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
