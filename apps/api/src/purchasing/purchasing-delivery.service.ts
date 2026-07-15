import { BadRequestException, Injectable } from '@nestjs/common';
import { PurchasingDeliveryMode } from '@prisma/client';

export type PurchasingDeliveryProfile = {
  deliveryMode: PurchasingDeliveryMode;
  deliveryWeekdays: number[];
  cutoffTime: string | null;
  timezone: string;
  leadTimeDays: number;
};

@Injectable()
export class PurchasingDeliveryService {
  options(profile: PurchasingDeliveryProfile, from: Date, count = 24) {
    const local = this.zonedParts(from, profile.timezone || 'UTC');
    const localTime = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
    const cutoffPassed = Boolean(profile.cutoffTime && localTime > profile.cutoffTime);
    const start = new Date(
      Date.UTC(
        local.year,
        local.month - 1,
        local.day + profile.leadTimeDays + (cutoffPassed ? 1 : 0),
        12,
      ),
    );
    const dates: string[] = [];
    for (let offset = 0; offset < 180 && dates.length < count; offset += 1) {
      const candidate = new Date(start);
      candidate.setUTCDate(start.getUTCDate() + offset);
      const parts = this.zonedParts(candidate, profile.timezone || 'UTC');
      const iso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      if (
        profile.deliveryMode === PurchasingDeliveryMode.ON_DEMAND ||
        profile.deliveryWeekdays.includes(parts.weekday)
      )
        dates.push(iso);
    }
    return dates;
  }

  assertAllowed(profile: PurchasingDeliveryProfile | null | undefined, value: string, now = new Date()) {
    if (!profile) return;
    const allowed = this.options(profile, now, 120);
    if (!allowed.includes(new Date(value).toISOString().slice(0, 10)))
      throw new BadRequestException(
        'La date de livraison ne respecte plus les jours, le délai ou l’heure limite du fournisseur.',
      );
  }

  dateOnly(value: string) {
    const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Date invalide.');
    return parsed;
  }

  private zonedParts(date: Date, timezone: string) {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
      });
    } catch {
      throw new BadRequestException(`Fuseau horaire invalide : ${timezone}`);
    }
    const values = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const weekday = (
      { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>
    )[values.weekday];
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      weekday,
    };
  }
}
