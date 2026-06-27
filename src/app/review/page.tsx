import { prisma } from "@/lib/db";
import { getDueReviews } from "@/lib/engine/review";
import { ReviewCards } from "@/components/review-cards";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  const cards = user ? await getDueReviews(prisma, user.id) : [];

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
      <p className="mt-1 text-sm text-muted">
        Spaced repetition over solved <em>patterns</em>, not flashcards. Don&apos;t
        re-solve from scratch — re-derive the key observation, then grade how well
        it came back. Retention is the point.
      </p>

      <div className="mt-6">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
            Nothing due. Solve problems and they&apos;ll come back here on a spaced
            schedule.
          </div>
        ) : (
          <>
            <div className="mb-3 text-xs text-muted">{cards.length} due</div>
            <ReviewCards cards={cards} />
          </>
        )}
      </div>
    </div>
  );
}
