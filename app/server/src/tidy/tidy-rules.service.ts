import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ItemKind, Prisma, SpaceRole, TidyAction } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { presentTag, tagFields } from '../tags/tags.service';
import { CreateTidyRuleDto } from './dto/tidy.dto';
import { fileTypes, type FileType } from './file-types';

const settleMs = 60_000;

const ruleFields = {
  id: true,
  spaceId: true,
  titleContains: true,
  kind: true,
  fileType: true,
  enabled: true,
  createdAt: true,
  tag: { select: tagFields },
} satisfies Prisma.TidyRuleSelect;

function presentRule(rule: Prisma.TidyRuleGetPayload<{ select: typeof ruleFields }>) {
  return {
    id: rule.id,
    spaceId: rule.spaceId,
    titleContains: rule.titleContains,
    kind: rule.kind?.toLowerCase() ?? null,
    fileType: rule.fileType,
    tag: presentTag(rule.tag),
    enabled: rule.enabled,
    createdAt: rule.createdAt,
  };
}

function matching(rule: { spaceId: string; titleContains: string; kind: ItemKind | null; fileType: string | null; tagId: string }) {
  return {
    spaceId: rule.spaceId,
    trashedAt: null,
    kind: rule.kind ?? undefined,
    title: rule.titleContains ? { contains: rule.titleContains, mode: 'insensitive' } : undefined,
    file: rule.fileType ? { mimeType: fileTypes[rule.fileType as FileType] } : undefined,
    tags: { none: { tagId: rule.tagId } },
  } satisfies Prisma.ItemWhereInput;
}

@Injectable()
export class TidyRulesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly maintenance: MaintenanceScheduler,
  ) {}

  onModuleInit() {
    this.maintenance.register((now) => this.applyRules(now));
  }

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const rules = await this.prisma.tidyRule.findMany({
      where: { spaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ruleFields,
    });
    return rules.map(presentRule);
  }

  async create(userId: string, spaceId: string, input: CreateTidyRuleDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if (!input.titleContains && !input.fileType) throw new BadRequestException('Look for words in the title, a file type, or both');
    if (!(await this.prisma.tag.count({ where: { id: input.tagId, spaceId } }))) {
      throw new BadRequestException("Choose a tag from this rule's space");
    }
    const rule = await this.prisma.tidyRule.create({
      data: {
        spaceId,
        createdById: userId,
        titleContains: input.titleContains ?? '',
        fileType: input.fileType ?? null,
        kind: input.kind ? (input.kind.toUpperCase() as ItemKind) : null,
        tagId: input.tagId,
        checkedUntil: new Date(),
      },
      select: ruleFields,
    });
    return presentRule(rule);
  }

  async update(userId: string, ruleId: string, enabled: boolean) {
    await this.editable(userId, ruleId);
    const rule = await this.prisma.tidyRule.update({
      where: { id: ruleId },
      data: { enabled, ...(enabled ? { checkedUntil: new Date() } : {}) },
      select: ruleFields,
    });
    return presentRule(rule);
  }

  async remove(userId: string, ruleId: string) {
    await this.editable(userId, ruleId);
    await this.prisma.tidyRule.deleteMany({ where: { id: ruleId } });
  }

  async matches(userId: string, ruleId: string) {
    const rule = await this.prisma.tidyRule.findFirst({
      where: { id: ruleId, space: this.access.spacesOf(userId) },
      select: { spaceId: true, titleContains: true, kind: true, fileType: true, tagId: true },
    });
    if (!rule) throw new NotFoundException('Rule not found');
    const [total, items] = await this.prisma.$transaction([
      this.prisma.item.count({ where: matching(rule) }),
      this.prisma.item.findMany({
        where: matching(rule),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
        select: { id: true, spaceId: true, kind: true, title: true },
      }),
    ]);
    return { total, results: items.map((item) => ({ ...item, kind: item.kind.toLowerCase() })) };
  }

  async applyRules(now: Date) {
    const until = new Date(now.getTime() - settleMs);
    const rules = await this.prisma.tidyRule.findMany({
      where: { enabled: true, checkedUntil: { lt: until } },
      select: { id: true, spaceId: true, createdById: true, titleContains: true, kind: true, fileType: true, tagId: true, checkedUntil: true },
      take: 500,
    });
    for (const rule of rules) {
      const member = await this.prisma.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: rule.spaceId, userId: rule.createdById } },
        select: { role: true },
      });
      const items =
        member && member.role !== SpaceRole.VIEWER
          ? await this.prisma.item.findMany({
              where: { ...matching(rule), createdAt: { gt: rule.checkedUntil, lte: until } },
              select: { id: true },
            })
          : [];
      await this.prisma.$transaction(async (transaction) => {
        if (items.length > 0) {
          await transaction.itemTag.createMany({ data: items.map(({ id }) => ({ itemId: id, tagId: rule.tagId })), skipDuplicates: true });
          await transaction.tidyBatch.create({
            data: {
              userId: rule.createdById,
              action: TidyAction.TAG,
              tagId: rule.tagId,
              ruleId: rule.id,
              itemCount: items.length,
              changes: { createMany: { data: items.map(({ id }) => ({ itemId: id })) } },
            },
          });
        }
        await transaction.tidyRule.update({ where: { id: rule.id }, data: { checkedUntil: until } });
      });
    }
  }

  private async editable(userId: string, ruleId: string) {
    const rule = await this.prisma.tidyRule.findFirst({
      where: { id: ruleId, space: this.access.spacesOf(userId) },
      select: { spaceId: true },
    });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.access.assertSpace(userId, rule.spaceId, 'edit');
  }
}
