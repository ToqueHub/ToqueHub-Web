import { Injectable } from '@nestjs/common';
import {
  CatererEventStatus,
  OperationalTaskStatus,
  ProductionOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatererEventLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForOrder(organizationId: string, orderId: string) {
    const link = await this.prisma.menuProductionLink.findFirst({
      where: { organizationId, productionOrderId: orderId },
      select: {
        menu: {
          select: {
            catererPrestation: {
              select: { eventId: true },
            },
          },
        },
      },
    });
    const eventId = link?.menu.catererPrestation?.eventId;
    return eventId ? this.evaluateEvent(organizationId, eventId) : null;
  }

  async evaluateForTask(organizationId: string, taskId: string) {
    const task = await this.prisma.operationalTask.findFirst({
      where: { id: taskId, organizationId },
      select: { sourceKey: true },
    });
    const eventId = task?.sourceKey?.match(/^CATERER:([^:]+):/)?.[1];
    return eventId ? this.evaluateEvent(organizationId, eventId) : null;
  }

  async evaluateEvent(organizationId: string, eventId: string) {
    const event = await this.prisma.catererEvent.findFirst({
      where: {
        id: eventId,
        organizationId,
        status: CatererEventStatus.CONFIRMED,
      },
      include: {
        prestations: {
          include: {
            menu: {
              include: {
                items: { select: { id: true, technicalSheetId: true } },
                productionLinks: {
                  include: {
                    productionOrder: { select: { id: true, status: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!event) return null;

    const recipeItems = event.prestations.flatMap((prestation) =>
      prestation.menu.items
        .filter((item) => Boolean(item.technicalSheetId))
        .map((item) => ({ item, menu: prestation.menu })),
    );
    const productionComplete = recipeItems.every(({ item, menu }) =>
      menu.productionLinks.some((link) => {
        if (
          !link.productionOrder ||
          link.productionOrder.status !== ProductionOrderStatus.COMPLETED
        ) {
          return false;
        }
        const snapshot = link.snapshot as { lines?: Array<{ menuItemId?: string }> } | null;
        return snapshot?.lines?.some((line) => line.menuItemId === item.id) ?? false;
      }),
    );
    if (!productionComplete) return event;

    const logisticsTasks = await this.prisma.operationalTask.findMany({
      where: {
        organizationId,
        sourceKey: { startsWith: `CATERER:${eventId}:` },
      },
      select: { status: true },
    });
    const logisticsComplete = logisticsTasks
      .filter((task) => task.status !== OperationalTaskStatus.CANCELLED)
      .every((task) => task.status === OperationalTaskStatus.COMPLETED);
    if (!logisticsComplete) return event;

    return this.prisma.catererEvent.update({
      where: { id: eventId },
      data: { status: CatererEventStatus.COMPLETED },
    });
  }
}
