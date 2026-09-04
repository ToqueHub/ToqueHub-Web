import { Injectable } from '@nestjs/common';
import { get as httpsGet } from 'node:https';

type Weather = {
  status: 'ready' | 'needs_location' | 'unavailable';
  city?: string;
  temperature?: number;
  apparentTemperature?: number;
  weatherCode?: number;
  label?: string;
  cityImage?: string;
};

type NewsItem = { title: string; url: string; source: string; publishedAt?: string };
type ExternalDashboard = { weather: Weather; localNews: NewsItem[]; industryNews: NewsItem[] };
export type AddressSuggestion = { label: string; address: string; postalCode?: string; city?: string; country: 'FR' | 'FI' };
type FrenchGeocodingResponse = {
  features?: Array<{ properties?: { housenumber?: string; name?: string; label?: string; postcode?: string; city?: string } }>;
};
type NominatimAddress = { house_number?: string; road?: string; postcode?: string; city?: string; town?: string; village?: string; municipality?: string };
type NominatimResult = { address?: NominatimAddress; display_name?: string; lat?: string; lon?: string };

const TTL = 15 * 60 * 1000;
const NEWS_TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: ExternalDashboard }>();

/** External data is intentionally best-effort: the operational dashboard must work offline. */
@Injectable()
export class DashboardExternalService {
  private readonly addressCache = new Map<string, { expiresAt: number; value: AddressSuggestion[] }>();
  private readonly newsCache = new Map<string, { expiresAt: number; value: { localNews: NewsItem[]; industryNews: NewsItem[] } }>();
  async get(address?: string | null, fallbackName?: string | null): Promise<ExternalDashboard> {
    // A site name must never be appended to a postal address: it makes city geocoders fail.
    const query = (address || fallbackName || '').trim();
    if (!query) return { weather: { status: 'needs_location', label: 'Ajoutez l’adresse du site principal pour activer la météo locale.' }, localNews: [], industryNews: [] };
    const existing = cache.get(query);
    if (existing && existing.expiresAt > Date.now()) return existing.value;

    const value = await this.load(query);
    cache.set(query, { expiresAt: Date.now() + TTL, value });
    return value;
  }

