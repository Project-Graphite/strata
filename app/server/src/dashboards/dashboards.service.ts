import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDashboardDto, LayoutDto, templates, UpdateDashboardDto, WidgetDto, widgetTypes } from './dto/dashboards.dto';

const maxDashboards = 10;
const maxSettingsLength = 4_096;

type Template = (typeof templates)[number];

const starters: Record<Template, Pick<WidgetDto, 'type' | 'x' | 'y' | 'w' | 'settings'>[]> = {
  morning: [
    { type: 'clock', x: 0, y: 0, w: 3, settings: {} },
    { type: 'today', x: 3, y: 0, w: 6, settings: {} },
    { type: 'agenda', x: 9, y: 0, w: 3, settings: {} },
    { type: 'recurring', x: 0, y: 1, w: 3, settings: {} },
    { type: 'inbox', x: 3, y: 1, w: 6, settings: {} },
  ],
  work: [
    { type: 'today', x: 0, y: 0, w: 6, settings: {} },
    { type: 'tasks', x: 6, y: 0, w: 6, settings: {} },
    { type: 'shortcuts', x: 0, y: 1, w: 9, settings: { links: [] } },
    { type: 'clock', x: 9, y: 1, w: 3, settings: {} },
  ],
  student: [
    { type: 'today', x: 0, y: 0, w: 6, settings: {} },
    { type: 'tasks', x: 6, y: 0, w: 6, settings: {} },
    { type: 'shortcuts', x: 0, y: 1, w: 12, settings: { links: [] } },
  ],
  travel: [
    { type: 'clock', x: 0, y: 0, w: 6, settings: { zones: ['Europe/London', 'America/New_York', 'Asia/Tokyo'] } },
    { type: 'today', x: 6, y: 0, w: 6, settings: {} },
    { type: 'shortcuts', x: 0, y: 1, w: 12, settings: { links: [] } },
  ],
};

const dashboardFields = { id: true, name: true, position: true, layout: true, showFrom: true, showUntil: true, showOn: true, updatedAt: true } satisfies Prisma.DashboardSelect;

type DashboardRow = Prisma.DashboardGetPayload<{ select: typeof dashboardFields }>;

function withKnownWidgets(dashboard: DashboardRow) {
  const layout = dashboard.layout as { widgets?: { type: string }[] };
  return { ...dashboard, layout: { ...layout, widgets: (layout.widgets ?? []).filter((widget) => (widgetTypes as readonly string[]).includes(widget.type)) } };
}

function starterLayout(template: Template): Prisma.InputJsonObject {
  return {
    widgets: starters[template].map(({ type, x, y, w, settings }) => ({
      id: randomUUID(),
      type,
      x,
      y,
      w,
      settings: settings as Prisma.InputJsonObject,
    })),
  };
}

function validShortcut(link: unknown) {
  if (typeof link !== 'object' || link === null) return false;
  const { label, url } = link as { label?: unknown; url?: unknown };
  return (
    typeof label === 'string' &&
    label.length >= 1 &&
    label.length <= 40 &&
    typeof url === 'string' &&
    /^https:\/\/\S{1,500}$/.test(url)
  );
}

function validCountdown({ label, date }: Record<string, unknown>) {
  return (
    (label === undefined || (typeof label === 'string' && label.length <= 60)) &&
    (date === undefined || (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))))
  );
}

function validFocus({ minutes, breakMinutes }: Record<string, unknown>) {
  return (minutes === undefined || [15, 25, 50].includes(minutes as number)) && (breakMinutes === undefined || [5, 10, 15].includes(breakMinutes as number));
}

function validWeather({ place, unit }: Record<string, unknown>) {
  const spot = place as { name?: unknown; latitude?: unknown; longitude?: unknown } | undefined;
  return (
    (unit === undefined || unit === 'celsius' || unit === 'fahrenheit') &&
    (spot === undefined ||
      (typeof spot === 'object' &&
        spot !== null &&
        typeof spot.name === 'string' &&
        spot.name.length <= 120 &&
        typeof spot.latitude === 'number' &&
        Math.abs(spot.latitude) <= 90 &&
        typeof spot.longitude === 'number' &&
        Math.abs(spot.longitude) <= 180))
  );
}

function validNews({ feeds, count }: Record<string, unknown>) {
  return (
    (feeds === undefined ||
      (Array.isArray(feeds) && feeds.length <= 5 && feeds.every((feed) => typeof feed === 'string' && /^https:\/\/\S{1,492}$/.test(feed)))) &&
    (count === undefined || [3, 5, 10].includes(count as number))
  );
}

