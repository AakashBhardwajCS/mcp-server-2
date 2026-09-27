import { Injectable } from '@nestjs/common';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
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

@Injectable()
export class WebSearchService {
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });
    const response = await fetch(`https://api.duckduckgo.com/?${params}`);

    if (!response.ok) {
      throw new Error(`Web search failed with HTTP ${response.status}`);
    }

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
}
