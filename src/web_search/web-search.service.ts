import { Injectable, Logger } from '@nestjs/common';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedAt?: string;
}

interface DuckDuckGoTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: DuckDuckGoTopic[];
}

const DEFAULT_DUCK_DUCK_GO_API = 'https://api.duckduckgo.com/';
const DEFAULT_NEWS_RSS_API = 'https://news.google.com/rss/search';
const REQUEST_TIMEOUT_MS = 8_000;

const decodeEntities = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

const tag = (xml: string, name: string): string | undefined => {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeEntities(match[1]) : undefined;
};

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  // DuckDuckGo's Instant Answer API only returns encyclopedic abstracts and is empty for most
  // news/current-events queries, so recent coverage comes from the Google News RSS feed.
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const [news, instant] = await Promise.all([
      this.searchNews(query, maxResults).catch((error: unknown) => this.failed('news', error)),
      this.searchInstantAnswer(query, maxResults).catch((error: unknown) => this.failed('instant answer', error)),
    ]);

    const seen = new Set<string>();
    const results = [...instant.slice(0, 1), ...news, ...instant.slice(1)].filter((result) => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    }).slice(0, maxResults);

    this.logger.log(`websearch "${query}" returned ${results.length} results (news=${news.length}, instant=${instant.length})`);
    return results;
  }

  private async searchNews(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query, hl: 'en', gl: 'US', ceid: 'US:en' });
    const response = await fetch(`${process.env.NEWS_RSS_API ?? DEFAULT_NEWS_RSS_API}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`News search failed with HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

    return items.slice(0, maxResults).flatMap((item) => {
      const title = tag(item, 'title');
      const url = tag(item, 'link');
      if (!title || !url) return [];

      const source = tag(item, 'source');
      const pubDate = tag(item, 'pubDate');
      const publishedAt = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString().slice(0, 10) : undefined;
      // Google News titles end with " - <Publisher>"; keep the headline clean since source is its own field.
      const headline = source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title;

      return [{
        title: headline,
        url,
        snippet: [headline, source && `(${source}${publishedAt ? `, ${publishedAt}` : ''})`].filter(Boolean).join(' '),
        source,
        publishedAt,
      }];
    });
  }

  private async searchInstantAnswer(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    const response = await fetch(`${process.env.DUCK_DUCK_GO_API ?? DEFAULT_DUCK_DUCK_GO_API}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Web search failed with HTTP ${response.status}`);
    }

    // type assertion to DuckDuckGoResponse to ensure correct typing.
    // Can also use type guards or validation libraries for more robust type checking if needed.
    const data = (await response.json()) as DuckDuckGoResponse;
    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    const addTopics = (topics: DuckDuckGoTopic[] = []): void => {
      for (const topic of topics) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
        if (topic.Topics) addTopics(topic.Topics);
        if (results.length >= maxResults) return;
      }
    };

    addTopics(data.RelatedTopics);

    return results.slice(0, maxResults);
  }

  private failed(provider: string, error: unknown): SearchResult[] {
    this.logger.warn(`websearch ${provider} provider failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