function checkedLayout(layout: LayoutDto): Prisma.InputJsonObject {
  const ids = new Set<string>();
  for (const widget of layout.widgets) {
    if (ids.has(widget.id)) throw new BadRequestException('Each widget needs its own id');
    ids.add(widget.id);
    const placed = widget.x !== undefined && widget.y !== undefined && widget.w !== undefined;
    if (!placed && widget.size === undefined) throw new BadRequestException('Each widget needs a place on the grid');
    if (placed && widget.x! + widget.w! > 12) throw new BadRequestException('Widgets must fit inside the 12 columns');
    if (JSON.stringify(widget.settings).length > maxSettingsLength) {
      throw new BadRequestException('Widget settings can be at most 4 kB');
    }
    const links = widget.settings.links;
    if (widget.type === 'shortcuts' && !(Array.isArray(links) && links.length <= 24 && links.every(validShortcut))) {
      throw new BadRequestException('Shortcuts need a label of up to 40 characters and an https:// link, at most 24 of them');
    }
    if (widget.type === 'countdown' && !validCountdown(widget.settings)) {
      throw new BadRequestException('A countdown needs a label of up to 60 characters and a date');
    }
    if (widget.type === 'weather' && !validWeather(widget.settings)) {
      throw new BadRequestException('Weather needs a place with a name and coordinates, in celsius or fahrenheit');
    }
    if (widget.type === 'news' && !validNews(widget.settings)) {
      throw new BadRequestException('News takes at most 5 https:// feed addresses and shows 3, 5 or 10 stories');
    }
    if (widget.type === 'focus' && !validFocus(widget.settings)) {
      throw new BadRequestException('Focus lasts 15, 25 or 50 minutes, with a break of 5, 10 or 15 minutes');
    }
  }
  if (layout.background && Boolean(layout.background.colour) === Boolean(layout.background.imageId)) {
    throw new BadRequestException('A background is either a colour or an image');
  }
  const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
  return {
    widgets: layout.widgets.map(({ id, type, size, x, y, w, h, title, hideTitle, accent, padding, settings }) =>
      defined({ id, type, size, x, y, w, h, title, hideTitle, accent, padding, settings: settings as Prisma.InputJsonObject }),
    ),
    ...(layout.background ? { background: defined({ colour: layout.background.colour, imageId: layout.background.imageId }) } : {}),
  } as Prisma.InputJsonObject;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangesService,
  ) {}

  async list(userId: string) {
    const dashboards = await this.prisma.dashboard.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: dashboardFields,
    });
    if (dashboards.length > 0) return dashboards.map(withKnownWidgets);
    return [
      await this.prisma.dashboard.create({
        data: { userId, name: 'Home', layout: starterLayout('morning') },
        select: dashboardFields,
      }),
    ];
  }

  async create(userId: string, input: CreateDashboardDto) {
    const count = await this.prisma.dashboard.count({ where: { userId } });
    if (count >= maxDashboards) {
      throw new ConflictException(`You can have ${maxDashboards} dashboards. Delete one you no longer use.`);
    }
    const dashboard = await this.prisma.dashboard.create({
      data: {
        userId,
        name: input.name,
        position: count,
        layout: input.template ? starterLayout(input.template) : { widgets: [] },
      },
      select: dashboardFields,
    });
    this.changes.notify('dashboards', { userId });
    return dashboard;
  }

  async update(userId: string, dashboardId: string, input: UpdateDashboardDto) {
    if ((input.showFrom ?? null) === null ? (input.showUntil ?? null) !== null : (input.showUntil ?? null) === null) {
      throw new BadRequestException('Set both the start and the end of the time range');
    }
    if (input.showFrom != null && input.showFrom === input.showUntil) {
      throw new BadRequestException('The time range needs a start and an end that differ');
    }
    const [updated] = await this.prisma.dashboard.updateManyAndReturn({
      where: { id: dashboardId, userId },
      data: {
        name: input.name,
        layout: input.layout ? checkedLayout(input.layout) : undefined,
        showFrom: input.showFrom,
        showUntil: input.showUntil,
        showOn: input.showOn,
      },
      select: dashboardFields,
    });
    if (!updated) throw new NotFoundException('Dashboard not found');
    this.changes.notify('dashboards', { userId });
    return withKnownWidgets(updated);
  }

  async remove(userId: string, dashboardId: string) {
    if (!(await this.prisma.dashboard.count({ where: { id: dashboardId, userId } }))) {
      throw new NotFoundException('Dashboard not found');
    }
    if ((await this.prisma.dashboard.count({ where: { userId } })) <= 1) {
      throw new BadRequestException('Keep at least one dashboard');
    }
    await this.prisma.dashboard.deleteMany({ where: { id: dashboardId, userId } });
    this.changes.notify('dashboards', { userId });
  }
}
