import { describe, expect, it } from 'vitest';
import { parseRssXml } from '../rss';

describe('parseRssXml', () => {
  it('decodes numeric and named HTML entities in titles', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title>Seahawks&#039; Super Bowl ring unveiled</title>
          <description>Expert&#039;s best bets &amp; more</description>
          <link>https://example.com/1</link>
        </item>
        <item>
          <title>It&#39;s a &#x27;great&#x27; day</title>
        </item>
      </rss></channel>`;

    const items = parseRssXml(xml);
    expect(items[0].title).toBe("Seahawks' Super Bowl ring unveiled");
    expect(items[0].description).toBe("Expert's best bets & more");
    expect(items[1].title).toBe("It's a 'great' day");
  });
});
