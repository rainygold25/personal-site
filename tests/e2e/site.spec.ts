import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const stat = (page: Page, id: string) => page.getByTestId(id);
const num = async (page: Page, id: string) =>
  Number((await stat(page, id).textContent())?.replace(/\D/g, ''));

test.describe('role lens', () => {
  test('switching lens filters projects, changes the resume and updates the URL', async ({ page }) => {
    await page.goto('/');
    const all = await page.locator('.project').count();

    await page.getByRole('button', { name: 'Embedded' }).click();
    await expect(page).toHaveURL(/\?lens=embedded/);
    await expect(page.getByRole('button', { name: 'Embedded' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#resume-link')).toHaveAttribute('href', 'resume/ranya-prasad-embedded.pdf');
    const embedded = await page.locator('.project').count();
    expect(embedded).toBeLessThan(all);
    await expect(page.locator('.project[data-id="forsys"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Data' }).click();
    await expect(page.locator('.project[data-id="forsys"]')).toHaveCount(1);

    await page.goBack();
    await expect(page.getByRole('button', { name: 'Embedded' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a shared link opens in that lens', async ({ page }) => {
    await page.goto('/?lens=data');
    await expect(page.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#work-lens-label')).toHaveText('Data lens');
  });

  test('an unknown lens falls back to all work (edge case)', async ({ page }) => {
    await page.goto('/?lens=astronaut');
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#projects-empty')).toBeHidden();
    expect(await page.locator('.project').count()).toBeGreaterThan(5);
  });

  test('resume files are served', async ({ request }) => {
    for (const lens of ['software', 'embedded', 'data']) {
      const res = await request.get(`/resume/ranya-prasad-${lens}.pdf`);
      expect(res.ok()).toBe(true);
      expect(res.headers()['content-type']).toContain('pdf');
    }
  });
});

test.describe('WinnieWheels sandbox', () => {
  test('stepping drives the robot and logs serial frames', async ({ page }) => {
    await page.goto('/#sandbox');
    for (let i = 0; i < 15; i++) await page.getByTestId('step').click();
    await expect(stat(page, 's-ticks')).toHaveText('15');
    expect(await num(page, 's-dist')).toBeGreaterThan(0);
    await expect(page.getByTestId('serial-log')).toContainText('"cmd":"FORWARD"');
    await expect(page.getByTestId('r-left')).toHaveText(/\d+ cm/);
  });

  test('run and pause', async ({ page }) => {
    await page.goto('/#sandbox');
    await page.getByTestId('run').click();
    await expect(page.getByTestId('run')).toHaveText('Pause');
    await expect.poll(() => num(page, 's-ticks')).toBeGreaterThan(5);
    await page.getByTestId('run').click();
    const paused = await num(page, 's-ticks');
    await page.waitForTimeout(300);
    expect(await num(page, 's-ticks')).toBe(paused);
  });

  test('unplugging a sensor stops the robot (edge case)', async ({ page }) => {
    await page.goto('/#sandbox');
    for (let i = 0; i < 5; i++) await page.getByTestId('step').click();
    await page.getByTestId('fault-left').check();
    await page.getByTestId('step').click();
    const dist = await num(page, 's-dist');
    for (let i = 0; i < 5; i++) await page.getByTestId('step').click();
    await expect(page.getByTestId('r-cmd')).toHaveText('STOP');
    await expect(page.getByTestId('r-why')).toContainText('stop and retry');
    await expect(page.getByTestId('r-left')).toHaveText('no echo');
    expect(await num(page, 's-dist')).toBe(dist);
    await expect(page.getByTestId('sim-status')).toContainText('Robot stopped');
  });

  test('turning off dedupe floods the serial link', async ({ page }) => {
    await page.goto('/#sandbox');
    await page.getByTestId('dedupe').uncheck();
    for (let i = 0; i < 10; i++) await page.getByTestId('step').click();
    await expect(stat(page, 's-sent')).toHaveText('10');
    await expect(stat(page, 's-supp')).toHaveText('0');
  });

  test('clicking the arena adds and removes a box; reset keeps the layout', async ({ page }) => {
    await page.goto('/#sandbox');
    await page.getByRole('button', { name: 'Clear boxes' }).click();
    const arena = page.getByTestId('arena');
    const box = (await arena.boundingBox())!;
    await arena.click({ position: { x: box.width * 0.7, y: box.height * 0.3 } });
    await expect(page.getByTestId('sim-status')).toHaveText(/Box added\. 1 boxes/);
    await arena.click({ position: { x: box.width * 0.7, y: box.height * 0.3 } });
    await expect(page.getByTestId('sim-status')).toHaveText(/Box removed\. 0 boxes/);

    await page.getByTestId('step').click();
    await page.getByTestId('reset').click();
    await expect(stat(page, 's-ticks')).toHaveText('0');
  });
});

test.describe('accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test('no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('lens buttons work from the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Software' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/lens=software/);
  });
});
