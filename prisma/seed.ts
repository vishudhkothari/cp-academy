import { PrismaClient } from "@prisma/client";
import { topics } from "./seed/topics";
import {
  syncCodeforcesProblems,
  syncCsesProblems,
  generateCuratedProblems,
  syncCodeforcesUser,
} from "../src/lib/sources/sync";

const prisma = new PrismaClient();

const USER_EMAIL = "vishudhkothari@gmail.com";
const CF_HANDLE = process.env.CF_HANDLE ?? "magisk123";
const ATCODER_HANDLE = process.env.ATCODER_HANDLE ?? "magisk123";

async function main() {
  console.log("→ Seeding topics…");
  for (const t of topics) {
    await prisma.topic.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        month: t.month,
        lean: t.lean,
        prereqs: t.prereqs ?? [],
        description: t.description ?? null,
      },
      create: {
        slug: t.slug,
        name: t.name,
        month: t.month,
        lean: t.lean,
        prereqs: t.prereqs ?? [],
        description: t.description ?? null,
      },
    });
  }
  console.log(`  ✓ ${topics.length} topics`);

  console.log("→ Ensuring user…");
  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: { cfHandle: CF_HANDLE, atcoderHandle: ATCODER_HANDLE },
    create: { email: USER_EMAIL, cfHandle: CF_HANDLE, atcoderHandle: ATCODER_HANDLE },
  });
  console.log(`  ✓ ${user.email}`);

  console.log("→ Syncing Codeforces problemset (this hits the CF API)…");
  const p = await syncCodeforcesProblems(prisma);
  console.log(`  ✓ fetched ${p.fetched}, newly created ${p.created}`);

  console.log("→ Syncing CSES problem set…");
  const c = await syncCsesProblems(prisma);
  console.log(`  ✓ fetched ${c.fetched}, newly created ${c.created}`);

  console.log("→ Generating curated ladders…");
  const g = await generateCuratedProblems(prisma);
  console.log(`  ✓ ${g.curated} curated problems across ${g.topics} topics`);

  console.log(`→ Syncing your CF solves + rating (@${CF_HANDLE})…`);
  try {
    const u = await syncCodeforcesUser(prisma, user.id, CF_HANDLE);
    console.log(
      `  ✓ solved ${u.solved}, recorded ${u.recorded}, rating snapshots ${u.snapshots}`,
    );
  } catch (e) {
    console.warn(`  ! user sync skipped: ${(e as Error).message}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
