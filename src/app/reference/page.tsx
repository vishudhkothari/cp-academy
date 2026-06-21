import { prisma } from "@/lib/db";
import { ReferenceBook } from "@/components/reference-book";

export const dynamic = "force-dynamic";

export default async function ReferencePage() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  const templates = user
    ? await prisma.template.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, language: true, code: true, notes: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Reference</h1>
      <p className="mt-1 text-sm text-muted">
        Your personal CP reference book — templates and snippets that grow over
        time. Copy them straight into the editor.
      </p>
      <div className="mt-6">
        <ReferenceBook templates={templates} />
      </div>
    </div>
  );
}
