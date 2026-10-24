import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { presentTag, tagFields } from '../tags/tags.service';

const itemLimit = 20;
const tagLimit = 10;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async search(userId: string, text: string, spaceId?: string) {
    const terms = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
    if (terms.length === 0) {
      return { items: [], tags: [] };
    }
    const query = terms.map((term) => `${term}:*`).join(' & ');
    const [matches, tags] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "d"."item_id" AS "id"
        FROM "search_documents" AS "d"
        JOIN "items" AS "i" ON "i"."id" = "d"."item_id"
        WHERE ("d"."space_id" IN (SELECT "space_id" FROM "space_members" WHERE "user_id" = ${userId}::uuid)
          OR ("i"."kind" IN ('note', 'board') AND "i"."archived_at" IS NULL AND EXISTS (SELECT 1 FROM "page_grants" AS "g" WHERE "g"."item_id" = "i"."id" AND "g"."user_id" = ${userId}::uuid)))
          AND (${spaceId ?? null}::uuid IS NULL OR "i"."space_id" = ${spaceId ?? null}::uuid)
          AND "i"."trashed_at" IS NULL
          AND to_tsvector('english', "d"."title" || ' ' || "d"."body_text") @@ to_tsquery('english', ${query})
        ORDER BY ts_rank(to_tsvector('english', "d"."title" || ' ' || "d"."body_text"), to_tsquery('english', ${query})) DESC,
          "i"."updated_at" DESC
        LIMIT ${itemLimit}`,
      this.prisma.tag.findMany({
        where: { ...(spaceId ? { spaceId } : {}), space: this.access.spacesOf(userId), name: { contains: text, mode: 'insensitive' } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: tagLimit,
        select: tagFields,
      }),
    ]);
    const items = await this.prisma.item.findMany({
      where: { id: { in: matches.map((match) => match.id) } },
      select: { id: true, spaceId: true, kind: true, title: true, archivedAt: true, space: { select: { name: true, members: { where: { userId }, select: { userId: true } } } }, note: { select: { quick: true } } },
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      items: matches.flatMap(({ id }) => {
        const item = byId.get(id);
        return item
          ? [
              {
                id: item.id,
                spaceId: item.spaceId,
                spaceName: item.space.members.length ? item.space.name : 'Shared page',
                kind: item.kind.toLowerCase(),
                quick: item.note?.quick ?? false,
                title: item.title,
                archived: item.archivedAt !== null,
              },
            ]
          : [];
      }),
      tags: tags.map(presentTag),
    };
  }
}