  async addressSuggestions(query: string, requestedCountry: string): Promise<AddressSuggestion[]> {
    const country = requestedCountry.toUpperCase() === 'FI' ? 'FI' : 'FR';
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) return [];
    const key = `${country}:${cleanQuery.toLowerCase()}`;
    const cached = this.addressCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const value = country === 'FR' ? await this.frenchAddresses(cleanQuery) : await this.finnishAddresses(cleanQuery);
      this.addressCache.set(key, { expiresAt: Date.now() + 60 * 60 * 1000, value });
      return value;
    } catch { return []; }
  }

  private async frenchAddresses(query: string): Promise<AddressSuggestion[]> {
    const response = await fetch(`https://data.geopf.fr/geocodage/search/?q=${encodeURIComponent(query)}&limit=6`, { signal: AbortSignal.timeout(3500), headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const data = await response.json() as FrenchGeocodingResponse;
    return (data.features ?? []).map((feature) => {
      const p = feature.properties ?? {};
      const address = [p.housenumber, p.name].filter(Boolean).join(' ') || p.label || '';
      return { label: p.label ?? address, address, postalCode: p.postcode, city: p.city, country: 'FR' as const };
    }).filter((item: AddressSuggestion) => Boolean(item.address));
  }

  private async finnishAddresses(query: string): Promise<AddressSuggestion[]> {
    // Nominatim is queried server-side so the browser never contacts a third party directly.
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=fi&limit=6&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(3500), headers: { Accept: 'application/json', 'User-Agent': 'ToqueHub address autocomplete' } });
    if (!response.ok) return [];
    const rows = await response.json() as NominatimResult[];
    return rows.map((row) => {
      const a = row.address ?? {};
      const address = [a.house_number, a.road].filter(Boolean).join(' ') || row.display_name?.split(',')[0] || '';
      return { label: row.display_name ?? address, address, postalCode: a.postcode, city: a.city ?? a.town ?? a.village ?? a.municipality, country: 'FI' as const };
    }).filter((item: AddressSuggestion) => Boolean(item.address));
  }

  private async load(query: string): Promise<ExternalDashboard> {
    try {
      const place = await this.weatherLocation(query);
      if (!place) return { weather: { status: 'needs_location', label: 'Ville du site principal introuvable. Complétez son adresse.' }, localNews: [], industryNews: await this.industryNews() };
      const city = place.city;
      const weatherJson = await this.fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`);
      const current = weatherJson?.current;
      const weather: Weather = current ? { status: 'ready', city, temperature: Math.round(current.temperature_2m), apparentTemperature: Math.round(current.apparent_temperature), weatherCode: current.weather_code, label: this.weatherLabel(current.weather_code) } : { status: 'unavailable', city, label: 'Météo indisponible' };
      const [news, cityImage] = await Promise.all([
        this.newsForCity(city),
        this.cityImage(city),
      ]);
      return { weather: cityImage ? { ...weather, cityImage } : weather, localNews: news.localNews, industryNews: news.industryNews };
    } catch {
      return { weather: { status: 'unavailable', label: 'Météo indisponible' }, localNews: [], industryNews: [] };
    }
  }

  private async weatherLocation(query: string): Promise<{ latitude: number; longitude: number; city: string } | null> {
    let lookupCompleted = false;
    // The official French geocoder handles a complete French street address precisely.
    try {
      const french = await this.fetchJson(`https://data.geopf.fr/geocodage/search/?q=${encodeURIComponent(query)}&limit=1`);
      lookupCompleted = true;
      const feature = french?.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (Array.isArray(coordinates) && coordinates.length >= 2) {
        const properties = feature.properties ?? {};
        return { latitude: Number(coordinates[1]), longitude: Number(coordinates[0]), city: properties.city ?? properties.label ?? query };
      }
    } catch { /* Fall through for Finnish or non-French addresses. */ }

    // Finnish saved addresses contain the locality and are resolved with the Finnish-only search.
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=fi&limit=1&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/json', 'User-Agent': 'ToqueHub weather lookup' } });
      if (!response.ok) throw new Error(`External service returned ${response.status}`);
      const rows = await response.json() as NominatimResult[];
      lookupCompleted = true;
      const row = rows[0];
      if (row?.lat && row?.lon) {
        const a = row.address ?? {};
        return { latitude: Number(row.lat), longitude: Number(row.lon), city: a.city ?? a.town ?? a.village ?? a.municipality ?? row.display_name?.split(',')[0] ?? query };
      }
    } catch { /* Final fallback below. */ }

    // A manually entered city still gets a useful weather result.
    try {
      const cityQuery = query.split(',').at(-1)?.trim() || query;
      const geo = await this.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1&language=fr&format=json`);
      lookupCompleted = true;
      const place = geo?.results?.[0];
      return place ? { latitude: Number(place.latitude), longitude: Number(place.longitude), city: [place.name, place.admin1].filter(Boolean).join(', ') } : null;
    } catch (error) {
      if (!lookupCompleted) throw error;
      return null;
    }
  }

  private async industryNews() {
    // Configurable RSS list; the Google News query is a no-key fallback for self-hosted installs.
    return this.rss(`https://news.google.com/rss/search?q=${encodeURIComponent('restauration collective réglementation HACCP EGalim when:30d')}&hl=fr&gl=FR&ceid=FR:fr`, 30);
  }

  private async newsForCity(city: string) {
    const key = city.toLocaleLowerCase('fr-FR');
    const cached = this.newsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const officialLocalNews = city.trim().toLocaleLowerCase('fi-FI') === 'kuusamo' ? await this.kuusamoNews() : [];
    const localNews = officialLocalNews.length
      ? officialLocalNews
      : await this.rss(`https://news.google.com/rss/search?q=${encodeURIComponent(`actualités ${city} -météo -weather when:7d`)}&hl=fr&gl=FR&ceid=FR:fr`, 7);
    // Small towns may not have recent local headlines: keep the card useful with sector news.
    const fallbackLocalNews = localNews.length ? localNews : await this.rss(`https://news.google.com/rss/search?q=${encodeURIComponent('métiers de bouche restauration boulangerie pâtisserie alimentation France when:14d')}&hl=fr&gl=FR&ceid=FR:fr`, 14);
    const value = { localNews: fallbackLocalNews, industryNews: await this.industryNews() };
    this.newsCache.set(key, { expiresAt: Date.now() + NEWS_TTL, value });
    return value;
  }

  private async kuusamoNews(): Promise<NewsItem[]> {
    try {
      const html = await this.fetchHtml('https://www.kuusamo.fi/en/');
      // The official English homepage publishes current municipal events in `.event` cards.
      // A card may have one or two dates; the first date is enough for display and ordering.
      return [...html.matchAll(/<time datetime=([0-9-]+)[^>]*>[\s\S]{0,800}?<h3 class=event-title>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map((match) => ({ title: this.decode(match[3].replace(/<[^>]+>/g, '').trim()), url: match[2], source: 'Kuusamo Town', publishedAt: `${match[1]}T00:00:00.000Z` }))
        .filter((item) => Boolean(item.title && item.url))
        .slice(0, 4);
    } catch { return []; }
  }

  private fetchHtml(url: string): Promise<string> {
    // Kuusamo's web server currently returns a 500 to Node's fetch client but serves its
    // public page correctly over a classic HTTPS request with a browser-compatible agent.
    return new Promise((resolve, reject) => {
      const request = httpsGet(url, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; ToqueHub/1.0)' } }, (response) => {
        if (!response.statusCode || response.statusCode >= 400) { response.resume(); reject(new Error(`HTML source returned ${response.statusCode}`)); return; }
        response.setEncoding('utf8');
        let html = '';
        response.on('data', (chunk) => { html += chunk; });
        response.on('end', () => resolve(html));
      });
      request.setTimeout(6000, () => request.destroy(new Error('HTML source timed out')));
      request.on('error', reject);
    });
  }

  private async cityImage(city: string): Promise<string | undefined> {
    try {
      const summary = await this.fetchJson(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city.replace(/,.*/, ''))}`);
      return summary?.thumbnail?.source || summary?.originalimage?.source || undefined;
    } catch { return undefined; }
  }

  private async fetchJson(url: string): Promise<any> {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`External service returned ${response.status}`);
    return response.json();
  }

  private async rss(url: string, maxAgeDays: number): Promise<NewsItem[]> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!response.ok) return [];
      const xml = await response.text();
      // Google News currently emits ordinary XML text, while other feeds often use CDATA.
      // Parse each item independently so optional tags and tag order never empty the whole feed.
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 16).map((match) => {
        const item = match[1];
        const tag = (name: string) => item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1];
        const clean = (value?: string) => this.decode((value ?? '').replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
        return { title: clean(tag('title')), url: clean(tag('link')), source: clean(tag('source')) || 'Google Actualités', publishedAt: clean(tag('pubDate')) || undefined };
      }).filter((item) => Boolean(item.title && item.url && item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) >= cutoff)).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!)).slice(0, 4);
    } catch { return []; }
  }

  private decode(value: string) { return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
  private weatherLabel(code: number) {
    if (code === 0) return 'Ciel dégagé';
    if ([1, 2, 3].includes(code)) return 'Partiellement nuageux';
    if ([45, 48].includes(code)) return 'Brouillard';
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Pluie';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neige';
    return 'Averses / orages';
  }
}
