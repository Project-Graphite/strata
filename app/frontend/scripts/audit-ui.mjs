import { AxeBuilder } from '@axe-core/playwright';
import { open, sweep } from './ui-routes.mjs';

const blocking = ['critical', 'serious'];
const pages = [];
const issues = [];

await sweep(async (page, { url, name }) => {
  await open(page, url);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const count = (impact) => violations.filter((violation) => violation.impact === impact).length;
  pages.push({ page: name, critical: count('critical'), serious: count('serious'), moderate: count('moderate'), minor: count('minor') });
  for (const violation of violations.filter((violation) => blocking.includes(violation.impact))) {
    issues.push({ page: name, impact: violation.impact, rule: violation.id, nodes: violation.nodes.length, first: violation.nodes[0]?.target.join(' '), why: violation.nodes[0]?.failureSummary?.split('\n').at(-1)?.trim() });
  }
});

console.table(pages);
if (issues.length > 0) {
  console.table(issues);
  console.error(`${issues.length} critical or serious accessibility issues; see https://dequeuniversity.com/rules/axe/ for each rule`);
  process.exitCode = 1;
} else {
  console.log(`No critical or serious accessibility issues on ${pages.length} pages`);
}
