// The week and day logic in several time zones, including the days when the clocks change.
import { test, expect } from '@playwright/test';

for (const timezoneId of ['Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Kolkata']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('days and Monday-to-Sunday weeks', async ({ page }) => {
      await page.goto('/index.html');
      const r = await page.evaluate(async () => {
        const u = await import('/util.js');
        const out = {};
        // every hour across both clock-change weekends of 2026 (Europe, US and Australia)
        for (const start of ['2026-03-27', '2026-04-03', '2026-10-23', '2026-10-30', '2026-03-06']) {
          for (let hr = 0; hr < 24 * 5; hr++) {
            const d = new Date(`${start}T00:00:00`); d.setHours(d.getHours() + hr);
            const wk = u.weekKey(d), mon = new Date(`${wk}T12:00:00`);
            if (mon.getDay() !== 1) out[`not monday ${d}`] = wk;
            if (u.dateKey(d) < wk) out[`day before week ${d}`] = wk;
            if ((new Date(`${u.dateKey(d)}T12:00:00`) - mon) / 864e5 >= 7) out[`week too long ${d}`] = wk;
            if (u.weekdayIndex(d) !== Math.round((new Date(`${u.dateKey(d)}T12:00:00`) - mon) / 864e5)) out[`weekday ${d}`] = u.weekdayIndex(d);
          }
        }
        out.yesterdayNewYear = u.yesterdayKey(new Date('2027-01-01T00:30:00'));
        out.sundayNight = u.weekKey(new Date('2026-11-01T23:59:59'));
        out.mondayMorning = u.weekKey(new Date('2026-11-02T00:00:00'));
        return out;
      });
      expect(r).toEqual({ yesterdayNewYear: '2026-12-31', sundayNight: '2026-10-26', mondayMorning: '2026-11-02' });
    });
  });
}
