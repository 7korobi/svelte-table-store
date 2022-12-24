import { expect, test } from '@playwright/test';

test('sazae page', async ({ page }) => {
	await page.goto('/sazae');
	await expect(page).toHaveScreenshot({ fullPage: true });
});
